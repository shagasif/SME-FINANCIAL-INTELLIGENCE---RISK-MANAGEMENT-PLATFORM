import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-31T00:00:00.000Z',
      openingCashBalance: '50000.0000',
      projectedInflows: '75000.0000',
      projectedOutflows: '45000.0000',
      projectedNetCashFlow: '30000.0000',
      projectedReceivablesInflow: '65000.0000',
      projectedRecurringInflow: '10000.0000',
      projectedPayablesOutflow: '35000.0000',
      projectedRecurringOutflow: '10000.0000',
      projectedClosingCash: '80000.0000',
      minimumProjectedCash: '48000.0000',
      minimumCashDate: '2026-03-05T00:00:00.000Z',
      hasLiquidityWarning: false,
      uncertaintyBandPct: '10.0000',
      isStale: false,
      items: [
        {
          id: 'item-1',
          projectionDate: '2026-03-02T00:00:00.000Z',
          expectedInflow: '5000.0000',
          recurringInflow: '1000.0000',
          expectedOutflow: '1200.0000',
          recurringOutflow: '300.0000',
          netCashFlow: '4500.0000',
          cumulativeBalance: '54500.0000',
        },
        {
          id: 'item-2',
          projectionDate: '2026-03-09T00:00:00.000Z',
          expectedInflow: '2000.0000',
          recurringInflow: '0.0000',
          expectedOutflow: '500.0000',
          recurringOutflow: '0.0000',
          netCashFlow: '1500.0000',
          cumulativeBalance: '56000.0000',
        },
      ],
      generatedAt: '2026-03-01T00:00:00.000Z',
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
    await waitFor(() => {
      expect(
        screen.getByText(/No Cash-Flow Forecast Generated \(30-Day Horizon\)/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/\$1,248,500\.00/)).not.toBeInTheDocument();
  });

  it('shows empty state without demo fallback figures when no forecasts exist', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'shagasif83@gmail.com',
        fullName: 'Shagufta Asif',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'a46568cf-61d4-4508-b545-f07d25d32256',
        name: 'star',
        slug: 'star',
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

    await waitFor(() => {
      expect(
        screen.getByText(/No Cash-Flow Forecast Generated \(30-Day Horizon\)/i),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Generate 30-Day Forecast/i })).toBeInTheDocument();
    });

    // Must never display Apex demo fallback figures
    expect(screen.queryByText(/1,248,500/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1,285,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/108,000/)).not.toBeInTheDocument();
  });

  it('displays error state without substituting demo figures when forecast fetch fails', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'shagasif83@gmail.com',
        fullName: 'Shagufta Asif',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'a46568cf-61d4-4508-b545-f07d25d32256',
        name: 'star',
        slug: 'star',
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

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network unavailable'));

    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unable to reach backend API/i);
      expect(
        screen.getByText(/No Cash-Flow Forecast Generated \(30-Day Horizon\)/i),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText(/1,248,500/)).not.toBeInTheDocument();
  });

  it('switches between Daily, Weekly, and Monthly period views, shows stale warning, and compares actuals', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-owner',
        email: 'owner@apex.local',
        fullName: 'Owner User',
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

    const staleForecast = {
      id: 'fc-stale',
      horizonDays: 30,
      scenarioType: 'BASE',
      version: 1,
      currency: 'PKR',
      startDate: '2026-11-01T00:00:00.000Z',
      endDate: '2026-12-01T00:00:00.000Z',
      openingCashBalance: '100000.0000',
      projectedInflows: '15000.0000',
      projectedOutflows: '5000.0000',
      projectedNetCashFlow: '10000.0000',
      projectedClosingCash: '110000.0000',
      minimumProjectedCash: '100000.0000',
      minimumCashDate: '2026-11-01T00:00:00.000Z',
      hasLiquidityWarning: false,
      uncertaintyBandPct: '10.0000',
      isStale: true,
      items: [
        {
          id: 'i-1',
          projectionDate: '2026-11-02T00:00:00.000Z',
          expectedInflow: '10000.0000',
          recurringInflow: '2000.0000',
          expectedOutflow: '3000.0000',
          recurringOutflow: '1000.0000',
          netCashFlow: '8000.0000',
          cumulativeBalance: '108000.0000',
        },
        {
          id: 'i-2',
          projectionDate: '2026-11-03T00:00:00.000Z',
          expectedInflow: '3000.0000',
          recurringInflow: '0.0000',
          expectedOutflow: '1000.0000',
          recurringOutflow: '0.0000',
          netCashFlow: '2000.0000',
          cumulativeBalance: '110000.0000',
        },
      ],
      generatedAt: '2026-11-01T00:00:00.000Z',
    };

    const comparisonResponse = {
      forecastId: 'fc-stale',
      currency: 'PKR',
      isComplete: true,
      projected: { inflows: '15000.0000', outflows: '5000.0000', closingCash: '110000.0000' },
      actual: {
        inflows: '14000.0000',
        outflows: '4000.0000',
        closingCash: '110000.0000',
        transactionCount: 2,
      },
      variance: {
        inflowVariance: '-1000.0000',
        outflowVariance: '-1000.0000',
        closingCashVariance: '0.0000',
        closingCashVariancePct: '0.0000',
      },
      comparedAt: '2026-11-12T00:00:00.000Z',
    };

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/compare-actuals') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => comparisonResponse,
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [staleForecast],
      };
    });

    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText('Underlying Financial Records Updated')).toBeInTheDocument();
    });

    // Switch to Weekly view
    fireEvent.click(screen.getByRole('button', { name: 'weekly' }));
    expect(screen.getByText('Weekly Liquidity Projection Summary')).toBeInTheDocument();
    expect(screen.getByText('Week 1')).toBeInTheDocument();

    // Switch to Monthly view
    fireEvent.click(screen.getByRole('button', { name: 'monthly' }));
    expect(screen.getByText('Monthly Liquidity Projection Summary')).toBeInTheDocument();
    expect(screen.getByText('Nov 2026')).toBeInTheDocument();

    // Trigger Compare Actuals
    fireEvent.click(screen.getByRole('button', { name: 'Compare Actuals' }));
    await waitFor(() => {
      expect(screen.getByText('Forecast vs. Actual Ledger Variance')).toBeInTheDocument();
    });
  });

  it('renders scenario selector with rounded style and Title Case labels (v2 • Optimistic, v2 • Base)', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-owner',
        email: 'owner@apex.local',
        fullName: 'Owner User',
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

    const mockForecasts = [
      {
        id: 'fc-v2-opt',
        horizonDays: 30,
        scenarioType: 'OPTIMISTIC',
        version: 2,
        currency: 'PKR',
        startDate: '2026-11-01T00:00:00.000Z',
        endDate: '2026-12-01T00:00:00.000Z',
        openingCashBalance: '100000.0000',
        projectedInflows: '25000.0000',
        projectedOutflows: '5000.0000',
        projectedClosingCash: '120000.0000',
        minimumProjectedCash: '100000.0000',
        minimumCashDate: '2026-11-01T00:00:00.000Z',
        hasLiquidityWarning: false,
        uncertaintyBandPct: '10.0000',
        items: [],
      },
      {
        id: 'fc-v2-base',
        horizonDays: 30,
        scenarioType: 'BASE',
        version: 2,
        currency: 'PKR',
        startDate: '2026-11-01T00:00:00.000Z',
        endDate: '2026-12-01T00:00:00.000Z',
        openingCashBalance: '100000.0000',
        projectedInflows: '15000.0000',
        projectedOutflows: '5000.0000',
        projectedClosingCash: '110000.0000',
        minimumProjectedCash: '100000.0000',
        minimumCashDate: '2026-11-01T00:00:00.000Z',
        hasLiquidityWarning: false,
        uncertaintyBandPct: '10.0000',
        items: [],
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockForecasts,
    });

    render(<CashFlowPage />);

    await waitFor(() => {
      const trigger = screen.getByLabelText(/Select forecast version/i);
      expect(trigger).toBeInTheDocument();
      fireEvent.click(trigger);
      expect(screen.getByRole('option', { name: 'v2 • Optimistic' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'v2 • Base' })).toBeInTheDocument();
    });
  });

  it('Option A: preserves all scenarios during Compare Actuals and supports Version History modal', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-owner',
        email: 'owner@apex.local',
        fullName: 'Owner User',
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

    const mockForecastList = [
      {
        id: 'fc-v3-cons',
        horizonDays: 30,
        scenarioType: 'CONSERVATIVE',
        version: 3,
        currency: 'USD',
        startDate: '2026-11-01T00:00:00.000Z',
        endDate: '2026-12-01T00:00:00.000Z',
        openingCashBalance: '50000.0000',
        projectedInflows: '20000.0000',
        projectedOutflows: '15000.0000',
        projectedClosingCash: '55000.0000',
        minimumProjectedCash: '45000.0000',
        minimumCashDate: '2026-11-05T00:00:00.000Z',
        hasLiquidityWarning: false,
        uncertaintyBandPct: '10.0000',
        items: [],
      },
      {
        id: 'fc-v2-cons',
        horizonDays: 30,
        scenarioType: 'CONSERVATIVE',
        version: 2,
        currency: 'USD',
        startDate: '2026-11-01T00:00:00.000Z',
        endDate: '2026-12-01T00:00:00.000Z',
        openingCashBalance: '50000.0000',
        projectedInflows: '18000.0000',
        projectedOutflows: '14000.0000',
        projectedClosingCash: '54000.0000',
        minimumProjectedCash: '44000.0000',
        minimumCashDate: '2026-11-05T00:00:00.000Z',
        hasLiquidityWarning: false,
        uncertaintyBandPct: '10.0000',
        items: [],
      },
      {
        id: 'fc-v2-base',
        horizonDays: 30,
        scenarioType: 'BASE',
        version: 2,
        currency: 'USD',
        startDate: '2026-11-01T00:00:00.000Z',
        endDate: '2026-12-01T00:00:00.000Z',
        openingCashBalance: '50000.0000',
        projectedInflows: '25000.0000',
        projectedOutflows: '12000.0000',
        projectedClosingCash: '63000.0000',
        minimumProjectedCash: '48000.0000',
        minimumCashDate: '2026-11-05T00:00:00.000Z',
        hasLiquidityWarning: false,
        uncertaintyBandPct: '10.0000',
        items: [],
      },
    ];

    const comparisonResponse = {
      forecastId: 'fc-v2-base',
      currency: 'USD',
      isComplete: true,
      projected: { inflows: '25000.0000', outflows: '12000.0000', closingCash: '63000.0000' },
      actual: {
        inflows: '24000.0000',
        outflows: '11000.0000',
        closingCash: '63000.0000',
        transactionCount: 3,
      },
      variance: {
        inflowVariance: '-1000.0000',
        outflowVariance: '-1000.0000',
        closingCashVariance: '0.0000',
        closingCashVariancePct: '0.0000',
      },
      comparedAt: '2026-11-13T00:00:00.000Z',
    };

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/compare-actuals') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => comparisonResponse,
        };
      }
      if (url.includes('/fc-v2-cons')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockForecastList[1],
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockForecastList,
      };
    });

    render(<CashFlowPage />);

    // Custom dropdown trigger is rendered with accessible label
    const trigger = await screen.findByLabelText(/Select forecast version/i);
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);

    // Selector displays latest active Base and Conservative, plus Optimistic (Generate)
    expect(screen.getByRole('option', { name: 'v2 • Base' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'v3 • Conservative' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Optimistic (Generate)' })).toBeInTheDocument();

    // Close menu before proceeding
    fireEvent.click(trigger);

    // Version History button is present with correct snapshot count
    const historyBtn = screen.getByRole('button', { name: /Version History \(3\)/i });
    expect(historyBtn).toBeInTheDocument();

    // Trigger Compare Actuals
    fireEvent.click(screen.getByRole('button', { name: 'Compare Actuals' }));
    await waitFor(() => {
      expect(screen.getByText('Forecast vs. Actual Ledger Variance')).toBeInTheDocument();
    });

    // Verify all scenarios REMAIN in the selector and are NEVER hidden by Compare Actuals
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'v2 • Base' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'v3 • Conservative' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Optimistic (Generate)' })).toBeInTheDocument();

    // Open Version History Modal
    fireEvent.click(historyBtn);
    expect(screen.getByText(/Forecast Version History \(30-Day Horizon\)/i)).toBeInTheDocument();
    expect(screen.getAllByText('Latest Active')).toHaveLength(2);
    expect(screen.getByText('Historical Run')).toBeInTheDocument();

    // Click View on historical snapshot (v2 • Conservative, which is second View button)
    const viewButtons = screen.getAllByRole('button', { name: 'View' });
    fireEvent.click(viewButtons[1]);

    // Modal closes, historical notice banner appears with return button
    await waitFor(() => {
      expect(screen.getByText(/Viewing Historical Snapshot/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Return to Latest Active \(v3\)/i })).toBeInTheDocument();
    });
  });
});
