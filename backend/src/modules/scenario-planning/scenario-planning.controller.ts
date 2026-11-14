import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleType } from '../../generated/prisma/client.js';
import {
  AuthenticatedPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import { CreateScenarioSimulationDto } from './dto/scenario.dto.js';
import { ScenarioPlanningService } from './scenario-planning.service.js';

@ApiTags('What-If Scenario Planning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard)
@Controller({ path: 'organizations/:orgId/scenarios', version: '1' })
export class ScenarioPlanningController {
  constructor(private readonly service: ScenarioPlanningService) {}

  @Post()
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({
    summary:
      'Execute a non-destructive scenario simulation against a baseline forecast (never modifies actual ledger records)',
  })
  async simulate(
    @Param('orgId') orgId: string,
    @Body() dto: CreateScenarioSimulationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.runScenarioSimulation(orgId, dto, user.userId);
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
  @ApiOperation({ summary: 'List scenario simulations and baseline comparison results' })
  async list(@Param('orgId') orgId: string) {
    return this.service.listScenarios(orgId);
  }

  @Get(':scenarioId')
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
    summary: 'Get details, impact, projections, risk assessment, and recommendations for a specific scenario simulation',
  })
  async getScenario(
    @Param('orgId') orgId: string,
    @Param('scenarioId') scenarioId: string,
  ) {
    return this.service.getScenarioById(orgId, scenarioId);
  }
}
