import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSourceType,
  ImportBatchStatus,
  Prisma,
  RoleType,
  TransactionType,
} from '../../generated/prisma/client.js';
import { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { SecurityUtil } from '../../common/utils/security.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AiModelProviderService } from '../ai-orchestration/model-provider/ai-model-provider.service.js';
import { SupervisorOrchestratorService } from '../ai-orchestration/supervisor-orchestrator.service.js';
import { AuditService } from '../audit/audit.service.js';
import { FinancialTransactionsService } from '../financial-transactions/financial-transactions.service.js';
import { AutoMapColumnsDto, ConfirmCsvImportDto, UploadCsvPreviewDto } from './dto/csv-import.dto.js';

export interface ValidatedCsvRow {
  rowNumber: number;
  transactionDate: string;
  date?: string;
  type: TransactionType;
  amount: string;
  description: string;
  category: string;
  counterparty: string | null;
  department: string | null;
  reference: string | null;
  duplicateHash: string;
  isDuplicate: boolean;
  duplicateReason?: string;
  sanitizationFlags: string[];
}

export interface CsvRowError {
  rowNumber: number;
  rawRow: Record<string, string>;
  errors: string[];
}

@Injectable()
export class CsvImportService {
  public static readonly ALLOWED_FILE_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.json'] as const;

  public static isSupportedFileName(fileName: string): boolean {
    if (!fileName || typeof fileName !== 'string') return false;
    // Strip optional worksheet specifier suffix like "[Sheet1]" or "[Sheet 2]"
    const cleaned = fileName.replace(/\s*\[.*\]$/, '').trim().toLowerCase();
    return CsvImportService.ALLOWED_FILE_EXTENSIONS.some((ext) => cleaned.endsWith(ext));
  }

  /**
   * Robust date parser handling ISO-8601, standard date strings (YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY),
   * and Excel serial date numbers (e.g. 45506). Returns null if the value cannot be parsed or falls
   * outside reasonable sanity boundaries.
   */
  public static parseFlexibleDate(raw: unknown): Date | null {
    if (raw === null || raw === undefined) return null;
    if (raw instanceof Date) {
      return Number.isNaN(raw.getTime()) ? null : raw;
    }
    const trimmed = String(raw).trim();
    if (!trimmed) return null;

    // Excel serial dates: 4 to 5 digits (e.g. 45506 represents ~Aug 2024; valid range 1000 to 90000)
    if (/^\d{4,5}(\.\d+)?$/.test(trimmed)) {
      const serial = parseFloat(trimmed);
      if (serial >= 1000 && serial <= 90000) {
        // Excel base date: Dec 30, 1899 taking into account Lotus 1900 leap bug
        const excelEpochMs = Date.UTC(1899, 11, 30);
        const dateMs = excelEpochMs + Math.round(serial * 86400 * 1000);
        const d = new Date(dateMs);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }

    // Standard date parsing (ISO-8601, YYYY-MM-DD, MM/DD/YYYY, etc.)
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      const d = new Date(parsed);
      const y = d.getUTCFullYear();
      if (y >= 1970 && y <= 2100) return d;
    }

    // Common DD/MM/YYYY or DD-MM-YYYY formats
    const parts = trimmed.split(/[/.-]/);
    if (parts.length === 3) {
      const [p1, p2, p3] = parts.map((p) => parseInt(p, 10));
      // YYYY-MM-DD
      if (p1 > 1000 && p2 >= 1 && p2 <= 12 && p3 >= 1 && p3 <= 31) {
        return new Date(Date.UTC(p1, p2 - 1, p3));
      }
      // DD-MM-YYYY
      if (p3 > 1000 && p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
        return new Date(Date.UTC(p3, p2 - 1, p1));
      }
    }

    return null;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly supervisor: SupervisorOrchestratorService,
    private readonly aiModelProvider: AiModelProviderService,
  ) {}

  /**
   * Dispatches file schema profiling and automatic column mapping to the
   * Supervisor Orchestrator, Finance Data Analyst Agent, and Verifier AI Agent.
   */
  async autoMapColumns(
    orgId: string,
    dto: AutoMapColumnsDto,
    user: AuthenticatedPrincipal,
  ) {
    if (!dto.headers || dto.headers.length === 0) {
      throw new BadRequestException('At least one header column is required for AI column mapping');
    }

    if (!CsvImportService.isSupportedFileName(dto.fileName)) {
      throw new BadRequestException(
        'Only .csv, .xlsx, .xls, and .json files are permitted for financial transaction import',
      );
    }

    const providerConfig = this.aiModelProvider.getProviderConfigurationSummary();

    const orchestrationResult = await this.supervisor.orchestrateFileSchemaMapping({
      organizationId: orgId,
      userId: user.userId,
      userRole: user.organizationRole ?? RoleType.FINANCE_MANAGER,
      isPlatformAdmin: user.isPlatformAdmin,
      fileName: dto.fileName,
      headers: dto.headers,
      sampleRows: dto.sampleRows ?? [],
    });

    return {
      success: true,
      provider: providerConfig.activeProvider,
      externalCredentialsConfigured: providerConfig.externalCredentialsConfigured,
      workflowRunId: orchestrationResult.workflowRunId,
      taskClassification: orchestrationResult.taskClassification,
      durationMs: orchestrationResult.durationMs,
      analystResult: orchestrationResult.analystResult,
      verifierResult: orchestrationResult.verifierResult,
    };
  }

  /**
   * Parses RFC-4180 CSV content into header array and row objects.
   */
  parseCsv(content: string): { headers: string[]; rows: Array<Record<string, string>> } {
    const lines = content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      throw new BadRequestException('CSV file must contain a header row and at least one data row');
    }

    const splitCsvLine = (line: string): string[] => {
      const cells: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          cells.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      cells.push(current.trim());
      return cells;
    };

    const headers = splitCsvLine(lines[0]);
    const rows: Array<Record<string, string>> = [];

    for (let idx = 1; idx < lines.length; idx += 1) {
      const values = splitCsvLine(lines[idx]);
      const rowObj: Record<string, string> = {};
      headers.forEach((h, colIdx) => {
        rowObj[h] = values[colIdx] ?? '';
      });
      rows.push(rowObj);
    }

    return { headers, rows };
  }

  async createPreviewBatch(organizationId: string, dto: UploadCsvPreviewDto, actorUserId: string) {
    if (!CsvImportService.isSupportedFileName(dto.fileName)) {
      throw new BadRequestException(
        'Only .csv, .xlsx, .xls, and .json files are permitted for financial transaction import',
      );
    }

    const account = await this.prisma.financialAccount.findFirst({
      where: { id: dto.accountId, organizationId, isArchived: false },
    });
    if (!account) {
      throw new NotFoundException('Target financial account not found in this organization');
    }

    const { headers, rows } = this.parseCsv(dto.csvContent);
    const mapping = dto.columnMapping;

    const requiredColumns = [mapping.dateColumn, mapping.amountColumn, mapping.descriptionColumn];
    for (const col of requiredColumns) {
      if (!headers.includes(col)) {
        throw new BadRequestException(
          `Mapped column "${col}" does not exist in file headers: [${headers.join(', ')}]`,
        );
      }
    }

    const validRows: ValidatedCsvRow[] = [];
    const rowErrors: CsvRowError[] = [];
    const duplicateRows: ValidatedCsvRow[] = [];
    const sanitizationNotes: Array<{ rowNumber: number; flags: string[] }> = [];
    const seenHashesInBatch = new Set<string>();
    const candidateHashes: string[] = [];

    const prelimRows: Array<{
      rowNumber: number;
      txDate: Date;
      type: TransactionType;
      amount: Prisma.Decimal;
      description: string;
      category: string;
      counterparty: string | null;
      department: string | null;
      reference: string | null;
      duplicateHash: string;
      intraBatchDuplicate: boolean;
      sanitizationFlags: string[];
    }> = [];

    for (let i = 0; i < rows.length; i += 1) {
      const rowNumber = i + 2; // 1-based including header
      const raw = rows[i];
      const errors: string[] = [];

      const rawDate = raw[mapping.dateColumn] ?? '';
      const parsedDate = CsvImportService.parseFlexibleDate(rawDate);
      if (!parsedDate) {
        errors.push(`Invalid date "${rawDate}" in column "${mapping.dateColumn}"`);
      }

      const rawAmount = (raw[mapping.amountColumn] ?? '').replace(/[,$]/g, '').trim();
      let parsedDecimal: Prisma.Decimal | null = null;
      if (!rawAmount || !/^-?\d+(\.\d+)?$/.test(rawAmount)) {
        errors.push(`Invalid numeric amount "${raw[mapping.amountColumn] ?? ''}"`);
      } else {
        parsedDecimal = DecimalMath.of(rawAmount);
        if (parsedDecimal.isZero()) {
          errors.push('Transaction amount cannot be zero');
        }
      }

      const rawDescription = raw[mapping.descriptionColumn] ?? '';
      if (!rawDescription || rawDescription.trim().length < 2) {
        errors.push('Description is required and must be at least 2 characters');
      }

      const rawType = mapping.typeColumn
        ? (raw[mapping.typeColumn] ?? '').toUpperCase().trim()
        : '';
      let resolvedType: TransactionType = TransactionType.EXPENSE;
      if (rawType) {
        if (
          rawType === 'INCOME' ||
          rawType === 'CREDIT' ||
          rawType === 'INFLOW' ||
          rawType === 'RECEIPT'
        ) {
          resolvedType = TransactionType.INCOME;
        } else if (
          rawType === 'EXPENSE' ||
          rawType === 'DEBIT' ||
          rawType === 'OUTFLOW' ||
          rawType === 'PAYMENT'
        ) {
          resolvedType = TransactionType.EXPENSE;
        } else if (rawType === 'TRANSFER') {
          resolvedType = TransactionType.TRANSFER;
        } else {
          errors.push(`Unrecognized transaction type "${rawType}"`);
        }
      } else if (parsedDecimal) {
        resolvedType = parsedDecimal.gt(DecimalMath.ZERO)
          ? TransactionType.INCOME
          : TransactionType.EXPENSE;
      }

      if (errors.length > 0 || !parsedDecimal) {
        rowErrors.push({ rowNumber, rawRow: raw, errors });
        continue;
      }

      const absAmount = parsedDecimal.abs().toDecimalPlaces(4);
      const txDate = parsedDate!;

      const descSanitized = SecurityUtil.sanitizeImportedText(rawDescription);
      const categoryRaw = mapping.categoryColumn
        ? raw[mapping.categoryColumn] || 'Uncategorized'
        : 'Uncategorized';
      const catSanitized = SecurityUtil.sanitizeImportedText(categoryRaw);
      const counterpartySanitized = mapping.counterpartyColumn
        ? SecurityUtil.sanitizeImportedText(raw[mapping.counterpartyColumn] ?? '')
        : { sanitized: '', flaggedPatterns: [] };
      const deptSanitized = mapping.departmentColumn
        ? SecurityUtil.sanitizeImportedText(raw[mapping.departmentColumn] ?? '')
        : { sanitized: '', flaggedPatterns: [] };
      const refSanitized = mapping.referenceColumn
        ? SecurityUtil.sanitizeImportedText(raw[mapping.referenceColumn] ?? '')
        : { sanitized: '', flaggedPatterns: [] };

      const combinedFlags = [
        ...descSanitized.flaggedPatterns,
        ...catSanitized.flaggedPatterns,
        ...counterpartySanitized.flaggedPatterns,
        ...deptSanitized.flaggedPatterns,
        ...refSanitized.flaggedPatterns,
      ];
      if (combinedFlags.length > 0) {
        sanitizationNotes.push({ rowNumber, flags: combinedFlags });
      }

      const duplicateHash = FinancialTransactionsService.computeDuplicateHash({
        organizationId,
        accountId: dto.accountId,
        transactionDate: txDate,
        type: resolvedType,
        amount: absAmount,
        description: descSanitized.sanitized,
      });

      const intraBatchDuplicate = seenHashesInBatch.has(duplicateHash);
      seenHashesInBatch.add(duplicateHash);
      candidateHashes.push(duplicateHash);

      prelimRows.push({
        rowNumber,
        txDate,
        type: resolvedType,
        amount: absAmount,
        description: descSanitized.sanitized,
        category: catSanitized.sanitized || 'Uncategorized',
        counterparty: counterpartySanitized.sanitized || null,
        department: deptSanitized.sanitized || null,
        reference: refSanitized.sanitized || null,
        duplicateHash,
        intraBatchDuplicate,
        sanitizationFlags: combinedFlags,
      });
    }

    // Check existing DB transactions for duplicate hashes
    const existingDuplicates =
      candidateHashes.length > 0
        ? await this.prisma.financialTransaction.findMany({
            where: {
              organizationId,
              isArchived: false,
              duplicateHash: { in: candidateHashes },
            },
            select: { duplicateHash: true, id: true },
          })
        : [];
    const existingHashSet = new Set(
      existingDuplicates.map((d) => d.duplicateHash).filter((h): h is string => Boolean(h)),
    );

    for (const row of prelimRows) {
      const isDbDuplicate = existingHashSet.has(row.duplicateHash);
      const isDuplicate = row.intraBatchDuplicate || isDbDuplicate;
      const duplicateReason = row.intraBatchDuplicate
        ? 'Duplicate row within uploaded CSV file'
        : isDbDuplicate
          ? 'Matches an existing financial transaction in organization ledger'
          : undefined;

      const formattedRow: ValidatedCsvRow = {
        rowNumber: row.rowNumber,
        transactionDate: row.txDate.toISOString(),
        date: row.txDate.toISOString().split('T')[0],
        type: row.type,
        amount: DecimalMath.toFixed4(row.amount),
        description: row.description,
        category: row.category,
        counterparty: row.counterparty,
        department: row.department,
        reference: row.reference,
        duplicateHash: row.duplicateHash,
        isDuplicate,
        duplicateReason,
        sanitizationFlags: row.sanitizationFlags,
      };

      validRows.push(formattedRow);
      if (isDuplicate) {
        duplicateRows.push(formattedRow);
      }
    }

    const fileChecksum = SecurityUtil.sha256(dto.csvContent);
    const dataSource = await this.prisma.dataSource.create({
      data: {
        organizationId,
        name: `Financial File Import: ${dto.fileName}`,
        type: DataSourceType.CSV_IMPORT,
        description: `Uploaded by user ${actorUserId}`,
        metadata: { fileName: dto.fileName, fileChecksum },
      },
    });

    const batch = await this.prisma.importBatch.create({
      data: {
        organizationId,
        dataSourceId: dataSource.id,
        accountId: dto.accountId,
        uploadedByUserId: actorUserId,
        fileName: dto.fileName,
        fileChecksum,
        fileSizeBytes: Buffer.byteLength(dto.csvContent, 'utf8'),
        status: ImportBatchStatus.VALIDATED,
        columnMapping: dto.columnMapping as unknown as Prisma.InputJsonValue,
        totalRows: rows.length,
        validRowsCount: validRows.length,
        errorRowsCount: rowErrors.length,
        duplicateRowsCount: duplicateRows.length,
        previewRows: validRows as unknown as Prisma.InputJsonValue,
        rowErrors: rowErrors as unknown as Prisma.InputJsonValue,
        duplicateRows: duplicateRows as unknown as Prisma.InputJsonValue,
        sanitizationNotes: sanitizationNotes as unknown as Prisma.InputJsonValue,
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'CSV_IMPORT_PREVIEW_CREATED',
      resourceType: 'IMPORT_BATCH',
      resourceId: batch.id,
      details: {
        fileName: batch.fileName,
        totalRows: batch.totalRows,
        validRowsCount: batch.validRowsCount,
        errorRowsCount: batch.errorRowsCount,
        duplicateRowsCount: batch.duplicateRowsCount,
        sanitizedRowCount: sanitizationNotes.length,
      },
    });

    return {
      ...batch,
      validRows: batch.validRowsCount,
      invalidRows: batch.errorRowsCount,
    };
  }

  async confirmImportBatch(
    organizationId: string,
    batchId: string,
    dto: ConfirmCsvImportDto,
    actorUserId: string,
  ) {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, organizationId },
    });
    if (!batch) {
      throw new NotFoundException('Import batch not found in this organization');
    }
    if (batch.status === ImportBatchStatus.COMMITTED) {
      throw new ConflictException('Import batch has already been committed');
    }
    if (!batch.accountId) {
      throw new BadRequestException('Import batch is missing a target financial account');
    }

    const account = await this.prisma.financialAccount.findFirst({
      where: { id: batch.accountId, organizationId, isArchived: false },
    });
    if (!account) {
      throw new NotFoundException('Target financial account is no longer active');
    }

    const previewRows = (batch.previewRows as unknown as ValidatedCsvRow[]) ?? [];
    const skipDuplicates = dto.skipDuplicates ?? true;
    const rowsToCommit = previewRows.filter((row) => !(skipDuplicates && row.isDuplicate));

    let netBalanceChange = DecimalMath.ZERO;
    for (const row of rowsToCommit) {
      const amt = DecimalMath.of(row.amount);
      if (row.type === TransactionType.INCOME) {
        netBalanceChange = DecimalMath.add(netBalanceChange, amt);
      } else if (row.type === TransactionType.EXPENSE) {
        netBalanceChange = DecimalMath.sub(netBalanceChange, amt);
      }
    }

    const updatedBatch = await this.prisma.$transaction(async (tx) => {
      for (const row of rowsToCommit) {
        await tx.financialTransaction.create({
          data: {
            organizationId,
            accountId: account.id,
            dataSourceId: batch.dataSourceId,
            importBatchId: batch.id,
            type: row.type,
            amount: DecimalMath.of(row.amount),
            currency: account.currency,
            transactionDate: new Date(row.transactionDate),
            description: row.description,
            category: row.category,
            counterparty: row.counterparty,
            department: row.department,
            reference: row.reference,
            duplicateHash: row.duplicateHash,
            createdByUserId: actorUserId,
          },
        });
      }

      if (!netBalanceChange.isZero()) {
        await tx.financialAccount.update({
          where: { id: account.id },
          data: {
            currentBalance: DecimalMath.add(account.currentBalance, netBalanceChange),
          },
        });
      }

      return tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: ImportBatchStatus.COMMITTED,
          committedRowsCount: rowsToCommit.length,
          confirmedAt: new Date(),
          confirmedByUserId: actorUserId,
        },
      });
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'CSV_IMPORT_BATCH_COMMITTED',
      resourceType: 'IMPORT_BATCH',
      resourceId: batch.id,
      details: {
        committedRowsCount: rowsToCommit.length,
        skippedDuplicates: previewRows.length - rowsToCommit.length,
        netBalanceChange: DecimalMath.toFixed4(netBalanceChange),
      },
    });

    return updatedBatch;
  }

  async listImportBatches(organizationId: string) {
    return this.prisma.importBatch.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getImportBatch(organizationId: string, batchId: string) {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, organizationId },
    });
    if (!batch) {
      throw new NotFoundException('Import batch not found');
    }
    return {
      ...batch,
      validRows: batch.validRowsCount,
      invalidRows: batch.errorRowsCount,
    };
  }
}
