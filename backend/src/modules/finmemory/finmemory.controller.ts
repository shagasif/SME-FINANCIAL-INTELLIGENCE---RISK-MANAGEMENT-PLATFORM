import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleType } from '../../generated/prisma/client.js';
import {
  AuthenticatedPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import { GenerateFinMemorySnapshotDto } from './dto/finmemory.dto.js';
import { FinMemoryService } from './finmemory.service.js';

@ApiTags('FinMemory Historical Financial Intelligence')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard)
@Controller({ path: 'organizations/:orgId/finmemory', version: '1' })
export class FinMemoryController {
  constructor(private readonly service: FinMemoryService) {}

  @Post('snapshots')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({
    summary:
      'Generate a traceable FinMemory monthly/period financial snapshot with source record IDs and completeness tracking',
  })
  async generateSnapshot(
    @Param('orgId') orgId: string,
    @Body() dto: GenerateFinMemorySnapshotDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.generateSnapshot(orgId, dto, user.userId);
  }

  @Get('snapshots')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'List historical FinMemory snapshots' })
  async listSnapshots(@Param('orgId') orgId: string) {
    return this.service.listSnapshots(orgId);
  }

  @Get('compare')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({
    summary: 'Compare two FinMemory snapshots across revenue, expenses, cash, and working capital',
  })
  async compare(
    @Param('orgId') orgId: string,
    @Query('baseSnapshotId') baseSnapshotId: string,
    @Query('targetSnapshotId') targetSnapshotId: string,
  ) {
    return this.service.compareSnapshots(orgId, baseSnapshotId, targetSnapshotId);
  }
}
