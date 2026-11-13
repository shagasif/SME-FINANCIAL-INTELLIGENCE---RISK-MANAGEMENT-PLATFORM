import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BillStatus, InvoiceStatus, RoleType } from '../../generated/prisma/client.js';
import {
  AuthenticatedPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import {
  CreateBillDto,
  CreateInvoiceDto,
  RecordPaymentDto,
  UpdateBillDto,
  UpdateInvoiceDto,
  VoidDocumentDto,
} from './dto/invoices-payables.dto.js';
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
  @ApiOperation({ summary: 'Create a customer invoice with line items, taxes, and due-date tracking' })
  async createInvoice(
    @Param('orgId') orgId: string,
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.createInvoice(orgId, dto, user.userId, user.organizationRole);
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
  @ApiOperation({ summary: 'List customer invoices with search, status filters, and overdue detection' })
  async listInvoices(
    @Param('orgId') orgId: string,
    @Query('status') status?: InvoiceStatus,
    @Query('search') search?: string,
  ) {
    return this.service.listInvoices(orgId, status, search);
  }

  @Get('invoices/:invoiceId')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'Get individual customer invoice detail including line items and payment history' })
  async getInvoiceById(@Param('orgId') orgId: string, @Param('invoiceId') invoiceId: string) {
    return this.service.getInvoiceById(orgId, invoiceId);
  }

  @Patch('invoices/:invoiceId')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Edit eligible customer invoice details or transition DRAFT to ISSUED' })
  async updateInvoice(
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.updateInvoice(orgId, invoiceId, dto, user.userId);
  }

  @Post('invoices/:invoiceId/void')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Safely void an unpaid customer invoice with audit logging' })
  async voidInvoice(
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: VoidDocumentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.voidInvoice(orgId, invoiceId, dto, user.userId);
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
  @ApiOperation({ summary: 'Create a supplier bill / payable record with line items and tax breakdown' })
  async createBill(
    @Param('orgId') orgId: string,
    @Body() dto: CreateBillDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.createBill(orgId, dto, user.userId, user.organizationRole);
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
  @ApiOperation({ summary: 'List supplier bills with search, status filters, and overdue detection' })
  async listBills(
    @Param('orgId') orgId: string,
    @Query('status') status?: BillStatus,
    @Query('search') search?: string,
  ) {
    return this.service.listBills(orgId, status, search);
  }

  @Get('bills/:billId')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'Get individual supplier bill detail including line items and payment history' })
  async getBillById(@Param('orgId') orgId: string, @Param('billId') billId: string) {
    return this.service.getBillById(orgId, billId);
  }

  @Patch('bills/:billId')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Edit eligible supplier bill details or transition DRAFT to OPEN' })
  async updateBill(
    @Param('orgId') orgId: string,
    @Param('billId') billId: string,
    @Body() dto: UpdateBillDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.updateBill(orgId, billId, dto, user.userId);
  }

  @Post('bills/:billId/void')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Safely void an unpaid supplier bill with audit logging' })
  async voidBill(
    @Param('orgId') orgId: string,
    @Param('billId') billId: string,
    @Body() dto: VoidDocumentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.voidBill(orgId, billId, dto, user.userId);
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
