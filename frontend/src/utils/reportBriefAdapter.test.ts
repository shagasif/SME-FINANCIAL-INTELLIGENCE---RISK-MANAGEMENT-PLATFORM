import { describe, expect, it } from 'vitest';
import { ReportType, type ExecutiveBrief, type ReportRecord } from '../types/reports.types';
import {
  formatSourceReferenceValues,
  getSourceReferenceLabel,
  getReportDataSources,
  getReportRecordCounts,
  resolveExecutiveBrief,
} from './reportBriefAdapter';

const report: ReportRecord = {
  id: 'rep-adapter-test',
  organizationId: 'org-test',
  title: 'Risk review',
  reportType: ReportType.RISK,
  sourceRecordIds: {},
  createdAt: '2026-11-14T00:00:00.000Z',
};

const brief: ExecutiveBrief = {
  schemaVersion: '2.0',
  reportType: ReportType.RISK,
  executiveSummary: [
    'Overdue receivables are PKR 20,000.',
    'Overdue receivables are PKR 20,000.',
    'An AI-synthesized z-score note requires review.',
    'The finance review is complete.',
    'The finance review is complete.',
  ],
  kpis: [
    {
      label: 'Overdue Receivables',
      value: 'PKR 20000',
      status: 'VERIFIED',
    },
  ],
  tables: [
    {
      title: 'Receivables & Payables Aging',
      columns: [{ label: 'Amount' }],
      rows: [{ cells: ['PKR 20,000'] }],
    },
    {
      title: 'Recent Anomaly Signals',
      columns: [{ label: 'Signal' }],
      rows: [{ cells: ['Duplicate supplier payment'] }],
    },
  ],
  risksAndAnomalies: [
    {
      severity: 'HIGH',
      title: 'Overdue Customer Receivables',
      detail: 'Receivables remain overdue.',
      sourceTag: 'AR Aging',
    },
    {
      severity: 'HIGH',
      title: 'Duplicate supplier payment',
      detail: 'The transaction is listed in the alert table.',
      sourceTag: 'Risk Alert',
    },
    {
      severity: 'MEDIUM',
      title: 'Supplier concentration',
      detail: 'Two suppliers account for a material share of purchases.',
      sourceTag: 'Payables review',
    },
    {
      severity: 'MEDIUM',
      title: 'Supplier concentration',
      detail: 'Two suppliers account for a material share of purchases.',
      sourceTag: 'Payables review',
    },
  ],
  prioritizedActionPlan: [1, 2, 3, 4].map((priority) => ({
    priority,
    title: `Review priority ${priority}`,
    rationale: 'Follow up with the finance team.',
    targetArea: 'Finance',
    impact: 'MEDIUM',
  })),
  dataGrounding: {
    reportingPeriodStart: '2026-10-15T00:00:00.000Z',
    reportingPeriodEnd: '2026-11-14T00:00:00.000Z',
    currency: 'PKR',
    recordCounts: {
      accounts: 0,
      transactions: 0,
      invoices: 0,
      bills: 0,
      budgets: 0,
      riskAlerts: 0,
      forecasts: 0,
    },
    dataSources: ['Financial accounts (2)', 'Financial accounts (2)'],
    missingInputs: [],
    methodologyNote: 'Prioritized actions are AI-synthesized.',
  },
};

describe('resolveExecutiveBrief', () => {
  it('deduplicates duplicate findings and formats a report once for drawer and PDF consumers', () => {
    const resolved = resolveExecutiveBrief({
      ...report,
      narrativeBody: { executiveBrief: brief },
    });

    expect(resolved.executiveSummary).toEqual([
      'unusual transaction activity requires review.',
      'The finance review is complete.',
    ]);
    expect(resolved.kpis[0].value).toBe('PKR 20,000.00');
    expect(resolved.risksAndAnomalies).toHaveLength(1);
    expect(resolved.risksAndAnomalies[0].title).toBe('Supplier concentration');
    expect(resolved.prioritizedActionPlan.map((action) => action.priority)).toEqual([1, 2, 3]);
    expect(resolved.dataGrounding.dataSources).toEqual(['Financial accounts']);
    expect(resolved.dataGrounding.methodologyNote).toContain('verified organization records');
  });

  it('shows source counts only when the corresponding detail is not already in a report table', () => {
    const countBrief: ExecutiveBrief = {
      ...brief,
      tables: [
        {
          title: 'Receivables & Payables Aging',
          columns: [],
          rows: [],
        },
        { title: 'Budget Plans Summary', columns: [], rows: [] },
        { title: 'Alert Distribution by Severity', columns: [], rows: [] },
        { title: 'Forecast Checkpoints', columns: [], rows: [] },
      ],
      dataGrounding: {
        ...brief.dataGrounding,
        dataSources: ['Financial accounts (2)', 'Invoices'],
        recordCounts: {
          accounts: 1,
          transactions: 3,
          invoices: 4,
          bills: 2,
          budgets: 1,
          riskAlerts: 5,
          forecasts: 1,
        },
      },
    };

    expect(getReportRecordCounts(countBrief)).toEqual([
      { label: 'Accounts', count: 1 },
      { label: 'Transactions', count: 3 },
      { label: 'Forecasts', count: 1 },
    ]);
    expect(getReportDataSources(countBrief)).toEqual([]);
  });

  it('removes only duplicated legacy-summary facts and preserves distinct information', () => {
    const resolved = resolveExecutiveBrief({
      ...report,
      currency: 'PKR',
      summary:
        'Overdue receivables are PKR 20,000.00; collection timing may delay supplier payments.',
      summaryMetrics: { overdueReceivables: 20000 },
    });

    expect(resolved.executiveSummary).toEqual(['collection timing may delay supplier payments.']);
  });

  it('uses business labels for source-reference keys without changing source IDs', () => {
    expect(getSourceReferenceLabel('accountIds')).toBe('Financial accounts');
    expect(getSourceReferenceLabel('account_ids')).toBe('Financial accounts');
    expect(getSourceReferenceLabel('riskAlertIds')).toBe('Risk alerts');
    expect(getSourceReferenceLabel('operatingCashFlow')).toBe('Operating cash flow transactions');
    expect(getSourceReferenceLabel('metrics')).toBe('Financial metrics');
    expect(getSourceReferenceLabel('unrecognized_source_key')).toBe('Other source records');
    expect(formatSourceReferenceValues('metrics', ['operatingCashFlow', 'cashRunway'])).toEqual([
      'Operating Cash Flow',
      'Cash Runway',
    ]);
    expect(formatSourceReferenceValues('accountIds', ['acc-1'])).toEqual(['acc-1']);
  });
});
