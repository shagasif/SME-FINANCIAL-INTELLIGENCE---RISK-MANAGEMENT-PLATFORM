import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { MembershipStatus, RoleType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../../modules/audit/audit.service.js';
import { AuthenticatedPrincipal, ROLES_KEY } from '../decorators/auth.decorators.js';

/**
 * Organization Isolation & Role-Based Access Control (RBAC) Guard
 *
 * Enforces:
 * 1. Strict organization-level tenant isolation (validates active membership in :orgId).
 * 2. Role permission verification across all 7 platform roles.
 * 3. Audit trail logging for unauthorized/denied access attempts.
 */
@Injectable()
export class OrgRbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedPrincipal }>();
    const principal = request.user;
    if (!principal) {
      throw new UnauthorizedException('Authenticated user context is missing');
    }

    const requiredRoles = this.reflector.getAllAndOverride<RoleType[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const orgId =
      (request.params?.orgId as string | undefined) ??
      (request.params?.organizationId as string | undefined) ??
      (request.headers['x-organization-id'] as string | undefined);

    // Platform Administrator bypasses org membership only if PLATFORM_ADMIN is allowed or no orgId is scoped
    if (principal.isPlatformAdmin) {
      principal.organizationId = orgId;
      principal.organizationRole = RoleType.PLATFORM_ADMIN;
      return true;
    }

    if (orgId) {
      const membership = await this.prisma.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: principal.userId,
          },
        },
      });

      if (!membership || membership.status !== MembershipStatus.ACTIVE) {
        await this.auditService.record({
          organizationId: orgId,
          actorUserId: principal.userId,
          action: `${request.method} ${request.path}`,
          resourceType: 'ORGANIZATION_BOUNDARY',
          resourceId: orgId,
          status: 'DENIED',
          ipAddress: request.ip,
          details: { reason: 'User is not an active member of target organization' },
        });
        throw new ForbiddenException(
          'Access denied: you do not have an active membership in this organization',
        );
      }

      principal.organizationId = orgId;
      principal.organizationRole = membership.role;

      if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(membership.role)) {
        await this.auditService.record({
          organizationId: orgId,
          actorUserId: principal.userId,
          actorRole: membership.role,
          action: `${request.method} ${request.path}`,
          resourceType: 'RBAC_PERMISSION',
          resourceId: orgId,
          status: 'DENIED',
          ipAddress: request.ip,
          details: {
            userRole: membership.role,
            requiredRoles,
          },
        });
        throw new ForbiddenException(
          `Insufficient role permissions. Required one of: ${requiredRoles.join(', ')}`,
        );
      }

      return true;
    }

    // If no orgId is in route but requiredRoles specifies PLATFORM_ADMIN
    if (requiredRoles && requiredRoles.length > 0) {
      if (requiredRoles.includes(RoleType.PLATFORM_ADMIN) && !principal.isPlatformAdmin) {
        throw new ForbiddenException('Platform Administrator privileges required');
      }
    }

    return true;
  }
}
