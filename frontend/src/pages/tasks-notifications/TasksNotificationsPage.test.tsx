import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { TaskPriority, TaskStatus } from '../../types/reports.types';
import { TasksNotificationsPage } from './TasksNotificationsPage';

describe('TasksNotificationsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tasks list and notifications feed for Finance Manager', async () => {
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

    const mockTasks = [
      {
        id: 'tsk-1',
        organizationId: 'org-1',
        createdById: 'usr-1',
        title: 'Reconcile Q1 corporate card disbursements',
        description: 'Verify 14 missing receipts before closing ledger',
        priority: TaskPriority.HIGH,
        status: TaskStatus.IN_PROGRESS,
        dueDate: '2026-03-15',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ];

    const mockNotifs = [
      {
        id: 'notif-1',
        organizationId: 'org-1',
        title: 'Runway Alert: Liquidity safety threshold',
        message: '30-day projection buffer is within 10% of minimum threshold.',
        type: 'WARNING',
        priority: 'HIGH',
        isRead: false,
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ];

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/notifications')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: mockNotifs }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockTasks }),
      });
    });

    render(<TasksNotificationsPage />);

    expect(screen.getByText('Financial Tasks & Alerts Hub')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Reconcile Q1 corporate card disbursements')).toBeInTheDocument();
      expect(screen.getByText('IN_PROGRESS')).toBeInTheDocument();
    });

    expect(screen.getByText('New Task')).toBeInTheDocument();

    // Switch to notifications tab
    const notifsTab = screen.getByRole('button', { name: /Alerts Feed/i });
    fireEvent.click(notifsTab);

    await waitFor(() => {
      expect(screen.getByText('Runway Alert: Liquidity safety threshold')).toBeInTheDocument();
    });
  });

  it('renders Auditor restriction and hides New Task button', async () => {
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
      json: async () => ({ success: true, data: [] }),
    });

    render(<TasksNotificationsPage />);

    expect(screen.getByText('Auditor Mode Active')).toBeInTheDocument();
    expect(screen.queryByText('New Task')).not.toBeInTheDocument();
  });
});
