import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleType } from '../../generated/prisma/client.js';
import {
  AuthenticatedPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import { BudgetsService } from './budgets.service.js';
import { CreateBudgetDto, ReviseBudgetDto } from './dto/budget.dto.js';

@ApiTags('Budgets, Variance & Revisions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard)
@Controller({ path: 'organizations/:orgId/budgets', version: '1' })
export class BudgetsController {
  constructor(private readonly service: BudgetsService) {}

  @Post()
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.OPERATIONS_MANAGER,
  )
  @ApiOperation({
    summary: 'Create a monthly, quarterly, or annual budget with category/department lines',
  })
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateBudgetDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.createBudget(orgId, dto, user.userId);
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
  @ApiOperation({ summary: 'List organization budgets and revision history' })
  async list(@Param('orgId') orgId: string) {
    return this.service.listBudgets(orgId);
  }

  @Patch(':budgetId/revise')
  @Roles(RoleType.PLATFORM_ADMIN, RoleType.BUSINESS_OWNER, RoleType.FINANCE_MANAGER)
  @ApiOperation({
    summary: 'Revise budget allocations and append an immutable BudgetRevision record',
  })
  async revise(
    @Param('orgId') orgId: string,
    @Param('budgetId') budgetId: string,
    @Body() dto: ReviseBudgetDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.reviseBudget(orgId, budgetId, dto, user.userId);
  }

  @Get(':budgetId/variance')
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
    summary: 'Calculate deterministic actual-versus-budget variance by category and department',
  })
  async getVariance(@Param('orgId') orgId: string, @Param('budgetId') budgetId: string) {
    return this.service.calculateBudgetVariance(orgId, budgetId);
  }
}
