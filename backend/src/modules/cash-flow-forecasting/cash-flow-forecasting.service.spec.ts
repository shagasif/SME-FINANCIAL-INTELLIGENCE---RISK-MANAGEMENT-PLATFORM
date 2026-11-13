import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ForecastScenarioType,
  Prisma,
  RecurrenceFrequency,
  TransactionType,
} from '../../generated/prisma/client.js';
import { CashFlowForecastingService } from './cash-flow-forecasting.service.js';

function dec(value: string | number) {
  return new Prisma.Decimal(value);
}

function createMockPrisma(overrides?: Partial<Record<string, any>>) {
  const createdForecasts: any[] = [];
  const prisma = {
    organization: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === 'org-1' ? { id: 'org-1', baseCurrency: 'PKR' } : null,
      ),
    },
    financialAccount: {
      findMany: jest.fn(async () => [
        {
          id: 'acct-1',
          organizationId: 'org-1',
          currency: 'PKR',
          currentBalance: dec('100000.0000'),
        },
      ]),
      findFirst: jest.fn(async () => ({ updatedAt: new Date('2026-11-01T00:00:00.000Z') })),
    },
    invoice: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
    },
    bill: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
    },
    financialTransaction: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
    },
    paymentRecord: {
      findFirst: jest.fn(async () => null),
    },
    cashFlowForecast: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => createdForecasts),
      create: jest.fn(async ({ data }: any) => {
        const record = {
          id: `fc-${createdForecasts.length + 1}`,
          ...data,
          generatedAt: new Date('2026-11-12T10:00:00.000Z'),
          items: (data.items?.create ?? []).map((item: any, idx: number) => ({
            id: `item-${idx + 1}`,
            forecastId: `fc-${createdForecasts.length + 1}`,
            ...item,
          })),
        };
        createdForecasts.push(record);
        return record;
      }),
      update: jest.fn(async ({ data }: any) => data),
    },
    ...overrides,
  };
  return prisma;
}

function createMockAudit() {
  return {
    record: jest.fn(async () => undefined),
  };
}

describe('CashFlowForecastingService', () => {
  it('projects invoices (including overdue & end-of-window), bills, and opening cash without double counting', async () => {
    const prisma = createMockPrisma();
    prisma.invoice.findMany = jest.fn(async () => [
      // Overdue invoice (scheduled on Day 1)
      {
        id: 'inv-overdue',
        outstandingBalance: dec('5000.0000'),
        currency: 'PKR',
        dueDate: new Date('2026-11-10T10:00:00.000Z'),
      },
      // Invoice due on final day (Day 7) at 18:30Z (must NOT be dropped by 00:00Z cutoff)
      {
        id: 'inv-day7',
        outstandingBalance: dec('12000.0000'),
        currency: 'PKR',
        dueDate: new Date('2026-11-19T18:30:00.000Z'),
      },
    ]);
    prisma.bill.findMany = jest.fn(async () => [
      {
        id: 'bill-day3',
        outstandingBalance: dec('20000.0000'),
        currency: 'PKR',
        dueDate: new Date('2026-11-15T00:00:00.000Z'),
      },
    ]);

    const service = new CashFlowForecastingService(prisma as any, createMockAudit() as any);
    const result = await service.generateForecast(
      'org-1',
      {
        horizonDays: 7,
        scenarioType: ForecastScenarioType.BASE,
        startDate: '2026-11-12T00:00:00.000Z',
        liquiditySafetyBuffer: '90000.0000',
      },
      'user-1',
    );

    expect(result.currency).toBe('PKR');
    expect(result.openingCashBalance).toBe('100000.0000');
    expect(result.projectedInflows).toBe('17000.0000');
    expect(result.projectedOutflows).toBe('20000.0000');
    expect(result.projectedNetCashFlow).toBe('-3000.0000');
    expect(result.projectedClosingCash).toBe('97000.0000');
    expect(result.projectedReceivablesInflow).toBe('17000.0000');
    expect(result.projectedPayablesOutflow).toBe('20000.0000');
    // Day 1: 100k + 5k = 105k; Day 3: 105k - 20k = 85k (< 90k safety buffer -> liquidity warning)
    expect(result.minimumProjectedCash).toBe('85000.0000');
    expect(result.minimumCashDate).toBe('2026-11-15T00:00:00.000Z');
    expect(result.hasLiquidityWarning).toBe(true);
    expect(result.items).toHaveLength(7);

    // Ensure invoice query used endOfWindow (23:59:59.999Z)
    const invCall = prisma.invoice.findMany.mock.calls[0][0];
    expect(invCall.where.organizationId).toBe('org-1');
    expect(invCall.where.dueDate.lte.toISOString()).toBe('2026-11-19T23:59:59.999Z');
  });

  it('schedules WEEKLY, BIWEEKLY, MONTHLY (month-end clamped), QUARTERLY, and ANNUALLY recurrences accurately', async () => {
    const prisma = createMockPrisma();
    prisma.financialTransaction.findMany = jest.fn(async () => [
      // Weekly on Fridays: 2026-01-02 is Friday -> should land on Jan 9, 16, 23, 30 (4 times in 30d from Jan 2)
      {
        id: 'r-weekly',
        type: TransactionType.INCOME,
        amount: dec('1000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-01-02T00:00:00.000Z'),
        recurrenceFrequency: RecurrenceFrequency.WEEKLY,
      },
      // Monthly on the 31st: Jan 31 -> in Feb 2026 (non-leap) should clamp to Feb 28!
      {
        id: 'r-monthly-31',
        type: TransactionType.EXPENSE,
        amount: dec('2500.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-01-31T00:00:00.000Z'),
        recurrenceFrequency: RecurrenceFrequency.MONTHLY,
      },
      // Quarterly from 2025-11-15 -> should land on 2026-02-15 (3 months later)
      {
        id: 'r-quarterly',
        type: TransactionType.EXPENSE,
        amount: dec('4000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2025-11-15T00:00:00.000Z'),
        recurrenceFrequency: RecurrenceFrequency.QUARTERLY,
      },
      // Annually from 2025-02-10 -> should land on 2026-02-10
      {
        id: 'r-annual',
        type: TransactionType.INCOME,
        amount: dec('6000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2025-02-10T00:00:00.000Z'),
        recurrenceFrequency: RecurrenceFrequency.ANNUALLY,
      },
    ]);

    const service = new CashFlowForecastingService(prisma as any, createMockAudit() as any);
    const result = await service.generateForecast(
      'org-1',
      {
        horizonDays: 30,
        scenarioType: ForecastScenarioType.BASE,
        startDate: '2026-02-01T00:00:00.000Z',
        liquiditySafetyBuffer: '5000.0000',
      },
      'user-1',
    );

    // Weekly Fridays in Feb 2..Mar 3 2026: Feb 6, 13, 20, 27 = 4 * 1000 = 4000
    // Annual on Feb 10: 6000 -> total recurring inflows = 10000
    expect(result.projectedRecurringInflow).toBe('10000.0000');
    // Monthly-31 clamped to Feb 28 (2500) + Quarterly on Feb 15 (4000) = 6500
    expect(result.projectedRecurringOutflow).toBe('6500.0000');
  });

  it('converts foreign currency actuals in compareForecastWithActuals and reports missing rates', async () => {
    const prisma = createMockPrisma();
    prisma.cashFlowForecast.findFirst = jest.fn(async () => ({
      id: 'fc-1',
      organizationId: 'org-1',
      horizonDays: 7,
      scenarioType: ForecastScenarioType.BASE,
      version: 1,
      currency: 'PKR',
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-11-08T00:00:00.000Z'),
      openingCashBalance: dec('100000.0000'),
      projectedInflows: dec('50000.0000'),
      projectedOutflows: dec('10000.0000'),
      projectedClosingCash: dec('140000.0000'),
    }));
    prisma.financialTransaction.findMany = jest.fn(async () => [
      {
        id: 'tx-1',
        type: TransactionType.INCOME,
        amount: dec('100.0000'),
        currency: 'USD',
        transactionDate: new Date('2026-11-05T12:00:00.000Z'),
      },
      {
        id: 'tx-2',
        type: TransactionType.EXPENSE,
        amount: dec('5000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-08T19:00:00.000Z'),
      },
    ]);

    const mockCurrencyService = {
      loadRatesForOrganization: jest.fn(async () => []),
      convertAmountSync: jest.fn(({ amount, fromCurrency }: any) => {
        if (fromCurrency === 'USD') {
          return {
            isConverted: true,
            convertedAmount: dec(amount).mul(280),
            rateInfo: null,
          };
        }
        return { isConverted: false, convertedAmount: null };
      }),
    };

    const service = new CashFlowForecastingService(
      prisma as any,
      createMockAudit() as any,
      mockCurrencyService as any,
    );

    const comparison = await service.compareForecastWithActuals('org-1', 'fc-1');
    expect(comparison.currency).toBe('PKR');
    expect(comparison.isComplete).toBe(true);
    expect(comparison.actual.inflows).toBe('28000.0000');
    expect(comparison.actual.outflows).toBe('5000.0000');
    expect(comparison.actual.closingCash).toBe('123000.0000');
  });

  it('marks forecasts as stale when underlying financial records update after generatedAt', async () => {
    const prisma = createMockPrisma({
      invoice: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async () => ({ updatedAt: new Date('2026-11-12T12:00:00.000Z') })),
      },
      cashFlowForecast: {
        findMany: jest.fn(async () => [
          {
            id: 'fc-old',
            organizationId: 'org-1',
            horizonDays: 30,
            scenarioType: ForecastScenarioType.BASE,
            version: 1,
            currency: 'PKR',
            generatedAt: new Date('2026-11-12T10:00:00.000Z'),
            startDate: new Date('2026-11-12T00:00:00.000Z'),
            endDate: new Date('2026-12-12T00:00:00.000Z'),
            openingCashBalance: dec('50000.0000'),
            projectedInflows: dec('0.0000'),
            projectedOutflows: dec('0.0000'),
            projectedClosingCash: dec('50000.0000'),
            minimumProjectedCash: dec('50000.0000'),
            minimumCashDate: new Date('2026-11-12T00:00:00.000Z'),
            hasLiquidityWarning: false,
            uncertaintyBandPct: dec('10.0000'),
            assumptions: {},
            sourceRecordIds: {},
            dataLimitations: [],
            actualComparison: null,
          },
        ]),
      },
    });

    const service = new CashFlowForecastingService(prisma as any, createMockAudit() as any);
    const list = await service.listForecasts('org-1', 30);
    expect(list).toHaveLength(1);
    expect(list[0].isStale).toBe(true);
    expect(list[0].latestFinancialChangeAt).toBe('2026-11-12T12:00:00.000Z');
  });

  it('rejects negative safety buffers and missing organizations', async () => {
    const prisma = createMockPrisma();
    const service = new CashFlowForecastingService(prisma as any, createMockAudit() as any);

    await expect(
      service.generateForecast(
        'org-1',
        { horizonDays: 30, liquiditySafetyBuffer: '-100.0000' },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.generateForecast('missing-org', { horizonDays: 30 }, 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('handles received customer payment, supplier payment, paid bill, unpaid bill, and non-recurring expense without double counting', async () => {
    // Isolated in-memory dataset simulating persisted DB state after:
    // 1. Opening bank balance: 100,000 PKR
    // 2. Customer invoice INV-1 (30,000 PKR) received partial PaymentRecord of 10,000 PKR -> bank +10,000, outstanding = 20,000, non-recurring INCOME tx created
    // 3. Supplier bill BILL-PAID (15,000 PKR) fully paid via PaymentRecord -> bank -15,000, outstanding = 0, status = PAID, non-recurring EXPENSE tx created
    // 4. Supplier bill BILL-PARTIAL (12,000 PKR) partially paid 4,000 PKR -> bank -4,000, outstanding = 8,000, non-recurring EXPENSE tx created
    // 5. Unpaid supplier bill BILL-UNPAID (6,000 PKR) due on Day 5 -> outstanding = 6,000, status = OPEN
    // 6. Non-recurring expense (3,000 PKR) posted to bank -> bank -3,000, isRecurring = false
    // Net bank currentBalance = 100,000 + 10,000 - 15,000 - 4,000 - 3,000 = 88,000 PKR
    const accounts = [
      {
        id: 'acct-bank',
        organizationId: 'org-1',
        isArchived: false,
        isLiquid: true,
        type: 'BANK',
        currency: 'PKR',
        currentBalance: dec('88000.0000'),
      },
    ];
    const invoices = [
      {
        id: 'inv-partial',
        organizationId: 'org-1',
        isArchived: false,
        status: 'PARTIALLY_PAID',
        totalAmount: dec('30000.0000'),
        paidAmount: dec('10000.0000'),
        outstandingBalance: dec('20000.0000'),
        currency: 'PKR',
        dueDate: new Date('2026-11-15T00:00:00.000Z'),
      },
      {
        id: 'inv-paid',
        organizationId: 'org-1',
        isArchived: false,
        status: 'PAID',
        totalAmount: dec('5000.0000'),
        paidAmount: dec('5000.0000'),
        outstandingBalance: dec('0.0000'),
        currency: 'PKR',
        dueDate: new Date('2026-11-14T00:00:00.000Z'),
      },
    ];
    const bills = [
      {
        id: 'bill-paid',
        organizationId: 'org-1',
        isArchived: false,
        status: 'PAID',
        totalAmount: dec('15000.0000'),
        paidAmount: dec('15000.0000'),
        outstandingBalance: dec('0.0000'),
        currency: 'PKR',
        dueDate: new Date('2026-11-14T00:00:00.000Z'),
      },
      {
        id: 'bill-partial',
        organizationId: 'org-1',
        isArchived: false,
        status: 'PARTIALLY_PAID',
        totalAmount: dec('12000.0000'),
        paidAmount: dec('4000.0000'),
        outstandingBalance: dec('8000.0000'),
        currency: 'PKR',
        dueDate: new Date('2026-11-16T00:00:00.000Z'),
      },
      {
        id: 'bill-unpaid',
        organizationId: 'org-1',
        isArchived: false,
        status: 'OPEN',
        totalAmount: dec('6000.0000'),
        paidAmount: dec('0.0000'),
        outstandingBalance: dec('6000.0000'),
        currency: 'PKR',
        dueDate: new Date('2026-11-17T00:00:00.000Z'),
      },
    ];
    const transactions = [
      {
        id: 'tx-inv-payment',
        organizationId: 'org-1',
        isArchived: false,
        type: TransactionType.INCOME,
        amount: dec('10000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-12T00:00:00.000Z'),
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
      },
      {
        id: 'tx-bill-paid-payment',
        organizationId: 'org-1',
        isArchived: false,
        type: TransactionType.EXPENSE,
        amount: dec('15000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-12T00:00:00.000Z'),
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
      },
      {
        id: 'tx-bill-partial-payment',
        organizationId: 'org-1',
        isArchived: false,
        type: TransactionType.EXPENSE,
        amount: dec('4000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-12T00:00:00.000Z'),
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
      },
      {
        id: 'tx-non-recurring-expense',
        organizationId: 'org-1',
        isArchived: false,
        type: TransactionType.EXPENSE,
        amount: dec('3000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-12T00:00:00.000Z'),
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
      },
    ];

    const prisma = createMockPrisma({
      financialAccount: {
        findMany: jest.fn(async ({ where }: any) =>
          accounts.filter(
            (a) =>
              a.organizationId === where.organizationId &&
              a.isArchived === where.isArchived &&
              a.isLiquid === where.isLiquid,
          ),
        ),
        findFirst: jest.fn(async () => null),
      },
      invoice: {
        findMany: jest.fn(async ({ where }: any) =>
          invoices.filter(
            (i) =>
              i.organizationId === where.organizationId &&
              !i.isArchived &&
              i.outstandingBalance.gt(dec(where.outstandingBalance.gt)) &&
              !where.status.notIn.includes(i.status) &&
              i.dueDate <= where.dueDate.lte,
          ),
        ),
        findFirst: jest.fn(async () => null),
      },
      bill: {
        findMany: jest.fn(async ({ where }: any) =>
          bills.filter(
            (b) =>
              b.organizationId === where.organizationId &&
              !b.isArchived &&
              b.outstandingBalance.gt(dec(where.outstandingBalance.gt)) &&
              !where.status.notIn.includes(b.status) &&
              b.dueDate <= where.dueDate.lte,
          ),
        ),
        findFirst: jest.fn(async () => null),
      },
      financialTransaction: {
        findMany: jest.fn(async ({ where }: any) =>
          transactions.filter(
            (t) =>
              t.organizationId === where.organizationId &&
              !t.isArchived &&
              (where.isRecurring === undefined || t.isRecurring === where.isRecurring) &&
              (!where.recurrenceFrequency?.not ||
                t.recurrenceFrequency !== where.recurrenceFrequency.not) &&
              (!where.transactionDate?.gte || t.transactionDate >= where.transactionDate.gte) &&
              (!where.transactionDate?.lte || t.transactionDate <= where.transactionDate.lte),
          ),
        ),
        findFirst: jest.fn(async () => null),
      },
    });

    const service = new CashFlowForecastingService(prisma as any, createMockAudit() as any);
    const result = await service.generateForecast(
      'org-1',
      {
        horizonDays: 7,
        scenarioType: ForecastScenarioType.BASE,
        startDate: '2026-11-12T00:00:00.000Z',
        liquiditySafetyBuffer: '5000.0000',
      },
      'user-1',
    );

    // Opening cash reflects all settled payments & non-recurring expense
    expect(result.openingCashBalance).toBe('88000.0000');
    // Only remaining unpaid AR (20,000) is projected; paid invoice (5,000) & received payment (10,000) excluded
    expect(result.projectedReceivablesInflow).toBe('20000.0000');
    expect(result.projectedRecurringInflow).toBe('0.0000');
    expect(result.projectedInflows).toBe('20000.0000');
    // Only remaining unpaid AP (8,000 partial + 6,000 unpaid = 14,000) is projected; paid bill (15,000) & supplier payment (4,000) excluded
    expect(result.projectedPayablesOutflow).toBe('14000.0000');
    // Non-recurring expense (3,000) & payment ledger txs are NOT projected as recurring outflows
    expect(result.projectedRecurringOutflow).toBe('0.0000');
    expect(result.projectedOutflows).toBe('14000.0000');
    // Closing cash = 88,000 + 20,000 - 14,000 = 94,000
    expect(result.projectedNetCashFlow).toBe('6000.0000');
    expect(result.projectedClosingCash).toBe('94000.0000');
    expect(result.sourceRecordIds).toEqual({
      accountIds: ['acct-bank'],
      invoiceIds: ['inv-partial'],
      billIds: ['bill-partial', 'bill-unpaid'],
      futureTransactionIds: [],
      recurringTransactionIds: [],
      unpostedPaymentRecordIds: [],
    });
  });

  it('reflects future-dated non-recurring expenses/income on exact dates, reconciles historical accountless payments, excludes transfers, and avoids double counting', async () => {
    // Scenario:
    // - Bank currentBalance: 100,000 PKR (includes past/current txs AND 1 pre-fix future expense of 2,000 PKR that lacked deferredFutureBalance)
    // - Historical accountless PaymentRecords (transactionId: null): +5,000 customer receipt, -1,500 supplier payment -> +3,500 net
    //   => True Opening Cash = 100,000 + 2,000 (reversed pre-fix future expense) + 3,500 (unposted historical payments) = 105,500 PKR
    // - Day 2 (Nov 14): Future-dated non-recurring EXPENSE 4,000 PKR (deferredFutureBalance: true) + pre-fix future EXPENSE 2,000 PKR = 6,000 outflow
    // - Day 4 (Nov 16): Future-dated non-recurring INCOME 15,000 PKR (deferredFutureBalance: true)
    // - Day 7 (Nov 19): Recurring WEEKLY EXPENSE 1,000 PKR (anchor Nov 12)
    // - Past/Current transactions & TRANSFER: must NOT be projected in future days
    const startDate = '2026-11-12T00:00:00.000Z';
    const allTransactions = [
      {
        id: 'tx-future-exp-deferred',
        organizationId: 'org-1',
        isArchived: false,
        type: TransactionType.EXPENSE,
        amount: dec('4000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-14T10:00:00.000Z'),
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
        metadata: { deferredFutureBalance: true },
      },
      {
        id: 'tx-future-exp-prefix',
        organizationId: 'org-1',
        isArchived: false,
        type: TransactionType.EXPENSE,
        amount: dec('2000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-14T12:00:00.000Z'),
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
        metadata: null,
      },
      {
        id: 'tx-future-inc-deferred',
        organizationId: 'org-1',
        isArchived: false,
        type: TransactionType.INCOME,
        amount: dec('15000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-16T09:00:00.000Z'),
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
        metadata: { deferredFutureBalance: true },
      },
      {
        id: 'tx-past-exp',
        organizationId: 'org-1',
        isArchived: false,
        type: TransactionType.EXPENSE,
        amount: dec('9000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-10T00:00:00.000Z'),
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
        metadata: null,
      },
      {
        id: 'tx-today-inc',
        organizationId: 'org-1',
        isArchived: false,
        type: TransactionType.INCOME,
        amount: dec('7000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-12T15:00:00.000Z'),
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
        metadata: null,
      },
      {
        id: 'tx-future-transfer',
        organizationId: 'org-1',
        isArchived: false,
        type: TransactionType.TRANSFER,
        amount: dec('25000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-15T00:00:00.000Z'),
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
        metadata: null,
      },
      {
        id: 'tx-weekly-rec-exp',
        organizationId: 'org-1',
        isArchived: false,
        type: TransactionType.EXPENSE,
        amount: dec('1000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-12T00:00:00.000Z'),
        isRecurring: true,
        recurrenceFrequency: RecurrenceFrequency.WEEKLY,
        metadata: null,
      },
    ];

    const prisma = createMockPrisma({
      financialAccount: {
        findMany: jest.fn(async () => [
          {
            id: 'acct-1',
            organizationId: 'org-1',
            currency: 'PKR',
            currentBalance: dec('100000.0000'),
          },
        ]),
        findFirst: jest.fn(async () => null),
      },
      paymentRecord: {
        findMany: jest.fn(async () => [
          {
            id: 'pay-acctless-inv',
            organizationId: 'org-1',
            invoiceId: 'inv-hist',
            billId: null,
            transactionId: null,
            amount: dec('5000.0000'),
            currency: 'PKR',
            paymentDate: new Date('2026-11-11T00:00:00.000Z'),
          },
          {
            id: 'pay-acctless-bill',
            organizationId: 'org-1',
            invoiceId: null,
            billId: 'bill-hist',
            transactionId: null,
            amount: dec('1500.0000'),
            currency: 'PKR',
            paymentDate: new Date('2026-11-11T00:00:00.000Z'),
          },
        ]),
        findFirst: jest.fn(async () => null),
      },
      financialTransaction: {
        findMany: jest.fn(async ({ where }: any) =>
          allTransactions.filter((t) => {
            if (t.organizationId !== where.organizationId || t.isArchived) return false;
            if (where.isRecurring !== undefined && t.isRecurring !== where.isRecurring) return false;
            if (where.type?.in && !where.type.in.includes(t.type)) return false;
            if (where.recurrenceFrequency?.not && t.recurrenceFrequency === where.recurrenceFrequency.not) {
              return false;
            }
            if (where.transactionDate?.gte && t.transactionDate < where.transactionDate.gte) {
              return false;
            }
            if (where.transactionDate?.lte && t.transactionDate > where.transactionDate.lte) {
              return false;
            }
            return true;
          }),
        ),
        findFirst: jest.fn(async () => null),
      },
    });

    const service = new CashFlowForecastingService(prisma as any, createMockAudit() as any);
    const result = await service.generateForecast(
      'org-1',
      {
        horizonDays: 7,
        scenarioType: ForecastScenarioType.BASE,
        startDate,
        liquiditySafetyBuffer: '5000.0000',
      },
      'user-1',
    );

    expect(result.openingCashBalance).toBe('105500.0000');
    expect(result.projectedFutureTxInflow).toBe('15000.0000');
    expect(result.projectedFutureTxOutflow).toBe('6000.0000');
    expect(result.projectedRecurringOutflow).toBe('1000.0000');
    expect(result.projectedInflows).toBe('15000.0000');
    expect(result.projectedOutflows).toBe('7000.0000');
    // Closing = 105,500 + 15,000 - 7,000 = 113,500
    expect(result.projectedClosingCash).toBe('113500.0000');

    // Day 2 (Nov 14): -6,000 -> 99,500
    expect(result.items?.[1].projectionDate).toBe('2026-11-14T00:00:00.000Z');
    expect(result.items?.[1].expectedOutflow).toBe('6000.0000');
    expect(result.items?.[1].cumulativeBalance).toBe('99500.0000');
    // Day 3 (Nov 15): transfer excluded -> 0 flow, 99,500
    expect(result.items?.[2].netCashFlow).toBe('0.0000');
    // Day 4 (Nov 16): +15,000 -> 114,500
    expect(result.items?.[3].expectedInflow).toBe('15000.0000');
    expect(result.items?.[3].cumulativeBalance).toBe('114500.0000');
    // Day 7 (Nov 19): -1,000 weekly -> 113,500
    expect(result.items?.[6].recurringOutflow).toBe('1000.0000');
    expect(result.items?.[6].cumulativeBalance).toBe('113500.0000');
  });
});
