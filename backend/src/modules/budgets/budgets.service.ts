import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { BudgetStatus, Prisma, TransactionType } from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CurrencyConversionService } from '../currency/currency.service.js';
import { BudgetLineInputDto, CreateBudgetDto, ReviseBudgetDto } from './dto/budget.dto.js';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly currencyService?: CurrencyConversionService,
  ) {}

  private validateBudgetLines(lines: BudgetLineInputDto[]): void {
    const seenPairs = new Set<string>();
    for (const line of lines) {
      const category = line.category?.trim() ?? '';
      const department = (line.department ?? 'General').trim() || 'General';
      if (category.length < 2) {
        throw new BadRequestException('Each budget line must specify a valid category');
      }

      const allocated = DecimalMath.of(line.allocatedAmount);
      if (allocated.lte(DecimalMath.ZERO)) {
        throw new BadRequestException(
          `Allocated amount for "${category}" (${department}) must be strictly greater than zero`,
        );
      }

      const threshold = DecimalMath.of(line.alertThreshold ?? '90.0000');
      if (threshold.lt(DecimalMath.ZERO) || threshold.gt(DecimalMath.HUNDRED)) {
        throw new BadRequestException(
          `Alert threshold for "${category}" (${department}) must be between 0 and 100`,
        );
      }

      const pairKey = `${category.toLowerCase()}::${department.toLowerCase()}`;
      if (seenPairs.has(pairKey)) {
        throw new BadRequestException(
          `Duplicate budget line for category "${category}" and department "${department}"`,
        );
      }
      seenPairs.add(pairKey);
    }
  }

  async createBudget(organizationId: string, dto: CreateBudgetDto, actorUserId: string) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid budget startDate or endDate');
    }
    if (endDate.getTime() <= startDate.getTime()) {
      throw new BadRequestException('Budget endDate must be after startDate');
    }

    this.validateBudgetLines(dto.lines);
    const totalAllocated = DecimalMath.sum(dto.lines.map((l) => l.allocatedAmount));
    if (totalAllocated.lte(DecimalMath.ZERO)) {
      throw new BadRequestException('Total allocated budget must be strictly greater than zero');
    }

    const orgCurrency = this.currencyService
      ? await this.currencyService.getOrganizationBaseCurrency(organizationId)
      : 'USD';

    const budget = await this.prisma.$transaction(async (tx) => {
      const created = await tx.budget.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          periodType: dto.periodType,
          startDate,
          endDate,
          currency: (dto.currency ?? orgCurrency).toUpperCase(),
          totalAllocated,
          version: 1,
          notes: dto.notes ?? null,
          createdById: actorUserId,
          lines: {
            create: dto.lines.map((line) => ({
              category: line.category.trim(),
              department: (line.department ?? 'General').trim(),
              allocatedAmount: DecimalMath.of(line.allocatedAmount),
              alertThreshold: DecimalMath.of(line.alertThreshold ?? '90.0000'),
              notes: line.notes ?? null,
            })),
          },
        },
        include: { lines: true, revisions: true },
      });

      await tx.budgetRevision.create({
        data: {
          budgetId: created.id,
          version: 1,
          previousAllocated: DecimalMath.ZERO,
          newAllocated: totalAllocated,
          changeSummary: 'Initial budget creation',
          snapshotLines: dto.lines as unknown as Prisma.InputJsonValue,
          revisedByUserId: actorUserId,
        },
      });

      return tx.budget.findUniqueOrThrow({
        where: { id: created.id },
        include: { lines: true, revisions: true },
      });
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'BUDGET_CREATED',
      resourceType: 'BUDGET',
      resourceId: budget.id,
      details: {
        name: budget.name,
        periodType: budget.periodType,
        totalAllocated: DecimalMath.toFixed4(budget.totalAllocated),
      },
    });

    return this.serializeBudget(budget);
  }

  async reviseBudget(
    organizationId: string,
    budgetId: string,
    dto: ReviseBudgetDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.budget.findFirst({
      where: { id: budgetId, organizationId },
      include: { lines: true },
    });
    if (!existing) {
      throw new NotFoundException('Budget not found in organization');
    }
    if (existing.status === BudgetStatus.ARCHIVED) {
      throw new BadRequestException('Archived budgets cannot be revised');
    }

    this.validateBudgetLines(dto.lines);
    const newAllocated = DecimalMath.sum(dto.lines.map((l) => l.allocatedAmount));
    if (newAllocated.lte(DecimalMath.ZERO)) {
      throw new BadRequestException('Revised total allocated budget must be strictly greater than zero');
    }
    const nextVersion = existing.version + 1;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.budgetLine.deleteMany({ where: { budgetId } });

      await tx.budgetLine.createMany({
        data: dto.lines.map((l) => ({
          budgetId,
          category: l.category.trim(),
          department: (l.department ?? 'General').trim(),
          allocatedAmount: DecimalMath.of(l.allocatedAmount),
          alertThreshold: DecimalMath.of(l.alertThreshold ?? '90.0000'),
          notes: l.notes ?? null,
        })),
      });

      await tx.budgetRevision.create({
        data: {
          budgetId,
          version: nextVersion,
          previousAllocated: existing.totalAllocated,
          newAllocated,
          changeSummary: dto.changeSummary.trim(),
          snapshotLines: dto.lines as unknown as Prisma.InputJsonValue,
          revisedByUserId: actorUserId,
        },
      });

      return tx.budget.update({
        where: { id: budgetId },
        data: {
          totalAllocated: newAllocated,
          version: nextVersion,
        },
        include: {
          lines: true,
          revisions: { orderBy: { version: 'desc' } },
        },
      });
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'BUDGET_REVISED',
      resourceType: 'BUDGET',
      resourceId: budgetId,
      details: {
        version: nextVersion,
        previousAllocated: DecimalMath.toFixed4(existing.totalAllocated),
        newAllocated: DecimalMath.toFixed4(newAllocated),
        changeSummary: dto.changeSummary,
      },
    });

    return this.serializeBudget(updated);
  }

  async listBudgets(organizationId: string) {
    const budgets = await this.prisma.budget.findMany({
      where: { organizationId },
      include: {
        lines: true,
        revisions: { orderBy: { version: 'desc' } },
      },
      orderBy: { startDate: 'desc' },
    });
    return budgets.map((b) => this.serializeBudget(b));
  }

  async calculateBudgetVariance(organizationId: string, budgetId: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id: budgetId, organizationId },
      include: {
        lines: true,
        revisions: { orderBy: { version: 'desc' } },
      },
    });
    if (!budget) {
      throw new NotFoundException('Budget not found in organization');
    }

    const endOfPeriod = new Date(budget.endDate.getTime());
    endOfPeriod.setUTCHours(23, 59, 59, 999);

    const expenses = await this.prisma.financialTransaction.findMany({
      where: {
        organizationId,
        isArchived: false,
        type: TransactionType.EXPENSE,
        transactionDate: {
          gte: budget.startDate,
          lte: endOfPeriod,
        },
      },
    });

    const targetCurrency = budget.currency.trim().toUpperCase();
    const preloadedRates = this.currencyService
      ? await this.currencyService.loadRatesForOrganization(organizationId)
      : [];
    const missingCurrencies = new Set<string>();

    const convertExpenseAmount = (tx: (typeof expenses)[number]): Prisma.Decimal => {
      const txCurrency = (tx.currency || targetCurrency).trim().toUpperCase();
      if (txCurrency === targetCurrency) {
        return tx.amount;
      }
      if (this.currencyService) {
        const conv = this.currencyService.convertAmountSync({
          rates: preloadedRates,
          organizationId,
          amount: tx.amount,
          fromCurrency: txCurrency,
          toCurrency: targetCurrency,
          asOfDate: tx.transactionDate,
        });
        if (conv.isConverted && conv.convertedAmount !== null) {
          return conv.convertedAmount;
        }
      }
      missingCurrencies.add(txCurrency);
      return DecimalMath.ZERO;
    };

    // Two-pass matching prevents double-counting when both department-specific and General lines share a category:
    // Pass 1 assigns expenses to exact (category, department) lines; Pass 2 assigns remaining category expenses to General lines.
    const matchedTxIds = new Set<string>();
    const matchedByLineId = new Map<string, typeof expenses>();

    for (const line of budget.lines) {
      const lineDept = (line.department || 'General').trim().toLowerCase();
      if (lineDept === 'general') continue;
      const lineCat = line.category.trim().toLowerCase();
      const matched = expenses.filter((tx) => {
        if (matchedTxIds.has(tx.id)) return false;
        const catMatch = tx.category.trim().toLowerCase() === lineCat;
        const txDept = tx.department?.trim().toLowerCase() ?? '';
        return catMatch && txDept === lineDept;
      });
      for (const tx of matched) matchedTxIds.add(tx.id);
      matchedByLineId.set(line.id, matched);
    }

    for (const line of budget.lines) {
      const lineDept = (line.department || 'General').trim().toLowerCase();
      if (lineDept !== 'general') continue;
      const lineCat = line.category.trim().toLowerCase();
      const matched = expenses.filter((tx) => {
        if (matchedTxIds.has(tx.id)) return false;
        return tx.category.trim().toLowerCase() === lineCat;
      });
      for (const tx of matched) matchedTxIds.add(tx.id);
      matchedByLineId.set(line.id, matched);
    }

    const lineVariances = budget.lines.map((line) => {
      const matchingTxs = matchedByLineId.get(line.id) ?? [];

      let actualSpent = DecimalMath.ZERO;
      for (const tx of matchingTxs) {
        actualSpent = DecimalMath.add(actualSpent, convertExpenseAmount(tx));
      }

      const varianceAmount = DecimalMath.sub(line.allocatedAmount, actualSpent); // Positive = under budget, Negative = overrun
      const utilizationPct =
        DecimalMath.percentage(actualSpent, line.allocatedAmount) ?? DecimalMath.ZERO;
      const variancePct =
        DecimalMath.percentage(varianceAmount, line.allocatedAmount) ?? DecimalMath.ZERO;

      const isOverBudget = actualSpent.gt(line.allocatedAmount);
      const isNearThreshold = !isOverBudget && utilizationPct.gte(line.alertThreshold);

      return {
        lineId: line.id,
        category: line.category,
        department: line.department,
        allocatedAmount: DecimalMath.toFixed4(line.allocatedAmount),
        actualSpent: DecimalMath.toFixed4(actualSpent),
        varianceAmount: DecimalMath.toFixed4(varianceAmount),
        utilizationPct: DecimalMath.toFixed4(utilizationPct),
        variancePct: DecimalMath.toFixed4(variancePct),
        alertThresholdPct: DecimalMath.toFixed4(line.alertThreshold),
        status: isOverBudget ? 'OVERRUN' : isNearThreshold ? 'WARNING' : 'ON_TRACK',
        sourceTransactionIds: matchingTxs.map((t) => t.id),
      };
    });

    // Track unbudgeted expenses within the budget period so total spend is never hidden
    const unbudgetedTxs = expenses.filter((tx) => !matchedTxIds.has(tx.id));
    const unbudgetedBucketMap = new Map<
      string,
      { category: string; department: string; amount: Prisma.Decimal; transactionIds: string[] }
    >();
    let unbudgetedActualSpent = DecimalMath.ZERO;
    for (const tx of unbudgetedTxs) {
      const converted = convertExpenseAmount(tx);
      unbudgetedActualSpent = DecimalMath.add(unbudgetedActualSpent, converted);
      const cat = tx.category.trim();
      const dept = tx.department?.trim() || 'General';
      const key = `${cat.toLowerCase()}::${dept.toLowerCase()}`;
      const existingBucket = unbudgetedBucketMap.get(key);
      if (existingBucket) {
        existingBucket.amount = DecimalMath.add(existingBucket.amount, converted);
        existingBucket.transactionIds.push(tx.id);
      } else {
        unbudgetedBucketMap.set(key, {
          category: cat,
          department: dept,
          amount: converted,
          transactionIds: [tx.id],
        });
      }
    }

    const totalActualSpent = DecimalMath.sum(lineVariances.map((l) => l.actualSpent));
    const totalOrganizationExpenses = DecimalMath.add(totalActualSpent, unbudgetedActualSpent);
    const totalVarianceAmount = DecimalMath.sub(budget.totalAllocated, totalActualSpent);
    const totalUtilizationPct =
      DecimalMath.percentage(totalActualSpent, budget.totalAllocated) ?? DecimalMath.ZERO;
    const totalVariancePct =
      DecimalMath.percentage(totalVarianceAmount, budget.totalAllocated) ?? DecimalMath.ZERO;
    const missingCurrencyList = Array.from(missingCurrencies).sort();

    return {
      budgetId: budget.id,
      budgetName: budget.name,
      version: budget.version,
      periodType: budget.periodType,
      periodStart: budget.startDate.toISOString(),
      periodEnd: budget.endDate.toISOString(),
      currency: targetCurrency,
      isComplete: missingCurrencyList.length === 0,
      missingCurrencies: missingCurrencyList,
      formula:
        'VarianceAmount = AllocatedAmount - ActualSpent; UtilizationPct = (ActualSpent / AllocatedAmount) * 100',
      totalAllocated: DecimalMath.toFixed4(budget.totalAllocated),
      totalActualSpent: DecimalMath.toFixed4(totalActualSpent),
      unbudgetedActualSpent: DecimalMath.toFixed4(unbudgetedActualSpent),
      totalOrganizationExpenses: DecimalMath.toFixed4(totalOrganizationExpenses),
      totalVarianceAmount: DecimalMath.toFixed4(totalVarianceAmount),
      totalUtilizationPct: DecimalMath.toFixed4(totalUtilizationPct),
      totalVariancePct: DecimalMath.toFixed4(totalVariancePct),
      isOverBudget: totalActualSpent.gt(budget.totalAllocated),
      lines: lineVariances,
      unbudgetedCategories: Array.from(unbudgetedBucketMap.values()).map((u) => ({
        category: u.category,
        department: u.department,
        actualSpent: DecimalMath.toFixed4(u.amount),
        transactionIds: u.transactionIds,
      })),
      unbudgetedTransactionIds: unbudgetedTxs.map((t) => t.id),
      revisions: budget.revisions.map((r) => ({
        id: r.id,
        version: r.version,
        previousAllocated: DecimalMath.toFixed4(r.previousAllocated),
        newAllocated: DecimalMath.toFixed4(r.newAllocated),
        changeSummary: r.changeSummary,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  private serializeBudget(budget: {
    id: string;
    organizationId: string;
    name: string;
    periodType: string;
    startDate: Date;
    endDate: Date;
    currency: string;
    totalAllocated: Prisma.Decimal;
    status: string;
    version: number;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    lines?: Array<{
      id: string;
      category: string;
      department: string;
      allocatedAmount: Prisma.Decimal;
      alertThreshold: Prisma.Decimal;
      notes: string | null;
    }>;
    revisions?: Array<{
      id: string;
      version: number;
      previousAllocated: Prisma.Decimal;
      newAllocated: Prisma.Decimal;
      changeSummary: string;
      createdAt: Date;
    }>;
  }) {
    return {
      ...budget,
      totalAllocated: DecimalMath.toFixed4(budget.totalAllocated),
      startDate: budget.startDate.toISOString(),
      endDate: budget.endDate.toISOString(),
      lines: budget.lines?.map((l) => ({
        ...l,
        allocatedAmount: DecimalMath.toFixed4(l.allocatedAmount),
        alertThreshold: DecimalMath.toFixed4(l.alertThreshold),
      })),
      revisions: budget.revisions?.map((r) => ({
        ...r,
        previousAllocated: DecimalMath.toFixed4(r.previousAllocated),
        newAllocated: DecimalMath.toFixed4(r.newAllocated),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
