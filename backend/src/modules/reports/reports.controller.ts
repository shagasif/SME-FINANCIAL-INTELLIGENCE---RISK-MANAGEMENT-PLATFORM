import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportType, RoleType, TaskStatus } from '../../generated/prisma/client.js';
import {
  AuthenticatedPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import {
  CreateFollowUpTaskDto,
  ExportReportQueryDto,
  GenerateReportDto,
  UpdateFollowUpTaskStatusDto,
} from './dto/reports.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Reports, Exports, Notifications, Tasks & Review History')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard)
@Controller({ path: 'organizations/:orgId', version: '1' })
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Post('reports')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({
    summary:
      'Generate a Business Health, Cash-Flow, Expense, Budget, or Risk report grounded in deterministic metrics',
  })
  async generateReport(
    @Param('orgId') orgId: string,
    @Body() dto: GenerateReportDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.generateReport(orgId, dto, user.userId);
  }

  @Get('reports')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'List generated financial and risk reports' })
  async listReports(@Param('orgId') orgId: string, @Query('type') type?: ReportType) {
    return this.service.listReports(orgId, type);
  }

  @Get('reports/:reportId/export')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({
    summary:
      'Export a report in CSV or PDF format (strictly restricted to authorized financial management roles)',
  })
  async exportReport(
    @Param('orgId') orgId: string,
    @Param('reportId') reportId: string,
    @Query() query: ExportReportQueryDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.exportReport(
      orgId,
      reportId,
      query.format,
      user.userId,
      user.organizationRole ?? 'USER',
    );
  }

  @Get('notifications')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'List organization and user notifications' })
  async listNotifications(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.listNotifications(orgId, user.userId);
  }

  @Patch('notifications/:notificationId/read')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markRead(@Param('orgId') orgId: string, @Param('notificationId') notificationId: string) {
    return this.service.markNotificationRead(orgId, notificationId);
  }

  @Post('tasks')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({ summary: 'Create a financial follow-up task' })
  async createTask(
    @Param('orgId') orgId: string,
    @Body() dto: CreateFollowUpTaskDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.createFollowUpTask(orgId, dto, user.userId);
  }

  @Get('tasks')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'List financial follow-up tasks' })
  async listTasks(@Param('orgId') orgId: string, @Query('status') status?: TaskStatus) {
    return this.service.listFollowUpTasks(orgId, status);
  }

  @Patch('tasks/:taskId/status')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({ summary: 'Update follow-up task status' })
  async updateTaskStatus(
    @Param('orgId') orgId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateFollowUpTaskStatusDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.updateFollowUpTaskStatus(orgId, taskId, dto, user.userId);
  }

  @Get('review-history')
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
    summary: 'List human review decisions across alerts, imports, and recommendations',
  })
  async listReviewHistory(@Param('orgId') orgId: string) {
    return this.service.listReviewDecisions(orgId);
  }
}
