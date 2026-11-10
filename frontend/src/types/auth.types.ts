/**
 * 7 Supported Platform Roles (matching backend RoleType in Prisma schema)
 */
export const RoleType = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  BUSINESS_OWNER: 'BUSINESS_OWNER',
  FINANCE_MANAGER: 'FINANCE_MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
  FINANCIAL_ANALYST: 'FINANCIAL_ANALYST',
  AUDITOR: 'AUDITOR',
} as const;

export type RoleType = (typeof RoleType)[keyof typeof RoleType];

export const MembershipStatus = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED',
} as const;

export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus];

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  isActive?: boolean;
  lastLoginAt?: string | null;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  baseCurrency: string;
  fiscalYearStartMonth?: number;
  timeZone?: string;
  role?: RoleType;
}

export interface OrganizationMembershipSummary {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  baseCurrency: string;
  role: RoleType;
  department?: string | null;
  status?: MembershipStatus;
}

export interface AuthSessionPayload {
  accessToken: string;
  expiresAt: string;
  user: UserSummary;
  organization?: OrganizationSummary | null;
  memberships: OrganizationMembershipSummary[];
}

export interface UserProfileResponse {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  lastLoginAt?: string | null;
  memberships: OrganizationMembershipSummary[];
}
