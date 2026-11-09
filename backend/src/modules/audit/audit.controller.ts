import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RoleType } from '../../generated/prisma/client.js';
import { Roles } from '../../common/decorators/auth.decorators.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import { AuditService } from './audit.service.js';

@ApiTags('Audit Trail')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard)
@Controller({ path: 'organizations/:orgId/audit-events', version: '1' })
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.AUDITOR,
  )
  @ApiOperation({
    summary: 'List organization audit events',
    description:
      'Returns immutable audit logs including RBAC decisions, financial record mutations, and sandbox blocked operations.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  async listAuditEvents(
    @Param('orgId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('action') action?: string,
  ) {
    return this.auditService.listOrganizationAuditEvents(orgId, {
      page,
      limit,
      status,
      action,
    });
  }
}
