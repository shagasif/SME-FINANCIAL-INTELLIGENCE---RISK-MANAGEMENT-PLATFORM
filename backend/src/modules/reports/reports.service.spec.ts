import { jest } from '@jest/globals';
import { ReportType } from '../../generated/prisma/client.js';
import { ReportsService } from './reports.service.js';

describe('ReportsService (Executive Brief & Strict Grounding)', () => {
  function makeDeps(overrides: {
    currency?: string;
    cashRunwayStatus?: string;
    cashRunwayVal?: string | null;
    liquidCashBalance?: string | null;
    ocfVal?: string | null;
    workingCapitalVal?: string | null;
    arOutstanding?: string;
    arOverdue?: string;
    apOutstanding?: string;
    apOverdue?: string;
    alerts?: Array<{
      id: string;
      severity: string;
      status: string;
      title: string;
      explanation: string;
      type: string;
    }>;
    missingCurrencies?: string[];
  } = {}) {
    const currency = overrides.currency ?? 'PKR';
    const missingCurrencies = overrides.missingCurrencies ?? [];

    const prisma = {
      financialAccount: {
        findMany: jest.fn().mockResolvedValue(
          overrides.liquidCashBalance === null
            ? []
            : [{ id: 'acc-1', currency, currentBalance: overrides.liquidCashBalance ?? '150000.0000' }],
        ),
      },
      financialTransaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tx-exp-1',
            category: 'Payroll',
            amount: '40000.0000',
            currency,
            transactionDate: new Date('2026-11-05T00:00:00.000Z'),
          },
        ]),
      },
      reportRecord: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'rep-created-1',
          createdAt: new Date('2026-11-12T00:00:00.000Z'),
          ...data,
        })),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
    };

    const analytics = {
      computeAllMetrics: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        currency,
        conversionContext: {
          baseCurrency: currency,
          isComplete: missingCurrencies.length === 0,
          missingCurrencies,
        },
        metrics: {
          operatingCashFlow: {
            status: overrides.ocfVal === null ? 'UNSUPPORTED_MISSING_DATA' : 'COMPUTED',
            value: overrides.ocfVal === undefined ? '35000.0000' : overrides.ocfVal,
            sourceRecordIds: { transactionIds: ['tx-1', 'tx-2'] },
            dataLimitations: overrides.ocfVal === null ? ['Missing FX rate for EUR -> PKR'] : [],
            components: {
              cashInflows: '75000.0000',
              cashOutflows: '40000.0000',
            },
          },
          cashRunway: {
            status: overrides.cashRunwayStatus ?? 'COMPUTED',
            value: overrides.cashRunwayVal === undefined ? '999.0000' : overrides.cashRunwayVal,
            sourceRecordIds: { accountIds: ['acc-1'], transactionIds: ['tx-1', 'tx-2'] },
            dataLimitations: [],
            components:
              overrides.liquidCashBalance === null
                ? undefined
                : { liquidCashBalance: overrides.liquidCashBalance ?? '150000.0000', monthlyNetBurn: '-35000.0000' },
          },
          currentRatio: {
            status: 'COMPUTED',
            value: '2.5000',
            sourceRecordIds: { accountIds: ['acc-1'] },
            dataLimitations: [],
          },
          quickRatio: {
            status: 'COMPUTED',
            value: '2.5000',
            sourceRecordIds: { accountIds: ['acc-1'] },
            dataLimitations: [],
          },
          grossMargin: {
            status: 'COMPUTED',
            value: '80.0000',
            sourceRecordIds: { transactionIds: ['tx-1'] },
            dataLimitations: [],
            components: { revenue: '75000.0000', costOfGoodsSold: '15000.0000', grossProfit: '60000.0000' },
          },
          expenseGrowth: {
            status: 'UNSUPPORTED_MISSING_DATA',
            value: null,
            sourceRecordIds: { transactionIds: ['tx-2'] },
            dataLimitations: ['Prior comparison period has zero recorded expenses.'],
          },
          workingCapital: {
            status: 'COMPUTED',
            value: overrides.workingCapitalVal === undefined ? '170000.0000' : overrides.workingCapitalVal,
            sourceRecordIds: { accountIds: ['acc-1'], invoiceIds: ['inv-1'], billIds: ['bill-1'] },
            dataLimitations: [],
            components: { currentAssets: '210000.0000', currentLiabilities: '40000.0000' },
          },
          budgetVariance: {
            status: 'UNSUPPORTED_MISSING_DATA',
            value: null,
            sourceRecordIds: { budgetIds: [] },
            dataLimitations: ['No active budget overlaps the selected reporting period.'],
          },
          receivableAging: {
            status: 'COMPUTED',
            value: {
              totalOutstanding: overrides.arOutstanding ?? '60000.0000',
              totalOverdue: overrides.arOverdue ?? '20000.0000',
              buckets:
                overrides.arOutstanding === '0.0000'
                  ? [
                      { bucket: 'CURRENT', count: 0, amount: '0.0000' },
                      { bucket: '1_TO_30_DAYS', count: 0, amount: '0.0000' },
                      { bucket: '31_TO_60_DAYS', count: 0, amount: '0.0000' },
                      { bucket: '61_TO_90_DAYS', count: 0, amount: '0.0000' },
                      { bucket: 'OVER_90_DAYS', count: 0, amount: '0.0000' },
                    ]
                  : [
                      { bucket: 'CURRENT', count: 1, amount: '40000.0000' },
                      { bucket: '1_TO_30_DAYS', count: 1, amount: overrides.arOverdue ?? '20000.0000' },
                      { bucket: '31_TO_60_DAYS', count: 0, amount: '0.0000' },
                      { bucket: '61_TO_90_DAYS', count: 0, amount: '0.0000' },
                      { bucket: 'OVER_90_DAYS', count: 0, amount: '0.0000' },
                    ],
            },
            sourceRecordIds: { invoiceIds: overrides.arOutstanding === '0.0000' ? [] : ['inv-1', 'inv-2'] },
            dataLimitations: [],
            components: { draftCount: '1', draftTotal: '55000.0000' },
          },
          payableAging: {
            status: 'COMPUTED',
            value: {
              totalOutstanding: overrides.apOutstanding ?? '40000.0000',
              totalOverdue: overrides.apOverdue ?? '0.0000',
              buckets:
                overrides.apOutstanding === '0.0000'
                  ? [
                      { bucket: 'CURRENT', count: 0, amount: '0.0000' },
                      { bucket: '1_TO_30_DAYS', count: 0, amount: '0.0000' },
                      { bucket: '31_TO_60_DAYS', count: 0, amount: '0.0000' },
                      { bucket: '61_TO_90_DAYS', count: 0, amount: '0.0000' },
                      { bucket: 'OVER_90_DAYS', count: 0, amount: '0.0000' },
                    ]
                  : [
                      { bucket: 'CURRENT', count: 1, amount: '40000.0000' },
                      { bucket: '1_TO_30_DAYS', count: 0, amount: '0.0000' },
                      { bucket: '31_TO_60_DAYS', count: 0, amount: '0.0000' },
                      { bucket: '61_TO_90_DAYS', count: 0, amount: '0.0000' },
                      { bucket: 'OVER_90_DAYS', count: 0, amount: '0.0000' },
                    ],
            },
            sourceRecordIds: { billIds: overrides.apOutstanding === '0.0000' ? [] : ['bill-1'] },
            dataLimitations: [],
          },
        },
      }),
    };

    const forecasting = {
      listForecasts: jest.fn().mockResolvedValue([
        {
          id: 'fc-1',
          openingCashBalance: '150000.0000',
          projectedClosingCash: '185000.0000',
          minimumProjectedCash: '140000.0000',
          hasLiquidityWarning: false,
        },
      ]),
      getForecastById: jest.fn().mockResolvedValue({
        id: 'fc-1',
        items: [
          {
            projectionDate: '2026-11-13T00:00:00.000Z',
            expectedInflow: '10000.0000',
            recurringInflow: '0.0000',
            expectedOutflow: '2000.0000',
            recurringOutflow: '0.0000',
            cumulativeBalance: '158000.0000',
          },
        ],
      }),
    };

    const budgets = {
      listBudgets: jest.fn().mockResolvedValue([
        { id: 'bgt-1', name: 'FY26 Ops Budget' },
      ]),
      calculateBudgetVariance: jest.fn().mockResolvedValue({
        totalAllocated: '100000.0000',
        totalActualSpent: '40000.0000',
        totalVarianceAmount: '60000.0000',
        totalUtilizationPct: '40.0000',
        lines: [
          {
            category: 'Payroll',
            department: 'Ops',
            budgetedAmount: '100000.0000',
            actualSpent: '40000.0000',
            varianceAmount: '60000.0000',
            utilizationPct: '40.00',
            status: 'NORMAL',
          },
        ],
      }),
    };

    const riskMonitoring = {
      listAlerts: jest.fn().mockResolvedValue(
        overrides.alerts ?? [
          {
            id: 'al-1',
            severity: 'HIGH',
            status: 'OPEN',
            title: 'Unusual expense in Payroll',
            explanation: 'Outlier expense detected.',
            type: 'UNUSUAL_AMOUNT',
          },
        ],
      ),
    };

    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const service = new ReportsService(
      prisma as never,
      analytics as never,
      forecasting as never,
      budgets as never,
      riskMonitoring as never,
      audit as never,
    );

    return { service, prisma, audit };
  }

  it('compiles a concise BUSINESS_HEALTH executive brief with 4 KPIs, aging comparison, risks, actions, and grounding', async () => {
    const { service } = makeDeps({ currency: 'PKR' });

    const created = await service.generateReport(
      'org-1',
      { type: ReportType.BUSINESS_HEALTH, title: 'November Health Brief' },
      'usr-1',
    );

    const narrative = created.narrativeBody as {
      executiveBrief: {
        schemaVersion: string;
        executiveSummary: string[];
        kpis: Array<{ label: string; value: string }>;
        tables: Array<{ title: string; note?: string }>;
        risksAndAnomalies: Array<{ severity: string; title: string }>;
        prioritizedActionPlan: Array<{ priority: number; title: string }>;
        dataGrounding: { currency: string; recordCounts: { invoices: number; riskAlerts: number } };
      };
    };

    const brief = narrative.executiveBrief;
    expect(brief.schemaVersion).toBe('2.0');
    expect(brief.executiveSummary).toHaveLength(4);
    expect(brief.kpis.map((k) => k.label)).toEqual([
      'Cash Balance',
      'Operating Cash Flow',
      'Working Capital',
      'Outstanding AR / AP',
    ]);
    expect(brief.kpis[0].value).toContain('PKR');
    expect(brief.tables.map((t) => t.title)).toEqual([
      'Financial Performance & Position',
      'Receivables & Payables Aging',
    ]);
    expect(brief.tables[1].note).toContain('Excludes 1 draft invoice(s)');
    expect(brief.risksAndAnomalies.some((r) => r.title.includes('Overdue Customer Receivables'))).toBe(true);
    expect(brief.prioritizedActionPlan.length).toBeGreaterThanOrEqual(3);
    expect(brief.prioritizedActionPlan.length).toBeLessThanOrEqual(4);
    expect(brief.dataGrounding.currency).toBe('PKR');
    expect(brief.dataGrounding.recordCounts.invoices).toBe(2);
    expect(brief.dataGrounding.recordCounts.riskAlerts).toBe(1);
  });

  it('omits risksAndAnomalies cleanly when there are zero detected risks, overdue items, or FX gaps', async () => {
    const { service } = makeDeps({
      currency: 'USD',
      arOutstanding: '0.0000',
      arOverdue: '0.0000',
      apOutstanding: '0.0000',
      apOverdue: '0.0000',
      alerts: [],
    });

    const created = await service.generateReport(
      'org-1',
      { type: ReportType.BUSINESS_HEALTH, title: 'Clean Health Snapshot' },
      'usr-1',
    );

    const brief = (created.narrativeBody as { executiveBrief: { risksAndAnomalies: unknown[]; tables: Array<{ title: string }> } }).executiveBrief;
    expect(brief.risksAndAnomalies).toEqual([]);
    // Aging table omitted cleanly when open AR and AP balances are both zero
    expect(brief.tables.some((t) => t.title === 'Receivables & Payables Aging')).toBe(false);
  });

  it('surfaces MISSING_DATA and missing FX inputs cleanly without fabricating values', async () => {
    const { service } = makeDeps({
      currency: 'PKR',
      ocfVal: null,
      liquidCashBalance: null,
      missingCurrencies: ['EUR'],
    });

    const created = await service.generateReport(
      'org-1',
      { type: ReportType.BUSINESS_HEALTH },
      'usr-1',
    );

    const brief = (
      created.narrativeBody as {
        executiveBrief: {
          kpis: Array<{ label: string; status: string; value: string }>;
          dataGrounding: { missingInputs: string[] };
        };
      }
    ).executiveBrief;

    const ocfKpi = brief.kpis.find((k) => k.label === 'Operating Cash Flow');
    expect(ocfKpi?.status).toBe('MISSING_DATA');
    expect(ocfKpi?.value).toBe('Unavailable');
    expect(brief.dataGrounding.missingInputs.some((m) => m.includes('EUR'))).toBe(true);
  });

  it('exports PDF documentStructure containing executiveBrief matching the brief model and logs audit', async () => {
    const { service, prisma, audit } = makeDeps({ currency: 'PKR' });
    const generated = await service.generateReport(
      'org-1',
      { type: ReportType.EXPENSE, title: 'Expense Audit' },
      'usr-1',
    );

    prisma.reportRecord.findFirst.mockResolvedValue({
      ...generated,
      periodStart: new Date('2026-10-13T00:00:00.000Z'),
      periodEnd: new Date('2026-11-12T00:00:00.000Z'),
    });

    const exported = (await service.exportReport(
      'org-1',
      'rep-created-1',
      'PDF',
      'usr-1',
      'BUSINESS_OWNER',
    )) as {
      format: string;
      documentStructure: { executiveBrief: { reportType: string; tables: Array<{ title: string }> } };
    };

    expect(exported.format).toBe('PDF');
    expect(exported.documentStructure.executiveBrief.reportType).toBe(ReportType.EXPENSE);
    expect(exported.documentStructure.executiveBrief.tables[0].title).toBe(
      'Operating Expenses by Category',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REPORT_EXPORTED_PDF' }),
    );
  });
});
