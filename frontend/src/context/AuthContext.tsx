import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiGet, apiPost, authStorage } from '../services/apiClient';
import {
  RoleType,
  type AuthSessionPayload,
  type OrganizationMembershipSummary,
  type OrganizationSummary,
  type UserProfileResponse,
  type UserSummary,
} from '../types/auth.types';
import { AuthContext } from './authContextDef';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [activeOrg, setActiveOrg] = useState<OrganizationSummary | null>(() => {
    if (!authStorage.getToken()) return null;
    return authStorage.getActiveOrg<OrganizationSummary>();
  });
  const [memberships, setMemberships] = useState<OrganizationMembershipSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(authStorage.getToken()));

  const activeRole: RoleType | null =
    (activeOrg?.role as RoleType | undefined) ||
    memberships.find((m) => m.organizationId === activeOrg?.id)?.role ||
    (user?.isPlatformAdmin ? RoleType.PLATFORM_ADMIN : null);

  const syncActiveOrganization = useCallback(
    (members: OrganizationMembershipSummary[], preferredOrgId?: string | null) => {
      if (members.length === 0) {
        setActiveOrg(null);
        authStorage.clearActiveOrgId();
        return;
      }

      const savedOrgId = preferredOrgId || authStorage.getActiveOrgId();
      const matched = members.find((m) => m.organizationId === savedOrgId) || members[0];

      const orgSummary: OrganizationSummary = {
        id: matched.organizationId,
        name: matched.organizationName,
        slug: matched.organizationSlug,
        baseCurrency: matched.baseCurrency,
        role: matched.role,
      };

      setActiveOrg(orgSummary);
      authStorage.setActiveOrg(orgSummary);
    },
    [],
  );

  const handleLogoutLocal = useCallback(() => {
    authStorage.clearToken();
    authStorage.clearActiveOrgId();
    setUser(null);
    setActiveOrg(null);
    setMemberships([]);
  }, []);

  useEffect(() => {
    authStorage.registerUnauthorizedHandler(() => {
      handleLogoutLocal();
    });

    const token = authStorage.getToken();
    if (!token) return;

    let isMounted = true;
    apiGet<UserProfileResponse>('/v1/auth/me')
      .then((profile) => {
        if (!isMounted || !authStorage.getToken() || !profile?.id) return;
        setUser({
          id: profile.id,
          email: profile.email,
          fullName: profile.fullName,
          isPlatformAdmin: profile.isPlatformAdmin,
          lastLoginAt: profile.lastLoginAt,
        });
        setMemberships(profile.memberships || []);
        syncActiveOrganization(profile.memberships || []);
      })
      .catch(() => {
        if (isMounted) handleLogoutLocal();
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [handleLogoutLocal, syncActiveOrganization]);

  const login = async (
    credentials: { email: string; password: string },
    persist = false,
  ): Promise<AuthSessionPayload> => {
    setIsLoading(true);
    try {
      const session = await apiPost<AuthSessionPayload>('/v1/auth/login', credentials);
      authStorage.setToken(session.accessToken, persist);

      setUser(session.user);
      setMemberships(session.memberships || []);

      const primaryOrgId = session.organization?.id || session.memberships?.[0]?.organizationId;
      syncActiveOrganization(session.memberships || [], primaryOrgId);

      return session;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await apiPost('/v1/auth/logout');
    } catch {
      // ignore network errors on logout
    } finally {
      handleLogoutLocal();
    }
  };

  const switchOrganization = (orgId: string) => {
    syncActiveOrganization(memberships, orgId);
  };

  const updateActiveOrganization = (patch: Partial<OrganizationSummary>) => {
    setActiveOrg((prev) => {
      if (!prev) return prev;
      const updated: OrganizationSummary = {
        ...prev,
        ...patch,
      };
      authStorage.setActiveOrg(updated);
      return updated;
    });

    setMemberships((prev) =>
      prev.map((m) =>
        activeOrg && m.organizationId === activeOrg.id
          ? {
              ...m,
              organizationName: patch.name ?? m.organizationName,
              baseCurrency: patch.baseCurrency ?? m.baseCurrency,
            }
          : m,
      ),
    );
  };

  const hasRole = (roles: RoleType[]): boolean => {
    if (user?.isPlatformAdmin) return true;
    if (!activeRole) return false;
    return roles.includes(activeRole);
  };

  // Specific Permission Assertions matching backend OrgRbacGuard rules
  const canMutateLedger = hasRole([
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  ]);

  const canManageBudgets = hasRole([
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.OPERATIONS_MANAGER,
  ]);

  const canRunAiWorkflows = hasRole([
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
  ]);

  // Auditor is strictly blocked from export operations in ReportsController
  const canExportReports = hasRole([
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  ]);

  const isAuditor = activeRole === RoleType.AUDITOR;

  return (
    <AuthContext.Provider
      value={{
        user,
        activeOrg,
        memberships,
        activeRole,
        isAuthenticated: Boolean(user),
        isLoading,
        login,
        logout,
        switchOrganization,
        updateActiveOrganization,
        hasRole,
        canMutateLedger,
        canManageBudgets,
        canRunAiWorkflows,
        canExportReports,
        isAuditor,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
