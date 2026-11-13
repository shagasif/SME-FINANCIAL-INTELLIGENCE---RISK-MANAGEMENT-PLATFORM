import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RecurrenceFrequency, Prisma, TransactionType } from '../../generated/prisma/client.js';
import { CurrencyConversionService, ExchangeRateRow } from '../currency/currency.service.js';
import { TransactionFilterQueryDto } from './dto/financial-transaction.dto.js';
import { FinancialTransactionsService } from './financial-transactions.service.js';

describe('FinancialTransactionsService & DTO (Sorting + Multi-Currency Summary)', () => {
  const sampleRates: ExchangeRateRow[] = [
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

  const createMockCurrencyService = (baseCurrency = 'USD', rates: ExchangeRateRow[] = sampleRates) => {
    const prismaStub = {
      organization: { findUnique: async () => ({ baseCurrency }) },
      exchangeRate: { findMany: async () => rates },
    };
    return new CurrencyConversionService(prismaStub as never, {} as never);
  };

  it('validates allowed sortBy and sortOrder values and rejects invalid sort injection in DTO', async () => {
    const validDto = plainToInstance(TransactionFilterQueryDto, {
      sortBy: 'amount',
      sortOrder: 'asc',
      page: '2',
      limit: '15',
    });
    const validErrors = await validate(validDto);
    expect(validErrors).toHaveLength(0);

    const invalidFieldDto = plainToInstance(TransactionFilterQueryDto, {
      sortBy: 'passwordHash',
      sortOrder: 'desc',
    });
    const invalidFieldErrors = await validate(invalidFieldDto);
    expect(invalidFieldErrors.length).toBeGreaterThan(0);

    const invalidOrderDto = plainToInstance(TransactionFilterQueryDto, {
      sortBy: 'amount',
      sortOrder: 'DROP_TABLE',
    });
    const invalidOrderErrors = await validate(invalidOrderDto);
    expect(invalidOrderErrors.length).toBeGreaterThan(0);
  });

  it('preserves default ordering and computes converted Organization.baseCurrency summary + native byCurrency breakdown', async () => {
    let capturedOrderBy: unknown;
    let capturedWhere: unknown;

    const summaryRows = [
      {
        type: TransactionType.INCOME,
        amount: new Prisma.Decimal('276820.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-10-15T00:00:00.000Z'),
      },
      {
        type: TransactionType.EXPENSE,
        amount: new Prisma.Decimal('138410.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-10-20T00:00:00.000Z'),
      },
    ];

    let callIdx = 0;
    const mockPrisma = {
      financialTransaction: {
        findMany: async (args: { orderBy?: unknown; where: unknown }) => {
          callIdx += 1;
          if (callIdx === 1) {
            capturedOrderBy = args.orderBy;
            capturedWhere = args.where;
            return [];
          }
          return summaryRows;
        },
        count: async () => 2,
      },
    };

    const service = new FinancialTransactionsService(
      mockPrisma as never,
      {} as never,
      createMockCurrencyService('USD'),
    );
    const result = await service.listTransactions('org-star', { page: 1, limit: 15 });

    expect(capturedWhere).toEqual({ organizationId: 'org-star', isArchived: false });
    expect(capturedOrderBy).toEqual([
      { transactionDate: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);

    expect(result.summary.currency).toBe('USD');
    expect(result.summary.isComplete).toBe(true);
    expect(result.summary.totalIncome).toBe('1000.0000');
    expect(result.summary.totalExpenses).toBe('500.0000');
    expect(result.summary.netCashMovement).toBe('500.0000');
    expect(result.summary.byCurrency).toEqual([
      {
        currency: 'PKR',
        totalTransactions: 2,
        incomeCount: 1,
        expenseCount: 1,
        transferCount: 0,
        totalIncome: '276820.0000',
        totalExpenses: '138410.0000',
        netCashMovement: '138410.0000',
      },
    ]);
  });

  it('applies custom server-side sortBy/sortOrder with deterministic tie-breakers', async () => {
    let capturedOrderBy: unknown;
    let callIdx = 0;
    const mockPrisma = {
      financialTransaction: {
        findMany: async (args: { orderBy?: unknown }) => {
          callIdx += 1;
          if (callIdx === 1) capturedOrderBy = args.orderBy;
          return [];
        },
        count: async () => 0,
      },
    };

    const service = new FinancialTransactionsService(
      mockPrisma as never,
      {} as never,
      createMockCurrencyService('USD'),
    );
    await service.listTransactions('org-star', {
      sortBy: 'amount',
      sortOrder: 'asc',
    });

    expect(capturedOrderBy).toEqual([
      { amount: 'asc' },
      { transactionDate: 'desc' },
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('marks summary incomplete and sets totals to null when FX rate is missing for a currency', async () => {
    const summaryRows = [
      {
        type: TransactionType.INCOME,
        amount: new Prisma.Decimal('100000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-10-15T00:00:00.000Z'),
      },
      {
        type: TransactionType.EXPENSE,
        amount: new Prisma.Decimal('500.0000'),
        currency: 'EUR',
        transactionDate: new Date('2026-10-15T00:00:00.000Z'),
      },
    ];

    let callIdx = 0;
    const mockPrisma = {
      financialTransaction: {
        findMany: async () => {
          callIdx += 1;
          return callIdx === 1 ? [] : summaryRows;
        },
        count: async () => 2,
      },
    };

    const service = new FinancialTransactionsService(
      mockPrisma as never,
      {} as never,
      createMockCurrencyService('USD'),
    );
    const result = await service.listTransactions('org-multi', {});

    expect(result.summary.currency).toBe('USD');
    expect(result.summary.isComplete).toBe(false);
    expect(result.summary.missingCurrencies).toEqual(['EUR']);
    expect(result.summary.totalIncome).toBeNull();
    expect(result.summary.totalExpenses).toBeNull();
    expect(result.summary.netCashMovement).toBeNull();
    expect(result.summary.byCurrency).toHaveLength(2);
  });

  it('defers currentBalance updates for future-dated transactions while applying past/current transactions immediately and leaving transfers neutral', async () => {
    let accountBalance = new Prisma.Decimal('50000.0000');
    const createdRecords: Array<Record<string, unknown>> = [];
    const balanceUpdates: string[] = [];

    const mockPrisma = {
      financialAccount: {
        findFirst: async () => ({
          id: 'acc-1',
          organizationId: 'org-1',
          currency: 'PKR',
          currentBalance: accountBalance,
          isArchived: false,
        }),
        update: async ({ data }: { data: { currentBalance: Prisma.Decimal } }) => {
          accountBalance = data.currentBalance;
          balanceUpdates.push(accountBalance.toFixed(4));
          return { id: 'acc-1', currentBalance: accountBalance };
        },
      },
      financialTransaction: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const rec = {
            id: `tx-${createdRecords.length + 1}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          createdRecords.push(rec);
          return rec;
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma),
    };

    const service = new FinancialTransactionsService(
      mockPrisma as never,
      { record: async () => undefined } as never,
    );

    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const todayDate = new Date().toISOString();

    // 1. Future-dated expense -> must NOT reduce currentBalance prematurely
    const futureExp = await service.createTransaction(
      'org-1',
      {
        accountId: 'acc-1',
        type: TransactionType.EXPENSE,
        amount: '8000.0000',
        transactionDate: futureDate,
        description: 'Future Rent',
        category: 'Rent',
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
      },
      'user-1',
    );
    expect(accountBalance.toFixed(4)).toBe('50000.0000');
    expect((futureExp.metadata as Record<string, unknown>)?.deferredFutureBalance).toBe(true);

    // 2. Future-dated income -> must NOT increase currentBalance prematurely
    const futureInc = await service.createTransaction(
      'org-1',
      {
        accountId: 'acc-1',
        type: TransactionType.INCOME,
        amount: '12000.0000',
        transactionDate: futureDate,
        description: 'Future Grant',
        category: 'Other Income',
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
      },
      'user-1',
    );
    expect(accountBalance.toFixed(4)).toBe('50000.0000');
    expect((futureInc.metadata as Record<string, unknown>)?.deferredFutureBalance).toBe(true);

    // 3. Past-dated expense -> reduces currentBalance immediately
    await service.createTransaction(
      'org-1',
      {
        accountId: 'acc-1',
        type: TransactionType.EXPENSE,
        amount: '5000.0000',
        transactionDate: pastDate,
        description: 'Past Utilities',
        category: 'Utilities',
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
      },
      'user-1',
    );
    expect(accountBalance.toFixed(4)).toBe('45000.0000');

    // 4. Current-dated income -> increases currentBalance immediately
    await service.createTransaction(
      'org-1',
      {
        accountId: 'acc-1',
        type: TransactionType.INCOME,
        amount: '3000.0000',
        transactionDate: todayDate,
        description: 'Today Cash Sale',
        category: 'Sales',
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
      },
      'user-1',
    );
    expect(accountBalance.toFixed(4)).toBe('48000.0000');

    // 5. Transfer -> zero impact on balance
    await service.createTransaction(
      'org-1',
      {
        accountId: 'acc-1',
        type: TransactionType.TRANSFER,
        amount: '10000.0000',
        transactionDate: todayDate,
        description: 'Internal Transfer',
        category: 'Transfer',
        isRecurring: false,
        recurrenceFrequency: RecurrenceFrequency.NONE,
      },
      'user-1',
    );
    expect(accountBalance.toFixed(4)).toBe('48000.0000');
    expect(balanceUpdates).toEqual(['45000.0000', '48000.0000']);
  });
});
