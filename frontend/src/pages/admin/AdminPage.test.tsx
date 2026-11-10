import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { AdminPage } from './AdminPage';

describe('AdminPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders workspace settings and audit logs for Business Owner', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'owner@apex.local',
        fullName: 'Jane Owner',
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
      hasRole: (roles) =>
        Array.isArray(roles)
          ? roles.includes(RoleType.BUSINESS_OWNER)
          : roles === RoleType.BUSINESS_OWNER,
      canMutateLedger: true,
      canManageBudgets: true,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    const mockMembers = [
      {
        id: 'mem-1',
        organizationId: 'org-1',
        userId: 'usr-2',
        userName: 'Frank Finance',
        userEmail: 'finance@apex.local',
        role: RoleType.FINANCE_MANAGER,
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const mockAuditLogs = [
      {
        id: 'aud-1',
        organizationId: 'org-1',
        actorRole: 'BUSINESS_OWNER',
        action: 'LEDGER_TRANSACTION_CREATED',
        resourceType: 'TRANSACTION',
        integrityHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        status: 'SUCCESS',
        createdAt: '2026-03-01T12:00:00.000Z',
      },
    ];

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/audit-logs')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: mockAuditLogs }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockMembers }),
      });
    });

    render(<AdminPage />);

    expect(screen.getByText('Administration & Organization Governance')).toBeInTheDocument();
    expect(screen.getByText('Workspace Profile & Currency Preferences')).toBeInTheDocument();

    // Switch to Audit logs tab
    const auditTab = screen.getByRole('button', { name: /SHA-256 Audit Trail/i });
    fireEvent.click(auditTab);

    await waitFor(() => {
      expect(screen.getByText('LEDGER_TRANSACTION_CREATED')).toBeInTheDocument();
      expect(screen.getByText('Immutable Cryptographic SHA-256 Log')).toBeInTheDocument();
    });
  });

  it('blocks unauthorized non-admin roles with an access restriction gate', () => {
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

    render(<AdminPage />);

    expect(screen.getByText('Administration Access Restricted')).toBeInTheDocument();
    expect(
      screen.getByText(/Only Business Owners and Platform Administrators are authorized/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Administration & Organization Governance')).not.toBeInTheDocument();
  });
});
