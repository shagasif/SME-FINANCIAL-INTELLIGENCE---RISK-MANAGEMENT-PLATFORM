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
    expect(screen.getByText('Authoritative Ledger Sandbox Isolation')).toBeInTheDocument();
    expect(screen.getByText('Run What-If Simulation')).toBeInTheDocument();
  });
});
