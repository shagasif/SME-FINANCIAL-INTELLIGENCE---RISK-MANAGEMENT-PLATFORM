import { describe, expect, it } from 'vitest';
import { ReportType, type ExecutiveBrief, type ReportRecord } from '../types/reports.types';
import { getRiskSeverityCounts } from './reportBriefAdapter';
import { buildExecutiveReportPdfBytes } from './reportPdfGenerator';

const report: ReportRecord = {
  id: 'risk-report-2026-01',
  organizationId: 'org-test',
  title: 'Quarterly liquidity and risk review',
  reportType: ReportType.RISK,
  sourceRecordIds: {},
  createdAt: '2026-11-14T00:00:00.000Z',
};

const brief: ExecutiveBrief = {
  schemaVersion: '2.0',
  reportType: ReportType.RISK,
  executiveSummary: ['Liquidity remains under review for this sample report.'],
  kpis: [],
  tables: [
    {
      title: 'Risk register',
      columns: [
        { label: 'Reference', align: 'left' },
        { label: 'Exposure', align: 'right', isNumeric: true },
      ],
      rows: [
        {
          cells: [
            'A long receivable concentration exposed to wholesale customers in the northern region',
            'PKR 125,000',
          ],
        },
        ...Array.from({ length: 54 }, (_, index) => ({
          cells: [`Observation ${index + 2}`, `PKR ${index + 1},000`],
        })),
      ],
    },
  ],
  risksAndAnomalies: [
    {
      severity: 'HIGH',
      title: 'Receivable concentration',
      detail: 'A single customer accounts for a material share of the open balance.',
      sourceTag: 'Receivables ledger',
    },
    {
      severity: 'MEDIUM',
      title: 'Collection delay',
      detail: 'Several invoices remain outstanding beyond their expected collection date.',
      sourceTag: 'Invoice aging',
    },
  ],
  prioritizedActionPlan: [],
  dataGrounding: {
    reportingPeriodStart: '2026-10-15T00:00:00.000Z',
    reportingPeriodEnd: '2026-11-14T00:00:00.000Z',
    currency: 'PKR',
    recordCounts: {
      accounts: 1,
      transactions: 54,
      invoices: 3,
      bills: 1,
      budgets: 0,
      riskAlerts: 2,
      forecasts: 0,
    },
    dataSources: ['Receivables ledger', 'Invoice aging'],
    missingInputs: [],
    methodologyNote: 'Presentation-only fixture for report pagination.',
  },
};

describe('buildExecutiveReportPdfBytes', () => {
  it('wraps long table values and repeats table headers across pages', () => {
    const pdfText = new TextDecoder().decode(
      buildExecutiveReportPdfBytes(report, brief, 'Apex Manufacturing'),
    );
    const pageCount = Number(pdfText.match(/\/Count (\d+)/)?.[1] ?? 0);
    const repeatedHeaderCount = pdfText.split('(Reference) Tj ET').length - 1;
    const organizationHeaderCount = pdfText.split('(Apex Manufacturing) Tj ET').length - 1;

    expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
    expect(pageCount).toBeGreaterThan(1);
    expect(repeatedHeaderCount).toBeGreaterThanOrEqual(2);
    expect(organizationHeaderCount).toBeGreaterThanOrEqual(pageCount);
    expect(pdfText).toContain('(the northern region) Tj ET');
    expect(pdfText).toContain('Page 1 of');
    expect(pdfText).toContain(`Page ${pageCount} of ${pageCount}`);
    expect(pdfText).toContain('Risk observations');
    expect(pdfText).toContain('HIGH');
    expect(pdfText).toContain('MEDIUM');
  });

  it('removes AI labels from the exported report title', () => {
    const pdfText = new TextDecoder().decode(
      buildExecutiveReportPdfBytes(
        { ...report, title: 'AI-generated liquidity review' },
        brief,
        'Apex Manufacturing',
      ),
    );

    expect(pdfText).toContain('(liquidity review) Tj ET');
    expect(pdfText).not.toContain('AI-generated');
  });

  it('summarizes the existing risk items by severity without changing their values', () => {
    expect(getRiskSeverityCounts(brief.risksAndAnomalies)).toEqual([
      { severity: 'CRITICAL', count: 0 },
      { severity: 'HIGH', count: 1 },
      { severity: 'MEDIUM', count: 1 },
      { severity: 'LOW', count: 0 },
    ]);
  });

  it('omits empty executive-summary and source sections', () => {
    const emptyBrief: ExecutiveBrief = {
      ...brief,
      executiveSummary: [],
      kpis: [],
      tables: [],
      risksAndAnomalies: [],
      prioritizedActionPlan: [],
      dataGrounding: {
        ...brief.dataGrounding,
        recordCounts: {
          accounts: 0,
          transactions: 0,
          invoices: 0,
          bills: 0,
          budgets: 0,
          riskAlerts: 0,
          forecasts: 0,
        },
        dataSources: [],
        missingInputs: [],
        methodologyNote: '',
      },
    };
    const pdfText = new TextDecoder().decode(
      buildExecutiveReportPdfBytes(report, emptyBrief, 'Apex Manufacturing'),
    );

    expect(pdfText).not.toContain('Executive summary');
    expect(pdfText).not.toContain('Sources & limitations');
  });

  it('uses the alert table for severity counts while retaining detailed risk observations', () => {
    const riskBrief: ExecutiveBrief = {
      ...brief,
      tables: [
        {
          title: 'Alert Distribution by Severity',
          columns: [{ label: 'Severity' }, { label: 'Open Alerts' }],
          rows: [{ cells: ['HIGH', '1'] }],
        },
      ],
    };
    const pdfText = new TextDecoder().decode(
      buildExecutiveReportPdfBytes(report, riskBrief, 'Apex Manufacturing'),
    );

    expect(pdfText).toContain('Alert Distribution by Severity');
    expect(pdfText).not.toContain('Severity profile');
    expect(pdfText).toContain('Receivable concentration');
  });
});
