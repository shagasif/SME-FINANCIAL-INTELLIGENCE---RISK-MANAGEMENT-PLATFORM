import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsNumberString, IsOptional, IsString, Length } from 'class-validator';
import { RoleType } from '../../generated/prisma/client.js';
import {
  AuthenticatedPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import { CurrencyConversionService } from './currency.service.js';

export class UpsertExchangeRateDto {
  @IsString()
  @Length(3, 3)
  fromCurrency!: string;

  @IsString()
  @Length(3, 3)
  toCurrency!: string;

  @IsNumberString()
  rate!: string;

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  source?: string;
}

@ApiTags('Multi-Currency Exchange Rates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard)
@Controller({ path: 'organizations/:orgId/currencies', version: '1' })
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyConversionService) {}

  @Get('rates')
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
    summary: 'List effective exchange rates and base reporting currency for an organization',
  })
  async listRates(@Param('orgId') orgId: string) {
    return this.currencyService.listExchangeRates(orgId);
  }

  @Post('rates')
  @Roles(RoleType.PLATFORM_ADMIN, RoleType.BUSINESS_OWNER, RoleType.FINANCE_MANAGER)
  @ApiOperation({
    summary: 'Add or update an organization-scoped effective exchange rate',
  })
  async upsertRate(
    @Param('orgId') orgId: string,
    @Body() dto: UpsertExchangeRateDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.currencyService.upsertOrganizationRate(orgId, dto, user.userId);
  }
}
