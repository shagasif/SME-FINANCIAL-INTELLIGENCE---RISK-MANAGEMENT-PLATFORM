import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BudgetPeriodType, BudgetStatus, Prisma, TransactionType } from '../../generated/prisma/client.js';
import { BudgetsService } from './budgets.service.js';

function dec(value: string | number) {
  return new Prisma.Decimal(value);
}

describe('BudgetsService', () => {
  it('creates a budget using organization baseCurrency and rejects duplicate category/department lines', async () => {
    const createdRevisions: any[] = [];
    const mockPrisma = {
      budget: {
        create: jest.fn(async ({ data }: any) => ({
          id: 'bgt-1',
          ...data,
          status: BudgetStatus.ACTIVE,
          lines: (data.lines?.create ?? []).map((l: any, idx: number) => ({
            id: `line-${idx + 1}`,
            budgetId: 'bgt-1',
            ...l,
          })),
          revisions: [],
          createdAt: new Date('2026-11-01T00:00:00.000Z'),
          updatedAt: new Date('2026-11-01T00:00:00.000Z'),
        })),
        findUniqueOrThrow: jest.fn(async () => ({
          id: 'bgt-1',
          organizationId: 'org-1',
          name: 'Q4 Operating Plan',
          periodType: BudgetPeriodType.QUARTERLY,
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T23:59:59.999Z'),
          currency: 'PKR',
          totalAllocated: dec('50000.0000'),
          status: BudgetStatus.ACTIVE,
          version: 1,
          notes: null,
          lines: [
            {
              id: 'line-1',
              category: 'Cloud & IT Infrastructure',
              department: 'Engineering',
              allocatedAmount: dec('50000.0000'),
              alertThreshold: dec('90.0000'),
              notes: null,
            },
          ],
          revisions: createdRevisions,
          createdAt: new Date('2026-11-01T00:00:00.000Z'),
          updatedAt: new Date('2026-11-01T00:00:00.000Z'),
        })),
      },
      budgetRevision: {
        create: jest.fn(async ({ data }: any) => {
          const rev = { id: 'rev-1', ...data, createdAt: new Date('2026-11-01T00:00:00.000Z') };
          createdRevisions.push(rev);
          return rev;
        }),
      },
      $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
    };

    const mockCurrency = {
      getOrganizationBaseCurrency: jest.fn(async () => 'PKR'),
    };
    const mockAudit = { record: jest.fn(async () => undefined) };

    const service = new BudgetsService(mockPrisma as any, mockAudit as any, mockCurrency as any);

    const created = await service.createBudget(
      'org-1',
      {
        name: 'Q4 Operating Plan',
        periodType: BudgetPeriodType.QUARTERLY,
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-12-31T23:59:59.999Z',
        lines: [
          {
            category: 'Cloud & IT Infrastructure',
            department: 'Engineering',
            allocatedAmount: '50000.0000',
            alertThreshold: '90.0000',
          },
        ],
      },
      'user-1',
    );

    expect(created.currency).toBe('PKR');
    expect(created.totalAllocated).toBe('50000.0000');
    expect(createdRevisions).toHaveLength(1);

    await expect(
      service.createBudget(
        'org-1',
        {
          name: 'Invalid Duplicate',
          periodType: BudgetPeriodType.MONTHLY,
          startDate: '2026-11-01T00:00:00.000Z',
          endDate: '2026-11-30T23:59:59.999Z',
          lines: [
            { category: 'Operating Expense', department: 'General', allocatedAmount: '1000.0000' },
            { category: ' operating expense ', department: 'general', allocatedAmount: '2000.0000' },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('prevents double-counting across Engineering and General lines, tracks unbudgeted spend, converts FX, and includes end-of-day expenses', async () => {
    const budgetRecord = {
      id: 'bgt-1',
      organizationId: 'org-1',
      name: 'Q4 Budget',
      periodType: BudgetPeriodType.QUARTERLY,
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'), // midnight endDate -> must include 23:59:59.999Z
      currency: 'PKR',
      totalAllocated: dec('30000.0000'),
      version: 1,
      lines: [
        {
          id: 'line-eng',
          category: 'Cloud & IT Infrastructure',
          department: 'Engineering',
          allocatedAmount: dec('10000.0000'),
          alertThreshold: dec('90.0000'),
        },
        {
          id: 'line-gen',
          category: 'Cloud & IT Infrastructure',
          department: 'General',
          allocatedAmount: dec('20000.0000'),
          alertThreshold: dec('80.0000'),
        },
      ],
      revisions: [],
    };

    const expenses = [
      // Should match ONLY line-eng (12,000 -> OVERRUN on 10,000), NOT line-gen!
      {
        id: 'tx-eng',
        type: TransactionType.EXPENSE,
        category: 'Cloud & IT Infrastructure',
        department: 'Engineering',
        amount: dec('12000.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-12-31T18:30:00.000Z'),
      },
      // Foreign currency USD 50 * 280 = 14,000 PKR with department null -> matches line-gen (70% < 80% -> ON_TRACK)
      {
        id: 'tx-gen-usd',
        type: TransactionType.EXPENSE,
        category: 'Cloud & IT Infrastructure',
        department: null,
        amount: dec('50.0000'),
        currency: 'USD',
        transactionDate: new Date('2026-11-15T00:00:00.000Z'),
      },
      // Unbudgeted expense in Travel -> must appear in unbudgetedActualSpent
      {
        id: 'tx-unbudgeted',
        type: TransactionType.EXPENSE,
        category: 'Travel & Entertainment',
        department: 'Sales',
        amount: dec('4500.0000'),
        currency: 'PKR',
        transactionDate: new Date('2026-11-20T00:00:00.000Z'),
      },
    ];

    const mockPrisma = {
      budget: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.id === 'bgt-1' && where.organizationId === 'org-1' ? budgetRecord : null,
        ),
      },
      financialTransaction: {
        findMany: jest.fn(async () => expenses),
      },
    };

    const mockCurrency = {
      loadRatesForOrganization: jest.fn(async () => []),
      convertAmountSync: jest.fn(({ amount, fromCurrency }: any) => {
        if (fromCurrency === 'USD') {
          return { isConverted: true, convertedAmount: dec(amount).mul(280) };
        }
        return { isConverted: false, convertedAmount: null };
      }),
    };

    const service = new BudgetsService(mockPrisma as any, { record: jest.fn() } as any, mockCurrency as any);
    const variance = await service.calculateBudgetVariance('org-1', 'bgt-1');

    // Verify endOfPeriod query included 23:59:59.999Z
    const txQuery = mockPrisma.financialTransaction.findMany.mock.calls[0][0];
    expect(txQuery.where.transactionDate.lte.toISOString()).toBe('2026-12-31T23:59:59.999Z');

    const engLine = variance.lines.find((l) => l.lineId === 'line-eng')!;
    const genLine = variance.lines.find((l) => l.lineId === 'line-gen')!;
    expect(engLine.actualSpent).toBe('12000.0000');
    expect(engLine.status).toBe('OVERRUN');
    expect(engLine.sourceTransactionIds).toEqual(['tx-eng']);

    expect(genLine.actualSpent).toBe('14000.0000');
    expect(genLine.status).toBe('ON_TRACK');
    expect(genLine.sourceTransactionIds).toEqual(['tx-gen-usd']);

    // Total budgeted spend = 12,000 + 14,000 = 26,000 (zero double counting!)
    expect(variance.totalActualSpent).toBe('26000.0000');
    expect(variance.totalVarianceAmount).toBe('4000.0000');
    expect(variance.unbudgetedActualSpent).toBe('4500.0000');
    expect(variance.totalOrganizationExpenses).toBe('30500.0000');
    expect(variance.unbudgetedCategories).toHaveLength(1);
    expect(variance.unbudgetedCategories[0].category).toBe('Travel & Entertainment');

    // Organization isolation
    await expect(service.calculateBudgetVariance('other-org', 'bgt-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
