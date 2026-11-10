import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { BudgetsPage } from './BudgetsPage';

describe('BudgetsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders budget list and variance breakdown for authorized Finance Manager', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-2',
        email: 'finance@apex.local',
        fullName: 'Finance Manager',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.FINANCE_MANAGER,
      },
      memberships: [],
      activeRole: RoleType.FINANCE_MANAGER,
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

    const mockBudgets = [
      {
        id: 'bgt-1',
        organizationId: 'org-1',
        name: 'FY2026 Q1 Operating Plan',
        periodType: 'QUARTERLY',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        totalAllocatedAmount: '150000.0000',
        currency: 'USD',
        version: 1,
        lines: [
          {
            id: 'line-1',
            budgetId: 'bgt-1',
            category: 'Operating Expense',
            department: 'Operations',
            allocatedAmount: '100000.0000',
            alertThreshold: '80.00',
          },
        ],
        revisions: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const mockVariance = {
      budgetId: 'bgt-1',
      totalAllocated: '150000.0000',
      totalActual: '80000.0000',
      netVariance: '70000.0000',
      variancePercentage: '53.33',
      categories: [
        {
          category: 'Operating Expense',
          department: 'Operations',
          allocated: '100000.0000',
          actual: '60000.0000',
          variance: '40000.0000',
          variancePercentage: '60.00',
          status: 'NORMAL',
        },
      ],
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/variance')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: mockVariance,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: mockBudgets,
        }),
      });
    });

    render(<BudgetsPage />);

    expect(screen.getByText('Budgets, Variance & Allocation Controls')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/FY2026 Q1 Operating Plan/i).length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText('New Budget Plan')).toBeInTheDocument();
  });

  it('displays read-only notice and suppresses creation for Auditor', async () => {
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

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: [],
      }),
    });

    render(<BudgetsPage />);

    expect(screen.getByText('Auditor Mode Active')).toBeInTheDocument();
    expect(screen.queryByText('New Budget Plan')).not.toBeInTheDocument();
  });
});
