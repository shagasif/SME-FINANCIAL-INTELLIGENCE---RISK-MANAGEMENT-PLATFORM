import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { Sidebar } from './Sidebar';

function renderSidebar() {
  return render(
    <BrowserRouter>
      <Sidebar />
    </BrowserRouter>,
  );
}

describe('Sidebar Navigation Component', () => {
  it('renders all allowed items for Business Owner and displays role badge', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-bo',
        email: 'owner@example.com',
        fullName: 'Jane Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Corp',
        slug: 'apex',
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
      hasRole: (roles: RoleType[]) => roles.includes(RoleType.BUSINESS_OWNER),
      canMutateLedger: true,
      canManageBudgets: true,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    renderSidebar();

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Transactions')).toBeInTheDocument();
    expect(screen.getByText('Invoices & Payables')).toBeInTheDocument();
    expect(screen.getByText('Budgets & Expenses')).toBeInTheDocument();
    expect(screen.getByText('Risk Center')).toBeInTheDocument();
    expect(screen.getByText('AI Finance Assistant')).toBeInTheDocument();
    expect(screen.getByText('BUSINESS OWNER')).toBeInTheDocument();
  });

  it('restricts Administration navigation item for non-admin roles', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-acc',
        email: 'acc@example.com',
        fullName: 'Staff Accountant',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Corp',
        slug: 'apex',
        baseCurrency: 'USD',
        role: RoleType.ACCOUNTANT,
      },
      memberships: [],
      activeRole: RoleType.ACCOUNTANT,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: (roles: RoleType[]) => roles.includes(RoleType.ACCOUNTANT),
      canMutateLedger: true,
      canManageBudgets: false,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    renderSidebar();

    // Administration requires PLATFORM_ADMIN or BUSINESS_OWNER
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
    expect(screen.getByText('Transactions')).toBeInTheDocument();
  });

  it('displays read-only notice badge when active role is Auditor', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-aud',
        email: 'auditor@example.com',
        fullName: 'Independent Auditor',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Corp',
        slug: 'apex',
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
      hasRole: (roles: RoleType[]) => roles.includes(RoleType.AUDITOR),
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: false,
      canExportReports: false,
      isAuditor: true,
    });

    renderSidebar();

    expect(screen.getByText('AUDITOR')).toBeInTheDocument();
    expect(screen.getByText('(Read-Only)')).toBeInTheDocument();
  });

  it('toggles collapse state when clicking the collapse button', () => {
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
      hasRole: () => true,
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: false,
      canExportReports: false,
      isAuditor: false,
    });

    renderSidebar();

    const collapseButton = screen.getByRole('button', { name: /Collapse sidebar/i });
    fireEvent.click(collapseButton);

    expect(screen.getByRole('button', { name: /Expand sidebar/i })).toBeInTheDocument();
  });
});
