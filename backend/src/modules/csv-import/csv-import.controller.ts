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
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { CsvImportService } from './csv-import.service.js';
import { AutoMapColumnsDto, ConfirmCsvImportDto, UploadCsvPreviewDto } from './dto/csv-import.dto.js';

@ApiTags('CSV Financial Import Pipeline')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard, RateLimitGuard)
@Controller({ path: 'organizations/:orgId/csv-imports', version: '1' })
export class CsvImportController {
  constructor(private readonly service: CsvImportService) {}

  @Post('auto-map')
  @RateLimit({ windowMs: 60_000, maxRequests: 30 })
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({
    summary:
      'Execute Supervisor Orchestrator, Finance Data Analyst, and Verifier AI for uploaded file schema profiling and column mapping',
  })
  async autoMap(
    @Param('orgId') orgId: string,
    @Body() dto: AutoMapColumnsDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.autoMapColumns(orgId, dto, user);
  }

  @Post('preview')
  @RateLimit({ windowMs: 60_000, maxRequests: 20 })
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({
    summary:
      'Upload CSV content with column mapping for validation, duplicate detection, prompt-injection sanitization, and preview',
  })
  async uploadPreview(
    @Param('orgId') orgId: string,
    @Body() dto: UploadCsvPreviewDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.createPreviewBatch(orgId, dto, user.userId);
  }

  @Post(':batchId/confirm')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'Confirm a validated CSV import batch and commit records to the ledger',
  })
  async confirmImport(
    @Param('orgId') orgId: string,
    @Param('batchId') batchId: string,
    @Body() dto: ConfirmCsvImportDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.confirmImportBatch(orgId, batchId, dto, user.userId, user.organizationRole);
  }

  @Get()
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'List CSV import batches for the organization' })
  async listBatches(@Param('orgId') orgId: string) {
    return this.service.listImportBatches(orgId);
  }

  @Get(':batchId')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'Get CSV import batch preview, row errors, and duplicate details' })
  async getBatch(@Param('orgId') orgId: string, @Param('batchId') batchId: string) {
    return this.service.getImportBatch(orgId, batchId);
  }
}
