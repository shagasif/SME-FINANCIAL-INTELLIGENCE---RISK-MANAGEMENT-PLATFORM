import { AccountType, Prisma, TransactionType } from '../../generated/prisma/client.js';
import { CurrencyConversionService, ExchangeRateRow } from '../currency/currency.service.js';
import { FinancialAnalyticsService } from './financial-analytics.service.js';

describe('FinancialAnalyticsService (Organization.baseCurrency & Multi-Currency Conversion)', () => {
  const sampleRates: ExchangeRateRow[] = [
    {
      id: 'rate-nov',
      organizationId: null,
      fromCurrency: 'USD',
      toCurrency: 'PKR',
      rate: new Prisma.Decimal('276.62140000'),
      effectiveDate: new Date('2026-11-01T00:00:00.000Z'),
      source: 'SBP_M2M',
      isActive: true,
    },
    {
      id: 'rate-oct',
      organizationId: null,
      fromCurrency: 'USD',
      toCurrency: 'PKR',
      rate: new Prisma.Decimal('276.82000000'),
      effectiveDate: new Date('2026-10-01T00:00:00.000Z'),
      source: 'SBP_M2M',
      isActive: true,
    },
  ];

  const createStubDeps = (overrides: {
    baseCurrency?: string;
    accounts?: Array<Record<string, unknown>>;
    currentTxs?: Array<Record<string, unknown>>;
    rates?: ExchangeRateRow[];
  }) => {
    const baseCurr = overrides.baseCurrency ?? 'USD';
    const prisma = {
      organization: {
        findUnique: async () => ({
          id: 'org-star',
          name: 'star',
          baseCurrency: baseCurr,
        }),
      },
      exchangeRate: {
        findMany: async () => overrides.rates ?? sampleRates,
      },
      financialAccount: {
        findMany: async () => overrides.accounts ?? [],
      },
      financialTransaction: {
        findMany: async ({ where }: { where: { transactionDate: { gte: Date } } }) => {
          const startIso = where.transactionDate.gte.toISOString();
          if (startIso.startsWith('2026-10-') || startIso.startsWith('2026-08-')) {
            return overrides.currentTxs ?? [];
          }
          return [];
        },
      },
      invoice: { findMany: async () => [] },
      bill: { findMany: async () => [] },
      budget: { findMany: async () => [] },
    };

    const currencyService = new CurrencyConversionService(prisma as never, {} as never);

    const invoicesPayables = {
      computeAgingReport: async () => ({
        receivablesAging: {
          totalOutstanding: '0.0000',
          totalOverdue: '0.0000',
          isComplete: true,
          missingCurrencies: [],
          buckets: [],
          sourceRecordIds: [],
        },
        payablesAging: {
          totalOutstanding: '0.0000',
          totalOverdue: '0.0000',
          isComplete: true,
          missingCurrencies: [],
          buckets: [],
          sourceRecordIds: [],
        },
      }),
    };

    const budgetsService = {};
    return { prisma, invoicesPayables, budgetsService, currencyService };
  };

  it('always uses Organization.baseCurrency (USD) and converts PKR balances and transactions using date-appropriate FX rates', async () => {
    const deps = createStubDeps({
      baseCurrency: 'USD',
      accounts: [
        {
          id: 'acc-usd',
          type: AccountType.BANK,
          currency: 'USD',
          currentBalance: new Prisma.Decimal('0.0000'),
          isLiquid: true,
        },
        {
          id: 'acc-pkr',
          type: AccountType.BANK,
          currency: 'PKR',
          currentBalance: new Prisma.Decimal('2615100.0000'),
          isLiquid: true,
        },
      ],
      currentTxs: [
        {
          id: 'tx-1',
          type: TransactionType.INCOME,
          amount: new Prisma.Decimal('276820.0000'),
          currency: 'PKR',
          transactionDate: new Date('2026-10-16T00:00:00.000Z'),
          isCostOfGoodsSold: false,
        },
        {
          id: 'tx-2',
          type: TransactionType.EXPENSE,
          amount: new Prisma.Decimal('138410.0000'),
          currency: 'PKR',
          transactionDate: new Date('2026-10-20T00:00:00.000Z'),
          isCostOfGoodsSold: false,
        },
      ],
    });

    const service = new FinancialAnalyticsService(
      deps.prisma as never,
      deps.invoicesPayables as never,
      deps.budgetsService as never,
      deps.currencyService,
    );

    const res = await service.computeAllMetrics('org-star', {
      startDate: new Date('2026-10-12T00:00:00.000Z'),
      endDate: new Date('2026-11-11T23:59:59.999Z'),
    });

    // Respects Organization.baseCurrency = USD
    expect(res.currency).toBe('USD');
    expect(res.conversionContext.isComplete).toBe(true);
    expect(res.conversionContext.missingCurrencies).toEqual([]);

    // PKR transactions converted at Oct SBP rate (276.82): 1000.0000 - 500.0000 = 500.0000 USD
    expect(res.metrics.operatingCashFlow.currency).toBe('USD');
    expect(res.metrics.operatingCashFlow.value).toBe('500.0000');

    // PKR balance (2,615,100) converted at Nov 2026 SBP rate (276.6214) = 9453.7154 USD
    expect(res.metrics.cashRunway.components?.liquidCashBalance).toBe('9453.7154');
    expect(res.metrics.workingCapital.value).toBe('9453.7154');
  });

  it('marks calculations incomplete and identifies missing currency when an exchange rate is unavailable', async () => {
    const deps = createStubDeps({
      baseCurrency: 'USD',
      rates: sampleRates, // Does not contain EUR -> USD
      accounts: [
        {
          id: 'acc-usd',
          type: AccountType.BANK,
          currency: 'USD',
          currentBalance: new Prisma.Decimal('1000.0000'),
          isLiquid: true,
        },
        {
          id: 'acc-eur',
          type: AccountType.BANK,
          currency: 'EUR',
          currentBalance: new Prisma.Decimal('500.0000'),
          isLiquid: true,
        },
      ],
      currentTxs: [
        {
          id: 'tx-eur',
          type: TransactionType.INCOME,
          amount: new Prisma.Decimal('200.0000'),
          currency: 'EUR',
          transactionDate: new Date('2026-10-15T00:00:00.000Z'),
          isCostOfGoodsSold: false,
        },
      ],
    });

    const service = new FinancialAnalyticsService(
      deps.prisma as never,
      deps.invoicesPayables as never,
      deps.budgetsService as never,
      deps.currencyService,
    );

    const res = await service.computeAllMetrics('org-multi', {
      startDate: new Date('2026-10-12T00:00:00.000Z'),
      endDate: new Date('2026-11-11T23:59:59.999Z'),
    });

    expect(res.currency).toBe('USD');
    expect(res.conversionContext.isComplete).toBe(false);
    expect(res.conversionContext.missingCurrencies).toEqual(['EUR']);

    // Affected metrics must be marked incomplete with missing currency identified
    expect(res.metrics.operatingCashFlow.status).toBe('UNSUPPORTED_MISSING_DATA');
    expect(res.metrics.operatingCashFlow.value).toBeNull();
    expect(res.metrics.operatingCashFlow.dataLimitations[0]).toMatch(/missing exchange rate.*EUR/i);
    expect(res.metrics.workingCapital.status).toBe('UNSUPPORTED_MISSING_DATA');
    expect(res.metrics.workingCapital.value).toBeNull();
    expect(res.metrics.workingCapital.dataLimitations[0]).toMatch(/missing exchange rate.*EUR/i);
  });

  it('normalizes default 30-day window boundaries to UTC start/end of day for deterministic OCF', async () => {
    let capturedStart: Date | undefined;
    let capturedEnd: Date | undefined;

    const deps = createStubDeps({ baseCurrency: 'USD', accounts: [], currentTxs: [] });
    let callCount = 0;
    deps.prisma.financialTransaction.findMany = async ({
      where,
    }: {
      where: { transactionDate: { gte: Date; lte: Date } };
    }) => {
      if (callCount === 0) {
        capturedStart = where.transactionDate.gte;
        capturedEnd = where.transactionDate.lte;
      }
      callCount++;
      return [];
    };

    const service = new FinancialAnalyticsService(
      deps.prisma as never,
      deps.invoicesPayables as never,
      deps.budgetsService as never,
      deps.currencyService,
    );

    await service.computeAllMetrics('org-star');

    expect(capturedStart?.toISOString().endsWith('T00:00:00.000Z')).toBe(true);
    expect(capturedEnd?.toISOString().endsWith('T23:59:59.999Z')).toBe(true);
  });
});
