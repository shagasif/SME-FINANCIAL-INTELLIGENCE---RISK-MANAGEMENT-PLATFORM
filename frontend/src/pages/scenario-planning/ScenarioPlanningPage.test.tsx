import { render, screen } from '@testing-library/react';
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
});
