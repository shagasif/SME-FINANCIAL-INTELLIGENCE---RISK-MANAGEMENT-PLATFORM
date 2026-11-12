import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { createWorker, OEM } from 'tesseract.js';
import { BillStatus, InvoiceStatus, Prisma, RoleType } from '../../generated/prisma/client.js';
import { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { SecurityUtil } from '../../common/utils/security.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  AiMediaAttachment,
  AiModelProviderService,
} from '../ai-orchestration/model-provider/ai-model-provider.service.js';
import { SupervisorOrchestratorService } from '../ai-orchestration/supervisor-orchestrator.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  DocumentArithmeticVerification,
  DocumentTargetType,
  ExtractedFieldConfidence,
  ExtractedLineItem,
  validateUploadedDocumentFile,
} from './document-parser.util.js';
import {
  DocumentExtractionMethod,
  DocumentImportExtractionResponse,
  DuplicateMatchWarning,
  DuplicateWarningsReport,
  PreviousExtractionInfo,
} from './dto/document-import.dto.js';

export interface UploadedMulterDocument {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
}

const MIN_EMBEDDED_PDF_CHARS = 25;
const MIN_READABLE_TEXT_CHARS = 10;
const MAX_OCR_PDF_PAGES = 3;

@Injectable()
export class DocumentImportService {
  private readonly logger = new Logger(DocumentImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly supervisor: SupervisorOrchestratorService,
    private readonly aiModelProvider: AiModelProviderService,
  ) {}

  /**
   * Validates, extracts (PDF text / scanned PDF OCR / image OCR + optional Vision AI),
   * sanitizes, orchestrates Analyst + Verifier AI checks, and checks duplicates.
   * Does NOT save Invoice/Bill records or mutate FinancialTransaction/FinancialAccount tables.
   */
  async extractDocument(
    organizationId: string,
    documentType: DocumentTargetType,
    file: UploadedMulterDocument | undefined,
    user: AuthenticatedPrincipal,
  ): Promise<DocumentImportExtractionResponse> {
    const descriptor = validateUploadedDocumentFile(file);
    const buffer = file!.buffer!;

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, baseCurrency: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const defaultCurrency = (org.baseCurrency || 'USD').trim().toUpperCase();
    const providerSummary = this.aiModelProvider.getProviderConfigurationSummary();
    const externalVisionConfigured =
      providerSummary.activeProvider !== 'deterministic-grounded' &&
      providerSummary.externalCredentialsConfigured;

    const warnings: string[] = [];
    const limitations: string[] = [];

    if (!externalVisionConfigured) {
      const lim = `External multimodal Vision AI provider is not configured (AI_PROVIDER=${providerSummary.activeProvider}, externalCredentialsConfigured=${providerSummary.externalCredentialsConfigured}); extraction used local PDF text / offline Tesseract OCR and deterministic structural parsing.`;
      limitations.push(lim);
      this.logger.log(lim);
    }

    // 1. Perform genuine text/OCR extraction and prepare optional vision image attachments
    let rawExtractedText: string;
    let pageCount: number | null;
    let ocrConfidence: number | null;
    let extractionMethod: DocumentExtractionMethod;
    const visionAttachments: AiMediaAttachment[] = [];

    if (descriptor.format === 'pdf') {
      const pdfExtraction = await this.extractFromPdf(buffer);
      pageCount = pdfExtraction.pageCount;
      rawExtractedText = pdfExtraction.text;
      ocrConfidence = pdfExtraction.ocrConfidence;
      extractionMethod = pdfExtraction.extractionMethod;
      warnings.push(...pdfExtraction.warnings);
      limitations.push(...pdfExtraction.limitations);
      if (externalVisionConfigured && pdfExtraction.renderedPageBuffers.length > 0) {
        pdfExtraction.renderedPageBuffers.slice(0, 2).forEach((pageBuf, idx) => {
          visionAttachments.push({
            mimeType: 'image/png',
            base64Data: pageBuf.toString('base64'),
            fileName: `${descriptor.originalName}-page-${idx + 1}.png`,
          });
        });
      }
    } else {
      const ocrResult = await this.runLocalImageOcr(buffer);
      rawExtractedText = ocrResult.text;
      ocrConfidence = ocrResult.confidence;
      extractionMethod = externalVisionConfigured ? 'OCR_AND_VISION_AI' : 'IMAGE_OCR';
      pageCount = 1;
      warnings.push(...ocrResult.warnings);
      limitations.push(...ocrResult.limitations);

      if (externalVisionConfigured) {
        visionAttachments.push({
          mimeType: descriptor.mimeType,
          base64Data: buffer.toString('base64'),
          fileName: descriptor.originalName,
        });
      }
    }

    const compactCharCount = rawExtractedText.replace(/\s+/g, '').length;
    if (compactCharCount < MIN_READABLE_TEXT_CHARS && visionAttachments.length === 0) {
      throw new UnprocessableEntityException(
        'No readable text could be extracted from the uploaded document. Ensure the PDF/image is clear, unencrypted, and not blank; no fabricated values were generated.',
      );
    }

    // 2. Sanitize extracted text prior to AI orchestration or storage
    const sanitizedTextResult = SecurityUtil.sanitizeImportedText(rawExtractedText);
    const sanitizedText = sanitizedTextResult.sanitized;

    // 3. Dispatch to SupervisorOrchestratorService (FINANCE_DATA_ANALYST + VERIFIER_AI)
    const orchestration = await this.supervisor.orchestrateDocumentExtraction({
      organizationId,
      userId: user.userId,
      userRole: user.organizationRole ?? RoleType.FINANCE_MANAGER,
      documentType,
      fileName: descriptor.originalName,
      defaultCurrency,
      sanitizedText,
      sanitizationFlags: sanitizedTextResult.flaggedPatterns,
      attachments: visionAttachments.length > 0 ? visionAttachments : undefined,
    });

    const analystOut = orchestration.analystResult;
    const verifierOut = orchestration.verifierResult;

    const extractedDocument =
      analystOut.extractedDocument as DocumentImportExtractionResponse['extractedDocument'];
    const lineItems = (analystOut.lineItems ?? []) as ExtractedLineItem[];
    const fieldConfidence = analystOut.fieldConfidence as ExtractedFieldConfidence;
    const sanitizationFlags = Array.from(
      new Set([
        ...sanitizedTextResult.flaggedPatterns,
        ...((analystOut.sanitizationFlags as string[] | undefined) ?? []),
      ]),
    );
    const arithmeticVerification =
      verifierOut.arithmeticVerification as DocumentArithmeticVerification;
    const analystNotes = (analystOut.extractionNotes as string[] | undefined) ?? [];
    warnings.push(...analystNotes);

    if (ocrConfidence !== null && ocrConfidence < 60) {
      warnings.push(
        `Low OCR recognition confidence (${ocrConfidence}%); verify extracted amounts and dates before saving.`,
      );
    }

    // 4. Read-only duplicate detection across uploaded file checksums & existing invoices/bills
    const duplicateWarnings = await this.detectDuplicateDocuments({
      organizationId,
      documentType,
      checksumSha256: descriptor.checksumSha256,
      documentNumber: extractedDocument.documentNumber,
      counterpartyName: extractedDocument.counterpartyName,
      issueDate: extractedDocument.issueDate,
      totalAmount: extractedDocument.totalAmount,
    });

    // 5. Record non-mutating extraction audit event (no Invoice/Bill or FinancialTransaction written)
    await this.audit.record({
      organizationId,
      actorUserId: user.userId,
      actorRole: user.organizationRole,
      action: 'DOCUMENT_IMPORT_EXTRACTED',
      resourceType: 'DOCUMENT_IMPORT',
      resourceId: orchestration.workflowRunId,
      details: {
        documentType,
        fileName: descriptor.originalName,
        detectedFormat: descriptor.format,
        sizeBytes: descriptor.sizeBytes,
        fileChecksum: descriptor.checksumSha256,
        extractionMethod,
        ocrConfidence,
        extractedDocumentNumber: extractedDocument.documentNumber,
        extractedTotalAmount: extractedDocument.totalAmount,
        isApproved: Boolean(verifierOut.isApproved),
        hasPotentialDuplicate: duplicateWarnings.hasPotentialDuplicate,
        savedToDatabase: false,
        ledgerMutationPerformed: false,
      },
    });

    return {
      success: true,
      savedToDatabase: false,
      ledgerMutationPerformed: false,
      documentType,
      fileMetadata: {
        fileName: descriptor.originalName,
        mimeType: descriptor.mimeType,
        detectedFormat: descriptor.format,
        sizeBytes: descriptor.sizeBytes,
        checksumSha256: descriptor.checksumSha256,
      },
      extractionMetadata: {
        extractionMethod,
        extractedCharCount: rawExtractedText.length,
        pageCount,
        ocrConfidence,
        provider: providerSummary.activeProvider,
        externalVisionConfigured,
        warnings: Array.from(new Set(warnings)),
        limitations: Array.from(new Set(limitations)),
      },
      extractedTextPreview: sanitizedText.slice(0, 1200),
      extractedDocument,
      lineItems,
      fieldConfidence,
      arithmeticVerification,
      duplicateWarnings,
      sanitizationFlags,
      aiOrchestration: {
        workflowRunId: orchestration.workflowRunId,
        taskClassification: orchestration.taskClassification,
        durationMs: orchestration.durationMs,
        isApproved: Boolean(verifierOut.isApproved),
        requiresHumanReview: Boolean(verifierOut.requiresHumanReview),
        validationErrors: (verifierOut.validationErrors as string[] | undefined) ?? [],
        confidenceScore: Number(verifierOut.confidenceScore ?? 0),
      },
    };
  }

  private async extractFromPdf(buffer: Buffer): Promise<{
    text: string;
    pageCount: number | null;
    ocrConfidence: number | null;
    extractionMethod: DocumentExtractionMethod;
    renderedPageBuffers: Buffer[];
    warnings: string[];
    limitations: string[];
  }> {
    const warnings: string[] = [];
    const limitations: string[] = [];
    const renderedPageBuffers: Buffer[] = [];
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const textResult = await parser.getText();
      const rawText = (textResult.text ?? '').trim();
      const pageCount = typeof textResult.total === 'number' ? textResult.total : null;

      if (rawText.replace(/\s+/g, '').length >= MIN_EMBEDDED_PDF_CHARS) {
        return {
          text: rawText,
          pageCount,
          ocrConfidence: null,
          extractionMethod: 'PDF_EMBEDDED_TEXT',
          renderedPageBuffers,
          warnings,
          limitations,
        };
      }

      // Embedded text empty/sparse -> likely scanned/image-based PDF; rasterize up to first 3 pages and run OCR
      warnings.push(
        'PDF contains minimal or no embedded text; falling back to page rendering and OCR.',
      );

      let screenshotResult;
      try {
        screenshotResult = await parser.getScreenshot({
          imageBuffer: true,
          scale: 2,
          first: MAX_OCR_PDF_PAGES,
        });
      } catch (renderErr: unknown) {
        const msg = renderErr instanceof Error ? renderErr.message : String(renderErr);
        limitations.push(`Scanned PDF page rasterization failed: ${msg}`);
        return {
          text: rawText,
          pageCount,
          ocrConfidence: null,
          extractionMethod: 'PDF_SCANNED_OCR',
          renderedPageBuffers,
          warnings,
          limitations,
        };
      }

      const ocrTexts: string[] = [];
      const confidences: number[] = [];

      for (const page of screenshotResult.pages ?? []) {
        if (!page.data || page.data.length === 0) continue;
        const pageBuf = Buffer.from(page.data);
        renderedPageBuffers.push(pageBuf);
        const ocr = await this.runLocalImageOcr(pageBuf);
        if (ocr.text.trim()) {
          ocrTexts.push(ocr.text.trim());
        }
        if (ocr.confidence !== null) {
          confidences.push(ocr.confidence);
        }
        warnings.push(...ocr.warnings);
        limitations.push(...ocr.limitations);
      }

      if ((pageCount ?? 0) > MAX_OCR_PDF_PAGES) {
        warnings.push(
          `OCR processed the first ${MAX_OCR_PDF_PAGES} of ${pageCount} PDF pages.`,
        );
      }

      const avgConf =
        confidences.length > 0
          ? Number(
              (confidences.reduce((sum, c) => sum + c, 0) / confidences.length).toFixed(2),
            )
          : null;

      return {
        text: ocrTexts.join('\n').trim() || rawText,
        pageCount,
        ocrConfidence: avgConf,
        extractionMethod: 'PDF_SCANNED_OCR',
        renderedPageBuffers,
        warnings,
        limitations,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new UnprocessableEntityException(
        `Failed to parse uploaded PDF document (${msg}). Ensure the PDF is not corrupted or password-protected.`,
      );
    } finally {
      await parser.destroy().catch((destroyErr: unknown) => {
        this.logger.warn(
          `PDFParse destroy warning: ${destroyErr instanceof Error ? destroyErr.message : String(destroyErr)}`,
        );
      });
    }
  }

  private resolveLocalTesseractLangPath(): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'node_modules/@tesseract.js-data/eng/4.0.0'),
      path.resolve(process.cwd(), 'backend/node_modules/@tesseract.js-data/eng/4.0.0'),
    ];
    for (const candidate of candidates) {
      if (existsSync(path.join(candidate, 'eng.traineddata.gz'))) {
        return candidate;
      }
    }
    return null;
  }

  private async runLocalImageOcr(buffer: Buffer): Promise<{
    text: string;
    confidence: number | null;
    warnings: string[];
    limitations: string[];
  }> {
    const warnings: string[] = [];
    const limitations: string[] = [];
    const langPath = this.resolveLocalTesseractLangPath();

    if (!langPath) {
      limitations.push(
        'Local @tesseract.js-data/eng traineddata directory was not found on disk; OCR cannot operate offline without remote language data.',
      );
    }

    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    try {
      worker = await createWorker('eng', OEM.DEFAULT, {
        ...(langPath ? { langPath, gzip: true, cacheMethod: 'none' } : { cachePath: path.join(os.tmpdir(), 'tesseract-cache') }),
        logger: () => undefined,
        errorHandler: (err: unknown) => {
          this.logger.warn(`Tesseract worker notice: ${String(err)}`);
        },
      });
      const result = await worker.recognize(buffer);
      const text = (result?.data?.text ?? '').trim();
      const confidence =
        typeof result?.data?.confidence === 'number'
          ? Number(result.data.confidence.toFixed(2))
          : null;
      return { text, confidence, warnings, limitations };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      limitations.push(`Local Tesseract OCR failed: ${msg}`);
      return { text: '', confidence: null, warnings, limitations };
    } finally {
      if (worker) {
        await worker.terminate().catch(() => undefined);
      }
    }
  }

  private async detectDuplicateDocuments(params: {
    organizationId: string;
    documentType: DocumentTargetType;
    checksumSha256: string;
    documentNumber: string | null;
    counterpartyName: string | null;
    issueDate: string | null;
    totalAmount: string | null;
  }): Promise<DuplicateWarningsReport> {
    const matches: DuplicateMatchWarning[] = [];
    let checksumMatched = false;
    let documentNumberConflict = false;
    let similarRecordMatch = false;
    let previouslyExtractedNotSaved = false;
    let previousExtractionInfo: PreviousExtractionInfo | null = null;

    const createdAction =
      params.documentType === 'INVOICE' ? 'INVOICE_CREATED' : 'SUPPLIER_BILL_CREATED';

    // 1. Check whether this exact document checksum was previously SAVED as an active Invoice/Bill
    const [savedCreationEvents, priorExtractions] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where: {
          organizationId: params.organizationId,
          action: createdAction,
        },
        orderBy: { createdAt: 'desc' },
        take: 250,
      }),
      this.prisma.auditEvent.findMany({
        where: {
          organizationId: params.organizationId,
          action: 'DOCUMENT_IMPORT_EXTRACTED',
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const savedCandidateIds = savedCreationEvents
      .filter((evt) => {
        const details = (evt.details ?? {}) as Record<string, unknown>;
        return details.sourceDocumentChecksum === params.checksumSha256 && Boolean(evt.resourceId);
      })
      .map((evt) => evt.resourceId as string);

    // 2. Check existing Invoices or Bills by saved checksum, exact number & soft metadata match
    if (params.documentType === 'INVOICE') {
      if (savedCandidateIds.length > 0) {
        const savedByChecksum = await this.prisma.invoice.findFirst({
          where: {
            organizationId: params.organizationId,
            id: { in: savedCandidateIds },
            isArchived: false,
            status: { not: InvoiceStatus.VOID },
          },
        });
        if (savedByChecksum) {
          checksumMatched = true;
          matches.push({
            matchType: 'FILE_CHECKSUM',
            recordId: savedByChecksum.id,
            documentNumber: savedByChecksum.invoiceNumber,
            counterpartyName: savedByChecksum.customerName,
            issueDate: savedByChecksum.issueDate.toISOString().slice(0, 10),
            totalAmount: DecimalMath.toFixed4(savedByChecksum.totalAmount),
            currency: savedByChecksum.currency,
            status: savedByChecksum.status,
            reason: this.formatSimpleDuplicateReason(
              'FILE_CHECKSUM',
              'Invoice',
              savedByChecksum.invoiceNumber,
              savedByChecksum.status,
              savedByChecksum.currency,
              savedByChecksum.totalAmount,
            ),
          });
        }
      }

      if (params.documentNumber) {
        const byNum = await this.prisma.invoice.findFirst({
          where: {
            organizationId: params.organizationId,
            invoiceNumber: { equals: params.documentNumber, mode: 'insensitive' },
          },
        });
        if (byNum && !matches.some((m) => m.recordId === byNum.id)) {
          documentNumberConflict = true;
          matches.push({
            matchType: 'DOCUMENT_NUMBER',
            recordId: byNum.id,
            documentNumber: byNum.invoiceNumber,
            counterpartyName: byNum.customerName,
            issueDate: byNum.issueDate.toISOString().slice(0, 10),
            totalAmount: DecimalMath.toFixed4(byNum.totalAmount),
            currency: byNum.currency,
            status: byNum.status,
            reason: this.formatSimpleDuplicateReason(
              'DOCUMENT_NUMBER',
              'Invoice',
              byNum.invoiceNumber,
              byNum.status,
              byNum.currency,
              byNum.totalAmount,
            ),
          });
        } else if (byNum) {
          documentNumberConflict = true;
        }
      }

      if (!checksumMatched && !documentNumberConflict && params.counterpartyName && params.totalAmount) {
        const whereSoft: Prisma.InvoiceWhereInput = {
          organizationId: params.organizationId,
          isArchived: false,
          status: { not: InvoiceStatus.VOID },
          customerName: { equals: params.counterpartyName, mode: 'insensitive' },
          totalAmount: DecimalMath.of(params.totalAmount),
          ...(params.issueDate
            ? {
                issueDate: {
                  gte: new Date(`${params.issueDate}T00:00:00.000Z`),
                  lte: new Date(`${params.issueDate}T23:59:59.999Z`),
                },
              }
            : {}),
        };
        const similar = await this.prisma.invoice.findFirst({ where: whereSoft });
        if (similar) {
          similarRecordMatch = true;
          matches.push({
            matchType: 'SIMILAR_RECORD',
            recordId: similar.id,
            documentNumber: similar.invoiceNumber,
            counterpartyName: similar.customerName,
            issueDate: similar.issueDate.toISOString().slice(0, 10),
            totalAmount: DecimalMath.toFixed4(similar.totalAmount),
            currency: similar.currency,
            status: similar.status,
            reason: this.formatSimpleDuplicateReason(
              'SIMILAR_RECORD',
              'Invoice',
              similar.invoiceNumber,
              similar.status,
              similar.currency,
              similar.totalAmount,
            ),
          });
        }
      }
    } else {
      if (savedCandidateIds.length > 0) {
        const savedByChecksum = await this.prisma.bill.findFirst({
          where: {
            organizationId: params.organizationId,
            id: { in: savedCandidateIds },
            isArchived: false,
            status: { not: BillStatus.VOID },
          },
        });
        if (savedByChecksum) {
          checksumMatched = true;
          matches.push({
            matchType: 'FILE_CHECKSUM',
            recordId: savedByChecksum.id,
            documentNumber: savedByChecksum.billNumber,
            counterpartyName: savedByChecksum.supplierName,
            issueDate: savedByChecksum.issueDate.toISOString().slice(0, 10),
            totalAmount: DecimalMath.toFixed4(savedByChecksum.totalAmount),
            currency: savedByChecksum.currency,
            status: savedByChecksum.status,
            reason: this.formatSimpleDuplicateReason(
              'FILE_CHECKSUM',
              'Bill',
              savedByChecksum.billNumber,
              savedByChecksum.status,
              savedByChecksum.currency,
              savedByChecksum.totalAmount,
            ),
          });
        }
      }

      if (params.documentNumber) {
        const byNum = await this.prisma.bill.findFirst({
          where: {
            organizationId: params.organizationId,
            billNumber: { equals: params.documentNumber, mode: 'insensitive' },
          },
        });
        if (byNum && !matches.some((m) => m.recordId === byNum.id)) {
          documentNumberConflict = true;
          matches.push({
            matchType: 'DOCUMENT_NUMBER',
            recordId: byNum.id,
            documentNumber: byNum.billNumber,
            counterpartyName: byNum.supplierName,
            issueDate: byNum.issueDate.toISOString().slice(0, 10),
            totalAmount: DecimalMath.toFixed4(byNum.totalAmount),
            currency: byNum.currency,
            status: byNum.status,
            reason: this.formatSimpleDuplicateReason(
              'DOCUMENT_NUMBER',
              'Bill',
              byNum.billNumber,
              byNum.status,
              byNum.currency,
              byNum.totalAmount,
            ),
          });
        } else if (byNum) {
          documentNumberConflict = true;
        }
      }

      if (!checksumMatched && !documentNumberConflict && params.counterpartyName && params.totalAmount) {
        const whereSoft: Prisma.BillWhereInput = {
          organizationId: params.organizationId,
          isArchived: false,
          status: { not: BillStatus.VOID },
          supplierName: { equals: params.counterpartyName, mode: 'insensitive' },
          totalAmount: DecimalMath.of(params.totalAmount),
          ...(params.issueDate
            ? {
                issueDate: {
                  gte: new Date(`${params.issueDate}T00:00:00.000Z`),
                  lte: new Date(`${params.issueDate}T23:59:59.999Z`),
                },
              }
            : {}),
        };
        const similar = await this.prisma.bill.findFirst({ where: whereSoft });
        if (similar) {
          similarRecordMatch = true;
          matches.push({
            matchType: 'SIMILAR_RECORD',
            recordId: similar.id,
            documentNumber: similar.billNumber,
            counterpartyName: similar.supplierName,
            issueDate: similar.issueDate.toISOString().slice(0, 10),
            totalAmount: DecimalMath.toFixed4(similar.totalAmount),
            currency: similar.currency,
            status: similar.status,
            reason: this.formatSimpleDuplicateReason(
              'SIMILAR_RECORD',
              'Bill',
              similar.billNumber,
              similar.status,
              similar.currency,
              similar.totalAmount,
            ),
          });
        }
      }
    }

    // 3. Track prior extraction-only uploads as informational notice (never a duplicate warning!)
    if (!checksumMatched) {
      const matchingExtractions = priorExtractions.filter((evt) => {
        const details = (evt.details ?? {}) as Record<string, unknown>;
        return (
          details.fileChecksum === params.checksumSha256 &&
          details.documentType === params.documentType
        );
      });
      if (matchingExtractions.length > 0) {
        previouslyExtractedNotSaved = true;
        const latest = matchingExtractions[0];
        const latestAt =
          latest.createdAt instanceof Date ? latest.createdAt.toISOString() : null;
        previousExtractionInfo = {
          previouslyExtracted: true,
          extractionCount: matchingExtractions.length,
          lastExtractedAt: latestAt,
          message: `This document was previously extracted ${matchingExtractions.length} time(s) for preview, but has not been saved as a ${params.documentType === 'INVOICE' ? 'customer invoice' : 'supplier bill'} yet.`,
        };
      }
    }

    return {
      hasPotentialDuplicate: matches.length > 0,
      checksumMatched,
      documentNumberConflict,
      similarRecordMatch,
      previouslyExtractedNotSaved,
      previousExtractionInfo,
      matches,
    };
  }

  private formatSimpleDuplicateReason(
    matchType: 'FILE_CHECKSUM' | 'DOCUMENT_NUMBER' | 'SIMILAR_RECORD',
    docKind: 'Invoice' | 'Bill',
    documentNumber: string,
    status: string | null | undefined,
    currency: string | null | undefined,
    totalAmount: Prisma.Decimal | null | undefined,
  ): string {
    const prettyStatus = status
      ? ` (${status
          .toLowerCase()
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')})`
      : '';
    const numVal = totalAmount ? Number(totalAmount.toString()) : Number.NaN;
    const cleanCurr = currency ? currency.trim().toUpperCase() : '';
    const hasFraction = !Number.isNaN(numVal) && Math.abs(numVal % 1) > 0.0001;
    const formattedAmount = !Number.isNaN(numVal)
      ? `${cleanCurr ? `${cleanCurr} ` : ''}${new Intl.NumberFormat('en-US', {
          minimumFractionDigits: hasFraction ? 2 : 0,
          maximumFractionDigits: 2,
        }).format(numVal)}`
      : '';

    if (matchType === 'FILE_CHECKSUM') {
      return `This file is already saved as ${docKind} ${documentNumber}${prettyStatus}${formattedAmount ? ` for ${formattedAmount}` : ''}.`;
    }
    if (matchType === 'DOCUMENT_NUMBER') {
      return `${docKind} ${documentNumber}${prettyStatus} already exists${formattedAmount ? ` for ${formattedAmount}` : ''}.`;
    }
    return `A similar ${docKind.toLowerCase()} (${documentNumber}${prettyStatus})${formattedAmount ? ` for ${formattedAmount}` : ''} already exists.`;
  }
}
