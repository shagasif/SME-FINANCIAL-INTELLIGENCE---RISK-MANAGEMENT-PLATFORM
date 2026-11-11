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
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(startDate.getTime() + dto.horizonDays * 24 * 60 * 60 * 1000);
    const liquiditySafetyBuffer = DecimalMath.of(dto.liquiditySafetyBuffer ?? '5000.0000');

    const [liquidAccounts, openInvoices, openBills, recurringTxs, latestVersionRecord] =
      await Promise.all([
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
            status: { not: InvoiceStatus.VOID },
            dueDate: { lte: endDate },
          },
        }),
        this.prisma.bill.findMany({
          where: {
            organizationId,
            isArchived: false,
            outstandingBalance: { gt: 0 },
            status: { not: BillStatus.VOID },
            dueDate: { lte: endDate },
          },
        }),
        this.prisma.financialTransaction.findMany({
          where: {
            organizationId,
            isArchived: false,
            isRecurring: true,
            recurrenceFrequency: { not: RecurrenceFrequency.NONE },
          },
        }),
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

    const openingCashBalance = convertSum(
      liquidAccounts,
      (a) => a.currentBalance,
      (a) => a.currency,
      () => startDate,
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
    let minCash = openingCashBalance;
    let minCashDate: Date = startDate;
    let hasLiquidityWarning = openingCashBalance.lt(liquiditySafetyBuffer);

    for (let dayOffset = 1; dayOffset <= dto.horizonDays; dayOffset += 1) {
      const currentDate = new Date(startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dayKey = currentDate.toISOString().slice(0, 10);

      // Expected receipts from invoices due on this date (or overdue on Day 1)
      const dueInvoices = openInvoices.filter((inv) => {
        const invDay = inv.dueDate.toISOString().slice(0, 10);
        if (dayOffset === 1 && inv.dueDate.getTime() <= currentDate.getTime()) {
          return true;
        }
        return invDay === dayKey;
      });

      // Planned payments from bills due on this date (or overdue on Day 1)
      const dueBills = openBills.filter((bill) => {
        const billDay = bill.dueDate.toISOString().slice(0, 10);
        if (dayOffset === 1 && bill.dueDate.getTime() <= currentDate.getTime()) {
          return true;
        }
        return billDay === dayKey;
      });

      // Recurring transactions landing on this day offset
      const matchingRecurring = recurringTxs.filter((rtx) => {
        const anchorDayOfMonth = rtx.transactionDate.getUTCDate();
        if (rtx.recurrenceFrequency === RecurrenceFrequency.WEEKLY) {
          return dayOffset % 7 === 0;
        }
        if (rtx.recurrenceFrequency === RecurrenceFrequency.BIWEEKLY) {
          return dayOffset % 14 === 0;
        }
        if (rtx.recurrenceFrequency === RecurrenceFrequency.MONTHLY) {
          return currentDate.getUTCDate() === anchorDayOfMonth;
        }
        if (rtx.recurrenceFrequency === RecurrenceFrequency.QUARTERLY) {
          return currentDate.getUTCDate() === anchorDayOfMonth && dayOffset % 30 === 0;
        }
        return false;
      });

      const rawInvoiceInflow = convertSum(
        dueInvoices,
        (i) => i.outstandingBalance,
        (i) => i.currency,
        () => currentDate,
      );
      const rawBillOutflow = convertSum(
        dueBills,
        (b) => b.outstandingBalance,
        (b) => b.currency,
        () => currentDate,
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

      const expectedInflow = DecimalMath.mul(rawInvoiceInflow, inflowMultiplier);
      const expectedOutflow = DecimalMath.mul(rawBillOutflow, outflowMultiplier);
      const recurringInflow = DecimalMath.mul(rawRecurringInflow, inflowMultiplier);
      const recurringOutflow = DecimalMath.mul(rawRecurringOutflow, outflowMultiplier);

      const dayTotalInflow = DecimalMath.add(expectedInflow, recurringInflow);
      const dayTotalOutflow = DecimalMath.add(expectedOutflow, recurringOutflow);
      const netCashFlow = DecimalMath.sub(dayTotalInflow, dayTotalOutflow);

      runningBalance = DecimalMath.add(runningBalance, netCashFlow);
      totalInflows = DecimalMath.add(totalInflows, dayTotalInflow);
      totalOutflows = DecimalMath.add(totalOutflows, dayTotalOutflow);

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
    if (
      openInvoices.length === 0 &&
      recurringTxs.filter((r) => r.type === TransactionType.INCOME).length === 0
    ) {
      dataLimitations.push(
        'No open customer invoices or recurring income rules found for inflow projection.',
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
    };

    const sourceRecordIds = {
      accountIds: liquidAccounts.map((a) => a.id),
      invoiceIds: openInvoices.map((i) => i.id),
      billIds: openBills.map((b) => b.id),
      recurringTransactionIds: recurringTxs.map((r) => r.id),
    };

    const forecast = await this.prisma.cashFlowForecast.create({
      data: {
        organizationId,
        horizonDays: dto.horizonDays,
        scenarioType,
        version: nextVersion,
        currency: org.baseCurrency,
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

    const actualTxs = await this.prisma.financialTransaction.findMany({
      where: {
        organizationId,
        isArchived: false,
        transactionDate: {
          gte: forecast.startDate,
          lte: forecast.endDate,
        },
      },
    });

    const actualInflows = DecimalMath.sum(
      actualTxs.filter((t) => t.type === TransactionType.INCOME).map((t) => t.amount),
    );
    const actualOutflows = DecimalMath.sum(
      actualTxs.filter((t) => t.type === TransactionType.EXPENSE).map((t) => t.amount),
    );
    const actualNetFlow = DecimalMath.sub(actualInflows, actualOutflows);
    const actualClosingCash = DecimalMath.add(forecast.openingCashBalance, actualNetFlow);

    const inflowVariance = DecimalMath.sub(actualInflows, forecast.projectedInflows);
    const outflowVariance = DecimalMath.sub(actualOutflows, forecast.projectedOutflows);
    const closingCashVariance = DecimalMath.sub(actualClosingCash, forecast.projectedClosingCash);
    const closingCashVariancePct =
      DecimalMath.percentage(closingCashVariance, forecast.projectedClosingCash.abs()) ??
      DecimalMath.ZERO;

    const comparison = {
      forecastId: forecast.id,
      horizonDays: forecast.horizonDays,
      scenarioType: forecast.scenarioType,
      version: forecast.version,
      periodStart: forecast.startDate.toISOString(),
      periodEnd: forecast.endDate.toISOString(),
      currency: forecast.currency,
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

  async listForecasts(organizationId: string, horizonDays?: number) {
    const forecasts = await this.prisma.cashFlowForecast.findMany({
      where: {
        organizationId,
        ...(horizonDays ? { horizonDays } : {}),
      },
      orderBy: [{ generatedAt: 'desc' }, { version: 'desc' }],
    });
    return forecasts.map((f) => this.serializeForecast(f));
  }

  async getForecastById(organizationId: string, forecastId: string) {
    const forecast = await this.prisma.cashFlowForecast.findFirst({
      where: { id: forecastId, organizationId },
      include: { items: { orderBy: { projectionDate: 'asc' } } },
    });
    if (!forecast) {
      throw new NotFoundException('Cash-flow forecast not found');
    }
    return this.serializeForecast(forecast);
  }

  serializeForecast(forecast: {
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
  }) {
    return {
      ...forecast,
      openingCashBalance: DecimalMath.toFixed4(forecast.openingCashBalance),
      projectedInflows: DecimalMath.toFixed4(forecast.projectedInflows),
      projectedOutflows: DecimalMath.toFixed4(forecast.projectedOutflows),
      projectedClosingCash: DecimalMath.toFixed4(forecast.projectedClosingCash),
      minimumProjectedCash: DecimalMath.toFixed4(forecast.minimumProjectedCash),
      uncertaintyBandPct: DecimalMath.toFixed4(forecast.uncertaintyBandPct),
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
