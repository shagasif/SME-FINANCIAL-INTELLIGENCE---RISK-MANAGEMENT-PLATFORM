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
    invoices?: Array<Record<string, unknown>>;
    bills?: Array<Record<string, unknown>>;
    budgets?: Array<Record<string, unknown>>;
    rates?: ExchangeRateRow[];
  }) => {
    const baseCurr = overrides.baseCurrency ?? 'USD';
    const prisma = {
      organization: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          if (where.id === 'org-nonexistent') {
            return null;
          }
          return {
            id: where.id,
            name: where.id,
            baseCurrency: baseCurr,
          };
        },
      },
      exchangeRate: {
        findMany: async () => overrides.rates ?? sampleRates,
      },
      financialAccount: {
        findMany: async ({ where }: { where?: { organizationId?: string } } = {}) => {
          if (where?.organizationId === 'org-nonexistent') return [];
          return overrides.accounts ?? [];
        },
      },
      financialTransaction: {
        findMany: async ({ where }: { where?: { organizationId?: string; transactionDate?: { gte?: Date } } } = {}) => {
          if (where?.organizationId === 'org-nonexistent') return [];
          const startIso = where?.transactionDate?.gte?.toISOString();
          if (!startIso || startIso.startsWith('2026-10-') || startIso.startsWith('2026-08-')) {
            return overrides.currentTxs ?? [];
          }
          return [];
        },
      },
      invoice: {
        findMany: async ({ where }: { where?: { organizationId?: string } } = {}) => {
          if (where?.organizationId === 'org-nonexistent') return [];
          return overrides.invoices ?? [];
        },
      },
      bill: {
        findMany: async ({ where }: { where?: { organizationId?: string } } = {}) => {
          if (where?.organizationId === 'org-nonexistent') return [];
          return overrides.bills ?? [];
        },
      },
      budget: {
        findMany: async ({ where }: { where?: { organizationId?: string } } = {}) => {
          if (where?.organizationId === 'org-nonexistent') return [];
          return overrides.budgets ?? [];
        },
      },
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

  it('excludes DRAFT and VOID records from open receivables/payables analytics queries and discloses drafts cleanly', async () => {
    const deps = createStubDeps({ baseCurrency: 'PKR', accounts: [], currentTxs: [] });
    let capturedInvoiceWhere: Record<string, unknown> | undefined;
    let capturedBillWhere: Record<string, unknown> | undefined;

    deps.prisma.invoice.findMany = async ({ where }: { where: Record<string, unknown> }) => {
      capturedInvoiceWhere = where;
      return [];
    };
    deps.prisma.bill.findMany = async ({ where }: { where: Record<string, unknown> }) => {
      capturedBillWhere = where;
      return [];
    };
    deps.invoicesPayables.computeAgingReport = async () => ({
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
      receivablesSummary: {
        draft: { count: 1, totalAmount: '55000.0000', recordIds: ['inv-draft'] },
        unpaid: { count: 0, totalAmount: '0.0000', outstandingAmount: '0.0000', recordIds: [] },
        partiallyPaid: {
          count: 0,
          totalAmount: '0.0000',
          paidAmount: '0.0000',
          outstandingAmount: '0.0000',
          recordIds: [],
        },
        paid: { count: 1, totalAmount: '399.9600', paidAmount: '399.9600', recordIds: ['inv-paid'] },
        activeOutstandingTotal: '0.0000',
        isComplete: true,
        missingCurrencies: [],
      },
      payablesSummary: {
        draft: { count: 0, totalAmount: '0.0000', recordIds: [] },
        unpaid: { count: 0, totalAmount: '0.0000', outstandingAmount: '0.0000', recordIds: [] },
        partiallyPaid: {
          count: 0,
          totalAmount: '0.0000',
          paidAmount: '0.0000',
          outstandingAmount: '0.0000',
          recordIds: [],
        },
        paid: { count: 0, totalAmount: '0.0000', paidAmount: '0.0000', recordIds: [] },
        activeOutstandingTotal: '0.0000',
        isComplete: true,
        missingCurrencies: [],
      },
    });

    const service = new FinancialAnalyticsService(
      deps.prisma as never,
      deps.invoicesPayables as never,
      deps.budgetsService as never,
      deps.currencyService,
    );

    const res = await service.computeAllMetrics('org-star');

    expect(capturedInvoiceWhere?.status).toEqual({ notIn: ['VOID', 'DRAFT'] });
    expect(capturedBillWhere?.status).toEqual({ notIn: ['VOID', 'DRAFT'] });
    expect(res.metrics.receivableAging.components?.draftCount).toBe('1');
    expect(res.metrics.receivableAging.components?.draftTotal).toBe('55000.0000');
    expect(res.metrics.receivableAging.dataLimitations).toContain(
      '1 draft customer invoice(s) totaling 55000.0000 PKR are excluded from active receivables until issued.',
    );
  });

  it('normalizes explicitly supplied date-only endDate to 23:59:59.999Z so final-day transactions are included', async () => {
    let capturedTxWhere: { transactionDate?: { gte: Date; lte: Date } } | undefined;
    const deps = createStubDeps({
      baseCurrency: 'PKR',
      accounts: [],
      currentTxs: [
        {
          id: 'tx-final-day',
          type: TransactionType.INCOME,
          amount: new Prisma.Decimal('50000.0000'),
          currency: 'PKR',
          transactionDate: new Date('2026-10-30T19:00:00.000Z'),
          isCostOfGoodsSold: false,
        },
      ],
    });
    const origFindMany = deps.prisma.financialTransaction.findMany;
    deps.prisma.financialTransaction.findMany = async (args: { where: { transactionDate: { gte: Date; lte: Date } } }) => {
      if (!capturedTxWhere) capturedTxWhere = args.where;
      return origFindMany(args);
    };

    const service = new FinancialAnalyticsService(
      deps.prisma as never,
      deps.invoicesPayables as never,
      deps.budgetsService as never,
      deps.currencyService,
    );

    const res = await service.computeAllMetrics('org-star', {
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-10-30'),
    });

    expect(capturedTxWhere?.transactionDate?.gte.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(capturedTxWhere?.transactionDate?.lte.toISOString()).toBe('2026-10-30T23:59:59.999Z');
    expect(res.metrics.operatingCashFlow.value).toBe('50000.0000');
  });

  it('does not emit 999.0000 Cash Runway when cash-flow positive, and does not emit 100% Gross Margin when COGS is unclassified', async () => {
    const deps = createStubDeps({
      baseCurrency: 'PKR',
      accounts: [
        {
          id: 'acc-1',
          type: AccountType.BANK,
          currency: 'PKR',
          currentBalance: new Prisma.Decimal('2615100.0000'),
          isLiquid: true,
        },
      ],
      currentTxs: [
        {
          id: 'tx-inc',
          type: TransactionType.INCOME,
          amount: new Prisma.Decimal('3330000.0000'),
          currency: 'PKR',
          transactionDate: new Date('2026-10-15T00:00:00.000Z'),
          isCostOfGoodsSold: false,
        },
        {
          id: 'tx-exp-unclassified',
          type: TransactionType.EXPENSE,
          amount: new Prisma.Decimal('1040900.0000'),
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
      startDate: new Date('2026-08-14'),
      endDate: new Date('2026-11-12'),
    });

    expect(res.metrics.operatingCashFlow.value).toBe('2289100.0000');
    // Cash Runway: no 999.0000 sentinel when cash-flow positive; denominator (burn) <= 0 is NOT_CALCULABLE
    expect(res.metrics.cashRunway.status).toBe('NOT_CALCULABLE');
    expect(res.metrics.cashRunway.value).toBeNull();
    expect(res.metrics.cashRunway.components?.liquidCashBalance).toBe('2615100.0000');
    // Gross Margin: no 100.0000% when expenses exist without COGS classification
    expect(res.metrics.grossMargin.status).toBe('UNSUPPORTED_MISSING_DATA');
    expect(res.metrics.grossMargin.value).toBeNull();
  });

  it('computes genuine Cash Runway on net burn and genuine Gross Margin strictly from isCostOfGoodsSold=true expenses', async () => {
    const deps = createStubDeps({
      baseCurrency: 'PKR',
      accounts: [
        {
          id: 'acc-1',
          type: AccountType.BANK,
          currency: 'PKR',
          currentBalance: new Prisma.Decimal('300000.0000'),
          isLiquid: true,
        },
      ],
      currentTxs: [
        {
          id: 'tx-inc',
          type: TransactionType.INCOME,
          amount: new Prisma.Decimal('100000.0000'),
          currency: 'PKR',
          transactionDate: new Date('2026-10-15T00:00:00.000Z'),
          isCostOfGoodsSold: false,
        },
        {
          id: 'tx-cogs',
          type: TransactionType.EXPENSE,
          amount: new Prisma.Decimal('40000.0000'),
          currency: 'PKR',
          transactionDate: new Date('2026-10-16T00:00:00.000Z'),
          isCostOfGoodsSold: true,
        },
        {
          id: 'tx-opex',
          type: TransactionType.EXPENSE,
          amount: new Prisma.Decimal('110000.0000'),
          currency: 'PKR',
          transactionDate: new Date('2026-10-18T00:00:00.000Z'),
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
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-10-31T23:59:59.999Z'),
    });

    // Revenue 100k, COGS 40k (OpEx 110k excluded from COGS) -> Gross Profit 60k -> Gross Margin 60.0000%
    expect(res.metrics.grossMargin.status).toBe('COMPUTED');
    expect(res.metrics.grossMargin.value).toBe('60.0000');
    expect(res.metrics.grossMargin.components?.costOfGoodsSold).toBe('40000.0000');

    // Net burn over 31 days = 150k - 100k = 50k -> monthly burn = 50k * 30 / 31 = 48387.0968 -> runway = 300k / 48387.0968 = 6.2000
    expect(res.metrics.cashRunway.status).toBe('COMPUTED');
    expect(res.metrics.cashRunway.value).toBe('6.2000');

    // Charts payload checks
    expect(res.charts.monthlySeries).toHaveLength(1);
    expect(res.charts.monthlySeries[0]).toMatchObject({
      month: '2026-10',
      income: '100000.0000',
      expenses: '150000.0000',
      netCashFlow: '-50000.0000',
      cogs: '40000.0000',
      grossMarginPct: '60.0000',
    });
    expect(res.charts.profitabilityTrend.isAvailable).toBe(true);
    expect(res.charts.budgetComparison).toBeNull();
  });

  describe('Current Ratio & Quick Ratio (Audit Trace, Genuinely Zero Liabilities, and Status Semantics)', () => {
    it('1. Current liabilities greater than zero — correct Current Ratio', async () => {
      const deps = createStubDeps({
        baseCurrency: 'PKR',
        accounts: [
          {
            id: 'acc-cash',
            name: 'Cash Account',
            type: AccountType.BANK,
            currency: 'PKR',
            currentBalance: new Prisma.Decimal('200000.0000'),
            isLiquid: true,
          },
        ],
        invoices: [
          {
            id: 'inv-1',
            invoiceNumber: 'INV-101',
            customerName: 'Client A',
            currency: 'PKR',
            outstandingBalance: new Prisma.Decimal('50000.0000'),
          },
        ],
        bills: [
          {
            id: 'bill-1',
            billNumber: 'BILL-501',
            supplierName: 'Vendor X',
            currency: 'PKR',
            outstandingBalance: new Prisma.Decimal('100000.0000'),
          },
        ],
      });

      const service = new FinancialAnalyticsService(
        deps.prisma as never,
        deps.invoicesPayables as never,
        deps.budgetsService as never,
        deps.currencyService,
      );

      const res = await service.computeAllMetrics('org-star');
      // Current Assets = 200k + 50k = 250k. Current Liabilities = 100k. Ratio = 2.5000.
      expect(res.metrics.currentRatio.status).toBe('COMPUTED');
      expect(res.metrics.currentRatio.value).toBe('2.5000');
      expect(res.metrics.currentRatio.components?.currentAssets).toBe('250000.0000');
      expect(res.metrics.currentRatio.components?.currentLiabilities).toBe('100000.0000');
    });

    it('2. Current liabilities greater than zero — correct Quick Ratio', async () => {
      const deps = createStubDeps({
        baseCurrency: 'PKR',
        accounts: [
          {
            id: 'acc-cash',
            name: 'Cash Account',
            type: AccountType.BANK,
            currency: 'PKR',
            currentBalance: new Prisma.Decimal('180000.0000'),
            isLiquid: true,
          },
          {
            id: 'acc-debt',
            name: 'Short Term Loan',
            type: AccountType.SHORT_TERM_DEBT,
            currency: 'PKR',
            currentBalance: new Prisma.Decimal('-20000.0000'),
            isLiquid: false,
          },
        ],
        invoices: [
          {
            id: 'inv-1',
            invoiceNumber: 'INV-101',
            customerName: 'Client A',
            currency: 'PKR',
            outstandingBalance: new Prisma.Decimal('60000.0000'),
          },
        ],
        bills: [
          {
            id: 'bill-1',
            billNumber: 'BILL-501',
            supplierName: 'Vendor X',
            currency: 'PKR',
            outstandingBalance: new Prisma.Decimal('60000.0000'),
          },
        ],
      });

      const service = new FinancialAnalyticsService(
        deps.prisma as never,
        deps.invoicesPayables as never,
        deps.budgetsService as never,
        deps.currencyService,
      );

      const res = await service.computeAllMetrics('org-star');
      // Quick Assets = LiquidCash (180k) + AR (60k) = 240k.
      // Current Liabilities = Bills (60k) + Debt (20k) = 80k.
      // Quick Ratio = 240k / 80k = 3.0000.
      expect(res.metrics.quickRatio.status).toBe('COMPUTED');
      expect(res.metrics.quickRatio.value).toBe('3.0000');
      expect(res.metrics.quickRatio.components?.liquidCash).toBe('180000.0000');
      expect(res.metrics.quickRatio.components?.accountsReceivable).toBe('60000.0000');
      expect(res.metrics.quickRatio.components?.quickAssets).toBe('240000.0000');
      expect(res.metrics.quickRatio.components?.currentLiabilities).toBe('80000.0000');
    });

    it('3. Current liabilities genuinely zero — Not Calculable', async () => {
      const deps = createStubDeps({
        baseCurrency: 'PKR',
        accounts: [
          {
            id: '385a34ca-9107-4bb5-8782-9f624bfd1158',
            name: 'Business Savings Reserve',
            type: AccountType.BANK,
            currency: 'PKR',
            currentBalance: new Prisma.Decimal('2615100.0000'),
            isLiquid: true,
          },
          {
            id: '64a76ede-5504-46e4-9850-b6298bf86232',
            name: 'USD Foreign Currency Account',
            type: AccountType.BANK,
            currency: 'USD',
            currentBalance: new Prisma.Decimal('0.0000'),
            isLiquid: true,
          },
        ],
        invoices: [
          {
            id: 'cf4fe1ad-2fe1-4b19-a666-9b5b03081473',
            invoiceNumber: 'INV 002',
            customerName: 'Ahmed',
            currency: 'PKR',
            outstandingBalance: new Prisma.Decimal('300.0000'),
          },
        ],
        bills: [], // Genuinely zero bills
      });

      const service = new FinancialAnalyticsService(
        deps.prisma as never,
        deps.invoicesPayables as never,
        deps.budgetsService as never,
        deps.currencyService,
      );

      const res = await service.computeAllMetrics('org-star');

      // Current Ratio: NOT_CALCULABLE (denominator verified zero)
      expect(res.metrics.currentRatio.status).toBe('NOT_CALCULABLE');
      expect(res.metrics.currentRatio.value).toBeNull();
      expect(res.metrics.currentRatio.components?.currentAssets).toBe('2615400.0000');
      expect(res.metrics.currentRatio.components?.currentLiabilities).toBe('0.0000');
      expect(res.metrics.currentRatio.components?.calculationReason).toContain(
        'Current liabilities are verified zero',
      );

      // Quick Ratio: NOT_CALCULABLE
      expect(res.metrics.quickRatio.status).toBe('NOT_CALCULABLE');
      expect(res.metrics.quickRatio.value).toBeNull();
      expect(res.metrics.quickRatio.components?.liquidCash).toBe('2615100.0000');
      expect(res.metrics.quickRatio.components?.accountsReceivable).toBe('300.0000');
      expect(res.metrics.quickRatio.components?.quickAssets).toBe('2615400.0000');
      expect(res.metrics.quickRatio.components?.currentLiabilities).toBe('0.0000');
      expect(res.metrics.quickRatio.components?.calculationReason).toContain(
        'Current liabilities are verified zero',
      );
    });

    it('4. Missing liability classification / FX rate — Insufficient Data', async () => {
      const deps = createStubDeps({
        baseCurrency: 'PKR',
        accounts: [
          {
            id: 'acc-cash',
            name: 'Cash',
            type: AccountType.BANK,
            currency: 'PKR',
            currentBalance: new Prisma.Decimal('100000.0000'),
            isLiquid: true,
          },
        ],
        bills: [
          {
            id: 'bill-eur',
            billNumber: 'BILL-EUR-1',
            supplierName: 'Euro Supplier',
            currency: 'EUR', // No EUR rate in sampleRates
            outstandingBalance: new Prisma.Decimal('500.0000'),
          },
        ],
      });

      const service = new FinancialAnalyticsService(
        deps.prisma as never,
        deps.invoicesPayables as never,
        deps.budgetsService as never,
        deps.currencyService,
      );

      const res = await service.computeAllMetrics('org-star');
      expect(res.metrics.currentRatio.status).toBe('UNSUPPORTED_MISSING_DATA');
      expect(res.metrics.currentRatio.value).toBeNull();
      expect(res.metrics.currentRatio.dataLimitations[0]).toContain('missing exchange rate for EUR -> PKR');
      expect(res.metrics.quickRatio.status).toBe('UNSUPPORTED_MISSING_DATA');
      expect(res.metrics.quickRatio.value).toBeNull();
    });

    it('5. Missing current asset information — Insufficient Data', async () => {
      const deps = createStubDeps({
        baseCurrency: 'PKR',
        accounts: [], // No liquid accounts configured
        bills: [
          {
            id: 'bill-1',
            billNumber: 'BILL-1',
            supplierName: 'Vendor',
            currency: 'PKR',
            outstandingBalance: new Prisma.Decimal('1000.0000'),
          },
        ],
      });

      const service = new FinancialAnalyticsService(
        deps.prisma as never,
        deps.invoicesPayables as never,
        deps.budgetsService as never,
        deps.currencyService,
      );

      const res = await service.computeAllMetrics('org-star');
      expect(res.metrics.currentRatio.status).toBe('UNSUPPORTED_MISSING_DATA');
      expect(res.metrics.currentRatio.value).toBeNull();
      expect(res.metrics.currentRatio.dataLimitations[0]).toContain(
        'No liquid bank or cash accounts configured',
      );
      expect(res.metrics.quickRatio.status).toBe('UNSUPPORTED_MISSING_DATA');
      expect(res.metrics.quickRatio.value).toBeNull();
    });

    it('6. Correct source citations and structured audit trace for each metric', async () => {
      const deps = createStubDeps({
        baseCurrency: 'PKR',
        accounts: [
          {
            id: 'acc-savings',
            name: 'Business Savings Reserve',
            type: AccountType.BANK,
            currency: 'PKR',
            currentBalance: new Prisma.Decimal('2615100.0000'),
            isLiquid: true,
          },
        ],
        invoices: [
          {
            id: 'inv-ahmed',
            invoiceNumber: 'INV 002',
            customerName: 'Ahmed',
            currency: 'PKR',
            outstandingBalance: new Prisma.Decimal('300.0000'),
          },
        ],
        bills: [],
      });

      const service = new FinancialAnalyticsService(
        deps.prisma as never,
        deps.invoicesPayables as never,
        deps.budgetsService as never,
        deps.currencyService,
      );

      const res = await service.computeAllMetrics('org-star');
      const crTrace = res.metrics.currentRatio.auditTrace;
      const qrTrace = res.metrics.quickRatio.auditTrace;

      expect(crTrace).toBeDefined();
      expect(crTrace?.status).toBe('NOT_CALCULABLE');
      expect(crTrace?.inputs.currentAssets).toBe('2615400.0000');
      expect(crTrace?.inputs.currentLiabilities).toBe('0.0000');
      expect(crTrace?.assetRecords).toHaveLength(2);
      expect(crTrace?.assetRecords?.[0].label).toBe('Business Savings Reserve');
      expect(crTrace?.assetRecords?.[0].classification).toBe('Liquid Asset (BANK)');
      expect(crTrace?.assetRecords?.[1].label).toBe('INV 002 (Ahmed)');
      expect(crTrace?.assetRecords?.[1].classification).toBe('Accounts Receivable');
      expect(crTrace?.liabilityRecords).toHaveLength(0);

      expect(qrTrace).toBeDefined();
      expect(qrTrace?.inputs.liquidCash).toBe('2615100.0000');
      expect(qrTrace?.inputs.accountsReceivable).toBe('300.0000');
      expect(qrTrace?.inputs.quickAssets).toBe('2615400.0000');
    });

    it('7. No cross-organization data leakage', async () => {
      const deps = createStubDeps({
        baseCurrency: 'PKR',
        accounts: [
          {
            id: 'acc-star',
            name: 'Star Bank',
            type: AccountType.BANK,
            currency: 'PKR',
            currentBalance: new Prisma.Decimal('100000.0000'),
            isLiquid: true,
          },
        ],
      });

      const service = new FinancialAnalyticsService(
        deps.prisma as never,
        deps.invoicesPayables as never,
        deps.budgetsService as never,
        deps.currencyService,
      );

      // Requesting an unknown or other org throws NotFoundException
      await expect(service.computeAllMetrics('org-nonexistent')).rejects.toThrow('Organization not found');
    });

    it('8. Reporting-period filtering', async () => {
      const deps = createStubDeps({
        baseCurrency: 'PKR',
        accounts: [
          {
            id: 'acc-1',
            type: AccountType.BANK,
            currency: 'PKR',
            currentBalance: new Prisma.Decimal('50000.0000'),
            isLiquid: true,
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
        startDate: new Date('2026-08-14T00:00:00.000Z'),
        endDate: new Date('2026-11-12T23:59:59.999Z'),
      });

      expect(res.reportingPeriod.startDate).toBe('2026-08-14T00:00:00.000Z');
      expect(res.reportingPeriod.endDate).toBe('2026-11-12T23:59:59.999Z');
      expect(res.metrics.currentRatio.reportingPeriod.startDate).toBe('2026-08-14T00:00:00.000Z');
      expect(res.metrics.currentRatio.reportingPeriod.endDate).toBe('2026-11-12T23:59:59.999Z');
    });

    it('9. Currency conversion and multi-currency handling', async () => {
      const deps = createStubDeps({
        baseCurrency: 'PKR',
        accounts: [
          {
            id: 'acc-usd',
            name: 'USD Account',
            type: AccountType.BANK,
            currency: 'USD',
            currentBalance: new Prisma.Decimal('1000.0000'),
            isLiquid: true,
          },
        ],
        bills: [
          {
            id: 'bill-usd',
            billNumber: 'BILL-USD-1',
            supplierName: 'US Supplier',
            currency: 'USD',
            outstandingBalance: new Prisma.Decimal('500.0000'),
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
        endDate: new Date('2026-11-12T23:59:59.999Z'),
      });

      // 1000 USD @ 276.6214 PKR/USD = 276621.4000 PKR.
      // 500 USD @ 276.6214 PKR/USD = 138310.7000 PKR.
      // Current Ratio = 276621.4000 / 138310.7000 = 2.0000.
      expect(res.metrics.currentRatio.status).toBe('COMPUTED');
      expect(res.metrics.currentRatio.value).toBe('2.0000');
      expect(res.metrics.currentRatio.components?.currentAssets).toBe('276621.4000');
      expect(res.metrics.currentRatio.components?.currentLiabilities).toBe('138310.7000');
    });

    it('10. No duplicate transaction or record counting', async () => {
      const deps = createStubDeps({
        baseCurrency: 'PKR',
        accounts: [
          {
            id: 'acc-bank',
            name: 'Primary Bank',
            type: AccountType.BANK,
            currency: 'PKR',
            currentBalance: new Prisma.Decimal('100000.0000'),
            isLiquid: true,
          },
        ],
        invoices: [
          {
            id: 'inv-open',
            invoiceNumber: 'INV-10',
            currency: 'PKR',
            outstandingBalance: new Prisma.Decimal('20000.0000'),
          },
        ],
        bills: [
          {
            id: 'bill-open',
            billNumber: 'BILL-10',
            currency: 'PKR',
            outstandingBalance: new Prisma.Decimal('10000.0000'),
          },
        ],
      });

      const service = new FinancialAnalyticsService(
        deps.prisma as never,
        deps.invoicesPayables as never,
        deps.budgetsService as never,
        deps.currencyService,
      );

      const res = await service.computeAllMetrics('org-star');
      // Assets = 100k + 20k = 120k. Liabilities = 10k. Ratio = 12.0000.
      expect(res.metrics.currentRatio.value).toBe('12.0000');
      expect(res.metrics.currentRatio.sourceRecordIds.accountIds).toHaveLength(1);
      expect(res.metrics.currentRatio.sourceRecordIds.invoiceIds).toHaveLength(1);
      expect(res.metrics.currentRatio.sourceRecordIds.billIds).toHaveLength(1);
    });
  });
});
