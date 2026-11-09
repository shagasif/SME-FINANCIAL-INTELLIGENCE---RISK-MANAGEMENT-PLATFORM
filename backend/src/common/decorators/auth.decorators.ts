import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { RoleType } from '../../generated/prisma/client.js';

export const ROLES_KEY = 'sme_required_roles';
export const IS_PUBLIC_KEY = 'sme_is_public';

/**
 * Declares which organization or platform roles are permitted to execute an endpoint.
 */
export const Roles = (...roles: RoleType[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Marks a route as public (does not require JWT bearer authentication).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export class AuthenticatedPrincipal {
  userId!: string;
  email!: string;
  sessionId!: string;
  isPlatformAdmin!: boolean;
  organizationId?: string;
  organizationRole?: RoleType;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPrincipal => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedPrincipal }>();
    return request.user;
  },
);
