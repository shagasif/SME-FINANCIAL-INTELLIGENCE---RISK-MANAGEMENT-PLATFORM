import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  AccountType,
  BillStatus,
  BudgetStatus,
  InvoiceStatus,
  Prisma,
  TransactionType,
} from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { PrismaService } from '../../database/prisma.service.js';
import { BudgetsService } from '../budgets/budgets.service.js';
import {
  AppliedExchangeRateInfo,
  CurrencyConversionService,
} from '../currency/currency.service.js';
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
    @Optional() private readonly currencyService?: CurrencyConversionService,
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

    const rawEndDate = options.endDate ?? new Date();
    const endDate = options.endDate
      ? rawEndDate
      : new Date(
          Date.UTC(
            rawEndDate.getUTCFullYear(),
            rawEndDate.getUTCMonth(),
            rawEndDate.getUTCDate(),
            23,
            59,
            59,
            999,
          ),
        );
    const rawStart =
      options.startDate ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = options.startDate
      ? rawStart
      : new Date(
          Date.UTC(
            rawStart.getUTCFullYear(),
            rawStart.getUTCMonth(),
            rawStart.getUTCDate(),
            0,
            0,
            0,
            0,
          ),
        );
    const periodDurationMs = Math.max(24 * 60 * 60 * 1000, endDate.getTime() - startDate.getTime());
    const priorStartDate = new Date(startDate.getTime() - periodDurationMs);
    const priorEndDate = new Date(startDate.getTime() - 1);

    const periodInfo = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    const [
      accounts,
      rawCurrentTxs,
      rawPriorTxs,
      rawOpenInvoices,
      rawOpenBills,
      activeBudgets,
      agingSchedule,
    ] = await Promise.all([
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
          status: { notIn: [InvoiceStatus.VOID, InvoiceStatus.DRAFT] },
        },
      }),
      this.prisma.bill.findMany({
        where: {
          organizationId,
          isArchived: false,
          outstandingBalance: { gt: 0 },
          status: { notIn: [BillStatus.VOID, BillStatus.DRAFT] },
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

    // Organization.baseCurrency is the single consolidated reporting currency of truth
    const currency = (org.baseCurrency || 'USD').trim().toUpperCase();
    const preloadedRates = this.currencyService
      ? await this.currencyService.loadRatesForOrganization(organizationId)
      : [];

    const appliedRateMap = new Map<string, AppliedExchangeRateInfo>();
    const globalMissingCurrencies = new Set<string>();

    const convertRecords = <T>(
      items: T[],
      getAmount: (item: T) => Prisma.Decimal,
      getCurr: (item: T) => string,
      getDate: (item: T) => Date,
    ) => {
      let sum = DecimalMath.ZERO;
      const missing: string[] = [];
      for (const item of items) {
        const amt = getAmount(item);
        const fromCurr = (getCurr(item) || currency).trim().toUpperCase();
        if (fromCurr === currency) {
          sum = DecimalMath.add(sum, amt);
          continue;
        }
        if (this.currencyService) {
          const res = this.currencyService.convertAmountSync({
            rates: preloadedRates,
            organizationId,
            amount: amt,
            fromCurrency: fromCurr,
            toCurrency: currency,
            asOfDate: getDate(item),
          });
          if (res.isConverted && res.convertedAmount !== null) {
            sum = DecimalMath.add(sum, res.convertedAmount);
            if (res.rateInfo && res.rateInfo.source !== 'IDENTITY') {
              const rateKey = `${res.rateInfo.fromCurrency}->${res.rateInfo.toCurrency}@${res.rateInfo.effectiveDate}`;
              if (!appliedRateMap.has(rateKey)) {
                appliedRateMap.set(rateKey, res.rateInfo);
              }
            }
            continue;
          }
        }
        if (!missing.includes(fromCurr)) missing.push(fromCurr);
        globalMissingCurrencies.add(fromCurr);
      }
      return { sum, missing, isComplete: missing.length === 0 };
    };

    const currentTxs = rawCurrentTxs;
    const priorTxs = rawPriorTxs;
    const openInvoices = rawOpenInvoices;
    const openBills = rawOpenBills;

    // All liquid accounts & short-term debt accounts (native balances preserved; converted at endDate for consolidation)
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

    const liquidConv = convertRecords(
      liquidAccounts,
      (a) => a.currentBalance,
      (a) => a.currency,
      () => endDate,
    );
    const debtConv = convertRecords(
      shortTermDebtAccounts,
      (a) => a.currentBalance.abs(),
      (a) => a.currency,
      () => endDate,
    );

    const incomeTxs = currentTxs.filter((t) => t.type === TransactionType.INCOME);
    const expenseTxs = currentTxs.filter((t) => t.type === TransactionType.EXPENSE);
    const cogsTxs = expenseTxs.filter((t) => t.isCostOfGoodsSold);
    const priorExpenseTxs = priorTxs.filter((t) => t.type === TransactionType.EXPENSE);

    const revConv = convertRecords(
      incomeTxs,
      (t) => t.amount,
      (t) => t.currency,
      (t) => t.transactionDate,
    );
    const expConv = convertRecords(
      expenseTxs,
      (t) => t.amount,
      (t) => t.currency,
      (t) => t.transactionDate,
    );
    const cogsConv = convertRecords(
      cogsTxs,
      (t) => t.amount,
      (t) => t.currency,
      (t) => t.transactionDate,
    );
    const priorExpConv = convertRecords(
      priorExpenseTxs,
      (t) => t.amount,
      (t) => t.currency,
      (t) => t.transactionDate,
    );
    const arConv = convertRecords(
      openInvoices,
      (i) => i.outstandingBalance,
      (i) => i.currency,
      () => endDate,
    );
    const apConv = convertRecords(
      openBills,
      (b) => b.outstandingBalance,
      (b) => b.currency,
      () => endDate,
    );

    const liquidCashBalance = liquidConv.sum;
    const shortTermDebtBalance = debtConv.sum;
    const totalRevenue = revConv.sum;
    const totalExpenses = expConv.sum;
    const totalCogs = cogsConv.sum;
    const priorTotalExpenses = priorExpConv.sum;
    const totalOpenReceivables = arConv.sum;
    const totalOpenPayables = apConv.sum;

    const currentAssets = DecimalMath.add(liquidCashBalance, totalOpenReceivables);
    const currentLiabilities = DecimalMath.add(totalOpenPayables, shortTermDebtBalance);

    const missingRateMsg = (currencies: string[]) =>
      `Incomplete calculation: missing exchange rate for ${currencies.join(', ')} -> ${currency}.`;

    const ocfMissing = Array.from(new Set([...revConv.missing, ...expConv.missing])).sort();
    const cashFlowMissing = Array.from(new Set([...liquidConv.missing, ...ocfMissing])).sort();
    const assetsMissing = Array.from(new Set([...liquidConv.missing, ...arConv.missing])).sort();
    const liabilitiesMissing = Array.from(new Set([...apConv.missing, ...debtConv.missing])).sort();
    const wcMissing = Array.from(new Set([...assetsMissing, ...liabilitiesMissing])).sort();
    const gmMissing = Array.from(new Set([...revConv.missing, ...cogsConv.missing])).sort();
    const expGrowthMissing = Array.from(
      new Set([...expConv.missing, ...priorExpConv.missing]),
    ).sort();

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
        : ocfMissing.length > 0
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
              sourceRecordIds: { transactionIds: currentTxs.map((t) => t.id) },
              dataLimitations: [missingRateMsg(ocfMissing)],
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
    } else if (cashFlowMissing.length > 0) {
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
        sourceRecordIds: {
          accountIds: liquidAccounts.map((a) => a.id),
          transactionIds: currentTxs.map((t) => t.id),
        },
        dataLimitations: [missingRateMsg(cashFlowMissing)],
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
      wcMissing.length > 0
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
              accountIds: [...liquidAccounts, ...shortTermDebtAccounts].map((a) => a.id),
              invoiceIds: openInvoices.map((i) => i.id),
              billIds: openBills.map((b) => b.id),
            },
            dataLimitations: [missingRateMsg(wcMissing)],
          }
        : currentRatioVal === null
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
      wcMissing.length > 0
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
              accountIds: [...liquidAccounts, ...shortTermDebtAccounts].map((a) => a.id),
              invoiceIds: openInvoices.map((i) => i.id),
              billIds: openBills.map((b) => b.id),
            },
            dataLimitations: [missingRateMsg(wcMissing)],
          }
        : quickRatioVal === null
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
      gmMissing.length > 0
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
            sourceRecordIds: { transactionIds: [...incomeTxs, ...cogsTxs].map((t) => t.id) },
            dataLimitations: [missingRateMsg(gmMissing)],
          }
        : grossMarginVal === null
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
      expGrowthMissing.length > 0
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
              transactionIds: [...expenseTxs, ...priorExpenseTxs].map((t) => t.id),
            },
            dataLimitations: [missingRateMsg(expGrowthMissing)],
          }
        : expenseGrowthVal === null
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
        : wcMissing.length > 0
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
              sourceRecordIds: {
                accountIds: [...liquidAccounts, ...shortTermDebtAccounts].map((a) => a.id),
                invoiceIds: openInvoices.map((i) => i.id),
                billIds: openBills.map((b) => b.id),
              },
              dataLimitations: [missingRateMsg(wcMissing)],
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
      const budgetMissing =
        'missingCurrencies' in varianceReport && Array.isArray(varianceReport.missingCurrencies)
          ? (varianceReport.missingCurrencies as string[])
          : [];
      const budgetIncomplete =
        'isComplete' in varianceReport && varianceReport.isComplete === false;

      budgetVariance = budgetIncomplete
        ? {
            metricKey: 'budgetVariance',
            name: 'Budget Variance',
            status: 'UNSUPPORTED_MISSING_DATA',
            value: null,
            unit: 'PERCENTAGE',
            formula:
              'BudgetVariancePct = ((TotalAllocated - TotalActualSpent) / TotalAllocated) * 100',
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
            dataLimitations: [
              `Incomplete calculation: missing exchange rate for ${budgetMissing.join(', ')} -> ${varianceReport.currency}.`,
            ],
          }
        : {
            metricKey: 'budgetVariance',
            name: 'Budget Variance',
            status: 'COMPUTED',
            value: varianceReport.totalVariancePct,
            unit: 'PERCENTAGE',
            formula:
              'BudgetVariancePct = ((TotalAllocated - TotalActualSpent) / TotalAllocated) * 100',
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
    const arAgingMissing =
      'missingCurrencies' in agingSchedule.receivablesAging &&
      Array.isArray(agingSchedule.receivablesAging.missingCurrencies)
        ? (agingSchedule.receivablesAging.missingCurrencies as string[])
        : [];
    const arSummary =
      'receivablesSummary' in agingSchedule ? agingSchedule.receivablesSummary : undefined;
    const arDraftCount = arSummary?.draft?.count ?? 0;
    const arDraftLimitation =
      arDraftCount > 0
        ? [
            `${arDraftCount} draft customer invoice(s) totaling ${arSummary?.draft?.totalAmount ?? '0.0000'} ${currency} are excluded from active receivables until issued.`,
          ]
        : [];
    const receivableAging: DeterministicMetricResult<typeof agingSchedule.receivablesAging> = {
      metricKey: 'receivableAging',
      name: 'Accounts Receivable Aging',
      status: arAgingMissing.length > 0 ? 'UNSUPPORTED_MISSING_DATA' : 'COMPUTED',
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
      dataLimitations:
        arAgingMissing.length > 0
          ? [missingRateMsg(arAgingMissing), ...arDraftLimitation]
          : openInvoices.length === 0
            ? ['No open customer invoices on record.', ...arDraftLimitation]
            : arDraftLimitation,
      ...(arSummary
        ? {
            components: {
              draftCount: String(arSummary.draft.count),
              draftTotal: arSummary.draft.totalAmount,
              unpaidCount: String(arSummary.unpaid.count),
              unpaidOutstanding: arSummary.unpaid.outstandingAmount,
              partiallyPaidCount: String(arSummary.partiallyPaid.count),
              partiallyPaidOutstanding: arSummary.partiallyPaid.outstandingAmount,
              paidCount: String(arSummary.paid.count),
              paidTotal: arSummary.paid.paidAmount,
            },
          }
        : {}),
    };

    // 10. Payable Aging
    const apAgingMissing =
      'missingCurrencies' in agingSchedule.payablesAging &&
      Array.isArray(agingSchedule.payablesAging.missingCurrencies)
        ? (agingSchedule.payablesAging.missingCurrencies as string[])
        : [];
    const apSummary =
      'payablesSummary' in agingSchedule ? agingSchedule.payablesSummary : undefined;
    const apDraftCount = apSummary?.draft?.count ?? 0;
    const apDraftLimitation =
      apDraftCount > 0
        ? [
            `${apDraftCount} draft supplier bill(s) totaling ${apSummary?.draft?.totalAmount ?? '0.0000'} ${currency} are excluded from active payables until opened.`,
          ]
        : [];
    const payableAging: DeterministicMetricResult<typeof agingSchedule.payablesAging> = {
      metricKey: 'payableAging',
      name: 'Accounts Payable Aging',
      status: apAgingMissing.length > 0 ? 'UNSUPPORTED_MISSING_DATA' : 'COMPUTED',
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
      dataLimitations:
        apAgingMissing.length > 0
          ? [missingRateMsg(apAgingMissing), ...apDraftLimitation]
          : openBills.length === 0
            ? ['No open supplier bills on record.', ...apDraftLimitation]
            : apDraftLimitation,
      ...(apSummary
        ? {
            components: {
              draftCount: String(apSummary.draft.count),
              draftTotal: apSummary.draft.totalAmount,
              unpaidCount: String(apSummary.unpaid.count),
              unpaidOutstanding: apSummary.unpaid.outstandingAmount,
              partiallyPaidCount: String(apSummary.partiallyPaid.count),
              partiallyPaidOutstanding: apSummary.partiallyPaid.outstandingAmount,
              paidCount: String(apSummary.paid.count),
              paidTotal: apSummary.paid.paidAmount,
            },
          }
        : {}),
    };

    const allMissingCurrencies = Array.from(
      new Set([...globalMissingCurrencies, ...arAgingMissing, ...apAgingMissing]),
    ).sort();

    return {
      organizationId,
      currency,
      formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
      generatedAt: new Date().toISOString(),
      reportingPeriod: periodInfo,
      conversionContext: {
        baseCurrency: currency,
        isComplete: allMissingCurrencies.length === 0,
        missingCurrencies: allMissingCurrencies,
        appliedRates: Array.from(appliedRateMap.values()),
      },
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
