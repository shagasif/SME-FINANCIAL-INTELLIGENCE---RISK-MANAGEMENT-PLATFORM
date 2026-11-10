import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authStorage } from '../services/apiClient';
import { RoleType } from '../types/auth.types';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';

describe('AuthContext & useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('initializes with unauthenticated state when no token is present', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.activeOrg).toBeNull();
    expect(result.current.canMutateLedger).toBe(false);
  });

  it('evaluates RBAC permissions accurately for Auditor role', async () => {
    // Mock successful login response with AUDITOR membership
    const mockSession = {
      accessToken: 'jwt-test-auditor-token',
      expiresIn: 3600,
      user: {
        id: 'usr-1',
        email: 'auditor@example.com',
        fullName: 'Audit Specialist',
        isPlatformAdmin: false,
      },
      organization: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.AUDITOR,
      },
      memberships: [
        {
          organizationId: 'org-1',
          organizationName: 'Apex Manufacturing',
          organizationSlug: 'apex-mfg',
          baseCurrency: 'USD',
          role: RoleType.AUDITOR,
          joinedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockSession), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await act(async () => {
      await result.current.login({ email: 'auditor@example.com', password: 'Password123!' });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.activeRole).toBe(RoleType.AUDITOR);
    expect(result.current.isAuditor).toBe(true);
    // Ledger mutation is prohibited for Auditors
    expect(result.current.canMutateLedger).toBe(false);
    // Report export is strictly blocked for Auditors (403 backend rule)
    expect(result.current.canExportReports).toBe(false);
    // AI workflow execution is not granted to Auditor
    expect(result.current.canRunAiWorkflows).toBe(false);
  });

  it('evaluates RBAC permissions accurately for Finance Manager role', async () => {
    const mockSession = {
      accessToken: 'jwt-test-fm-token',
      expiresIn: 3600,
      user: {
        id: 'usr-2',
        email: 'fm@example.com',
        fullName: 'Finance Lead',
        isPlatformAdmin: false,
      },
      organization: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.FINANCE_MANAGER,
      },
      memberships: [
        {
          organizationId: 'org-1',
          organizationName: 'Apex Manufacturing',
          organizationSlug: 'apex-mfg',
          baseCurrency: 'USD',
          role: RoleType.FINANCE_MANAGER,
          joinedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockSession), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await act(async () => {
      await result.current.login({ email: 'fm@example.com', password: 'Password123!' });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.activeRole).toBe(RoleType.FINANCE_MANAGER);
    expect(result.current.isAuditor).toBe(false);
    expect(result.current.canMutateLedger).toBe(true);
    expect(result.current.canManageBudgets).toBe(true);
    expect(result.current.canExportReports).toBe(true);
    expect(result.current.canRunAiWorkflows).toBe(true);
  });

  it('clears state on logout', async () => {
    authStorage.setToken('existing-token');
    authStorage.setActiveOrgId('org-1');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(authStorage.getToken()).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.activeOrg).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
