import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionType } from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { SecurityUtil } from '../../common/utils/security.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  CreateFinancialAccountDto,
  CreateTransactionDto,
  TransactionFilterQueryDto,
  UpdateTransactionDto,
} from './dto/financial-transaction.dto.js';

@Injectable()
export class FinancialTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  static computeDuplicateHash(params: {
    organizationId: string;
    accountId: string;
    transactionDate: Date;
    type: TransactionType;
    amount: Prisma.Decimal;
    description: string;
  }): string {
    const dateKey = params.transactionDate.toISOString().slice(0, 10);
    const normalizedDesc = params.description.trim().toLowerCase().replace(/\s+/g, ' ');
    return SecurityUtil.sha256(
      `${params.organizationId}|${params.accountId}|${dateKey}|${params.type}|${params.amount.toFixed(4)}|${normalizedDesc}`,
    );
  }

  async createAccount(organizationId: string, dto: CreateFinancialAccountDto, actorUserId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    let accountCode = dto.code?.trim();
    if (!accountCode) {
      const existingAccounts = await this.prisma.financialAccount.findMany({
        where: { organizationId },
        select: { code: true },
      });
      const codes = new Set(existingAccounts.map((a) => a.code));
      let candidate = 1010;
      while (codes.has(String(candidate))) {
        candidate += 10;
      }
      accountCode = String(candidate);
    }

    const existing = await this.prisma.financialAccount.findUnique({
      where: {
        organizationId_code: {
          organizationId,
          code: accountCode,
        },
      },
    });
    if (existing) {
      throw new ConflictException(`Account code ${accountCode} already exists in this organization`);
    }

    const opening = DecimalMath.of(dto.openingBalance ?? '0.0000');
    const currency = (dto.currency?.trim() || org.baseCurrency || 'PKR').toUpperCase();

    const account = await this.prisma.financialAccount.create({
      data: {
        organizationId,
        code: accountCode,
        name: dto.name.trim(),
        type: dto.type,
        currency,
        openingBalance: opening,
        currentBalance: opening,
        institution: dto.institution?.trim() ?? null,
        isLiquid: dto.isLiquid ?? true,
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'FINANCIAL_ACCOUNT_CREATED',
      resourceType: 'FINANCIAL_ACCOUNT',
      resourceId: account.id,
      details: {
        code: account.code,
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalance: DecimalMath.toFixed4(account.openingBalance),
      },
    });

    return this.serializeAccount(account);
  }

  async listAccounts(organizationId: string, includeArchived = false) {
    const accounts = await this.prisma.financialAccount.findMany({
      where: {
        organizationId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      orderBy: { code: 'asc' },
    });

    return accounts.map((a) => this.serializeAccount(a));
  }

  async archiveAccount(organizationId: string, accountId: string, actorUserId: string) {
    const account = await this.prisma.financialAccount.findFirst({
      where: { id: accountId, organizationId },
    });
    if (!account) {
      throw new NotFoundException('Financial account not found in organization');
    }

    const updated = await this.prisma.financialAccount.update({
      where: { id: accountId },
      data: { isArchived: true },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'FINANCIAL_ACCOUNT_ARCHIVED',
      resourceType: 'FINANCIAL_ACCOUNT',
      resourceId: accountId,
    });

    return this.serializeAccount(updated);
  }

  async createTransaction(organizationId: string, dto: CreateTransactionDto, actorUserId: string) {
    const amount = DecimalMath.of(dto.amount);
    if (amount.lte(DecimalMath.ZERO)) {
      throw new BadRequestException('Transaction amount must be strictly greater than zero');
    }

    const account = await this.prisma.financialAccount.findFirst({
      where: { id: dto.accountId, organizationId, isArchived: false },
    });
    if (!account) {
      throw new NotFoundException('Active financial account not found in this organization');
    }

    const txDate = new Date(dto.transactionDate);
    const { sanitized: sanitizedDesc } = SecurityUtil.sanitizeImportedText(dto.description);
    const { sanitized: sanitizedCounterparty } = SecurityUtil.sanitizeImportedText(
      dto.counterparty ?? '',
    );

    const duplicateHash = FinancialTransactionsService.computeDuplicateHash({
      organizationId,
      accountId: dto.accountId,
      transactionDate: txDate,
      type: dto.type,
      amount,
      description: sanitizedDesc,
    });

    const signedDelta =
      dto.type === TransactionType.INCOME
        ? amount
        : dto.type === TransactionType.EXPENSE
          ? amount.negated()
          : DecimalMath.ZERO;

    const transaction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.financialTransaction.create({
        data: {
          organizationId,
          accountId: dto.accountId,
          type: dto.type,
          amount,
          currency: (dto.currency ?? account.currency).toUpperCase(),
          transactionDate: txDate,
          description: sanitizedDesc,
          category: dto.category.trim(),
          subcategory: dto.subcategory?.trim() ?? null,
          department: dto.department?.trim() ?? null,
          counterparty: sanitizedCounterparty || null,
          reference: dto.reference?.trim() ?? null,
          isRecurring: dto.isRecurring ?? false,
          recurrenceFrequency: dto.recurrenceFrequency,
          isCostOfGoodsSold: dto.isCostOfGoodsSold ?? false,
          duplicateHash,
          createdByUserId: actorUserId,
        },
      });

      await tx.financialAccount.update({
        where: { id: account.id },
        data: {
          currentBalance: DecimalMath.add(account.currentBalance, signedDelta),
        },
      });

      return created;
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'FINANCIAL_TRANSACTION_CREATED',
      resourceType: 'FINANCIAL_TRANSACTION',
      resourceId: transaction.id,
      details: {
        type: transaction.type,
        amount: DecimalMath.toFixed4(transaction.amount),
        category: transaction.category,
        accountId: transaction.accountId,
      },
    });

    return this.serializeTransaction(transaction);
  }

  async listTransactions(organizationId: string, query: TransactionFilterQueryDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 25)));
    const skip = (page - 1) * limit;

    const where: Prisma.FinancialTransactionWhereInput = {
      organizationId,
      ...(query.includeArchived ? {} : { isArchived: false }),
      ...(query.type ? { type: query.type } : {}),
      ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
      ...(query.department
        ? { department: { equals: query.department, mode: 'insensitive' } }
        : {}),
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.startDate || query.endDate
        ? {
            transactionDate: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' } },
              { counterparty: { contains: query.search, mode: 'insensitive' } },
              { category: { contains: query.search, mode: 'insensitive' } },
              { reference: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.financialTransaction.findMany({
        where,
        include: {
          account: { select: { id: true, code: true, name: true, type: true, currency: true } },
        },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.financialTransaction.count({ where }),
    ]);

    return {
      items: items.map((t) => this.serializeTransaction(t)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateTransaction(
    organizationId: string,
    transactionId: string,
    dto: UpdateTransactionDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.financialTransaction.findFirst({
      where: { id: transactionId, organizationId },
      include: { account: true },
    });
    if (!existing) {
      throw new NotFoundException('Financial transaction not found in organization');
    }

    const newAmount = dto.amount !== undefined ? DecimalMath.of(dto.amount) : existing.amount;
    if (newAmount.lte(DecimalMath.ZERO)) {
      throw new BadRequestException('Transaction amount must be strictly greater than zero');
    }

    const newType = dto.type ?? existing.type;

    const oldSigned =
      existing.type === TransactionType.INCOME
        ? existing.amount
        : existing.type === TransactionType.EXPENSE
          ? existing.amount.negated()
          : DecimalMath.ZERO;
    const newSigned =
      newType === TransactionType.INCOME
        ? newAmount
        : newType === TransactionType.EXPENSE
          ? newAmount.negated()
          : DecimalMath.ZERO;
    const netAccountAdjustment = DecimalMath.sub(newSigned, oldSigned);

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.financialTransaction.update({
        where: { id: transactionId },
        data: {
          type: newType,
          amount: newAmount,
          transactionDate: dto.transactionDate
            ? new Date(dto.transactionDate)
            : existing.transactionDate,
          description: dto.description
            ? SecurityUtil.sanitizeImportedText(dto.description).sanitized
            : existing.description,
          category: dto.category?.trim() ?? existing.category,
          department: dto.department !== undefined ? dto.department.trim() : existing.department,
          counterparty:
            dto.counterparty !== undefined
              ? SecurityUtil.sanitizeImportedText(dto.counterparty).sanitized
              : existing.counterparty,
          isRecurring: dto.isRecurring ?? existing.isRecurring,
          recurrenceFrequency: dto.recurrenceFrequency ?? existing.recurrenceFrequency,
          isCostOfGoodsSold: dto.isCostOfGoodsSold ?? existing.isCostOfGoodsSold,
        },
      });

      if (!existing.isArchived && !netAccountAdjustment.isZero()) {
        await tx.financialAccount.update({
          where: { id: existing.accountId },
          data: {
            currentBalance: DecimalMath.add(existing.account.currentBalance, netAccountAdjustment),
          },
        });
      }

      return record;
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'FINANCIAL_TRANSACTION_UPDATED',
      resourceType: 'FINANCIAL_TRANSACTION',
      resourceId: transactionId,
      details: {
        previousAmount: DecimalMath.toFixed4(existing.amount),
        newAmount: DecimalMath.toFixed4(updated.amount),
      },
    });

    return this.serializeTransaction(updated);
  }

  async archiveTransaction(organizationId: string, transactionId: string, actorUserId: string) {
    const existing = await this.prisma.financialTransaction.findFirst({
      where: { id: transactionId, organizationId },
      include: { account: true },
    });
    if (!existing) {
      throw new NotFoundException('Financial transaction not found in organization');
    }
    if (existing.isArchived) {
      return this.serializeTransaction(existing);
    }

    const reversalDelta =
      existing.type === TransactionType.INCOME
        ? existing.amount.negated()
        : existing.type === TransactionType.EXPENSE
          ? existing.amount
          : DecimalMath.ZERO;

    const archived = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.financialTransaction.update({
        where: { id: transactionId },
        data: { isArchived: true },
      });

      if (!reversalDelta.isZero()) {
        await tx.financialAccount.update({
          where: { id: existing.accountId },
          data: {
            currentBalance: DecimalMath.add(existing.account.currentBalance, reversalDelta),
          },
        });
      }

      return updated;
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'FINANCIAL_TRANSACTION_ARCHIVED',
      resourceType: 'FINANCIAL_TRANSACTION',
      resourceId: transactionId,
    });

    return this.serializeTransaction(archived);
  }

  serializeAccount(account: {
    id: string;
    organizationId: string;
    code: string;
    name: string;
    type: string;
    currency: string;
    openingBalance: Prisma.Decimal;
    currentBalance: Prisma.Decimal;
    institution: string | null;
    isLiquid: boolean;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...account,
      openingBalance: DecimalMath.toFixed4(account.openingBalance),
      currentBalance: DecimalMath.toFixed4(account.currentBalance),
    };
  }

  serializeTransaction(tx: {
    id: string;
    organizationId: string;
    accountId: string;
    type: string;
    amount: Prisma.Decimal;
    currency: string;
    transactionDate: Date;
    description: string;
    category: string;
    subcategory: string | null;
    department: string | null;
    counterparty: string | null;
    reference: string | null;
    isRecurring: boolean;
    recurrenceFrequency: string;
    isCostOfGoodsSold: boolean;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
    account?: unknown;
  }) {
    return {
      ...tx,
      amount: DecimalMath.toFixed4(tx.amount),
      transactionDate: tx.transactionDate.toISOString(),
    };
  }
}
