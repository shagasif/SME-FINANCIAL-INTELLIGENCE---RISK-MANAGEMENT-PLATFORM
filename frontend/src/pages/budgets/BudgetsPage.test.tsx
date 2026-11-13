import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { BudgetsPage } from './BudgetsPage';

describe('BudgetsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders budget list, real variance breakdown, and unbudgeted expenses for Finance Manager', async () => {
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
        baseCurrency: 'PKR',
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
        name: 'FY2026 Q4 Operating Plan',
        periodType: 'QUARTERLY',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-12-31T23:59:59.999Z',
        totalAllocated: '150000.0000',
        currency: 'PKR',
        status: 'ACTIVE',
        version: 2,
        lines: [
          {
            id: 'line-1',
            category: 'Operating Expense',
            department: 'Operations',
            allocatedAmount: '150000.0000',
            alertThreshold: '80.0000',
          },
        ],
        revisions: [
          {
            id: 'rev-2',
            version: 2,
            previousAllocated: '100000.0000',
            newAllocated: '150000.0000',
            changeSummary: 'Expanded Q4 operations ceiling',
            createdAt: '2026-11-01T00:00:00.000Z',
          },
        ],
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ];

    const mockVariance = {
      budgetId: 'bgt-1',
      budgetName: 'FY2026 Q4 Operating Plan',
      version: 2,
      periodType: 'QUARTERLY',
      periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-12-31T23:59:59.999Z',
      currency: 'PKR',
      isComplete: true,
      missingCurrencies: [],
      totalAllocated: '150000.0000',
      totalActualSpent: '80000.0000',
      unbudgetedActualSpent: '12000.0000',
      totalOrganizationExpenses: '92000.0000',
      totalVarianceAmount: '70000.0000',
      totalUtilizationPct: '53.3333',
      totalVariancePct: '46.6667',
      isOverBudget: false,
      lines: [
        {
          lineId: 'line-1',
          category: 'Operating Expense',
          department: 'Operations',
          allocatedAmount: '150000.0000',
          actualSpent: '80000.0000',
          varianceAmount: '70000.0000',
          utilizationPct: '53.3333',
          variancePct: '46.6667',
          alertThresholdPct: '80.0000',
          status: 'ON_TRACK',
        },
      ],
      unbudgetedCategories: [
        {
          category: 'Travel & Entertainment',
          department: 'Sales',
          actualSpent: '12000.0000',
          transactionIds: ['tx-u1'],
        },
      ],
    };

    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/variance')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockVariance,
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockBudgets,
      });
    });

    render(<BudgetsPage />);

    expect(screen.getByText('Budgets, Variance & Allocation Controls')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/FY2026 Q4 Operating Plan/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Unbudgeted Period Expenses:/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Operating Expense')).toBeInTheDocument();
    expect(screen.getByText('ON_TRACK')).toBeInTheDocument();
    expect(screen.getByText('New Budget Plan')).toBeInTheDocument();
  });

  it('shows empty state without demo fallback figures when no budgets exist', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-owner',
        email: 'owner@star.local',
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

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => [],
    });

    render(<BudgetsPage />);

    await waitFor(() => {
      expect(screen.getByText('No Organization Budgets Configured')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Q4 2026 Operating Plan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/150,000/)).not.toBeInTheDocument();
  });

  it('displays error state without demo fallback figures when API fails', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-owner',
        email: 'owner@star.local',
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

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

    render(<BudgetsPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unable to reach backend API/i);
      expect(screen.getByText('No Organization Budgets Configured')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Q4 2026 Operating Plan/i)).not.toBeInTheDocument();
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
      json: async () => [],
    });

    render(<BudgetsPage />);

    expect(screen.getByText('Auditor Mode Active')).toBeInTheDocument();
    expect(screen.queryByText('New Budget Plan')).not.toBeInTheDocument();
  });
});
