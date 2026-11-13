import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
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

export interface MetricAuditTraceRecord {
  id: string;
  type: 'ACCOUNT' | 'INVOICE' | 'BILL' | 'TRANSACTION';
  label: string;
  classification: string;
  currency: string;
  nativeAmount: string;
  convertedAmount: string;
  role: 'CALCULATION_INPUT' | 'SUPPORTING_EVIDENCE';
}

export interface MetricAuditTrace {
  metricKey: string;
  calculationReason: string;
  status: 'COMPUTED' | 'NOT_CALCULABLE' | 'UNSUPPORTED_MISSING_DATA' | 'ERROR';
  reportingPeriod: {
    startDate: string;
    endDate: string;
  };
  currency: string;
  inputs: Record<string, string>;
  assetRecords?: MetricAuditTraceRecord[];
  liabilityRecords?: MetricAuditTraceRecord[];
  supportingRecords?: MetricAuditTraceRecord[];
}

export interface DeterministicMetricResult<T = string | null> {
  metricKey: string;
  name: string;
  status: 'COMPUTED' | 'UNSUPPORTED_MISSING_DATA' | 'NOT_CALCULABLE' | 'ERROR';
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
  auditTrace?: MetricAuditTrace;
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
    if (Number.isNaN(rawEndDate.getTime())) {
      throw new BadRequestException('Invalid endDate');
    }
    const isEndMidnightUtc =
      rawEndDate.getUTCHours() === 0 &&
      rawEndDate.getUTCMinutes() === 0 &&
      rawEndDate.getUTCSeconds() === 0 &&
      rawEndDate.getUTCMilliseconds() === 0;
    const endDate =
      !options.endDate || isEndMidnightUtc
        ? new Date(
            Date.UTC(
              rawEndDate.getUTCFullYear(),
              rawEndDate.getUTCMonth(),
              rawEndDate.getUTCDate(),
              23,
              59,
              59,
              999,
            ),
          )
        : rawEndDate;

    const rawStart =
      options.startDate ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(rawStart.getTime())) {
      throw new BadRequestException('Invalid startDate');
    }
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
    if (startDate.getTime() > endDate.getTime()) {
      throw new BadRequestException('startDate must be on or before endDate');
    }
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
        status: 'NOT_CALCULABLE',
        value: null,
        unit: 'MONTHS',
        formula:
          'CashRunwayMonths = LiquidCashBalance / MonthlyNetBurnRate (requires MonthlyNetBurnRate > 0)',
        formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
        reportingPeriod: periodInfo,
        currency,
        sourceRecordIds: {
          accountIds: liquidAccounts.map((a) => a.id),
          transactionIds: currentTxs.map((t) => t.id),
        },
        dataLimitations: [
          'Organization is cash-flow positive or break-even in this period (net cash burn <= 0); cash exhaustion runway is not applicable (self-sustaining).',
        ],
        components: {
          liquidCashBalance: DecimalMath.toFixed4(liquidCashBalance),
          monthlyNetBurn: DecimalMath.toFixed4(monthlyNetBurn),
          calculationReason:
            'Organization is cash-flow positive or break-even in this period (net cash burn <= 0); cash exhaustion runway is not calculable (self-sustaining).',
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

    // 3. Current Ratio & 4. Quick Ratio Audit Traces
    const currentAssetAuditRecords: MetricAuditTraceRecord[] = [
      ...liquidAccounts.map((a) => {
        let converted = a.currentBalance;
        if (a.currency !== currency && this.currencyService) {
          const res = this.currencyService.convertAmountSync({
            rates: preloadedRates,
            organizationId,
            amount: a.currentBalance,
            fromCurrency: a.currency,
            toCurrency: currency,
            asOfDate: endDate,
          });
          if (res.isConverted && res.convertedAmount !== null) {
            converted = res.convertedAmount;
          }
        }
        return {
          id: a.id,
          type: 'ACCOUNT' as const,
          label: a.name,
          classification: `Liquid Asset (${a.type})`,
          currency: a.currency,
          nativeAmount: DecimalMath.toFixed4(a.currentBalance),
          convertedAmount: DecimalMath.toFixed4(converted),
          role: 'CALCULATION_INPUT' as const,
        };
      }),
      ...openInvoices.map((i) => {
        let converted = i.outstandingBalance;
        if (i.currency !== currency && this.currencyService) {
          const res = this.currencyService.convertAmountSync({
            rates: preloadedRates,
            organizationId,
            amount: i.outstandingBalance,
            fromCurrency: i.currency,
            toCurrency: currency,
            asOfDate: endDate,
          });
          if (res.isConverted && res.convertedAmount !== null) {
            converted = res.convertedAmount;
          }
        }
        return {
          id: i.id,
          type: 'INVOICE' as const,
          label: `${i.invoiceNumber}${i.customerName ? ` (${i.customerName})` : ''}`,
          classification: 'Accounts Receivable',
          currency: i.currency,
          nativeAmount: DecimalMath.toFixed4(i.outstandingBalance),
          convertedAmount: DecimalMath.toFixed4(converted),
          role: 'CALCULATION_INPUT' as const,
        };
      }),
    ];

    const currentLiabilityAuditRecords: MetricAuditTraceRecord[] = [
      ...shortTermDebtAccounts.map((a) => {
        const absBal = a.currentBalance.abs();
        let converted = absBal;
        if (a.currency !== currency && this.currencyService) {
          const res = this.currencyService.convertAmountSync({
            rates: preloadedRates,
            organizationId,
            amount: absBal,
            fromCurrency: a.currency,
            toCurrency: currency,
            asOfDate: endDate,
          });
          if (res.isConverted && res.convertedAmount !== null) {
            converted = res.convertedAmount;
          }
        }
        return {
          id: a.id,
          type: 'ACCOUNT' as const,
          label: a.name,
          classification: `Short-Term Debt (${a.type})`,
          currency: a.currency,
          nativeAmount: DecimalMath.toFixed4(absBal),
          convertedAmount: DecimalMath.toFixed4(converted),
          role: 'CALCULATION_INPUT' as const,
        };
      }),
      ...openBills.map((b) => {
        let converted = b.outstandingBalance;
        if (b.currency !== currency && this.currencyService) {
          const res = this.currencyService.convertAmountSync({
            rates: preloadedRates,
            organizationId,
            amount: b.outstandingBalance,
            fromCurrency: b.currency,
            toCurrency: currency,
            asOfDate: endDate,
          });
          if (res.isConverted && res.convertedAmount !== null) {
            converted = res.convertedAmount;
          }
        }
        return {
          id: b.id,
          type: 'BILL' as const,
          label: `${b.billNumber}${b.supplierName ? ` (${b.supplierName})` : ''}`,
          classification: 'Accounts Payable',
          currency: b.currency,
          nativeAmount: DecimalMath.toFixed4(b.outstandingBalance),
          convertedAmount: DecimalMath.toFixed4(converted),
          role: 'CALCULATION_INPUT' as const,
        };
      }),
    ];

    // 3. Current Ratio
    let currentRatio: DeterministicMetricResult;
    if (liquidAccounts.length === 0) {
      currentRatio = {
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
          accountIds: [],
          invoiceIds: openInvoices.map((i) => i.id),
          billIds: openBills.map((b) => b.id),
        },
        dataLimitations: ['No liquid bank or cash accounts configured for this organization.'],
        components: {
          currentAssets: DecimalMath.toFixed4(totalOpenReceivables),
          currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
        },
      };
    } else if (assetsMissing.length > 0) {
      currentRatio = {
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
        dataLimitations: [missingRateMsg(assetsMissing)],
        components: {
          currentAssets: DecimalMath.toFixed4(currentAssets),
          currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
        },
      };
    } else if (liabilitiesMissing.length > 0) {
      currentRatio = {
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
        dataLimitations: [missingRateMsg(liabilitiesMissing)],
        components: {
          currentAssets: DecimalMath.toFixed4(currentAssets),
          currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
        },
      };
    } else if (currentLiabilities.isZero()) {
      currentRatio = {
        metricKey: 'currentRatio',
        name: 'Current Ratio',
        status: 'NOT_CALCULABLE',
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
        dataLimitations: [
          'Current liabilities (open supplier bills and short-term debt) are verified zero; ratio cannot be mathematically calculated (division by zero prevented).',
        ],
        components: {
          currentAssets: DecimalMath.toFixed4(currentAssets),
          currentLiabilities: '0.0000',
          liquidCash: DecimalMath.toFixed4(liquidCashBalance),
          accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
          shortTermDebt: DecimalMath.toFixed4(shortTermDebtBalance),
          openBillsPayable: DecimalMath.toFixed4(totalOpenPayables),
          calculationReason:
            'Current liabilities are verified zero (0 open supplier bills, 0 short-term debt accounts). Division by zero prevented; metric is not calculable.',
        },
        auditTrace: {
          metricKey: 'currentRatio',
          calculationReason:
            'Current liabilities are verified zero (0 open supplier bills, 0 short-term debt accounts). Division by zero prevented; metric is not calculable.',
          status: 'NOT_CALCULABLE',
          reportingPeriod: periodInfo,
          currency,
          inputs: {
            currentAssets: DecimalMath.toFixed4(currentAssets),
            currentLiabilities: '0.0000',
            liquidCash: DecimalMath.toFixed4(liquidCashBalance),
            accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
            shortTermDebt: DecimalMath.toFixed4(shortTermDebtBalance),
            openBillsPayable: DecimalMath.toFixed4(totalOpenPayables),
          },
          assetRecords: currentAssetAuditRecords,
          liabilityRecords: currentLiabilityAuditRecords,
        },
      };
    } else {
      const currentRatioVal = DecimalMath.divSafe(currentAssets, currentLiabilities);
      currentRatio = {
        metricKey: 'currentRatio',
        name: 'Current Ratio',
        status: 'COMPUTED',
        value: DecimalMath.toFixed4(currentRatioVal ?? DecimalMath.ZERO),
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
          liquidCash: DecimalMath.toFixed4(liquidCashBalance),
          accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
          shortTermDebt: DecimalMath.toFixed4(shortTermDebtBalance),
          openBillsPayable: DecimalMath.toFixed4(totalOpenPayables),
          calculationReason: `Calculated as CurrentAssets (${DecimalMath.toFixed4(currentAssets)}) / CurrentLiabilities (${DecimalMath.toFixed4(currentLiabilities)})`,
        },
        auditTrace: {
          metricKey: 'currentRatio',
          calculationReason: `Calculated as CurrentAssets (${DecimalMath.toFixed4(currentAssets)}) / CurrentLiabilities (${DecimalMath.toFixed4(currentLiabilities)})`,
          status: 'COMPUTED',
          reportingPeriod: periodInfo,
          currency,
          inputs: {
            currentAssets: DecimalMath.toFixed4(currentAssets),
            currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
            liquidCash: DecimalMath.toFixed4(liquidCashBalance),
            accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
            shortTermDebt: DecimalMath.toFixed4(shortTermDebtBalance),
            openBillsPayable: DecimalMath.toFixed4(totalOpenPayables),
          },
          assetRecords: currentAssetAuditRecords,
          liabilityRecords: currentLiabilityAuditRecords,
        },
      };
    }

    // 4. Quick Ratio
    const quickAssets = DecimalMath.add(liquidCashBalance, totalOpenReceivables);
    let quickRatio: DeterministicMetricResult;
    if (liquidAccounts.length === 0) {
      quickRatio = {
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
          accountIds: [],
          invoiceIds: openInvoices.map((i) => i.id),
          billIds: openBills.map((b) => b.id),
        },
        dataLimitations: ['No liquid bank or cash accounts configured for this organization.'],
        components: {
          liquidCash: '0.0000',
          accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
          quickAssets: DecimalMath.toFixed4(totalOpenReceivables),
          currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
        },
      };
    } else if (assetsMissing.length > 0) {
      quickRatio = {
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
        dataLimitations: [missingRateMsg(assetsMissing)],
        components: {
          liquidCash: DecimalMath.toFixed4(liquidCashBalance),
          accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
          quickAssets: DecimalMath.toFixed4(quickAssets),
          currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
        },
      };
    } else if (liabilitiesMissing.length > 0) {
      quickRatio = {
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
        dataLimitations: [missingRateMsg(liabilitiesMissing)],
        components: {
          liquidCash: DecimalMath.toFixed4(liquidCashBalance),
          accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
          quickAssets: DecimalMath.toFixed4(quickAssets),
          currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
        },
      };
    } else if (currentLiabilities.isZero()) {
      quickRatio = {
        metricKey: 'quickRatio',
        name: 'Quick Ratio (Acid-Test)',
        status: 'NOT_CALCULABLE',
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
        dataLimitations: [
          'Current liabilities (open supplier bills and short-term debt) are verified zero; quick ratio cannot be mathematically calculated without liabilities.',
        ],
        components: {
          liquidCash: DecimalMath.toFixed4(liquidCashBalance),
          accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
          quickAssets: DecimalMath.toFixed4(quickAssets),
          currentLiabilities: '0.0000',
          shortTermDebt: DecimalMath.toFixed4(shortTermDebtBalance),
          openBillsPayable: DecimalMath.toFixed4(totalOpenPayables),
          calculationReason:
            'Current liabilities are verified zero (0 open supplier bills, 0 short-term debt accounts). Division by zero prevented; quick ratio is not calculable.',
        },
        auditTrace: {
          metricKey: 'quickRatio',
          calculationReason:
            'Current liabilities are verified zero (0 open supplier bills, 0 short-term debt accounts). Division by zero prevented; quick ratio is not calculable.',
          status: 'NOT_CALCULABLE',
          reportingPeriod: periodInfo,
          currency,
          inputs: {
            liquidCash: DecimalMath.toFixed4(liquidCashBalance),
            accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
            quickAssets: DecimalMath.toFixed4(quickAssets),
            currentLiabilities: '0.0000',
            shortTermDebt: DecimalMath.toFixed4(shortTermDebtBalance),
            openBillsPayable: DecimalMath.toFixed4(totalOpenPayables),
          },
          assetRecords: currentAssetAuditRecords,
          liabilityRecords: currentLiabilityAuditRecords,
        },
      };
    } else {
      const quickRatioVal = DecimalMath.divSafe(quickAssets, currentLiabilities);
      quickRatio = {
        metricKey: 'quickRatio',
        name: 'Quick Ratio (Acid-Test)',
        status: 'COMPUTED',
        value: DecimalMath.toFixed4(quickRatioVal ?? DecimalMath.ZERO),
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
          quickAssets: DecimalMath.toFixed4(quickAssets),
          currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
          shortTermDebt: DecimalMath.toFixed4(shortTermDebtBalance),
          openBillsPayable: DecimalMath.toFixed4(totalOpenPayables),
          calculationReason: `Calculated as QuickAssets (${DecimalMath.toFixed4(quickAssets)}) / CurrentLiabilities (${DecimalMath.toFixed4(currentLiabilities)})`,
        },
        auditTrace: {
          metricKey: 'quickRatio',
          calculationReason: `Calculated as QuickAssets (${DecimalMath.toFixed4(quickAssets)}) / CurrentLiabilities (${DecimalMath.toFixed4(currentLiabilities)})`,
          status: 'COMPUTED',
          reportingPeriod: periodInfo,
          currency,
          inputs: {
            liquidCash: DecimalMath.toFixed4(liquidCashBalance),
            accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
            quickAssets: DecimalMath.toFixed4(quickAssets),
            currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
            shortTermDebt: DecimalMath.toFixed4(shortTermDebtBalance),
            openBillsPayable: DecimalMath.toFixed4(totalOpenPayables),
          },
          assetRecords: currentAssetAuditRecords,
          liabilityRecords: currentLiabilityAuditRecords,
        },
      };
    }

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
              status: 'NOT_CALCULABLE',
              value: null,
              unit: 'PERCENTAGE',
              formula: 'GrossMarginPct = ((Revenue - CostOfGoodsSold) / Revenue) * 100',
              formulaVersion: FinancialAnalyticsService.FORMULA_VERSION,
              reportingPeriod: periodInfo,
              currency,
              sourceRecordIds: { transactionIds: [] },
              dataLimitations: [
                'No revenue transactions recorded in the reporting period (revenue denominator is zero; gross margin is not calculable).',
              ],
            }
          : cogsTxs.length === 0 && expenseTxs.length > 0
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
                sourceRecordIds: {
                  transactionIds: [...incomeTxs, ...expenseTxs].map((t) => t.id),
                },
                dataLimitations: [
                  'No expense transactions are classified as Cost of Goods Sold (isCostOfGoodsSold=true) in this period; gross margin cannot be computed without COGS classification (operating expenses are not assumed to be COGS).',
                ],
                components: {
                  revenue: DecimalMath.toFixed4(totalRevenue),
                  costOfGoodsSold: '0.0000',
                },
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
                dataLimitations: [],
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
              status: 'NOT_CALCULABLE',
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
                `Prior comparison period (${priorStartDate.toISOString().slice(0, 10)} to ${priorEndDate.toISOString().slice(0, 10)}) has zero recorded expenses (prior expense denominator is zero; percentage growth is not calculable).`,
              ],
              components: {
                currentPeriodExpenses: DecimalMath.toFixed4(totalExpenses),
                priorPeriodExpenses: '0.0000',
                priorPeriodStart: priorStartDate.toISOString().slice(0, 10),
                priorPeriodEnd: priorEndDate.toISOString().slice(0, 10),
                calculationReason: `Prior comparison period has zero recorded expenses; percentage growth is not calculable (division by zero prevented).`,
              },
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
                priorPeriodStart: priorStartDate.toISOString().slice(0, 10),
                priorPeriodEnd: priorEndDate.toISOString().slice(0, 10),
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
                liquidCash: DecimalMath.toFixed4(liquidCashBalance),
                accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
                shortTermDebt: DecimalMath.toFixed4(shortTermDebtBalance),
                openBillsPayable: DecimalMath.toFixed4(totalOpenPayables),
                workingCapital: DecimalMath.toFixed4(workingCapitalVal),
                calculationReason: `Calculated as CurrentAssets (${DecimalMath.toFixed4(currentAssets)}) - CurrentLiabilities (${DecimalMath.toFixed4(currentLiabilities)})`,
              },
              auditTrace: {
                metricKey: 'workingCapital',
                calculationReason: `Calculated as CurrentAssets (${DecimalMath.toFixed4(currentAssets)}) - CurrentLiabilities (${DecimalMath.toFixed4(currentLiabilities)})`,
                status: 'COMPUTED',
                reportingPeriod: periodInfo,
                currency,
                inputs: {
                  currentAssets: DecimalMath.toFixed4(currentAssets),
                  currentLiabilities: DecimalMath.toFixed4(currentLiabilities),
                  liquidCash: DecimalMath.toFixed4(liquidCashBalance),
                  accountsReceivable: DecimalMath.toFixed4(totalOpenReceivables),
                  shortTermDebt: DecimalMath.toFixed4(shortTermDebtBalance),
                  openBillsPayable: DecimalMath.toFixed4(totalOpenPayables),
                },
                assetRecords: currentAssetAuditRecords,
                liabilityRecords: currentLiabilityAuditRecords,
              },
            };

    // 8. Budget Variance
    let budgetVariance: DeterministicMetricResult;
    let budgetComparisonChart: {
      budgetId: string;
      budgetName: string;
      currency: string;
      isComplete: boolean;
      lines: Array<{
        category: string;
        department: string;
        allocatedAmount: string;
        actualSpent: string;
        status: string;
      }>;
    } | null = null;
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

      budgetComparisonChart = {
        budgetId: primaryBudget.id,
        budgetName: varianceReport.budgetName,
        currency: varianceReport.currency,
        isComplete: !budgetIncomplete,
        lines: varianceReport.lines.map((l) => ({
          category: l.category,
          department: l.department,
          allocatedAmount: l.allocatedAmount,
          actualSpent: l.actualSpent,
          status: l.status,
        })),
      };

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

    // Build deterministic chart datasets from the exact same converted period transactions
    const convertSingleTx = (tx: (typeof currentTxs)[number]): Prisma.Decimal | null => {
      const fromCurr = (tx.currency || currency).trim().toUpperCase();
      if (fromCurr === currency) return tx.amount;
      if (this.currencyService) {
        const res = this.currencyService.convertAmountSync({
          rates: preloadedRates,
          organizationId,
          amount: tx.amount,
          fromCurrency: fromCurr,
          toCurrency: currency,
          asOfDate: tx.transactionDate,
        });
        if (res.isConverted && res.convertedAmount !== null) {
          return res.convertedAmount;
        }
      }
      return null;
    };

    const monthMap = new Map<
      string,
      { income: Prisma.Decimal; expenses: Prisma.Decimal; cogs: Prisma.Decimal }
    >();
    const categoryMap = new Map<string, { amount: Prisma.Decimal; count: number }>();

    for (const tx of currentTxs) {
      if (tx.type !== TransactionType.INCOME && tx.type !== TransactionType.EXPENSE) continue;
      const converted = convertSingleTx(tx);
      if (converted === null) continue;

      const monthKey = tx.transactionDate.toISOString().slice(0, 7);
      const bucket = monthMap.get(monthKey) ?? {
        income: DecimalMath.ZERO,
        expenses: DecimalMath.ZERO,
        cogs: DecimalMath.ZERO,
      };
      if (tx.type === TransactionType.INCOME) {
        bucket.income = DecimalMath.add(bucket.income, converted);
      } else {
        bucket.expenses = DecimalMath.add(bucket.expenses, converted);
        if (tx.isCostOfGoodsSold) {
          bucket.cogs = DecimalMath.add(bucket.cogs, converted);
        }
        const cat = (tx as { category?: string }).category?.trim() || 'Uncategorized';
        const catEntry = categoryMap.get(cat) ?? { amount: DecimalMath.ZERO, count: 0 };
        catEntry.amount = DecimalMath.add(catEntry.amount, converted);
        catEntry.count += 1;
        categoryMap.set(cat, catEntry);
      }
      monthMap.set(monthKey, bucket);
    }

    const monthlySeries = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => {
        const [yr, mo] = month.split('-');
        const label = new Date(Date.UTC(Number(yr), Number(mo) - 1, 1)).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        });
        const netCashFlow = DecimalMath.sub(data.income, data.expenses);
        const grossMarginPct =
          cogsTxs.length > 0 && data.income.gt(DecimalMath.ZERO)
            ? DecimalMath.toFixed4(
                DecimalMath.percentage(DecimalMath.sub(data.income, data.cogs), data.income) ??
                  DecimalMath.ZERO,
              )
            : null;
        return {
          month,
          label,
          income: DecimalMath.toFixed4(data.income),
          expenses: DecimalMath.toFixed4(data.expenses),
          netCashFlow: DecimalMath.toFixed4(netCashFlow),
          cogs: DecimalMath.toFixed4(data.cogs),
          grossMarginPct,
        };
      });

    const expenseBreakdown = Array.from(categoryMap.entries())
      .sort((a, b) => b[1].amount.comparedTo(a[1].amount))
      .map(([category, data]) => ({
        category,
        amount: DecimalMath.toFixed4(data.amount),
        percentage: DecimalMath.toFixed4(
          totalExpenses.gt(DecimalMath.ZERO)
            ? DecimalMath.percentage(data.amount, totalExpenses) ?? DecimalMath.ZERO
            : DecimalMath.ZERO,
        ),
        count: data.count,
      }));

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
      charts: {
        monthlySeries,
        expenseBreakdown,
        profitabilityTrend: {
          isAvailable:
            cogsTxs.length > 0 && totalRevenue.gt(DecimalMath.ZERO) && gmMissing.length === 0,
          reason:
            cogsTxs.length === 0
              ? grossMargin.dataLimitations[0] ?? 'No classified COGS data available.'
              : null,
        },
        budgetComparison: budgetComparisonChart,
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
