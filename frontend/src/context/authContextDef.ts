import { createContext } from 'react';
import {
  RoleType,
  type AuthSessionPayload,
  type OrganizationMembershipSummary,
  type OrganizationSummary,
  type UserSummary,
} from '../types/auth.types';

export interface AuthContextValue {
  user: UserSummary | null;
  activeOrg: OrganizationSummary | null;
  memberships: OrganizationMembershipSummary[];
  activeRole: RoleType | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    dto: { email: string; password: string },
    persist?: boolean,
  ) => Promise<AuthSessionPayload>;
  logout: () => Promise<void>;
  switchOrganization: (orgId: string) => void;
  hasRole: (roles: RoleType[]) => boolean;
  canMutateLedger: boolean;
  canManageBudgets: boolean;
  canRunAiWorkflows: boolean;
  canExportReports: boolean;
  isAuditor: boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
