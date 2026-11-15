import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { TopHeader } from './TopHeader';

describe('TopHeader Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders authenticated actual organization and user profile without fake fallbacks', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-real-1',
        email: 'ceo@quantumholdings.com',
        fullName: 'Dr. Evelyn Vance',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-real-1',
        name: 'Quantum Holdings Ltd',
        slug: 'quantum-holdings',
        baseCurrency: 'EUR',
        role: RoleType.BUSINESS_OWNER,
      },
      memberships: [
        {
          organizationId: 'org-real-1',
          organizationName: 'Quantum Holdings Ltd',
          organizationSlug: 'quantum-holdings',
          baseCurrency: 'EUR',
          role: RoleType.BUSINESS_OWNER,
        },
      ],
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

    render(
      <MemoryRouter>
        <TopHeader onOpenMobileNav={vi.fn()} />
      </MemoryRouter>,
    );

    // Verify real organization and currency are displayed
    expect(screen.getByText('Quantum Holdings Ltd')).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();

    // Verify real user is displayed
    expect(screen.getByText('Dr. Evelyn Vance')).toBeInTheDocument();

    // Ensure NO fake demo fallbacks are rendered
    expect(screen.queryByText('Apex Capital Holdings')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sarah Jenkins/i)).not.toBeInTheDocument();
  });

  it('renders clean placeholder and Sign In link when unauthenticated', () => {
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

    render(
      <MemoryRouter>
        <TopHeader onOpenMobileNav={vi.fn()} />
      </MemoryRouter>,
    );

    // Verify "No Organization Selected" indicator is shown
    expect(screen.getByText('No Organization Selected')).toBeInTheDocument();

    // Verify Sign In link is displayed
    const signInLink = screen.getByRole('link', { name: /Sign In/i });
    expect(signInLink).toBeInTheDocument();
    expect(signInLink).toHaveAttribute('href', '/login');

    // Ensure NO fake demo accounts are shown
    expect(screen.queryByText('Apex Capital Holdings')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sarah Jenkins/i)).not.toBeInTheDocument();
  });

  it('supports switching between multiple authenticated organization memberships', () => {
    const switchOrgMock = vi.fn();

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-multi',
        email: 'partner@synergy.com',
        fullName: 'Marcus Brody',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-alpha',
        name: 'Synergy Alpha Inc',
        slug: 'synergy-alpha',
        baseCurrency: 'USD',
        role: RoleType.BUSINESS_OWNER,
      },
      memberships: [
        {
          organizationId: 'org-alpha',
          organizationName: 'Synergy Alpha Inc',
          organizationSlug: 'synergy-alpha',
          baseCurrency: 'USD',
          role: RoleType.BUSINESS_OWNER,
        },
        {
          organizationId: 'org-beta',
          organizationName: 'Synergy Beta Labs',
          organizationSlug: 'synergy-beta',
          baseCurrency: 'GBP',
          role: RoleType.FINANCE_MANAGER,
        },
      ],
      activeRole: RoleType.BUSINESS_OWNER,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: switchOrgMock,
      hasRole: () => true,
      canMutateLedger: true,
      canManageBudgets: true,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    render(
      <MemoryRouter>
        <TopHeader onOpenMobileNav={vi.fn()} />
      </MemoryRouter>,
    );

    // Open workspace switcher dropdown
    const selectorButton = screen.getByRole('button', { name: /Select organization workspace/i });
    fireEvent.click(selectorButton);

    // Verify both memberships appear in dropdown
    expect(screen.getByText('Synergy Beta Labs')).toBeInTheDocument();

    // Select second organization
    fireEvent.click(screen.getByText('Synergy Beta Labs'));
    expect(switchOrgMock).toHaveBeenCalledWith('org-beta');
  });

  it('navigates to the landing page after signing out', async () => {
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-signout',
        email: 'owner@example.com',
        fullName: 'Workspace Owner',
        isPlatformAdmin: false,
      },
      activeOrg: null,
      memberships: [],
      activeRole: null,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: logoutMock,
      switchOrganization: vi.fn(),
      hasRole: () => false,
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: false,
      canExportReports: false,
      isAuditor: false,
    });

    render(
      <MemoryRouter initialEntries={['/overview']}>
        <Routes>
          <Route
            path="/overview"
            element={<TopHeader onOpenMobileNav={vi.fn()} />}
          />
          <Route path="/" element={<div>Landing page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'User profile options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));

    expect(logoutMock).toHaveBeenCalledOnce();
    expect(await screen.findByText('Landing page')).toBeInTheDocument();
  });

  it('opens notification panel on button click, displays real notifications, and marks them as read', async () => {
    const mockNotifications = [
      {
        id: 'notif-1',
        organizationId: 'org-real-1',
        title: 'Risk Alert: Sudden Expense Spike',
        message: 'Operating expenses surged by 45% in Operations department.',
        severity: 'HIGH',
        category: 'EXPENSE_SPIKE',
        isRead: false,
        linkPath: '/risk-center',
        createdAt: '2026-11-15T12:00:00.000Z',
      },
      {
        id: 'notif-2',
        organizationId: 'org-real-1',
        title: 'FinMemory Snapshot Committed',
        message: 'Snapshot baseline captured for period 2026-M11.',
        severity: 'LOW',
        category: 'FINMEMORY',
        isRead: true,
        linkPath: '/finmemory',
        createdAt: '2026-11-14T08:00:00.000Z',
      },
    ];

    const apiClient = await import('../../services/apiClient');
    vi.spyOn(apiClient, 'apiGet').mockResolvedValue(mockNotifications);
    const patchSpy = vi.spyOn(apiClient, 'apiPatch').mockResolvedValue({});

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-real-1',
        email: 'ceo@quantumholdings.com',
        fullName: 'Dr. Evelyn Vance',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-real-1',
        name: 'Quantum Holdings Ltd',
        slug: 'quantum-holdings',
        baseCurrency: 'EUR',
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

    render(
      <MemoryRouter>
        <TopHeader onOpenMobileNav={vi.fn()} />
      </MemoryRouter>,
    );

    // Initial state: notification bell button exists with unread badge '1'
    const notifBtn = screen.getByRole('button', { name: 'View notifications' });
    expect(notifBtn).toBeInTheDocument();
    expect(await screen.findByText('1')).toBeInTheDocument();

    // Clicking the notification button opens the panel
    fireEvent.click(notifBtn);
    expect(screen.getByRole('dialog', { name: 'Notifications panel' })).toBeInTheDocument();
    expect(screen.getByText('Risk Alert: Sudden Expense Spike')).toBeInTheDocument();
    expect(screen.getByText('FinMemory Snapshot Committed')).toBeInTheDocument();

    // Clicking 'Mark all read' triggers mark-all
    const markAllBtn = screen.getByRole('button', { name: /Mark all read/i });
    fireEvent.click(markAllBtn);
    expect(patchSpy).toHaveBeenCalledWith('/v1/organizations/org-real-1/notifications/read-all', {});

    // Clicking a notification navigates and closes panel
    fireEvent.click(screen.getByText('Risk Alert: Sudden Expense Spike'));
    expect(patchSpy).toHaveBeenCalledWith('/v1/organizations/org-real-1/notifications/notif-1/read', {});
  });
});
