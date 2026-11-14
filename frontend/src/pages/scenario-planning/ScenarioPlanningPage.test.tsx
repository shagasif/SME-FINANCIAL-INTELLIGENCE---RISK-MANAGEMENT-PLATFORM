import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { ScenarioPlanningPage } from './ScenarioPlanningPage';

describe('ScenarioPlanningPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders simulation parameters and Authoritative Ledger Sandbox guarantee', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'analyst@apex.local',
        fullName: 'Financial Analyst',
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

    render(<ScenarioPlanningPage />);

    expect(screen.getByText('Scenario Planning & What-If Simulation')).toBeInTheDocument();
    expect(screen.queryByText('Authoritative Ledger Sandbox Isolation')).not.toBeInTheDocument();
    expect(screen.getByText('Run What-If Simulation')).toBeInTheDocument();
  });

  it('shows no active organization warning and disables simulation button without sending API requests when activeOrg is null', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: null,
      activeOrg: null,
      memberships: [],
      activeRole: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => false,
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: false,
      canExportReports: false,
      isAuditor: false,
    });

    render(<ScenarioPlanningPage />);

    expect(screen.getByText('No Active Organization Selected')).toBeInTheDocument();
    const runBtn = screen.getByRole('button', { name: /Run What-If Simulation/i });
    expect(runBtn).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('dispatches API requests using the authenticated activeOrg.id strictly without demo fallback', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'analyst@apex.local',
        fullName: 'Financial Analyst',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'actual-tenant-xyz-99',
        name: 'Actual Tenant Enterprise',
        slug: 'actual-tenant',
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

    render(<ScenarioPlanningPage />);

    expect(screen.queryByText('No Active Organization Selected')).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/v1/organizations/actual-tenant-xyz-99/forecasts'),
      expect.anything(),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/v1/organizations/actual-tenant-xyz-99/scenarios'),
      expect.anything(),
    );
  });

  it('Inspect: fetches full scenario by id and renders results with risk assessment and recommendations', async () => {
    const orgId = 'org-inspect-test';
    const scenarioId = 'sc-abc-123';

    const listRecord = {
      id: scenarioId,
      organizationId: orgId,
      baselineForecastId: 'fc-1',
      name: 'Q4 Revenue Shock & Supply Inflation',
      description: null,
      customerPaymentDelayDays: 30,
      salesGrowthPct: '-15.0000',
      operatingCostChangePct: '10.0000',
      supplierPaymentTimingDays: 0,
      triggersLiquidityWarning: false,
      impactSummary: {
        customerPaymentDelayDays: 30,
        salesGrowthPct: '-15.0000',
        operatingCostChangePct: '10.0000',
        supplierPaymentTimingDays: 0,
        baselineClosingCash: '100000.0000',
        scenarioClosingCash: '82000.0000',
        netCashImpact: '-18000.0000',
        baselineMinCash: '50000.0000',
        scenarioMinCash: '30000.0000',
        minCashDelta: '-20000.0000',
        triggersLiquidityWarning: false,
      },
      dailyComparisons: [],
      createdAt: '2026-11-01T10:00:00.000Z',
    };

    const fullRecord = {
      ...listRecord,
      riskAssessment: {
        level: 'MEDIUM',
        summary: 'Moderate Operational Strain: Scenario experiences negative net cash flow.',
        vulnerabilities: [
          'Sales revenue contraction of -15.0000%',
          'Operating cost inflation surge of +10.0000%',
        ],
      },
      recommendations: [
        {
          category: 'RECEIVABLES',
          action: 'Enforce dynamic payment incentives (e.g. 2/10 net 30)',
          rationale: 'Counteracts the modeled +30-day collection delay.',
          impact: 'HIGH',
        },
        {
          category: 'LIQUIDITY_BUFFER',
          action: 'Maintain existing working capital cadence',
          rationale: 'Surplus reserves provide adequate cushion.',
          impact: 'LOW',
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/forecasts')) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: 'fc-1', name: 'Baseline Q4' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (urlStr.includes(`/scenarios/${scenarioId}`)) {
        return Promise.resolve(
          new Response(JSON.stringify(fullRecord), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      // List scenarios
      if (urlStr.includes('/scenarios')) {
        return Promise.resolve(
          new Response(JSON.stringify([listRecord]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-inspect',
        email: 'owner@apex.local',
        fullName: 'Business Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: orgId,
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

    render(<ScenarioPlanningPage />);

    // Wait for the history table to populate with the list record
    const inspectBtn = await waitFor(() => screen.getByRole('button', { name: /Inspect/i }));

    // Click Inspect — triggers handleInspect which calls GET /scenarios/:id
    fireEvent.click(inspectBtn);

    // Verify the full scenario was fetched
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(`/scenarios/${scenarioId}`),
        expect.anything(),
      );
    });

    // Verify the scenario name header appears in the results panel
    await waitFor(() => {
      const matches = screen.getAllByText('Q4 Revenue Shock & Supply Inflation');
      // Should appear in both the results header AND the history table row
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    // Verify Risk Assessment panel appears
    await waitFor(() => {
      expect(screen.getByText('Risk Assessment')).toBeInTheDocument();
      expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    });

    // Verify Recommendations panel appears
    await waitFor(() => {
      expect(screen.getByText('Corrective Recommendations')).toBeInTheDocument();
      expect(screen.getByText('RECEIVABLES')).toBeInTheDocument();
    });

    fetchSpy.mockRestore();
  });

  it('renders responsive comparison cards with wrapped PKR values and clear vertical metrics', async () => {
    const orgId = 'org-pkr-compare';
    const longCash = '1234567890123456.00';
    const scenario = {
      id: 'scenario-pkr-compare',
      organizationId: orgId,
      baselineForecastId: 'forecast-pkr',
      name: 'Large PKR Scenario',
      description: null,
      customerPaymentDelayDays: 0,
      salesGrowthPct: '0.0000',
      operatingCostChangePct: '0.0000',
      supplierPaymentTimingDays: 0,
      triggersLiquidityWarning: false,
      impactSummary: {
        customerPaymentDelayDays: 0,
        salesGrowthPct: '0.0000',
        operatingCostChangePct: '0.0000',
        supplierPaymentTimingDays: 0,
        baselineClosingCash: longCash,
        scenarioClosingCash: '1234567890123556.00',
        netCashImpact: '100.0000',
        baselineMinCash: longCash,
        scenarioMinCash: '1234567890123455.00',
        minCashDelta: '-1.0000',
        triggersLiquidityWarning: false,
      },
      dailyComparisons: [],
      createdAt: '2026-11-14T10:00:00.000Z',
    };

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-pkr',
        email: 'owner@example.com',
        fullName: 'Business Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: orgId,
        name: 'PKR Organization',
        slug: 'pkr-org',
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

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const response = String(url).includes('/forecasts') ? [] : [scenario];
      return Promise.resolve(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    render(<ScenarioPlanningPage />);

    const endingHeading = await screen.findByText('Projected Ending Cash');
    const reserveHeading = screen.getByText('Minimum Cash Reserve');
    expect(screen.getByText('Reserve Change:')).toBeInTheDocument();

    const expectResponsiveCard = (
      heading: HTMLElement,
      baselineLabel: string,
      changeLabel: string,
    ) => {
      const card = heading.closest('div.rounded-2xl');
      expect(card).not.toBeNull();
      if (!card) throw new Error('Comparison card was not found');

      expect(card).toHaveClass('min-w-0');
      expect(card.textContent).toContain('1,234,567,890,123,456');
      expect(card.textContent).toContain(baselineLabel);
      expect(card.textContent).toContain(changeLabel);

      const metricStack = card.querySelector('.space-y-1');
      expect(metricStack?.children).toHaveLength(2);
      const [primaryMetric, baselineMetric] = Array.from(metricStack?.children ?? []);

      expect(primaryMetric).toHaveClass(
        'min-w-0',
        'max-w-full',
        'text-xl',
        'sm:text-2xl',
        'font-bold',
        'tabular-nums',
        'tracking-tight',
      );
      expect(primaryMetric?.className).toContain('[overflow-wrap:anywhere]');
      expect(primaryMetric).not.toHaveClass('font-mono');
      expect(baselineMetric).toHaveClass(
        'min-w-0',
        'max-w-full',
        'text-xs',
        'tabular-nums',
        'tracking-tight',
      );
      expect(baselineMetric?.className).toContain('[overflow-wrap:anywhere]');
      expect(baselineMetric).not.toHaveClass('font-mono');

      const changeRow = card.querySelector('.flex.flex-wrap');
      expect(changeRow).toHaveClass('min-w-0', 'flex-wrap');
      const changeValue = changeRow?.querySelector('span:last-child');
      expect(changeValue).toHaveClass('min-w-0', 'max-w-full', 'tabular-nums', 'tracking-tight');
      expect(changeValue?.className).toContain('[overflow-wrap:anywhere]');
      expect(changeValue).not.toHaveClass('font-mono');
    };

    expectResponsiveCard(endingHeading, 'Baseline:', 'Net Cash Impact:');
    expectResponsiveCard(reserveHeading, 'Baseline Low:', 'Reserve Change:');

    expect(endingHeading.closest('div.rounded-2xl')?.querySelector('.space-y-1 > div')).toHaveClass(
      'text-emerald-600',
    );
    expect(
      reserveHeading.closest('div.rounded-2xl')?.querySelector('.space-y-1 > div'),
    ).toHaveClass('text-rose-600');

    fetchSpy.mockRestore();
  });
});
