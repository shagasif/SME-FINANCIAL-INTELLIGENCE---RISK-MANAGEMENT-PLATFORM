import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, TransactionType } from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CashFlowForecastingService } from '../cash-flow-forecasting/cash-flow-forecasting.service.js';
import { CurrencyConversionService } from '../currency/currency.service.js';
import { FinancialAnalyticsService } from '../financial-analytics/financial-analytics.service.js';
import { GenerateFinMemorySnapshotDto } from './dto/finmemory.dto.js';

@Injectable()
export class FinMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: FinancialAnalyticsService,
    private readonly forecasting: CashFlowForecastingService,
    private readonly audit: AuditService,
    @Optional() private readonly currencyService?: CurrencyConversionService,
  ) {}

  async generateSnapshot(
    organizationId: string,
    dto: GenerateFinMemorySnapshotDto,
    actorUserId: string,
  ) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    const [analyticsBundle, periodTxs, periodDecisions, overlappingForecasts] = await Promise.all([
      this.analytics.computeAllMetrics(organizationId, {
        startDate: periodStart,
        endDate: periodEnd,
      }),
      this.prisma.financialTransaction.findMany({
        where: {
          organizationId,
          isArchived: false,
          transactionDate: { gte: periodStart, lte: periodEnd },
        },
      }),
      this.prisma.reviewDecision.findMany({
        where: {
          organizationId,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cashFlowForecast.findMany({
        where: {
          organizationId,
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
        orderBy: { generatedAt: 'desc' },
        take: 3,
      }),
    ]);

    const m = analyticsBundle.metrics;
    const totalRevenue = DecimalMath.of(m.operatingCashFlow.components?.cashInflows ?? '0.0000');
    const totalExpenses = DecimalMath.of(m.operatingCashFlow.components?.cashOutflows ?? '0.0000');
    const operatingCashFlow = DecimalMath.of(m.operatingCashFlow.value ?? '0.0000');
    const closingCashBalance = DecimalMath.of(
      m.cashRunway.components?.liquidCashBalance ?? '0.0000',
    );
    const workingCapital = DecimalMath.of(m.workingCapital.value ?? '0.0000');

    // Compute data completeness score (0 - 100) across 5 pillars:
    // 1. Liquid accounts present, 2. Income transactions present, 3. Expense transactions present,
    // 4. Invoices/Bills present, 5. Active budget present
    let completenessPoints = 0;
    if ((m.cashRunway.sourceRecordIds.accountIds?.length ?? 0) > 0) completenessPoints += 25;
    if (periodTxs.some((t) => t.type === TransactionType.INCOME)) completenessPoints += 25;
    if (periodTxs.some((t) => t.type === TransactionType.EXPENSE)) completenessPoints += 20;
    if (
      (m.receivableAging.sourceRecordIds.invoiceIds?.length ?? 0) > 0 ||
      (m.payableAging.sourceRecordIds.billIds?.length ?? 0) > 0
    ) {
      completenessPoints += 15;
    }
    if ((m.budgetVariance.sourceRecordIds.budgetIds?.length ?? 0) > 0) completenessPoints += 15;
    const completenessScore = DecimalMath.of(completenessPoints);

    const preloadedRates = this.currencyService
      ? await this.currencyService.loadRatesForOrganization(organizationId)
      : [];

    // Identify recurring patterns in period transactions (converted to Organization.baseCurrency)
    const categoryTotals = new Map<
      string,
      { count: number; total: Prisma.Decimal; ids: string[]; isComplete: boolean }
    >();
    for (const tx of periodTxs) {
      const key = `${tx.type}:${tx.category}`;
      const existing = categoryTotals.get(key) ?? {
        count: 0,
        total: DecimalMath.ZERO,
        ids: [],
        isComplete: true,
      };
      existing.count += 1;
      existing.ids.push(tx.id);

      const txCurr = (tx.currency || analyticsBundle.currency).trim().toUpperCase();
      if (txCurr === analyticsBundle.currency) {
        existing.total = DecimalMath.add(existing.total, tx.amount);
      } else if (this.currencyService) {
        const conv = this.currencyService.convertAmountSync({
          rates: preloadedRates,
          organizationId,
          amount: tx.amount,
          fromCurrency: txCurr,
          toCurrency: analyticsBundle.currency,
          asOfDate: tx.transactionDate,
        });
        if (conv.isConverted && conv.convertedAmount !== null) {
          existing.total = DecimalMath.add(existing.total, conv.convertedAmount);
        } else {
          existing.isComplete = false;
        }
      } else {
        existing.isComplete = false;
      }

      categoryTotals.set(key, existing);
    }

    const recurringPatterns = Array.from(categoryTotals.entries()).map(([key, stat]) => {
      const [type, category] = key.split(':');
      return {
        type,
        category,
        currency: analyticsBundle.currency,
        occurrenceCount: stat.count,
        totalAmount: stat.isComplete ? DecimalMath.toFixed4(stat.total) : null,
        isComplete: stat.isComplete,
        isRecurringPattern: stat.count >= 2,
        sourceTransactionIds: stat.ids,
      };
    });

    // Compare overlapping forecasts with actuals
    const forecastComparisons = [];
    for (const fc of overlappingForecasts) {
      const comp = await this.forecasting.compareForecastWithActuals(organizationId, fc.id);
      forecastComparisons.push(comp);
    }

    // Compare with prior snapshot if available
    const priorSnapshot = await this.prisma.financialMetricSnapshot.findFirst({
      where: {
        organizationId,
        periodEnd: { lt: periodStart },
      },
      orderBy: { periodEnd: 'desc' },
    });

    const historicalInsights: Array<{
      insightType: string;
      summary: string;
      deltaPct: string | null;
      evidenceRecordIds: string[];
    }> = [];

    if (priorSnapshot) {
      const revGrowth = DecimalMath.growthRatePct(totalRevenue, priorSnapshot.totalRevenue);
      const expGrowth = DecimalMath.growthRatePct(totalExpenses, priorSnapshot.totalExpenses);
      const cashDelta = DecimalMath.sub(closingCashBalance, priorSnapshot.closingCashBalance);
      const wcDelta = DecimalMath.sub(workingCapital, priorSnapshot.workingCapital);

      historicalInsights.push(
        {
          insightType: 'REVENUE_TRAJECTORY',
          summary: `Revenue changed from ${DecimalMath.toFixed4(priorSnapshot.totalRevenue)} (${priorSnapshot.periodKey}) to ${DecimalMath.toFixed4(totalRevenue)} (${dto.periodKey}).`,
          deltaPct: revGrowth ? DecimalMath.toFixed4(revGrowth) : null,
          evidenceRecordIds: periodTxs
            .filter((t) => t.type === TransactionType.INCOME)
            .map((t) => t.id),
        },
        {
          insightType: 'EXPENSE_TRAJECTORY',
          summary: `Operating expenses changed from ${DecimalMath.toFixed4(priorSnapshot.totalExpenses)} (${priorSnapshot.periodKey}) to ${DecimalMath.toFixed4(totalExpenses)} (${dto.periodKey}).`,
          deltaPct: expGrowth ? DecimalMath.toFixed4(expGrowth) : null,
          evidenceRecordIds: periodTxs
            .filter((t) => t.type === TransactionType.EXPENSE)
            .map((t) => t.id),
        },
        {
          insightType: 'CASH_AND_WORKING_CAPITAL_SHIFT',
          summary: `Closing liquid cash shifted by ${DecimalMath.toFixed4(cashDelta)} and net working capital shifted by ${DecimalMath.toFixed4(wcDelta)} compared with ${priorSnapshot.periodKey}.`,
          deltaPct: null,
          evidenceRecordIds: m.workingCapital.sourceRecordIds.accountIds ?? [],
        },
      );
    } else {
      historicalInsights.push({
        insightType: 'INITIAL_BASELINE_ESTABLISHED',
        summary: `FinMemory baseline snapshot established for period ${dto.periodKey} with completeness score ${DecimalMath.toFixed2(completenessScore)}%.`,
        deltaPct: null,
        evidenceRecordIds: periodTxs.map((t) => t.id),
      });
    }

    const allSourceIds = {
      accountIds: m.workingCapital.sourceRecordIds.accountIds ?? [],
      transactionIds: periodTxs.map((t) => t.id),
      invoiceIds: m.receivableAging.sourceRecordIds.invoiceIds ?? [],
      billIds: m.payableAging.sourceRecordIds.billIds ?? [],
      budgetIds: m.budgetVariance.sourceRecordIds.budgetIds ?? [],
      reviewDecisionIds: periodDecisions.map((d) => d.id),
    };

    const allLimitations = Object.values(m).flatMap((metric) =>
      metric.dataLimitations.map((lim) => `${metric.metricKey}: ${lim}`),
    );

    const snapshot = await this.prisma.financialMetricSnapshot.create({
      data: {
        organizationId,
        periodKey: dto.periodKey.trim(),
        periodStart,
        periodEnd,
        currency: analyticsBundle.currency,
        formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
        completenessScore,
        totalRevenue,
        totalExpenses,
        operatingCashFlow,
        closingCashBalance,
        workingCapital,
        currentRatio: m.currentRatio.value ? DecimalMath.of(m.currentRatio.value) : null,
        quickRatio: m.quickRatio.value ? DecimalMath.of(m.quickRatio.value) : null,
        grossMarginPct: m.grossMargin.value ? DecimalMath.of(m.grossMargin.value) : null,
        expenseGrowthPct: m.expenseGrowth.value ? DecimalMath.of(m.expenseGrowth.value) : null,
        cashRunwayMonths: m.cashRunway.value ? DecimalMath.of(m.cashRunway.value) : null,
        budgetVariancePct: m.budgetVariance.value ? DecimalMath.of(m.budgetVariance.value) : null,
        overdueReceivables: DecimalMath.of(m.receivableAging.value?.totalOverdue ?? '0.0000'),
        overduePayables: DecimalMath.of(m.payableAging.value?.totalOverdue ?? '0.0000'),
        metricsPayload: m as unknown as Prisma.InputJsonValue,
        sourceRecordIds: allSourceIds as unknown as Prisma.InputJsonValue,
        dataLimitations: allLimitations as unknown as Prisma.InputJsonValue,
        recurringPatterns: recurringPatterns as unknown as Prisma.InputJsonValue,
        forecastComparison: forecastComparisons as unknown as Prisma.InputJsonValue,
        historicalInsights: historicalInsights as unknown as Prisma.InputJsonValue,
        assumptionsAndNotes: {
          notes: dto.notes ?? null,
          conversionContext: analyticsBundle.conversionContext ?? null,
          preservedUserDecisions: periodDecisions.map((d) => ({
            decisionId: d.id,
            targetType: d.targetType,
            targetId: d.targetId,
            action: d.action,
            reviewerNotes: d.reviewerNotes,
            createdAt: d.createdAt.toISOString(),
          })),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'FINMEMORY_SNAPSHOT_GENERATED',
      resourceType: 'FINANCIAL_METRIC_SNAPSHOT',
      resourceId: snapshot.id,
      details: {
        periodKey: snapshot.periodKey,
        completenessScore: DecimalMath.toFixed4(snapshot.completenessScore),
        formulaVersion: snapshot.formulaVersion,
      },
    });

    return this.serializeSnapshot(snapshot);
  }

  async listSnapshots(organizationId: string) {
    const snapshots = await this.prisma.financialMetricSnapshot.findMany({
      where: { organizationId },
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
    });
    return snapshots.map((s) => this.serializeSnapshot(s));
  }

  async compareSnapshots(organizationId: string, baseSnapshotId: string, targetSnapshotId: string) {
    const [base, target] = await Promise.all([
      this.prisma.financialMetricSnapshot.findFirst({
        where: { id: baseSnapshotId, organizationId },
      }),
      this.prisma.financialMetricSnapshot.findFirst({
        where: { id: targetSnapshotId, organizationId },
      }),
    ]);

    if (!base || !target) {
      throw new NotFoundException('One or both FinMemory snapshots were not found in organization');
    }

    const revenueChange = DecimalMath.sub(target.totalRevenue, base.totalRevenue);
    const revenueChangePct = DecimalMath.growthRatePct(target.totalRevenue, base.totalRevenue);
    const expenseChange = DecimalMath.sub(target.totalExpenses, base.totalExpenses);
    const expenseChangePct = DecimalMath.growthRatePct(target.totalExpenses, base.totalExpenses);
    const cashPositionChange = DecimalMath.sub(target.closingCashBalance, base.closingCashBalance);
    const workingCapitalChange = DecimalMath.sub(target.workingCapital, base.workingCapital);
    const budgetVarianceShift =
      base.budgetVariancePct && target.budgetVariancePct
        ? DecimalMath.sub(target.budgetVariancePct, base.budgetVariancePct)
        : null;

    return {
      organizationId,
      currency: target.currency,
      basePeriod: {
        snapshotId: base.id,
        periodKey: base.periodKey,
        formulaVersion: base.formulaVersion,
      },
      targetPeriod: {
        snapshotId: target.id,
        periodKey: target.periodKey,
        formulaVersion: target.formulaVersion,
      },
      deltas: {
        revenueChange: DecimalMath.toFixed4(revenueChange),
        revenueChangePct: revenueChangePct ? DecimalMath.toFixed4(revenueChangePct) : null,
        expenseChange: DecimalMath.toFixed4(expenseChange),
        expenseChangePct: expenseChangePct ? DecimalMath.toFixed4(expenseChangePct) : null,
        cashPositionChange: DecimalMath.toFixed4(cashPositionChange),
        workingCapitalChange: DecimalMath.toFixed4(workingCapitalChange),
        budgetVarianceShiftPct: budgetVarianceShift
          ? DecimalMath.toFixed4(budgetVarianceShift)
          : null,
      },
      evidenceLinks: {
        baseSourceRecordIds: base.sourceRecordIds,
        targetSourceRecordIds: target.sourceRecordIds,
      },
    };
  }

  serializeSnapshot(s: {
    id: string;
    organizationId: string;
    periodKey: string;
    periodStart: Date;
    periodEnd: Date;
    currency: string;
    formulaVersion: string;
    completenessScore: Prisma.Decimal;
    totalRevenue: Prisma.Decimal;
    totalExpenses: Prisma.Decimal;
    operatingCashFlow: Prisma.Decimal;
    closingCashBalance: Prisma.Decimal;
    workingCapital: Prisma.Decimal;
    currentRatio: Prisma.Decimal | null;
    quickRatio: Prisma.Decimal | null;
    grossMarginPct: Prisma.Decimal | null;
    expenseGrowthPct: Prisma.Decimal | null;
    cashRunwayMonths: Prisma.Decimal | null;
    budgetVariancePct: Prisma.Decimal | null;
    overdueReceivables: Prisma.Decimal;
    overduePayables: Prisma.Decimal;
    metricsPayload: unknown;
    sourceRecordIds: unknown;
    dataLimitations: unknown;
    recurringPatterns: unknown;
    forecastComparison: unknown;
    historicalInsights: unknown;
    assumptionsAndNotes: unknown;
    createdAt: Date;
  }) {
    return {
      ...s,
      periodStart: s.periodStart.toISOString(),
      periodEnd: s.periodEnd.toISOString(),
      completenessScore: DecimalMath.toFixed4(s.completenessScore),
      totalRevenue: DecimalMath.toFixed4(s.totalRevenue),
      totalExpenses: DecimalMath.toFixed4(s.totalExpenses),
      operatingCashFlow: DecimalMath.toFixed4(s.operatingCashFlow),
      closingCashBalance: DecimalMath.toFixed4(s.closingCashBalance),
      workingCapital: DecimalMath.toFixed4(s.workingCapital),
      currentRatio: s.currentRatio ? DecimalMath.toFixed4(s.currentRatio) : null,
      quickRatio: s.quickRatio ? DecimalMath.toFixed4(s.quickRatio) : null,
      grossMarginPct: s.grossMarginPct ? DecimalMath.toFixed4(s.grossMarginPct) : null,
      expenseGrowthPct: s.expenseGrowthPct ? DecimalMath.toFixed4(s.expenseGrowthPct) : null,
      cashRunwayMonths: s.cashRunwayMonths ? DecimalMath.toFixed4(s.cashRunwayMonths) : null,
      budgetVariancePct: s.budgetVariancePct ? DecimalMath.toFixed4(s.budgetVariancePct) : null,
      overdueReceivables: DecimalMath.toFixed4(s.overdueReceivables),
      overduePayables: DecimalMath.toFixed4(s.overduePayables),
      createdAt: s.createdAt.toISOString(),
    };
  }
}
