import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { ReportType } from '../../types/reports.types';
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
});
