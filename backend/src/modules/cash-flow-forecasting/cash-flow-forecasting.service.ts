import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  AccountType,
  BillStatus,
  ForecastScenarioType,
  InvoiceStatus,
  Prisma,
  RecurrenceFrequency,
  TransactionType,
} from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  AppliedExchangeRateInfo,
  CurrencyConversionService,
} from '../currency/currency.service.js';
import { GenerateForecastDto } from './dto/forecast.dto.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcMidnight(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function daysBetweenUtc(fromDate: Date, toDate: Date): number {
  return Math.round((toUtcMidnight(toDate).getTime() - toUtcMidnight(fromDate).getTime()) / MS_PER_DAY);
}

function daysInUtcMonth(year: number, monthZeroIndexed: number): number {
  return new Date(Date.UTC(year, monthZeroIndexed + 1, 0)).getUTCDate();
}

function matchesRecurrenceOnDate(
  anchorRaw: Date,
  frequency: RecurrenceFrequency,
  startDate: Date,
  currentDate: Date,
): boolean {
  const anchor = toUtcMidnight(anchorRaw);
  const start = toUtcMidnight(startDate);
  const current = toUtcMidnight(currentDate);

  // Never project before the recurring rule's anchor date
  if (current.getTime() < anchor.getTime()) {
    return false;
  }

  // If the anchor date is on or before startDate, its initial occurrence is already in openingCashBalance
  if (anchor.getTime() <= start.getTime() && current.getTime() <= start.getTime()) {
    return false;
  }

  const daysDiff = daysBetweenUtc(anchor, current);
  if (anchor.getTime() <= start.getTime() && daysDiff <= 0) {
    return false;
  }

  if (frequency === RecurrenceFrequency.WEEKLY) {
    return daysDiff % 7 === 0;
  }
  if (frequency === RecurrenceFrequency.BIWEEKLY) {
    return daysDiff % 14 === 0;
  }

  const monthsDiff =
    (current.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (current.getUTCMonth() - anchor.getUTCMonth());

  if (monthsDiff < 0 || (anchor.getTime() <= start.getTime() && monthsDiff === 0)) {
    return false;
  }

  const clampedAnchorDay = Math.min(
    anchor.getUTCDate(),
    daysInUtcMonth(current.getUTCFullYear(), current.getUTCMonth()),
  );
  if (current.getUTCDate() !== clampedAnchorDay) {
    return false;
  }

  if (frequency === RecurrenceFrequency.MONTHLY) {
    return true;
  }
  if (frequency === RecurrenceFrequency.QUARTERLY) {
    return monthsDiff % 3 === 0;
  }
  if (frequency === RecurrenceFrequency.ANNUALLY) {
    return monthsDiff % 12 === 0;
  }
  return false;
}

@Injectable()
export class CashFlowForecastingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly currencyService?: CurrencyConversionService,
  ) {}

  async generateForecast(organizationId: string, dto: GenerateForecastDto, actorUserId: string) {
    if (![7, 30, 60, 90].includes(dto.horizonDays)) {
      throw new BadRequestException('Forecast horizonDays must be one of 7, 30, 60, or 90');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const scenarioType = dto.scenarioType ?? ForecastScenarioType.BASE;
    const startDate = toUtcMidnight(dto.startDate ? new Date(dto.startDate) : new Date());
    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('Invalid startDate');
    }
    const startOfNextDay = new Date(startDate.getTime() + MS_PER_DAY);
    const endDate = new Date(startDate.getTime() + dto.horizonDays * MS_PER_DAY);
    const endOfWindow = new Date(endDate.getTime());
    endOfWindow.setUTCHours(23, 59, 59, 999);
    const liquiditySafetyBuffer = DecimalMath.of(dto.liquiditySafetyBuffer ?? '5000.0000');
    if (liquiditySafetyBuffer.lt(DecimalMath.ZERO)) {
      throw new BadRequestException('liquiditySafetyBuffer cannot be negative');
    }

    const [
      liquidAccounts,
      openInvoices,
      openBills,
      recurringTxs,
      futureNonRecurringTxs,
      unpostedPayments,
      latestVersionRecord,
    ] = await Promise.all([
      this.prisma.financialAccount.findMany({
        where: {
          organizationId,
          isArchived: false,
          isLiquid: true,
          type: { in: [AccountType.BANK, AccountType.CASH, AccountType.ASSET] },
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          isArchived: false,
          outstandingBalance: { gt: 0 },
          status: { notIn: [InvoiceStatus.VOID, InvoiceStatus.DRAFT] },
          dueDate: { lte: endOfWindow },
        },
      }),
      this.prisma.bill.findMany({
        where: {
          organizationId,
          isArchived: false,
          outstandingBalance: { gt: 0 },
          status: { notIn: [BillStatus.VOID, BillStatus.DRAFT] },
          dueDate: { lte: endOfWindow },
        },
      }),
      this.prisma.financialTransaction.findMany({
        where: {
          organizationId,
          isArchived: false,
          isRecurring: true,
          type: { in: [TransactionType.INCOME, TransactionType.EXPENSE] },
          recurrenceFrequency: { not: RecurrenceFrequency.NONE },
        },
      }),
      this.prisma.financialTransaction.findMany({
        where: {
          organizationId,
          isArchived: false,
          isRecurring: false,
          type: { in: [TransactionType.INCOME, TransactionType.EXPENSE] },
          transactionDate: {
            gte: startOfNextDay,
            lte: endOfWindow,
          },
        },
      }),
      this.prisma.paymentRecord?.findMany
        ? this.prisma.paymentRecord.findMany({
            where: {
              organizationId,
              transactionId: null,
            },
          })
        : Promise.resolve([]),
      this.prisma.cashFlowForecast.findFirst({
        where: {
          organizationId,
          horizonDays: dto.horizonDays,
          scenarioType,
        },
        orderBy: { version: 'desc' },
      }),
    ]);

    const targetCurrency = (org.baseCurrency || 'USD').trim().toUpperCase();
    const preloadedRates = this.currencyService
      ? await this.currencyService.loadRatesForOrganization(organizationId)
      : [];
    const missingCurrencySet = new Set<string>();
    const appliedRateMap = new Map<string, AppliedExchangeRateInfo>();

    const convertSum = <T>(
      records: T[],
      getAmt: (r: T) => Prisma.Decimal,
      getCurr: (r: T) => string,
      getDate: (r: T) => Date,
    ): Prisma.Decimal => {
      let sum = DecimalMath.ZERO;
      for (const r of records) {
        const amt = getAmt(r);
        const fromCurr = (getCurr(r) || targetCurrency).trim().toUpperCase();
        if (fromCurr === targetCurrency) {
          sum = DecimalMath.add(sum, amt);
          continue;
        }
        if (this.currencyService) {
          const conv = this.currencyService.convertAmountSync({
            rates: preloadedRates,
            organizationId,
            amount: amt,
            fromCurrency: fromCurr,
            toCurrency: targetCurrency,
            asOfDate: getDate(r),
          });
          if (conv.isConverted && conv.convertedAmount !== null) {
            sum = DecimalMath.add(sum, conv.convertedAmount);
            if (conv.rateInfo && conv.rateInfo.source !== 'IDENTITY') {
              const key = `${conv.rateInfo.fromCurrency}->${conv.rateInfo.toCurrency}@${conv.rateInfo.effectiveDate}`;
              if (!appliedRateMap.has(key)) appliedRateMap.set(key, conv.rateInfo);
            }
            continue;
          }
        }
        missingCurrencySet.add(fromCurr);
      }
      return sum;
    };

    const accountCashBalance = convertSum(
      liquidAccounts,
      (a) => a.currentBalance,
      (a) => a.currency,
      () => startDate,
    );

    // Reverse any pre-fix future-dated non-recurring transactions that already mutated currentBalance
    // so they are reflected on their actual future transactionDate without double-counting.
    const preFixAppliedFutureTxs = futureNonRecurringTxs.filter((tx) => {
      const meta =
        typeof tx.metadata === 'object' && tx.metadata !== null
          ? (tx.metadata as Record<string, unknown>)
          : null;
      return meta?.deferredFutureBalance !== true;
    });
    const preFixFutureIncome = convertSum(
      preFixAppliedFutureTxs.filter((t) => t.type === TransactionType.INCOME),
      (t) => t.amount,
      (t) => t.currency,
      (t) => t.transactionDate,
    );
    const preFixFutureExpense = convertSum(
      preFixAppliedFutureTxs.filter((t) => t.type === TransactionType.EXPENSE),
      (t) => t.amount,
      (t) => t.currency,
      (t) => t.transactionDate,
    );

    // Explicitly account for any preserved historical accountless PaymentRecords (transactionId: null)
    const unpostedReceipts = convertSum(
      unpostedPayments.filter((p) => p.invoiceId !== null),
      (p) => p.amount,
      (p) => p.currency,
      (p) => p.paymentDate,
    );
    const unpostedDisbursements = convertSum(
      unpostedPayments.filter((p) => p.billId !== null),
      (p) => p.amount,
      (p) => p.currency,
      (p) => p.paymentDate,
    );
    const unpostedNetCash = DecimalMath.sub(unpostedReceipts, unpostedDisbursements);

    const openingCashBalance = DecimalMath.add(
      DecimalMath.sub(DecimalMath.add(accountCashBalance, preFixFutureExpense), preFixFutureIncome),
      unpostedNetCash,
    );
    const nextVersion = (latestVersionRecord?.version ?? 0) + 1;

    // Scenario multipliers
    const inflowMultiplier =
      scenarioType === ForecastScenarioType.OPTIMISTIC
        ? DecimalMath.of('1.1000')
        : scenarioType === ForecastScenarioType.CONSERVATIVE
          ? DecimalMath.of('0.8500')
          : DecimalMath.ONE;

    const outflowMultiplier =
      scenarioType === ForecastScenarioType.OPTIMISTIC
        ? DecimalMath.of('0.9500')
        : scenarioType === ForecastScenarioType.CONSERVATIVE
          ? DecimalMath.of('1.1000')
          : DecimalMath.ONE;

    const uncertaintyBandPct =
      dto.horizonDays <= 7
        ? DecimalMath.of('5.0000')
        : dto.horizonDays <= 30
          ? DecimalMath.of('10.0000')
          : dto.horizonDays <= 60
            ? DecimalMath.of('15.0000')
            : DecimalMath.of('20.0000');

    const itemsToCreate: Array<{
      projectionDate: Date;
      expectedInflow: Prisma.Decimal;
      expectedOutflow: Prisma.Decimal;
      recurringInflow: Prisma.Decimal;
      recurringOutflow: Prisma.Decimal;
      netCashFlow: Prisma.Decimal;
      cumulativeBalance: Prisma.Decimal;
      optimisticBalance: Prisma.Decimal;
      conservativeBalance: Prisma.Decimal;
      drivers: Prisma.InputJsonValue;
    }> = [];

    let runningBalance = openingCashBalance;
    let totalInflows = DecimalMath.ZERO;
    let totalOutflows = DecimalMath.ZERO;
    let totalInvoiceInflows = DecimalMath.ZERO;
    let totalFutureTxInflows = DecimalMath.ZERO;
    let totalRecurringInflows = DecimalMath.ZERO;
    let totalBillOutflows = DecimalMath.ZERO;
    let totalFutureTxOutflows = DecimalMath.ZERO;
    let totalRecurringOutflows = DecimalMath.ZERO;
    let minCash = openingCashBalance;
    let minCashDate: Date = startDate;
    let hasLiquidityWarning = openingCashBalance.lt(liquiditySafetyBuffer);

    const scheduledInvoiceIds = new Set<string>();
    const scheduledBillIds = new Set<string>();
    const scheduledFutureTxIds = new Set<string>();

    for (let dayOffset = 1; dayOffset <= dto.horizonDays; dayOffset += 1) {
      const currentDate = new Date(startDate.getTime() + dayOffset * MS_PER_DAY);
      const dayKey = currentDate.toISOString().slice(0, 10);

      // Expected receipts from invoices due on this date (or overdue / due on startDate on Day 1)
      const dueInvoices = openInvoices.filter((inv) => {
        if (scheduledInvoiceIds.has(inv.id)) return false;
        const invDay = inv.dueDate.toISOString().slice(0, 10);
        const matches = dayOffset === 1 ? invDay <= dayKey : invDay === dayKey;
        if (matches) scheduledInvoiceIds.add(inv.id);
        return matches;
      });

      // Planned payments from bills due on this date (or overdue / due on startDate on Day 1)
      const dueBills = openBills.filter((bill) => {
        if (scheduledBillIds.has(bill.id)) return false;
        const billDay = bill.dueDate.toISOString().slice(0, 10);
        const matches = dayOffset === 1 ? billDay <= dayKey : billDay === dayKey;
        if (matches) scheduledBillIds.add(bill.id);
        return matches;
      });

      // Scheduled future-dated non-recurring transactions landing on this exact date
      const dueFutureNonRecurring = futureNonRecurringTxs.filter((tx) => {
        if (scheduledFutureTxIds.has(tx.id)) return false;
        const txDay = tx.transactionDate.toISOString().slice(0, 10);
        const matches = txDay === dayKey;
        if (matches) scheduledFutureTxIds.add(tx.id);
        return matches;
      });

      // Recurring transactions landing on this day offset
      const matchingRecurring = recurringTxs.filter((rtx) =>
        matchesRecurrenceOnDate(rtx.transactionDate, rtx.recurrenceFrequency, startDate, currentDate),
      );

      const rawInvoiceInflow = convertSum(
        dueInvoices,
        (i) => i.outstandingBalance,
        (i) => i.currency,
        () => currentDate,
      );
      const rawFutureTxInflow = convertSum(
        dueFutureNonRecurring.filter((t) => t.type === TransactionType.INCOME),
        (t) => t.amount,
        (t) => t.currency,
        (t) => t.transactionDate,
      );
      const rawBillOutflow = convertSum(
        dueBills,
        (b) => b.outstandingBalance,
        (b) => b.currency,
        () => currentDate,
      );
      const rawFutureTxOutflow = convertSum(
        dueFutureNonRecurring.filter((t) => t.type === TransactionType.EXPENSE),
        (t) => t.amount,
        (t) => t.currency,
        (t) => t.transactionDate,
      );

      const rawRecurringInflow = convertSum(
        matchingRecurring.filter((t) => t.type === TransactionType.INCOME),
        (t) => t.amount,
        (t) => t.currency,
        (t) => t.transactionDate,
      );
      const rawRecurringOutflow = convertSum(
        matchingRecurring.filter((t) => t.type === TransactionType.EXPENSE),
        (t) => t.amount,
        (t) => t.currency,
        (t) => t.transactionDate,
      );

      const scheduledInvoiceInflow = DecimalMath.mul(rawInvoiceInflow, inflowMultiplier);
      const scheduledFutureInflow = DecimalMath.mul(rawFutureTxInflow, inflowMultiplier);
      const scheduledBillOutflow = DecimalMath.mul(rawBillOutflow, outflowMultiplier);
      const scheduledFutureOutflow = DecimalMath.mul(rawFutureTxOutflow, outflowMultiplier);

      const expectedInflow = DecimalMath.add(scheduledInvoiceInflow, scheduledFutureInflow);
      const expectedOutflow = DecimalMath.add(scheduledBillOutflow, scheduledFutureOutflow);
      const recurringInflow = DecimalMath.mul(rawRecurringInflow, inflowMultiplier);
      const recurringOutflow = DecimalMath.mul(rawRecurringOutflow, outflowMultiplier);

      const dayTotalInflow = DecimalMath.add(expectedInflow, recurringInflow);
      const dayTotalOutflow = DecimalMath.add(expectedOutflow, recurringOutflow);
      const netCashFlow = DecimalMath.sub(dayTotalInflow, dayTotalOutflow);

      runningBalance = DecimalMath.add(runningBalance, netCashFlow);
      totalInflows = DecimalMath.add(totalInflows, dayTotalInflow);
      totalOutflows = DecimalMath.add(totalOutflows, dayTotalOutflow);
      totalInvoiceInflows = DecimalMath.add(totalInvoiceInflows, scheduledInvoiceInflow);
      totalFutureTxInflows = DecimalMath.add(totalFutureTxInflows, scheduledFutureInflow);
      totalRecurringInflows = DecimalMath.add(totalRecurringInflows, recurringInflow);
      totalBillOutflows = DecimalMath.add(totalBillOutflows, scheduledBillOutflow);
      totalFutureTxOutflows = DecimalMath.add(totalFutureTxOutflows, scheduledFutureOutflow);
      totalRecurringOutflows = DecimalMath.add(totalRecurringOutflows, recurringOutflow);

      if (runningBalance.lt(minCash)) {
        minCash = runningBalance;
        minCashDate = currentDate;
      }
      if (runningBalance.lt(liquiditySafetyBuffer) || runningBalance.lt(DecimalMath.ZERO)) {
        hasLiquidityWarning = true;
      }

      const bandDelta = runningBalance
        .abs()
        .mul(uncertaintyBandPct)
        .div(DecimalMath.HUNDRED)
        .toDecimalPlaces(4);

      const optimisticBalance = DecimalMath.add(runningBalance, bandDelta);
      const conservativeBalance = DecimalMath.sub(runningBalance, bandDelta);

      itemsToCreate.push({
        projectionDate: currentDate,
        expectedInflow,
        expectedOutflow,
        recurringInflow,
        recurringOutflow,
        netCashFlow,
        cumulativeBalance: runningBalance,
        optimisticBalance,
        conservativeBalance,
        drivers: {
          invoiceIds: dueInvoices.map((i) => i.id),
          billIds: dueBills.map((b) => b.id),
          futureTransactionIds: dueFutureNonRecurring.map((t) => t.id),
          recurringTransactionIds: matchingRecurring.map((r) => r.id),
        },
      });
    }

    const missingCurrencies = Array.from(missingCurrencySet).sort();
    const dataLimitations: string[] = [];
    if (liquidAccounts.length === 0) {
      dataLimitations.push(
        'No liquid accounts configured; opening cash balance defaulted to 0.0000.',
      );
    }
    if (unpostedPayments.length > 0) {
      dataLimitations.push(
        `${unpostedPayments.length} historical accountless payment record(s) without a linked ledger account (net ${targetCurrency} ${DecimalMath.toFixed4(unpostedNetCash)}) were explicitly included in opening cash impact.`,
      );
    }
    if (
      openInvoices.length === 0 &&
      futureNonRecurringTxs.filter((t) => t.type === TransactionType.INCOME).length === 0 &&
      recurringTxs.filter((r) => r.type === TransactionType.INCOME).length === 0
    ) {
      dataLimitations.push(
        'No open customer invoices, future income transactions, or recurring income rules found for inflow projection.',
      );
    }
    if (missingCurrencies.length > 0) {
      dataLimitations.push(
        `Incomplete conversion: missing exchange rate for ${missingCurrencies.join(', ')} -> ${targetCurrency}; unconverted foreign amounts were excluded from consolidated ${targetCurrency} totals.`,
      );
    }

    const assumptions = {
      scenarioType,
      baseCurrency: targetCurrency,
      isComplete: missingCurrencies.length === 0,
      missingCurrencies,
      appliedRates: Array.from(appliedRateMap.values()),
      inflowMultiplier: DecimalMath.toFixed4(inflowMultiplier),
      outflowMultiplier: DecimalMath.toFixed4(outflowMultiplier),
      uncertaintyBandPct: DecimalMath.toFixed4(uncertaintyBandPct),
      liquiditySafetyBuffer: DecimalMath.toFixed4(liquiditySafetyBuffer),
      overdueItemsScheduledOnDay1: true,
      receivablesInflows: DecimalMath.toFixed4(totalInvoiceInflows),
      futureTransactionInflows: DecimalMath.toFixed4(totalFutureTxInflows),
      recurringInflows: DecimalMath.toFixed4(totalRecurringInflows),
      payablesOutflows: DecimalMath.toFixed4(totalBillOutflows),
      futureTransactionOutflows: DecimalMath.toFixed4(totalFutureTxOutflows),
      recurringOutflows: DecimalMath.toFixed4(totalRecurringOutflows),
      unreconciledAccountlessPayments: {
        count: unpostedPayments.length,
        receipts: DecimalMath.toFixed4(unpostedReceipts),
        disbursements: DecimalMath.toFixed4(unpostedDisbursements),
        netImpact: DecimalMath.toFixed4(unpostedNetCash),
      },
    };

    const sourceRecordIds = {
      accountIds: liquidAccounts.map((a) => a.id),
      invoiceIds: openInvoices.map((i) => i.id),
      billIds: openBills.map((b) => b.id),
      futureTransactionIds: futureNonRecurringTxs.map((t) => t.id),
      recurringTransactionIds: recurringTxs.map((r) => r.id),
      unpostedPaymentRecordIds: unpostedPayments.map((p) => p.id),
    };

    const forecast = await this.prisma.cashFlowForecast.create({
      data: {
        organizationId,
        horizonDays: dto.horizonDays,
        scenarioType,
        version: nextVersion,
        currency: targetCurrency,
        startDate,
        endDate,
        openingCashBalance,
        projectedInflows: totalInflows,
        projectedOutflows: totalOutflows,
        projectedClosingCash: runningBalance,
        minimumProjectedCash: minCash,
        minimumCashDate: minCashDate,
        hasLiquidityWarning,
        uncertaintyBandPct,
        assumptions: assumptions as unknown as Prisma.InputJsonValue,
        sourceRecordIds: sourceRecordIds as unknown as Prisma.InputJsonValue,
        dataLimitations: dataLimitations as unknown as Prisma.InputJsonValue,
        createdByUserId: actorUserId,
        items: {
          create: itemsToCreate,
        },
      },
      include: {
        items: { orderBy: { projectionDate: 'asc' } },
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'CASH_FLOW_FORECAST_GENERATED',
      resourceType: 'CASH_FLOW_FORECAST',
      resourceId: forecast.id,
      details: {
        horizonDays: forecast.horizonDays,
        scenarioType: forecast.scenarioType,
        version: forecast.version,
        projectedClosingCash: DecimalMath.toFixed4(forecast.projectedClosingCash),
        hasLiquidityWarning: forecast.hasLiquidityWarning,
      },
    });

    return this.serializeForecast(forecast);
  }

  async compareForecastWithActuals(organizationId: string, forecastId: string) {
    const forecast = await this.prisma.cashFlowForecast.findFirst({
      where: { id: forecastId, organizationId },
    });
    if (!forecast) {
      throw new NotFoundException('Cash-flow forecast not found in organization');
    }

    const endOfWindow = new Date(forecast.endDate.getTime());
    endOfWindow.setUTCHours(23, 59, 59, 999);

    const [actualTxs, preloadedRates] = await Promise.all([
      this.prisma.financialTransaction.findMany({
        where: {
          organizationId,
          isArchived: false,
          type: { in: [TransactionType.INCOME, TransactionType.EXPENSE] },
          transactionDate: {
            gte: forecast.startDate,
            lte: endOfWindow,
          },
        },
      }),
      this.currencyService
        ? this.currencyService.loadRatesForOrganization(organizationId)
        : Promise.resolve([]),
    ]);

    const targetCurrency = (forecast.currency || 'USD').trim().toUpperCase();
    const missingCurrencySet = new Set<string>();
    const convertTxSum = (txs: typeof actualTxs): Prisma.Decimal => {
      let sum = DecimalMath.ZERO;
      for (const t of txs) {
        const fromCurr = (t.currency || targetCurrency).trim().toUpperCase();
        if (fromCurr === targetCurrency) {
          sum = DecimalMath.add(sum, t.amount);
          continue;
        }
        if (this.currencyService) {
          const conv = this.currencyService.convertAmountSync({
            rates: preloadedRates,
            organizationId,
            amount: t.amount,
            fromCurrency: fromCurr,
            toCurrency: targetCurrency,
            asOfDate: t.transactionDate,
          });
          if (conv.isConverted && conv.convertedAmount !== null) {
            sum = DecimalMath.add(sum, conv.convertedAmount);
            continue;
          }
        }
        missingCurrencySet.add(fromCurr);
      }
      return sum;
    };

    const actualInflows = convertTxSum(
      actualTxs.filter((t) => t.type === TransactionType.INCOME),
    );
    const actualOutflows = convertTxSum(
      actualTxs.filter((t) => t.type === TransactionType.EXPENSE),
    );
    const actualNetFlow = DecimalMath.sub(actualInflows, actualOutflows);
    const actualClosingCash = DecimalMath.add(forecast.openingCashBalance, actualNetFlow);

    const inflowVariance = DecimalMath.sub(actualInflows, forecast.projectedInflows);
    const outflowVariance = DecimalMath.sub(actualOutflows, forecast.projectedOutflows);
    const closingCashVariance = DecimalMath.sub(actualClosingCash, forecast.projectedClosingCash);
    const closingCashVariancePct =
      DecimalMath.percentage(closingCashVariance, forecast.projectedClosingCash.abs()) ??
      DecimalMath.ZERO;
    const missingCurrencies = Array.from(missingCurrencySet).sort();

    const comparison = {
      forecastId: forecast.id,
      horizonDays: forecast.horizonDays,
      scenarioType: forecast.scenarioType,
      version: forecast.version,
      periodStart: forecast.startDate.toISOString(),
      periodEnd: forecast.endDate.toISOString(),
      currency: targetCurrency,
      isComplete: missingCurrencies.length === 0,
      missingCurrencies,
      projected: {
        inflows: DecimalMath.toFixed4(forecast.projectedInflows),
        outflows: DecimalMath.toFixed4(forecast.projectedOutflows),
        closingCash: DecimalMath.toFixed4(forecast.projectedClosingCash),
      },
      actual: {
        inflows: DecimalMath.toFixed4(actualInflows),
        outflows: DecimalMath.toFixed4(actualOutflows),
        closingCash: DecimalMath.toFixed4(actualClosingCash),
        transactionCount: actualTxs.length,
        sourceTransactionIds: actualTxs.map((t) => t.id),
      },
      variance: {
        inflowVariance: DecimalMath.toFixed4(inflowVariance),
        outflowVariance: DecimalMath.toFixed4(outflowVariance),
        closingCashVariance: DecimalMath.toFixed4(closingCashVariance),
        closingCashVariancePct: DecimalMath.toFixed4(closingCashVariancePct),
      },
      comparedAt: new Date().toISOString(),
    };

    await this.prisma.cashFlowForecast.update({
      where: { id: forecast.id },
      data: {
        actualComparison: comparison as unknown as Prisma.InputJsonValue,
      },
    });

    return comparison;
  }

  private async getLatestFinancialChangeAt(organizationId: string): Promise<Date | null> {
    const [acct, inv, bill, tx, payment] = await Promise.all([
      this.prisma.financialAccount.findFirst({
        where: { organizationId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      this.prisma.invoice.findFirst({
        where: { organizationId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      this.prisma.bill.findFirst({
        where: { organizationId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      this.prisma.financialTransaction.findFirst({
        where: { organizationId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      this.prisma.paymentRecord.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const dates = [
      acct?.updatedAt,
      inv?.updatedAt,
      bill?.updatedAt,
      tx?.updatedAt,
      payment?.createdAt,
    ].filter((d): d is Date => d instanceof Date);

    if (dates.length === 0) return null;
    return dates.reduce((latest, curr) => (curr.getTime() > latest.getTime() ? curr : latest));
  }

  async listForecasts(organizationId: string, horizonDays?: number) {
    const [forecasts, latestFinancialChangeAt] = await Promise.all([
      this.prisma.cashFlowForecast.findMany({
        where: {
          organizationId,
          ...(horizonDays ? { horizonDays } : {}),
        },
        orderBy: [{ generatedAt: 'desc' }, { version: 'desc' }],
      }),
      this.getLatestFinancialChangeAt(organizationId),
    ]);
    return forecasts.map((f) => this.serializeForecast(f, latestFinancialChangeAt));
  }

  async getForecastById(organizationId: string, forecastId: string) {
    const [forecast, latestFinancialChangeAt] = await Promise.all([
      this.prisma.cashFlowForecast.findFirst({
        where: { id: forecastId, organizationId },
        include: { items: { orderBy: { projectionDate: 'asc' } } },
      }),
      this.getLatestFinancialChangeAt(organizationId),
    ]);
    if (!forecast) {
      throw new NotFoundException('Cash-flow forecast not found');
    }
    return this.serializeForecast(forecast, latestFinancialChangeAt);
  }

  serializeForecast(
    forecast: {
      id: string;
      organizationId: string;
      horizonDays: number;
      scenarioType: string;
      version: number;
      currency: string;
      generatedAt: Date;
      startDate: Date;
      endDate: Date;
      openingCashBalance: Prisma.Decimal;
      projectedInflows: Prisma.Decimal;
      projectedOutflows: Prisma.Decimal;
      projectedClosingCash: Prisma.Decimal;
      minimumProjectedCash: Prisma.Decimal;
      minimumCashDate: Date | null;
      hasLiquidityWarning: boolean;
      uncertaintyBandPct: Prisma.Decimal;
      assumptions: unknown;
      sourceRecordIds: unknown;
      dataLimitations: unknown;
      actualComparison: unknown;
      items?: Array<{
        id: string;
        projectionDate: Date;
        expectedInflow: Prisma.Decimal;
        expectedOutflow: Prisma.Decimal;
        recurringInflow: Prisma.Decimal;
        recurringOutflow: Prisma.Decimal;
        netCashFlow: Prisma.Decimal;
        cumulativeBalance: Prisma.Decimal;
        optimisticBalance: Prisma.Decimal;
        conservativeBalance: Prisma.Decimal;
        drivers: unknown;
      }>;
    },
    latestFinancialChangeAt?: Date | null,
  ) {
    const assumptionsObj =
      typeof forecast.assumptions === 'object' && forecast.assumptions !== null
        ? (forecast.assumptions as Record<string, unknown>)
        : {};

    const receivablesInflow =
      typeof assumptionsObj.receivablesInflows === 'string'
        ? assumptionsObj.receivablesInflows
        : forecast.items
          ? DecimalMath.toFixed4(DecimalMath.sum(forecast.items.map((i) => i.expectedInflow)))
          : undefined;
    const recurringInflow =
      typeof assumptionsObj.recurringInflows === 'string'
        ? assumptionsObj.recurringInflows
        : forecast.items
          ? DecimalMath.toFixed4(DecimalMath.sum(forecast.items.map((i) => i.recurringInflow)))
          : undefined;
    const payablesOutflow =
      typeof assumptionsObj.payablesOutflows === 'string'
        ? assumptionsObj.payablesOutflows
        : forecast.items
          ? DecimalMath.toFixed4(DecimalMath.sum(forecast.items.map((i) => i.expectedOutflow)))
          : undefined;
    const recurringOutflow =
      typeof assumptionsObj.recurringOutflows === 'string'
        ? assumptionsObj.recurringOutflows
        : forecast.items
          ? DecimalMath.toFixed4(DecimalMath.sum(forecast.items.map((i) => i.recurringOutflow)))
          : undefined;

    const isStale =
      latestFinancialChangeAt instanceof Date
        ? latestFinancialChangeAt.getTime() > forecast.generatedAt.getTime()
        : false;

    return {
      ...forecast,
      openingCashBalance: DecimalMath.toFixed4(forecast.openingCashBalance),
      projectedInflows: DecimalMath.toFixed4(forecast.projectedInflows),
      projectedOutflows: DecimalMath.toFixed4(forecast.projectedOutflows),
      projectedNetCashFlow: DecimalMath.toFixed4(
        DecimalMath.sub(forecast.projectedInflows, forecast.projectedOutflows),
      ),
      projectedReceivablesInflow: receivablesInflow,
      projectedFutureTxInflow:
        typeof assumptionsObj.futureTransactionInflows === 'string'
          ? assumptionsObj.futureTransactionInflows
          : '0.0000',
      projectedRecurringInflow: recurringInflow,
      projectedPayablesOutflow: payablesOutflow,
      projectedFutureTxOutflow:
        typeof assumptionsObj.futureTransactionOutflows === 'string'
          ? assumptionsObj.futureTransactionOutflows
          : '0.0000',
      projectedRecurringOutflow: recurringOutflow,
      projectedClosingCash: DecimalMath.toFixed4(forecast.projectedClosingCash),
      minimumProjectedCash: DecimalMath.toFixed4(forecast.minimumProjectedCash),
      uncertaintyBandPct: DecimalMath.toFixed4(forecast.uncertaintyBandPct),
      isStale,
      latestFinancialChangeAt: latestFinancialChangeAt?.toISOString() ?? null,
      generatedAt: forecast.generatedAt.toISOString(),
      startDate: forecast.startDate.toISOString(),
      endDate: forecast.endDate.toISOString(),
      minimumCashDate: forecast.minimumCashDate?.toISOString() ?? null,
      items: forecast.items?.map((item) => ({
        ...item,
        projectionDate: item.projectionDate.toISOString(),
        expectedInflow: DecimalMath.toFixed4(item.expectedInflow),
        expectedOutflow: DecimalMath.toFixed4(item.expectedOutflow),
        recurringInflow: DecimalMath.toFixed4(item.recurringInflow),
        recurringOutflow: DecimalMath.toFixed4(item.recurringOutflow),
        netCashFlow: DecimalMath.toFixed4(item.netCashFlow),
        cumulativeBalance: DecimalMath.toFixed4(item.cumulativeBalance),
        optimisticBalance: DecimalMath.toFixed4(item.optimisticBalance),
        conservativeBalance: DecimalMath.toFixed4(item.conservativeBalance),
      })),
    };
  }
}
