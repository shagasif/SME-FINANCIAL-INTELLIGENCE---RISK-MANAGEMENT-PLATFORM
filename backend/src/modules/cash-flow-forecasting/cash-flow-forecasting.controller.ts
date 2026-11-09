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
import { CashFlowForecastingService } from './cash-flow-forecasting.service.js';
import { GenerateForecastDto } from './dto/forecast.dto.js';

@ApiTags('Cash-Flow Forecasting Engine (7/30/60/90 Days)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard)
@Controller({ path: 'organizations/:orgId/forecasts', version: '1' })
export class CashFlowForecastingController {
  constructor(private readonly service: CashFlowForecastingService) {}

  @Post()
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({
    summary:
      'Generate a 7, 30, 60, or 90-day cash-flow forecast (Base, Optimistic, or Conservative) with version preservation',
  })
  async generate(
    @Param('orgId') orgId: string,
    @Body() dto: GenerateForecastDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.generateForecast(orgId, dto, user.userId);
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
  @ApiOperation({ summary: 'List historical cash-flow forecast versions' })
  async list(@Param('orgId') orgId: string, @Query('horizonDays') horizonDays?: number) {
    return this.service.listForecasts(orgId, horizonDays ? Number(horizonDays) : undefined);
  }

  @Get(':forecastId')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'Get cash-flow forecast details including daily trajectory items' })
  async getById(@Param('orgId') orgId: string, @Param('forecastId') forecastId: string) {
    return this.service.getForecastById(orgId, forecastId);
  }

  @Post(':forecastId/compare-actuals')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({
    summary: 'Compare a historical cash-flow forecast against actual ledger inflows and outflows',
  })
  async compareActuals(@Param('orgId') orgId: string, @Param('forecastId') forecastId: string) {
    return this.service.compareForecastWithActuals(orgId, forecastId);
  }
}
