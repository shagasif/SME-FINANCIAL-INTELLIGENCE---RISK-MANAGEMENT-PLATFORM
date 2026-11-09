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
  TransactionType,
} from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { SecurityUtil } from '../../common/utils/security.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { FinancialTransactionsService } from '../financial-transactions/financial-transactions.service.js';
import { ConfirmCsvImportDto, UploadCsvPreviewDto } from './dto/csv-import.dto.js';

export interface ValidatedCsvRow {
  rowNumber: number;
  transactionDate: string;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    if (!dto.fileName.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException(
        'Only .csv files are permitted for financial transaction import',
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
          `Mapped column "${col}" does not exist in CSV headers: [${headers.join(', ')}]`,
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
      const parsedTime = Date.parse(rawDate);
      if (!rawDate || Number.isNaN(parsedTime)) {
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
      const txDate = new Date(parsedTime);

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
        name: `CSV Upload: ${dto.fileName}`,
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

    return batch;
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
    return batch;
  }
}
