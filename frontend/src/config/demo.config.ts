import {
  RoleType,
  type OrganizationMembershipSummary,
  type OrganizationSummary,
  type UserSummary,
} from '../types/auth.types';

export const DEFAULT_DEMO_ORG: OrganizationSummary = {
  id: 'b6247841-e2f4-41f3-bc01-7c803af8eab0',
  name: 'Apex Capital Holdings',
  slug: 'apex-capital',
  baseCurrency: 'USD',
  role: RoleType.BUSINESS_OWNER,
};

export const DEFAULT_DEMO_USER: UserSummary = {
  id: 'usr-demo-owner',
  email: 'owner@apex.local',
  fullName: 'Sarah Jenkins (Owner)',
  isPlatformAdmin: false,
};

export const DEFAULT_DEMO_MEMBERSHIP: OrganizationMembershipSummary = {
  organizationId: DEFAULT_DEMO_ORG.id,
  organizationName: DEFAULT_DEMO_ORG.name,
  organizationSlug: DEFAULT_DEMO_ORG.slug,
  baseCurrency: DEFAULT_DEMO_ORG.baseCurrency,
  role: RoleType.BUSINESS_OWNER,
};
