import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleType } from '../../generated/prisma/client.js';
import {
  AuthenticatedPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import {
  CreateFinancialAccountDto,
  CreateTransactionDto,
  TransactionFilterQueryDto,
  UpdateTransactionDto,
} from './dto/financial-transaction.dto.js';
import { FinancialTransactionsService } from './financial-transactions.service.js';

@ApiTags('Financial Accounts & Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard)
@Controller({ path: 'organizations/:orgId', version: '1' })
export class FinancialTransactionsController {
  constructor(private readonly service: FinancialTransactionsService) {}

  @Post('accounts')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Create a financial account in the organization chart of accounts' })
  async createAccount(
    @Param('orgId') orgId: string,
    @Body() dto: CreateFinancialAccountDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.createAccount(orgId, dto, user.userId);
  }

  @Get('accounts')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'List financial accounts and decimal-safe current balances' })
  async listAccounts(
    @Param('orgId') orgId: string,
    @Query('includeArchived') includeArchived?: boolean,
  ) {
    return this.service.listAccounts(orgId, Boolean(includeArchived));
  }

  @Delete('accounts/:accountId')
  @Roles(RoleType.PLATFORM_ADMIN, RoleType.BUSINESS_OWNER, RoleType.FINANCE_MANAGER)
  @ApiOperation({ summary: 'Archive a financial account' })
  async archiveAccount(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.archiveAccount(orgId, accountId, user.userId);
  }

  @Post('transactions')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'Record an income, expense, or transfer transaction and update account balance',
  })
  async createTransaction(
    @Param('orgId') orgId: string,
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.createTransaction(orgId, dto, user.userId);
  }

  @Get('transactions')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'Filter, search, and paginate organization financial transactions' })
  async listTransactions(@Param('orgId') orgId: string, @Query() query: TransactionFilterQueryDto) {
    return this.service.listTransactions(orgId, query);
  }

  @Patch('transactions/:transactionId')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Update a financial transaction and reconcile account balance' })
  async updateTransaction(
    @Param('orgId') orgId: string,
    @Param('transactionId') transactionId: string,
    @Body() dto: UpdateTransactionDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.updateTransaction(orgId, transactionId, dto, user.userId);
  }

  @Delete('transactions/:transactionId')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Archive a financial transaction and reverse its balance impact' })
  async archiveTransaction(
    @Param('orgId') orgId: string,
    @Param('transactionId') transactionId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.service.archiveTransaction(orgId, transactionId, user.userId);
  }
}
