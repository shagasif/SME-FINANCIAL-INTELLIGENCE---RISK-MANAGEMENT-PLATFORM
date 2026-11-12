import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { ReportType, type ExecutiveBrief } from '../../types/reports.types';
import { ReportsPage } from './ReportsPage';

describe('ReportsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders reports list and allows generation for Business Owner', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'owner@apex.local',
        fullName: 'Jane Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.BUSINESS_OWNER,
      },
      memberships: [],
      activeRole: RoleType.BUSINESS_OWNER,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => true,
      canMutateLedger: true,
      canManageBudgets: true,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    const mockReports = [
      {
        id: 'rep-1',
        organizationId: 'org-1',
        title: 'FY2026 Q1 Executive Financial Dossier',
        reportType: ReportType.BUSINESS_HEALTH,
        generatedByUserId: 'usr-1',
        summary: 'Operating cash flow positive at $45,000. Cash runway extended to 8.5 months.',
        sections: [
          {
            heading: 'Liquidity Overview',
            content: 'Working capital is healthy with Quick Ratio at 1.8x.',
          },
        ],
        sourceRecordIds: { operatingCashFlow: ['tx-1', 'tx-2'] },
        dataLimitations: ['Excludes non-operating capital transfers'],
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: mockReports,
      }),
    });

    render(<ReportsPage />);

    expect(screen.getByText('Financial Reports & Executive Dossiers')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('FY2026 Q1 Executive Financial Dossier')).toBeInTheDocument();
      expect(screen.getByText('BUSINESS_HEALTH')).toBeInTheDocument();
    });

    expect(screen.getByText('Generate Report')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export/i })).toBeEnabled();
  });

  it('strictly enforces Auditor export lock (disabled button & governance banner)', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-auditor',
        email: 'auditor@apex.local',
        fullName: 'Arthur Auditor',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.AUDITOR,
      },
      memberships: [],
      activeRole: RoleType.AUDITOR,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: (roles) =>
        Array.isArray(roles) ? roles.includes(RoleType.AUDITOR) : roles === RoleType.AUDITOR,
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: false,
      canExportReports: false,
      isAuditor: true,
    });

    const mockReports = [
      {
        id: 'rep-1',
        organizationId: 'org-1',
        title: 'Audited Financial Ledger Summary',
        reportType: ReportType.BUSINESS_HEALTH,
        generatedByUserId: 'usr-1',
        summary: 'Inspection ready report.',
        sections: [],
        sourceRecordIds: {},
        dataLimitations: [],
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: mockReports,
      }),
    });

    render(<ReportsPage />);

    expect(screen.getByText(/Auditor Mode: Export Download Lock Enforced/i)).toBeInTheDocument();
    expect(screen.queryByText('Generate Report')).not.toBeInTheDocument();

    await waitFor(() => {
      const exportBtn = screen.getByRole('button', { name: /Export/i });
      expect(exportBtn).toBeDisabled();
    });
  });

  it('renders concise Executive Brief sections in right-side drawer, omits empty risks, and exports valid PDF matching drawer sections', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'owner@star.com',
        fullName: 'Star Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
        name: 'star',
        slug: 'star',
        baseCurrency: 'PKR',
        role: RoleType.BUSINESS_OWNER,
      },
      memberships: [],
      activeRole: RoleType.BUSINESS_OWNER,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => true,
      canMutateLedger: true,
      canManageBudgets: true,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    const sampleBrief: ExecutiveBrief = {
      schemaVersion: '2.0',
      reportType: ReportType.BUSINESS_HEALTH,
      executiveSummary: [
        'As of 2026-11-12, consolidated liquid cash stands at PKR 250,000.00 across 1 account.',
        'Operating cash flow reached PKR 50,000.00 on inflows of PKR 100,000.00 against outflows of PKR 50,000.00.',
        'Net working capital is positive at PKR 275,000.00 with PKR 45,000.00 in open receivables.',
      ],
      kpis: [
        { label: 'Cash Balance', value: 'PKR 250,000.00', status: 'VERIFIED', subtext: '1 liquid account' },
        { label: 'Operating Cash Flow', value: 'PKR 50,000.00', status: 'VERIFIED', subtext: 'In PKR 100,000.00 · Out PKR 50,000.00' },
        { label: 'Working Capital', value: 'PKR 275,000.00', status: 'VERIFIED', subtext: 'Current Ratio 3.20x' },
        {
          label: 'Outstanding AR / AP',
          value: 'AR PKR 45,000.00',
          secondaryLabel: 'AP',
          secondaryValue: 'PKR 20,000.00',
          status: 'VERIFIED',
          subtext: 'All open balances current',
        },
      ],
      tables: [
        {
          title: 'Receivables & Payables Aging',
          columns: [
            { label: 'Aging Bucket', align: 'left' },
            { label: 'AR Amount', align: 'right', isNumeric: true },
            { label: 'AP Amount', align: 'right', isNumeric: true },
          ],
          rows: [
            { cells: ['Current', 'PKR 45,000.00', 'PKR 20,000.00'] },
            { cells: ['Total Outstanding', 'PKR 45,000.00', 'PKR 20,000.00'], isTotal: true },
          ],
          note: 'Excludes 1 draft invoice (PKR 55,000.00).',
        },
      ],
      risksAndAnomalies: [],
      prioritizedActionPlan: [
        {
          priority: 1,
          title: 'Review & Issue 1 Pending Draft Invoice(s)',
          rationale: 'Draft invoice totaling PKR 55,000.00 remains excluded until issued.',
          targetArea: 'Billing Workflow',
          impact: 'MEDIUM',
        },
      ],
      dataGrounding: {
        reportingPeriodStart: '2026-10-13T00:00:00.000Z',
        reportingPeriodEnd: '2026-11-12T00:00:00.000Z',
        currency: 'PKR',
        recordCounts: { accounts: 1, transactions: 4, invoices: 2, bills: 1, budgets: 0, riskAlerts: 0, forecasts: 0 },
        dataSources: ['Financial Accounts (1)', 'Ledger Transactions (4)'],
        missingInputs: ['No active budget overlaps the selected reporting period.'],
        methodologyNote: 'KPIs use deterministic decimal arithmetic; actions are AI-synthesized.',
      },
    };

    const reportRow = {
      id: 'rep-brief-1',
      organizationId: 'org-star',
      title: 'Star November Executive Brief',
      type: ReportType.BUSINESS_HEALTH,
      currency: 'PKR',
      periodStart: '2026-10-13T00:00:00.000Z',
      periodEnd: '2026-11-12T00:00:00.000Z',
      narrativeBody: { executiveBrief: sampleBrief },
      sourceRecordIds: { accountIds: ['acc-1'], invoiceIds: ['inv-1', 'inv-2'] },
      createdAt: '2026-11-12T00:00:00.000Z',
    };

    let capturedBlob: Blob | null = null;
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      capturedBlob = blob as Blob;
      return 'blob:mock-pdf';
    });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/export?format=PDF')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              fileName: 'business_health_rep-brie.pdf',
              documentStructure: { executiveBrief: sampleBrief },
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [reportRow] }),
      });
    });

    try {
      render(<ReportsPage />);
      await waitFor(() => {
        expect(screen.getByText('Star November Executive Brief')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /^View$/i }));

      expect(screen.getByRole('heading', { name: 'Executive Summary' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Key Financial KPIs' })).toBeInTheDocument();
      expect(screen.getByText('Verified Ledger')).toBeInTheDocument();
      expect(screen.getByText('PKR 250,000.00')).toBeInTheDocument();
      expect(screen.getByText('Receivables & Payables Aging')).toBeInTheDocument();
      expect(screen.getByText('Prioritized Action Plan')).toBeInTheDocument();
      expect(screen.getByText(/AI Advisory/i)).toBeInTheDocument();
      expect(screen.getByText('Data Grounding & Limitations')).toBeInTheDocument();

      // Empty risksAndAnomalies omits section rather than displaying empty boilerplate
      expect(screen.queryByText('Key Risks & Anomalies')).not.toBeInTheDocument();

      // Progressive disclosure for source record IDs
      expect(screen.queryByText(/acc-1/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /View Source IDs/i }));
      expect(screen.getByText(/acc-1/)).toBeInTheDocument();

      // Export PDF from sticky drawer header
      fireEvent.click(screen.getByRole('button', { name: /Export PDF/i }));
      await waitFor(() => {
        expect(capturedBlob).not.toBeNull();
      });
      const pdfText = new TextDecoder().decode(await capturedBlob!.arrayBuffer());
      expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfText).toContain('Star November Executive Brief');
      expect(pdfText).toContain('PKR 250,000.00');
      expect(pdfText).toContain('Receivables & Payables Aging');
      expect(pdfText).toContain('PRIORITIZED ACTION PLAN');
      expect(pdfText).toContain('DATA GROUNDING & LIMITATIONS');
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
      clickSpy.mockRestore();
    }
  });
});
