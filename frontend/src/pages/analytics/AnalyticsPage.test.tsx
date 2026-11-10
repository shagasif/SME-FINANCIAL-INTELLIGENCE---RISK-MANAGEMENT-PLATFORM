import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { AnalyticsPage } from './AnalyticsPage';

describe('AnalyticsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all deterministic metrics with formulas, citations, and mathematical precision banner', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-analyst',
        email: 'analyst@apex.local',
        fullName: 'Anna Analyst',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.FINANCIAL_ANALYST,
      },
      memberships: [],
      activeRole: RoleType.FINANCIAL_ANALYST,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => true,
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    const mockMetrics = {
      organizationId: 'org-1',
      reportingPeriod: {
        startDate: '2026-02-01',
        endDate: '2026-03-01',
      },
      metrics: {
        operatingCashFlow: {
          metricName: 'Operating Cash Flow',
          status: 'CALCULATED',
          value: '45000.0000',
          unit: 'USD',
          formula: 'Cash Inflows from Operations - Cash Outflows for Operations',
          formulaVersion: 'v1.0.0-decimal',
          reportingPeriod: '2026-02-01 to 2026-03-01',
          currency: 'USD',
          sourceRecordIds: ['tx-101', 'tx-102'],
          dataLimitations: ['Excludes non-operating capital transfers'],
        },
        cashRunway: {
          metricName: 'Cash Runway',
          status: 'CALCULATED',
          value: '8.5',
          unit: 'months',
          formula: 'Liquid Cash / Average Monthly Net Burn',
          formulaVersion: 'v1.0.0-decimal',
          reportingPeriod: 'Trailing 90 Days',
          currency: 'USD',
          sourceRecordIds: ['tx-103'],
          dataLimitations: [],
        },
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: mockMetrics,
      }),
    });

    render(<AnalyticsPage />);

    expect(screen.getByText('Financial Analytics')).toBeInTheDocument();
    expect(
      screen.getByText(/Mathematical Precision Guarantee \(Zero AI Hallucinations\)/i),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Operating Cash Flow (OCF)')).toBeInTheDocument();
      expect(screen.getByText('Cash Runway')).toBeInTheDocument();
    });

    expect(screen.getByText('Days Sales Outstanding (DSO)')).toBeInTheDocument();
  });
});
