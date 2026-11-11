import { act, renderHook, waitFor } from '@testing-library/react';
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

    const mockProfile = {
      id: 'usr-1',
      email: 'user@example.com',
      fullName: 'Test User',
      isPlatformAdmin: false,
      memberships: [],
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockProfile), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
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

  it('synchronously restores cached active organization on refresh when token is present', () => {
    authStorage.setToken('valid-jwt-token');
    authStorage.setActiveOrg({
      id: 'org-cached-pk',
      name: 'Indus Logistics Ltd',
      slug: 'indus-logistics-pk',
      baseCurrency: 'PKR',
      role: RoleType.BUSINESS_OWNER,
    });

    // Mock fetch for /v1/auth/me that stays pending to verify initial synchronous render
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    // On initial mount before /v1/auth/me resolves, activeOrg is already restored
    expect(result.current.activeOrg).toEqual({
      id: 'org-cached-pk',
      name: 'Indus Logistics Ltd',
      slug: 'indus-logistics-pk',
      baseCurrency: 'PKR',
      role: RoleType.BUSINESS_OWNER,
    });
    expect(result.current.isLoading).toBe(true);
  });

  it('synchronizes cached organization with authenticated user actual active memberships returned by /v1/auth/me', async () => {
    authStorage.setToken('valid-jwt-token');
    authStorage.setActiveOrg({
      id: 'org-1',
      name: 'Apex Manufacturing (Old Name)',
      slug: 'apex-mfg',
      baseCurrency: 'USD',
      role: RoleType.BUSINESS_OWNER,
    });

    const mockProfile = {
      id: 'usr-1',
      email: 'owner@apex.local',
      fullName: 'Jane Owner',
      isPlatformAdmin: false,
      memberships: [
        {
          organizationId: 'org-1',
          organizationName: 'Apex Manufacturing (Updated Name)',
          organizationSlug: 'apex-mfg',
          baseCurrency: 'USD',
          role: RoleType.BUSINESS_OWNER,
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockProfile), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeOrg?.name).toBe('Apex Manufacturing (Updated Name)');
    expect(authStorage.getActiveOrg()).toEqual({
      id: 'org-1',
      name: 'Apex Manufacturing (Updated Name)',
      slug: 'apex-mfg',
      baseCurrency: 'USD',
      role: RoleType.BUSINESS_OWNER,
    });
  });

  it('overwrites cached org if user has lost active membership in that organization, falling back to valid membership', async () => {
    authStorage.setToken('valid-jwt-token');
    // Cached org that user is NO LONGER a member of
    authStorage.setActiveOrg({
      id: 'org-revoked-99',
      name: 'Former Company',
      slug: 'former-co',
      baseCurrency: 'USD',
      role: RoleType.BUSINESS_OWNER,
    });

    const mockProfile = {
      id: 'usr-1',
      email: 'owner@apex.local',
      fullName: 'Jane Owner',
      isPlatformAdmin: false,
      memberships: [
        {
          organizationId: 'org-valid-2',
          organizationName: 'Valid New Org',
          organizationSlug: 'valid-new-org',
          baseCurrency: 'PKR',
          role: RoleType.FINANCE_MANAGER,
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockProfile), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Authoritative server memberships override stale cached org
    expect(result.current.activeOrg?.id).toBe('org-valid-2');
    expect(result.current.activeOrg?.baseCurrency).toBe('PKR');
    expect(authStorage.getActiveOrgId()).toBe('org-valid-2');
  });

  it('handles user with no active memberships gracefully by setting activeOrg to null and clearing active org storage', async () => {
    authStorage.setToken('valid-jwt-token');
    authStorage.setActiveOrg({
      id: 'org-revoked-99',
      name: 'Former Company',
      slug: 'former-co',
      baseCurrency: 'USD',
      role: RoleType.BUSINESS_OWNER,
    });

    const mockProfile = {
      id: 'usr-unassigned',
      email: 'unassigned@apex.local',
      fullName: 'Unassigned User',
      isPlatformAdmin: false,
      memberships: [],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockProfile), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeOrg).toBeNull();
    expect(authStorage.getActiveOrg()).toBeNull();
    expect(authStorage.getActiveOrgId()).toBeNull();
  });
});
