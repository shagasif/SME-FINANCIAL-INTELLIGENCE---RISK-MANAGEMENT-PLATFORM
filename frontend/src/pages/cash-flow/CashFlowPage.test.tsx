import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { CashFlowPage } from './CashFlowPage';

describe('CashFlowPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders forecast view with multi-horizon selectors and KPI cards', async () => {
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

    const mockForecast = {
      id: 'fc-1',
      horizonDays: 30,
      scenarioType: 'BASE',
      version: 2,
      currency: 'USD',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      openingCashBalance: '50000.0000',
      totalProjectedInflow: '75000.0000',
      totalProjectedOutflow: '45000.0000',
      netCashFlow: '30000.0000',
      closingCashBalance: '80000.0000',
      minimumCashBalance: '48000.0000',
      minimumCashDate: '2026-03-05',
      hasLiquidityWarning: false,
      uncertaintyBandPct: '5.00',
      items: [
        {
          id: 'item-1',
          projectionDate: '2026-03-02',
          expectedInflow: '5000.0000',
          expectedOutflow: '1200.0000',
          netCashFlow: '3800.0000',
          cumulativeBalance: '53800.0000',
        },
      ],
      createdAt: '2026-03-01T00:00:00.000Z',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: [mockForecast],
      }),
    });

    render(<CashFlowPage />);

    expect(screen.getByText('Cash-Flow Forecasting Engine')).toBeInTheDocument();
    expect(screen.getByText(/30-Day Horizon/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Generate Forecast')).toBeInTheDocument();
    });
  });

  it('renders Auditor restriction and hides Generate Forecast button', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-auditor',
        email: 'auditor@apex.local',
        fullName: 'Auditor User',
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

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: [],
      }),
    });

    render(<CashFlowPage />);

    expect(screen.getByText('Auditor Mode Active')).toBeInTheDocument();
    expect(screen.queryByText('Generate Forecast')).not.toBeInTheDocument();
  });
});
