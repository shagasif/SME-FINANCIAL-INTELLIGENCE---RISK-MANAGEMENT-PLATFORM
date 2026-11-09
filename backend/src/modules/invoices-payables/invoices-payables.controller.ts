import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BillStatus, InvoiceStatus, RoleType } from '../../generated/prisma/client.js';
import {
  AuthenticatedPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import { CreateBillDto, CreateInvoiceDto, RecordPaymentDto } from './dto/invoices-payables.dto.js';
import { InvoicesPayablesService } from './invoices-payables.service.js';

@ApiTags('Invoices, Supplier Bills & Aging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard)
@Controller({ path: 'organizations/:orgId', version: '1' })
export class InvoicesPayablesController {
  constructor(private readonly service: InvoicesPayablesService) {}

  @Post('invoices')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Create a customer invoice with due-date tracking' })
  async createInvoice(
    @Param('orgId') orgId: string,
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.createInvoice(orgId, dto, user.userId);
  }

  @Get('invoices')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'List customer invoices with automatic overdue detection' })
  async listInvoices(@Param('orgId') orgId: string, @Query('status') status?: InvoiceStatus) {
    return this.service.listInvoices(orgId, status);
  }

  @Post('invoices/:invoiceId/payments')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Record a partial or full payment against a customer invoice' })
  async recordInvoicePayment(
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.recordInvoicePayment(orgId, invoiceId, dto, user.userId);
  }

  @Post('bills')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
  )
  @ApiOperation({ summary: 'Create a supplier bill / payable record' })
  async createBill(
    @Param('orgId') orgId: string,
    @Body() dto: CreateBillDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.createBill(orgId, dto, user.userId);
  }

  @Get('bills')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'List supplier bills with automatic overdue detection' })
  async listBills(@Param('orgId') orgId: string, @Query('status') status?: BillStatus) {
    return this.service.listBills(orgId, status);
  }

  @Post('bills/:billId/payments')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Record a partial or full payment against a supplier bill' })
  async recordBillPayment(
    @Param('orgId') orgId: string,
    @Param('billId') billId: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.recordBillPayment(orgId, billId, dto, user.userId);
  }

  @Get('aging')
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
    summary: 'Compute deterministic receivable and payable aging schedule by overdue bucket',
  })
  async getAging(@Param('orgId') orgId: string, @Query('asOfDate') asOfDate?: string) {
    return this.service.computeAgingReport(orgId, asOfDate ? new Date(asOfDate) : new Date());
  }
}
