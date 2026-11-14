import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { ReportType, TaskStatus } from '../../generated/prisma/client.js';
import { ReportsService } from './reports.service.js';

describe('ReportsService (Executive Brief & Strict Grounding)', () => {
  function makeDeps(
    overrides: {
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
    } = {},
  ) {
    const currency = overrides.currency ?? 'PKR';
    const missingCurrencies = overrides.missingCurrencies ?? [];

    const prisma = {
      financialAccount: {
        findMany: jest.fn().mockResolvedValue(
          overrides.liquidCashBalance === null
            ? []
            : [
                {
                  id: 'acc-1',
                  currency,
                  currentBalance: overrides.liquidCashBalance ?? '150000.0000',
                },
              ],
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
        create: jest
          .fn()
          .mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'rep-created-1',
            createdAt: new Date('2026-11-12T00:00:00.000Z'),
            ...data,
          })),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      followUpTask: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
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
                : {
                    liquidCashBalance: overrides.liquidCashBalance ?? '150000.0000',
                    monthlyNetBurn: '-35000.0000',
                  },
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
            components: {
              revenue: '75000.0000',
              costOfGoodsSold: '15000.0000',
              grossProfit: '60000.0000',
            },
          },
          expenseGrowth: {
            status: 'UNSUPPORTED_MISSING_DATA',
            value: null,
            sourceRecordIds: { transactionIds: ['tx-2'] },
            dataLimitations: ['Prior comparison period has zero recorded expenses.'],
          },
          workingCapital: {
            status: 'COMPUTED',
            value:
              overrides.workingCapitalVal === undefined
                ? '170000.0000'
                : overrides.workingCapitalVal,
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
                      {
                        bucket: '1_TO_30_DAYS',
                        count: 1,
                        amount: overrides.arOverdue ?? '20000.0000',
                      },
                      { bucket: '31_TO_60_DAYS', count: 0, amount: '0.0000' },
                      { bucket: '61_TO_90_DAYS', count: 0, amount: '0.0000' },
                      { bucket: 'OVER_90_DAYS', count: 0, amount: '0.0000' },
                    ],
            },
            sourceRecordIds: {
              invoiceIds: overrides.arOutstanding === '0.0000' ? [] : ['inv-1', 'inv-2'],
            },
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
      listBudgets: jest.fn().mockResolvedValue([{ id: 'bgt-1', name: 'FY26 Ops Budget' }]),
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

  it('compiles a concise BUSINESS_HEALTH brief with standardized currency, findings, actions, and grounding', async () => {
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
    expect(brief.executiveSummary).toHaveLength(1);
    expect(brief.kpis.map((k) => k.label)).toEqual([
      'Cash Balance',
      'Cash Runway',
      'Current Ratio',
    ]);
    expect(brief.kpis[0].value).toBe('PKR 150,000.00');
    expect(brief.kpis[2].value).toBe('2.50x');
    expect(brief.tables.map((t) => t.title)).toEqual([
      'Financial Performance & Position',
      'Receivables & Payables Aging',
    ]);
    expect(brief.tables[1].note).toContain('Excludes 1 draft invoice(s)');
    expect(
      brief.risksAndAnomalies.some((r) => r.title.includes('Overdue Customer Receivables')),
    ).toBe(false);
    expect(brief.prioritizedActionPlan.length).toBeLessThanOrEqual(3);
    expect(brief.prioritizedActionPlan.map((action) => action.priority)).toEqual(
      brief.prioritizedActionPlan.map((_, index) => index + 1),
    );
    expect(
      brief.prioritizedActionPlan.some((action) =>
        /maintain monthly|run periodic/i.test(action.title),
      ),
    ).toBe(false);
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

    const brief = (
      created.narrativeBody as {
        executiveBrief: { risksAndAnomalies: unknown[]; tables: Array<{ title: string }> };
      }
    ).executiveBrief;
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

  it('shows alert details once while keeping severity totals in the summary table', async () => {
    const { service } = makeDeps();
    const created = await service.generateReport(
      'org-1',
      { type: ReportType.RISK, title: 'Risk Review' },
      'usr-1',
    );
    const brief = (
      created.narrativeBody as {
        executiveBrief: {
          risksAndAnomalies: Array<{ title: string; detail: string }>;
          tables: Array<{ title: string; rows: Array<{ cells: string[] }> }>;
        };
      }
    ).executiveBrief;

    const alertTable = brief.tables.find(
      (table) => table.title === 'Alert Distribution by Severity',
    );
    expect(alertTable?.rows.find((row) => row.cells[0] === 'HIGH')?.cells.slice(1)).toEqual([
      '1',
      '1',
    ]);
    expect(brief.tables.some((table) => table.title === 'Recent Anomaly Signals')).toBe(false);
    const alertRisk = brief.risksAndAnomalies.find(
      (risk) => risk.title === 'Unusual expense in Payroll',
    );
    expect(alertRisk?.detail).toContain('The expense was unusually high.');
  });

  it('translates statistical alert wording into plain business language', async () => {
    const { service } = makeDeps({
      alerts: [
        {
          id: 'al-tech',
          severity: 'HIGH',
          status: 'OPEN',
          title: 'categoryBaselineMean stdDev',
          explanation:
            'Liquid reserves remain available. A transaction has z-score=2.3 and categoryBaselineMean=1250.0000.',
          type: 'UNUSUAL_AMOUNT',
        },
      ],
    });

    const created = await service.generateReport(
      'org-1',
      { type: ReportType.BUSINESS_HEALTH, title: 'Business Health' },
      'usr-1',
    );
    const brief = (
      created.narrativeBody as {
        executiveBrief: {
          risksAndAnomalies: Array<{ title: string; detail: string }>;
        };
      }
    ).executiveBrief;
    const reportText = brief.risksAndAnomalies
      .map((risk) => `${risk.title} ${risk.detail}`)
      .join(' ');

    expect(reportText).not.toMatch(/stdDev|z-score|categoryBaselineMean|\bAI\b/i);
    expect(reportText).toContain('average');
    expect(reportText).toContain('Liquid reserves remain available.');
    expect(reportText).toContain('unusual transaction activity was identified');
    expect(reportText).toContain('PKR 1,250.00');
  });

  it.each([
    ReportType.BUSINESS_HEALTH,
    ReportType.RISK,
    ReportType.EXPENSE,
    ReportType.CASH_FLOW,
    ReportType.BUDGET,
  ])('applies shared report standards to %s reports', async (reportType) => {
    const { service } = makeDeps({
      alerts: [
        {
          id: 'al-tech',
          severity: 'HIGH',
          status: 'OPEN',
          title: 'categoryBaselineMean stdDev',
          explanation:
            'Liquid reserves remain available. A transaction has z-score=2.3 and categoryBaselineMean=1250.0000.',
          type: 'UNUSUAL_AMOUNT',
        },
      ],
    });

    const created = await service.generateReport(
      'org-1',
      { type: reportType, title: 'Shared Standards Review' },
      'usr-1',
    );
    const brief = (
      created.narrativeBody as {
        executiveBrief: {
          executiveSummary: string[];
          kpis: Array<{ label: string; value: string }>;
          tables: Array<{ rows: Array<{ cells: string[] }> }>;
          risksAndAnomalies: Array<{ title: string; detail: string }>;
          prioritizedActionPlan: Array<{ priority: number; title: string; rationale: string }>;
        };
      }
    ).executiveBrief;
    const reportText = [
      ...brief.executiveSummary,
      ...brief.kpis.flatMap((kpi) => [kpi.label, kpi.value]),
      ...brief.tables.flatMap((table) => table.rows.flatMap((row) => row.cells)),
      ...brief.risksAndAnomalies.flatMap((risk) => [risk.title, risk.detail]),
      ...brief.prioritizedActionPlan.flatMap((action) => [action.title, action.rationale]),
    ].join(' ');

    expect(reportText).not.toMatch(/stdDev|z-score|categoryBaselineMean|\bAI\b/i);
    expect(reportText).toContain('spending pattern for this category');
    expect(reportText).toContain('Liquid reserves remain available.');
    expect(reportText).toContain('average spending for this category');
    expect(reportText).toContain('unusual transaction activity was identified');
    expect(reportText).toContain('PKR 1,250.00');
    expect(brief.prioritizedActionPlan.length).toBeLessThanOrEqual(3);
    expect(brief.prioritizedActionPlan.map((action) => action.priority)).toEqual(
      brief.prioritizedActionPlan.map((_, index) => index + 1),
    );
    expect(brief.tables.every((table) => table.rows.length > 0)).toBe(true);
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
      documentStructure: {
        executiveBrief: { reportType: string; tables: Array<{ title: string }> };
      };
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

  describe('updateFollowUpTaskStatus', () => {
    it('updates status to IN_PROGRESS and logs audit event', async () => {
      const { service, prisma, audit } = makeDeps();
      const existingTask = {
        id: 'tsk-101',
        organizationId: 'org-1',
        title: 'Review Q4 Accruals',
        status: TaskStatus.PENDING,
        completedAt: null,
      };

      (prisma.followUpTask.findFirst as ReturnType<typeof jest.fn>).mockResolvedValue(existingTask);
      (prisma.followUpTask.update as ReturnType<typeof jest.fn>).mockResolvedValue({
        ...existingTask,
        status: TaskStatus.IN_PROGRESS,
      });

      const res = await service.updateFollowUpTaskStatus(
        'org-1',
        'tsk-101',
        { status: TaskStatus.IN_PROGRESS },
        'usr-1',
      );

      expect(res.status).toBe(TaskStatus.IN_PROGRESS);
      expect(prisma.followUpTask.update).toHaveBeenCalledWith({
        where: { id: 'tsk-101' },
        data: {
          status: TaskStatus.IN_PROGRESS,
          completedAt: null,
        },
      });
      expect(audit.record).toHaveBeenCalledWith({
        organizationId: 'org-1',
        actorUserId: 'usr-1',
        action: 'FOLLOW_UP_TASK_STATUS_UPDATED',
        resourceType: 'FOLLOW_UP_TASK',
        resourceId: 'tsk-101',
        details: { status: TaskStatus.IN_PROGRESS },
      });
    });

    it('updates status to COMPLETED and sets completedAt timestamp', async () => {
      const { service, prisma } = makeDeps();
      const existingTask = {
        id: 'tsk-102',
        organizationId: 'org-1',
        title: 'Verify VAT submission',
        status: TaskStatus.IN_PROGRESS,
        completedAt: null,
      };

      (prisma.followUpTask.findFirst as ReturnType<typeof jest.fn>).mockResolvedValue(existingTask);
      (prisma.followUpTask.update as ReturnType<typeof jest.fn>).mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          ...existingTask,
          ...data,
        }),
      );

      const res = await service.updateFollowUpTaskStatus(
        'org-1',
        'tsk-102',
        { status: TaskStatus.COMPLETED },
        'usr-1',
      );

      expect(res.status).toBe(TaskStatus.COMPLETED);
      expect(res.completedAt).toBeInstanceOf(Date);
      expect(prisma.followUpTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tsk-102' },
          data: expect.objectContaining({
            status: TaskStatus.COMPLETED,
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws NotFoundException when task does not belong to organization', async () => {
      const { service, prisma } = makeDeps();
      (prisma.followUpTask.findFirst as ReturnType<typeof jest.fn>).mockResolvedValue(null);

      await expect(
        service.updateFollowUpTaskStatus(
          'org-other',
          'tsk-missing',
          { status: TaskStatus.IN_PROGRESS },
          'usr-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
