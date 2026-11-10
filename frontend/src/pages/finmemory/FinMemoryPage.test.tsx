import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { FinMemoryPage } from './FinMemoryPage';

describe('FinMemoryPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders FinMemory snapshots, metrics, and actions for Finance Manager', async () => {
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

    const mockSnapshots = [
      {
        id: 'snap-1',
        organizationId: 'org-1',
        periodKey: '2026-M02',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        completenessScore: '98',
        currency: 'USD',
        metrics: {
          endingCashBalance: '50000.0000',
          operatingCashFlow: '15000.0000',
          cashRunwayDays: 180,
          currentRatio: '2.10',
          quickRatio: '1.80',
          grossMarginPercent: '42.50',
          expenseGrowthPercent: '3.20',
        },
        sourceRecordIds: { operatingCashFlow: ['tx-1', 'tx-2'] },
        dataLimitations: ['Excludes intercompany transfers'],
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: mockSnapshots,
      }),
    });

    render(<FinMemoryPage />);

    expect(screen.getByText('FinMemory Intelligence')).toBeInTheDocument();
    expect(screen.getByText(/Episodic Financial Memory Architecture/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('2026-M02')).toBeInTheDocument();
      expect(screen.getByText('98%')).toBeInTheDocument();
    });

    expect(screen.getByText('Capture Snapshot')).toBeInTheDocument();
    expect(screen.getByText('Compare Shifts')).toBeInTheDocument();
  });

  it('renders Auditor restriction and hides snapshot capture button', async () => {
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

    render(<FinMemoryPage />);

    expect(screen.getByText('Auditor Mode Active')).toBeInTheDocument();
    expect(screen.queryByText('Capture Snapshot')).not.toBeInTheDocument();
  });
});
