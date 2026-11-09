import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountType,
  BillStatus,
  BudgetStatus,
  InvoiceStatus,
  TransactionType,
} from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { PrismaService } from '../../database/prisma.service.js';
import { BudgetsService } from '../budgets/budgets.service.js';
import { InvoicesPayablesService } from '../invoices-payables/invoices-payables.service.js';

export interface DeterministicMetricResult<T = string | null> {
  metricKey: string;
  name: string;
  status: 'COMPUTED' | 'UNSUPPORTED_MISSING_DATA';
  value: T;
  unit: 'CURRENCY' | 'PERCENTAGE' | 'RATIO' | 'MONTHS' | 'SCHEDULE';
  formula: string;
  formulaVersion: string;
  reportingPeriod: {
    startDate: string;
    endDate: string;
  };
  currency: string;
  sourceRecordIds: {
    accountIds?: string[];
    transactionIds?: string[];
    invoiceIds?: string[];
    billIds?: string[];
    budgetIds?: string[];
  };
  dataLimitations: string[];
  components?: Record<string, string>;
}

@Injectable()
export class FinancialAnalyticsService {
  static readonly FORMULA_VERSION = 'v1.0.0-decimal';

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesPayables: InvoicesPayablesService,
    private readonly budgetsService: BudgetsService,
  ) {}

  async computeAllMetrics(
    organizationId: string,
    options: { startDate?: Date; endDate?: Date } = {},
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const endDate = options.endDate ?? new Date();
    const startDate = options.startDate ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const periodDurationMs = Math.max(24 * 60 * 60 * 1000, endDate.getTime() - startDate.getTime());
    const priorStartDate = new Date(startDate.getTime() - periodDurationMs);
    const priorEndDate = new Date(startDate.getTime() - 1);

    const periodInfo = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
    const currency = org.baseCurrency;

    const [accounts, currentTxs, priorTxs, openInvoices, openBills, activeBudgets, agingSchedule] =
      await Promise.all([
        this.prisma.financialAccount.findMany({
          where: { organizationId, isArchived: false },
        }),
        this.prisma.financialTransaction.findMany({
          where: {
            organizationId,
            isArchived: false,
            transactionDate: { gte: startDate, lte: endDate },
          },
        }),
        this.prisma.financialTransaction.findMany({
          where: {
            organizationId,
            isArchived: false,
            transactionDate: { gte: priorStartDate, lte: priorEndDate },
          },
        }),
        this.prisma.invoice.findMany({
          where: {
            organizationId,
            isArchived: false,
            outstandingBalance: { gt: 0 },
            status: { not: InvoiceStatus.VOID },
          },
        }),
        this.prisma.bill.findMany({
          where: {
            organizationId,
            isArchived: false,
            outstandingBalance: { gt: 0 },
            status: { not: BillStatus.VOID },
          },
        }),
        this.prisma.budget.findMany({
          where: {
            organizationId,
            status: BudgetStatus.ACTIVE,
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
          include: { lines: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.invoicesPayables.computeAgingReport(organizationId, endDate),
      ]);

    // Liquid cash accounts
    const liquidAccounts = accounts.filter(
      (a) =>
        a.isLiquid &&
        (a.type === AccountType.BANK ||
          a.type === AccountType.CASH ||
          a.type === AccountType.ASSET),
    );
    const shortTermDebtAccounts = accounts.filter(
      (a) => a.type === AccountType.CREDIT_CARD || a.type === AccountType.SHORT_TERM_DEBT,
    );

    const liquidCashBalance = DecimalMath.sum(liquidAccounts.map((a) => a.currentBalance));
    const shortTermDebtBalance = DecimalMath.sum(
      shortTermDebtAccounts.map((a) => a.currentBalance.abs()),
    );

    const incomeTxs = currentTxs.filter((t) => t.type === TransactionType.INCOME);
    const expenseTxs = currentTxs.filter((t) => t.type === TransactionType.EXPENSE);
    const cogsTxs = expenseTxs.filter((t) => t.isCostOfGoodsSold);
    const priorExpenseTxs = priorTxs.filter((t) => t.type === TransactionType.EXPENSE);

    const totalRevenue = DecimalMath.sum(incomeTxs.map((t) => t.amount));
    const totalExpenses = DecimalMath.sum(expenseTxs.map((t) => t.amount));
    const totalCogs = DecimalMath.sum(cogsTxs.map((t) => t.amount));
    const priorTotalExpenses = DecimalMath.sum(priorExpenseTxs.map((t) => t.amount));

    const totalOpenReceivables = DecimalMath.sum(openInvoices.map((i) => i.outstandingBalance));
    const totalOpenPayables = DecimalMath.sum(openBills.map((b) => b.outstandingBalance));

    const currentAssets = DecimalMath.add(liquidCashBalance, totalOpenReceivables);
    const currentLiabilities = DecimalMath.add(totalOpenPayables, shortTermDebtBalance);

    // 1. Operating Cash Flow
    const operatingCashFlowVal = DecimalMath.sub(totalRevenue, totalExpenses);
    const operatingCashFlow: DeterministicMetricResult =
      currentTxs.length === 0
        ? {
            metricKey: 'operatingCashFlow',
            name: 'Operating Cash Flow',
            status: 'UNSUPPORTED_MISSING_DATA',
            value: null,
            unit: 'CURRENCY',
            formula: 'OperatingCashFlow = CashInflows - CashOutflows',
            formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
            reportingPeriod: periodInfo,
            currency,
            sourceRecordIds: { transactionIds: [] },
            dataLimitations: ['No financial transactions recorded in the reporting period.'],
          }
        : {
            metricKey: 'operatingCashFlow',
            name: 'Operating Cash Flow',
            status: 'COMPUTED',
            value: DecimalMath.toFixed4(operatingCashFlowVal),
            unit: 'CURRENCY',
            formula: 'OperatingCashFlow = CashInflows - CashOutflows',
            formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
            reportingPeriod: periodInfo,
            currency,
            sourceRecordIds: {
              transactionIds: currentTxs.map((t) => t.id),
            },
            dataLimitations: [],
            components: {
              cashInflows: DecimalMath.toFixed4(totalRevenue),
              cashOutflows: DecimalMath.toFixed4(totalExpenses),
            },
          };

    // 2. Cash Runway
    const periodDays = Math.max(1, Math.round(periodDurationMs / (24 * 60 * 60 * 1000)));
    const netBurnInPeriod = DecimalMath.sub(totalExpenses, totalRevenue);
    const monthlyNetBurn = netBurnInPeriod.mul(30).div(periodDays).toDecimalPlaces(4);

    let cashRunway: DeterministicMetricResult;
    if (liquidAccounts.length === 0) {
      cashRunway = {
        metricKey: 'cashRunway',
        name: 'Cash Runway',
        status: 'UNSUPPORTED_MISSING_DATA',
        value: null,
        unit: 'MONTHS',
        formula: 'CashRunwayMonths = LiquidCashBalance / MonthlyNetBurnRate',
        formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
        reportingPeriod: periodInfo,
        currency,
        sourceRecordIds: { accountIds: [], transactionIds: [] },
        dataLimitations: ['No liquid bank or cash accounts configured.'],
      };
    } else if (monthlyNetBurn.lte(DecimalMath.ZERO)) {
      cashRunway = {
        metricKey: 'cashRunway',
        name: 'Cash Runway',
        status: 'COMPUTED',
        value: '999.0000', // Self-sustaining / cash-flow positive
        unit: 'MONTHS',
        formula:
          'CashRunwayMonths = LiquidCashBalance / MonthlyNetBurnRate (NetBurn <= 0 -> Self-Sustaining)',
        formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
        reportingPeriod: periodInfo,
        currency,
        sourceRecordIds: {
          accountIds: liquidAccounts.map((a) => a.id),
          transactionIds: currentTxs.map((t) => t.id),
        },
        dataLimitations: [
          'Organization is cash-flow positive or break-even in this period (no net cash burn).',
        ],
        components: {
          liquidCashBalance: DecimalMath.toFixed4(liquidCashBalance),
          monthlyNetBurn: DecimalMath.toFixed4(monthlyNetBurn),
        },
      };
    } else {
      const runwayMonths =
        DecimalMath.divSafe(liquidCashBalance, monthlyNetBurn) ?? DecimalMath.ZERO;
      cashRunway = {
        metricKey: 'cashRunway',
        name: 'Cash Runway',
        status: 'COMPUTED',
        value: DecimalMath.toFixed4(runwayMonths),
        unit: 'MONTHS',
        formula: 'CashRunwayMonths = LiquidCashBalance / MonthlyNetBurnRate',
        formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
        reportingPeriod: periodInfo,
        currency,
        sourceRecordIds: {
          accountIds: liquidAccounts.map((a) => a.id),
          transactionIds: currentTxs.map((t) => t.id),
        },
        dataLimitations: [],
        components: {
          liquidCashBalance: DecimalMath.toFixed4(liquidCashBalance),
          monthlyNetBurn: DecimalMath.toFixed4(monthlyNetBurn),
        },
      };
    }

    // 3. Current Ratio
    const currentRatioVal = DecimalMath.divSafe(currentAssets, currentLiabilities);
    const currentRatio: DeterministicMetricResult =
      currentRatioVal === null
        ? {
            metricKey: 'currentRatio',
            name: 'Current Ratio',
            status: 'UNSUPPORTED_MISSING_DATA',
            value: null,
            unit: 'RATIO',
            formula: 'CurrentRatio = CurrentAssets / CurrentLiabilities',
            formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
            reportingPeriod: periodInfo,
            currency,
            sourceRecordIds: {
              accountIds: liquidAccounts.map((a) => a.id),
              invoiceIds: openInvoices.map((i) => i.id),
              billIds: openBills.map((b) => b.id),
            },
            dataLimitations: [
              'Current liabilities (open supplier bills and short-term debt) are zero; division by zero prevented.',
            ],
          }
        : {
            metricKey: 'currentRatio',
            name: 'Current Ratio',
            status: 'COMPUTED',
            value: DecimalMath.toFixed4(currentRatioVal),
            unit: 'RATIO',
            formula: 'CurrentRatio = CurrentAssets / CurrentLiabilities',
            formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
            reportingPeriod: periodInfo,
            currency,
            sourceRecordIds: {
              accountIds: [...liquidAccounts, ...shortTermDebtAccounts].map((a) => a.id),
              invoiceIds: openInvoices.map((i) => i.id),
              billIds: openBills.map((b) => b.id),
            },
            dataLimitations: ['Inventory is excluded unless tracked in current asset accounts.'],
            components: {
              currentAssets: DecimalMath.toFixed4(currentAssets),
              currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
            },
          };

    // 4. Quick Ratio
    const quickAssets = DecimalMath.add(liquidCashBalance, totalOpenReceivables);
    const quickRatioVal = DecimalMath.divSafe(quickAssets, currentLiabilities);
    const quickRatio: DeterministicMetricResult =
      quickRatioVal === null
        ? {
            metricKey: 'quickRatio',
            name: 'Quick Ratio (Acid-Test)',
            status: 'UNSUPPORTED_MISSING_DATA',
            value: null,
            unit: 'RATIO',
            formula: 'QuickRatio = (LiquidCash + AccountsReceivable) / CurrentLiabilities',
            formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
            reportingPeriod: periodInfo,
            currency,
            sourceRecordIds: {
              accountIds: liquidAccounts.map((a) => a.id),
              invoiceIds: openInvoices.map((i) => i.id),
              billIds: openBills.map((b) => b.id),
            },
            dataLimitations: [
              'Current liabilities are zero; quick ratio cannot be calculated without liabilities.',
            ],
          }
        : {
            metricKey: 'quickRatio',
            name: 'Quick Ratio (Acid-Test)',
            status: 'COMPUTED',
            value: DecimalMath.toFixed4(quickRatioVal),
            unit: 'RATIO',
            formula: 'QuickRatio = (LiquidCash + AccountsReceivable) / CurrentLiabilities',
            formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
            reportingPeriod: periodInfo,
            currency,
            sourceRecordIds: {
              accountIds: [...liquidAccounts, ...shortTermDebtAccounts].map((a) => a.id),
              invoiceIds: openInvoices.map((i) => i.id),
              billIds: openBills.map((b) => b.id),
            },
            dataLimitations: [],
            components: {
              liquidCash: DecimalMath.toFixed4(liquidCashBalance),
              accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
              currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
            },
          };

    // 5. Gross Margin
    const grossProfit = DecimalMath.sub(totalRevenue, totalCogs);
    const grossMarginVal = DecimalMath.percentage(grossProfit, totalRevenue);
    const grossMargin: DeterministicMetricResult =
      grossMarginVal === null
        ? {
            metricKey: 'grossMargin',
            name: 'Gross Margin',
            status: 'UNSUPPORTED_MISSING_DATA',
            value: null,
            unit: 'PERCENTAGE',
            formula: 'GrossMarginPct = ((Revenue - CostOfGoodsSold) / Revenue) * 100',
            formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
            reportingPeriod: periodInfo,
            currency,
            sourceRecordIds: { transactionIds: [] },
            dataLimitations: ['No revenue transactions recorded in the reporting period.'],
          }
        : {
            metricKey: 'grossMargin',
            name: 'Gross Margin',
            status: 'COMPUTED',
            value: DecimalMath.toFixed4(grossMarginVal),
            unit: 'PERCENTAGE',
            formula: 'GrossMarginPct = ((Revenue - CostOfGoodsSold) / Revenue) * 100',
            formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
            reportingPeriod: periodInfo,
            currency,
            sourceRecordIds: {
              transactionIds: [...incomeTxs, ...cogsTxs].map((t) => t.id),
            },
            dataLimitations:
              cogsTxs.length === 0
                ? [
                    'No expense transactions marked with isCostOfGoodsSold=true in period; COGS treated as 0.0000.',
                  ]
                : [],
            components: {
              revenue: DecimalMath.toFixed4(totalRevenue),
              costOfGoodsSold: DecimalMath.toFixed4(totalCogs),
              grossProfit: DecimalMath.toFixed4(grossProfit),
            },
          };

    // 6. Expense Growth
    const expenseGrowthVal = DecimalMath.growthRatePct(totalExpenses, priorTotalExpenses);
    const expenseGrowth: DeterministicMetricResult =
      expenseGrowthVal === null
        ? {
            metricKey: 'expenseGrowth',
            name: 'Period-over-Period Expense Growth',
            status: 'UNSUPPORTED_MISSING_DATA',
            value: null,
            unit: 'PERCENTAGE',
            formula:
              'ExpenseGrowthPct = ((CurrentPeriodExpenses - PriorPeriodExpenses) / PriorPeriodExpenses) * 100',
            formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
            reportingPeriod: periodInfo,
            currency,
            sourceRecordIds: {
              transactionIds: expenseTxs.map((t) => t.id),
            },
            dataLimitations: [
              `Prior comparison period (${priorStartDate.toISOString().slice(0, 10)} to ${priorEndDate.toISOString().slice(0, 10)}) has zero recorded expenses.`,
            ],
          }
        : {
            metricKey: 'expenseGrowth',
            name: 'Period-over-Period Expense Growth',
            status: 'COMPUTED',
            value: DecimalMath.toFixed4(expenseGrowthVal),
            unit: 'PERCENTAGE',
            formula:
              'ExpenseGrowthPct = ((CurrentPeriodExpenses - PriorPeriodExpenses) / PriorPeriodExpenses) * 100',
            formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
            reportingPeriod: periodInfo,
            currency,
            sourceRecordIds: {
              transactionIds: [...expenseTxs, ...priorExpenseTxs].map((t) => t.id),
            },
            dataLimitations: [],
            components: {
              currentPeriodExpenses: DecimalMath.toFixed4(totalExpenses),
              priorPeriodExpenses: DecimalMath.toFixed4(priorTotalExpenses),
            },
          };

    // 7. Working Capital
    const workingCapitalVal = DecimalMath.sub(currentAssets, currentLiabilities);
    const workingCapital: DeterministicMetricResult =
      liquidAccounts.length === 0 && openInvoices.length === 0 && openBills.length === 0
        ? {
            metricKey: 'workingCapital',
            name: 'Net Working Capital',
            status: 'UNSUPPORTED_MISSING_DATA',
            value: null,
            unit: 'CURRENCY',
            formula: 'WorkingCapital = CurrentAssets - CurrentLiabilities',
            formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
            reportingPeriod: periodInfo,
            currency,
            sourceRecordIds: { accountIds: [], invoiceIds: [], billIds: [] },
            dataLimitations: [
              'No accounts, receivables, or payables exist to compute working capital.',
            ],
          }
        : {
            metricKey: 'workingCapital',
            name: 'Net Working Capital',
            status: 'COMPUTED',
            value: DecimalMath.toFixed4(workingCapitalVal),
            unit: 'CURRENCY',
            formula: 'WorkingCapital = CurrentAssets - CurrentLiabilities',
            formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
            reportingPeriod: periodInfo,
            currency,
            sourceRecordIds: {
              accountIds: [...liquidAccounts, ...shortTermDebtAccounts].map((a) => a.id),
              invoiceIds: openInvoices.map((i) => i.id),
              billIds: openBills.map((b) => b.id),
            },
            dataLimitations: [],
            components: {
              currentAssets: DecimalMath.toFixed4(currentAssets),
              currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
            },
          };

    // 8. Budget Variance
    let budgetVariance: DeterministicMetricResult;
    if (activeBudgets.length === 0) {
      budgetVariance = {
        metricKey: 'budgetVariance',
        name: 'Budget Variance',
        status: 'UNSUPPORTED_MISSING_DATA',
        value: null,
        unit: 'PERCENTAGE',
        formula: 'BudgetVariancePct = ((TotalAllocated - TotalActualSpent) / TotalAllocated) * 100',
        formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
        reportingPeriod: periodInfo,
        currency,
        sourceRecordIds: { budgetIds: [] },
        dataLimitations: ['No active budget overlaps the selected reporting period.'],
      };
    } else {
      const primaryBudget = activeBudgets[0];
      const varianceReport = await this.budgetsService.calculateBudgetVariance(
        organizationId,
        primaryBudget.id,
      );
      budgetVariance = {
        metricKey: 'budgetVariance',
        name: 'Budget Variance',
        status: 'COMPUTED',
        value: varianceReport.totalVariancePct,
        unit: 'PERCENTAGE',
        formula: 'BudgetVariancePct = ((TotalAllocated - TotalActualSpent) / TotalAllocated) * 100',
        formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
        reportingPeriod: {
          startDate: varianceReport.periodStart,
          endDate: varianceReport.periodEnd,
        },
        currency: varianceReport.currency,
        sourceRecordIds: {
          budgetIds: [primaryBudget.id],
          transactionIds: varianceReport.lines.flatMap((l) => l.sourceTransactionIds),
        },
        dataLimitations: [],
        components: {
          totalAllocated: varianceReport.totalAllocated,
          totalActualSpent: varianceReport.totalActualSpent,
          totalVarianceAmount: varianceReport.totalVarianceAmount,
          totalUtilizationPct: varianceReport.totalUtilizationPct,
        },
      };
    }

    // 9. Receivable Aging
    const receivableAging: DeterministicMetricResult<typeof agingSchedule.receivablesAging> = {
      metricKey: 'receivableAging',
      name: 'Accounts Receivable Aging',
      status: 'COMPUTED',
      value: agingSchedule.receivablesAging,
      unit: 'SCHEDULE',
      formula:
        'DaysOverdue = floor((AsOfDate - DueDate) / 1 day) bucketed into Current, 1-30, 31-60, 61-90, 90+',
      formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
      reportingPeriod: periodInfo,
      currency,
      sourceRecordIds: {
        invoiceIds: agingSchedule.receivablesAging.sourceRecordIds,
      },
      dataLimitations: openInvoices.length === 0 ? ['No open customer invoices on record.'] : [],
    };

    // 10. Payable Aging
    const payableAging: DeterministicMetricResult<typeof agingSchedule.payablesAging> = {
      metricKey: 'payableAging',
      name: 'Accounts Payable Aging',
      status: 'COMPUTED',
      value: agingSchedule.payablesAging,
      unit: 'SCHEDULE',
      formula:
        'DaysOverdue = floor((AsOfDate - DueDate) / 1 day) bucketed into Current, 1-30, 31-60, 61-90, 90+',
      formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
      reportingPeriod: periodInfo,
      currency,
      sourceRecordIds: {
        billIds: agingSchedule.payablesAging.sourceRecordIds,
      },
      dataLimitations: openBills.length === 0 ? ['No open supplier bills on record.'] : [],
    };

    return {
      organizationId,
      currency,
      formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
      generatedAt: new Date().toISOString(),
      reportingPeriod: periodInfo,
      metrics: {
        operatingCashFlow,
        cashRunway,
        currentRatio,
        quickRatio,
        grossMargin,
        expenseGrowth,
        workingCapital,
        budgetVariance,
        receivableAging,
        payableAging,
      },
    };
  }
}
