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
        title: 'AI-generated FY2026 Q1 Executive Financial Dossier',
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

    expect(screen.getByText('Financial reports')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('FY2026 Q1 Executive Financial Dossier')).toBeInTheDocument();
      expect(screen.queryByText(/AI-generated/i)).not.toBeInTheDocument();
      expect(screen.getAllByText('Business Health')).toHaveLength(2);
    });

    expect(screen.getByText('Create report')).toBeInTheDocument();
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

  it('shows a compact severity profile for report risk observations', async () => {
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

    const riskBrief: ExecutiveBrief = {
      schemaVersion: '2.0',
      reportType: ReportType.RISK,
      executiveSummary: ['Two risk observations require review.'],
      kpis: [],
      tables: [],
      risksAndAnomalies: [
        {
          severity: 'HIGH',
          title: 'Receivable concentration',
          detail: 'Open balances are concentrated in one customer.',
          sourceTag: 'Receivables ledger',
        },
        {
          severity: 'MEDIUM',
          title: 'Collection delay',
          detail: 'Several invoices are past their expected collection date.',
          sourceTag: 'Invoice aging',
        },
      ],
      prioritizedActionPlan: [],
      dataGrounding: {
        reportingPeriodStart: '2026-10-15T00:00:00.000Z',
        reportingPeriodEnd: '2026-11-14T00:00:00.000Z',
        currency: 'USD',
        recordCounts: {
          accounts: 0,
          transactions: 0,
          invoices: 0,
          bills: 0,
          budgets: 0,
          riskAlerts: 2,
          forecasts: 0,
        },
        dataSources: ['Receivables ledger', 'Invoice aging'],
        missingInputs: [],
        methodologyNote: 'Severity reflects the saved risk records.',
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: [
          {
            id: 'rep-risk-1',
            organizationId: 'org-1',
            title: 'Receivables risk review',
            reportType: ReportType.RISK,
            sourceRecordIds: {},
            narrativeBody: { executiveBrief: riskBrief },
            createdAt: '2026-11-14T00:00:00.000Z',
          },
        ],
      }),
    });

    render(<ReportsPage />);
    await waitFor(() => {
      expect(screen.getByText('Receivables risk review')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^View$/i }));

    expect(screen.getByText('Severity profile')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /critical 0, high 1, medium 1, low 0/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/AI Advisory/i)).not.toBeInTheDocument();
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
      executiveSummary: ['Collections remain the primary liquidity focus this month.'],
      kpis: [
        {
          label: 'Cash Balance',
          value: 'PKR 250,000.00',
          status: 'VERIFIED',
          subtext: '1 liquid account',
        },
        {
          label: 'Operating Cash Flow',
          value: 'PKR 50,000.00',
          status: 'VERIFIED',
          subtext: 'In PKR 100,000.00 · Out PKR 50,000.00',
        },
        {
          label: 'Working Capital',
          value: 'PKR 275,000.00',
          status: 'VERIFIED',
          subtext: 'Current Ratio 3.20x',
        },
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
          title: 'Review and issue pending draft invoices',
          rationale: 'Pending drafts remain excluded until they are formally issued.',
          targetArea: 'Billing Workflow',
          impact: 'MEDIUM',
        },
      ],
      dataGrounding: {
        reportingPeriodStart: '2026-10-13T00:00:00.000Z',
        reportingPeriodEnd: '2026-11-12T00:00:00.000Z',
        currency: 'PKR',
        recordCounts: {
          accounts: 1,
          transactions: 4,
          invoices: 2,
          bills: 1,
          budgets: 0,
          riskAlerts: 0,
          forecasts: 0,
        },
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
      sourceRecordIds: {
        accountIds: ['acc-1'],
        invoiceIds: ['inv-1', 'inv-2'],
        metrics: ['operatingCashFlow', 'cashRunway'],
      },
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

      expect(screen.getByRole('heading', { name: 'Executive summary' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Financial indicators' })).toBeInTheDocument();
      expect(screen.getByText('PKR 250,000.00')).toBeInTheDocument();
      expect(screen.getByText('Receivables & Payables Aging')).toBeInTheDocument();
      expect(screen.getByText('Recommended actions')).toBeInTheDocument();
      expect(screen.queryByText(/AI Advisory/i)).not.toBeInTheDocument();
      expect(screen.getByText('Sources & limitations')).toBeInTheDocument();

      // Empty risksAndAnomalies omits section rather than displaying empty boilerplate
      expect(screen.queryByText('Key Risks & Anomalies')).not.toBeInTheDocument();

      // Progressive disclosure for source record IDs
      expect(screen.queryByText(/acc-1/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /View Source IDs/i }));
      expect(screen.getByText(/acc-1/)).toBeInTheDocument();
      expect(screen.getByText('Financial metrics:')).toBeInTheDocument();
      expect(screen.getByText('Operating Cash Flow, Cash Runway')).toBeInTheDocument();

      // Export PDF from sticky drawer header
      fireEvent.click(screen.getByRole('button', { name: /Export PDF/i }));
      await waitFor(() => {
        expect(capturedBlob).not.toBeNull();
      });
      const pdfText = new TextDecoder().decode(await capturedBlob!.arrayBuffer());
      expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfText).toContain('Star November Executive Brief');
      expect(pdfText).toContain('PKR 250,000.00');
      expect(pdfText).toContain('P1 | Review and issue pending draft invoices');
      expect(pdfText).toContain('Receivables & Payables Aging');
      expect(pdfText).toContain('Recommended actions');
      expect(pdfText).toContain('Sources & limitations');
      expect(pdfText).toContain('Financial accounts: acc-1');
      expect(pdfText).toContain('Financial metrics: Operating Cash Flow, Cash Runway');
      expect(pdfText).not.toContain('Account Ids');
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
      clickSpy.mockRestore();
    }
  });

  it.each([
    ReportType.BUSINESS_HEALTH,
    ReportType.RISK,
    ReportType.EXPENSE,
    ReportType.CASH_FLOW,
    ReportType.BUDGET,
  ])('applies shared drawer and PDF standards to %s reports', async (reportType) => {
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
      reportType,
      executiveSummary: [
        'Overdue receivables are PKR 20,000.00; collection timing may delay supplier payments.',
      ],
      kpis: [{ label: 'Overdue Receivables', value: 'PKR 20,000.00', status: 'VERIFIED' }],
      tables: [
        {
          title: 'Receivables & Payables Aging',
          columns: [{ label: 'Aging Bucket' }, { label: 'Amount' }],
          rows: [{ cells: ['Overdue', 'PKR 20,000.00'] }],
        },
      ],
      risksAndAnomalies: [],
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
          accounts: 1,
          transactions: 3,
          invoices: 2,
          bills: 0,
          budgets: 0,
          riskAlerts: 0,
          forecasts: 0,
        },
        dataSources: ['Customer invoices (2)', 'Financial accounts (1)'],
        missingInputs: [],
        methodologyNote: 'Actions are AI-synthesized.',
      },
    };
    const reportRow = {
      id: `rep-${reportType.toLowerCase()}`,
      organizationId: 'org-1',
      title: 'AI-generated shared standards report',
      reportType,
      type: reportType,
      currency: 'PKR',
      summary: 'AI-generated report summary.',
      narrativeBody: { executiveBrief: sampleBrief },
      sourceRecordIds: { accountIds: ['acc-1'], invoiceIds: ['inv-1', 'inv-2'] },
      createdAt: '2026-11-14T00:00:00.000Z',
    };
    let capturedBlob: Blob | null = null;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      capturedBlob = blob as Blob;
      return 'blob:standards-pdf';
    });
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();

    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (input.toString().includes('/export?format=PDF')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { documentStructure: { executiveBrief: sampleBrief } },
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
        expect(screen.getByText('shared standards report')).toBeInTheDocument();
      });
      expect(screen.queryByText(/AI-generated/i)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^View$/i }));

      expect(
        screen.getByText('collection timing may delay supplier payments.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Overdue receivables are PKR 20,000.00.')).not.toBeInTheDocument();
      expect(screen.getAllByText('PKR 20,000.00').length).toBeGreaterThan(0);
      expect(screen.queryByText('Invoices')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Risk observations' })).not.toBeInTheDocument();
      expect(screen.getByText('P3')).toBeInTheDocument();
      expect(screen.queryByText('P4')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /View Source IDs/i }));
      expect(screen.getByText(/Financial accounts:/)).toBeInTheDocument();
      expect(screen.getByText(/Customer invoices:/)).toBeInTheDocument();
      expect(screen.queryByText(/Account Ids|invoiceIds|account_ids/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Export PDF/i }));
      await waitFor(() => expect(capturedBlob).not.toBeNull());
      const pdfText = new TextDecoder().decode(await capturedBlob!.arrayBuffer());
      expect(pdfText).toContain('collection timing may delay supplier payments.');
      expect(pdfText).not.toContain('Overdue receivables are PKR 20,000.00.');
      expect(pdfText).toContain('PKR 20,000.00');
      expect(pdfText).toContain('P3 | Review priority 3');
      expect(pdfText).not.toContain('P4 | Review priority 4');
      expect(pdfText).toContain('Financial accounts: acc-1');
      expect(pdfText).toContain('Customer invoices: inv-1, inv-2');
      expect(pdfText).not.toContain('Account Ids');
      expect(pdfText).toContain('Sources & limitations');
      expect(pdfText).not.toContain('Invoices: 2');
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });
});
