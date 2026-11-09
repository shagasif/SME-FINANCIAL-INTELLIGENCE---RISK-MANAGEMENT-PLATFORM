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
import { RiskAlertQueryDto, TriageRiskAlertDto } from './dto/risk-alert.dto.js';
import { RiskMonitoringService } from './risk-monitoring.service.js';

@ApiTags('Anomaly Detection & Financial Risk Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard)
@Controller({ path: 'organizations/:orgId/risk-alerts', version: '1' })
export class RiskMonitoringController {
  constructor(private readonly service: RiskMonitoringService) {}

  @Post('scan')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({
    summary:
      'Execute deterministic and statistical anomaly/risk scan across transactions, cash, receivables, and budgets',
  })
  async runScan(@Param('orgId') orgId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.service.runAnomalyAndRiskScan(orgId, user.userId);
  }

  @Get()
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'List financial risk and anomaly alerts with reviewer history' })
  async list(@Param('orgId') orgId: string, @Query() query: RiskAlertQueryDto) {
    return this.service.listAlerts(orgId, query);
  }

  @Post(':alertId/triage')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({
    summary: 'Acknowledge, dismiss, investigate, or escalate a risk alert with reviewer notes',
  })
  async triage(
    @Param('orgId') orgId: string,
    @Param('alertId') alertId: string,
    @Body() dto: TriageRiskAlertDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.triageAlert(orgId, alertId, dto, user.userId);
  }
}
