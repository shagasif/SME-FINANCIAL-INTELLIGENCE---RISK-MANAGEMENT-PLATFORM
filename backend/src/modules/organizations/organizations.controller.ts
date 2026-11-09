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
import {
  AddMemberDto,
  CreateOrganizationDto,
  UpdateMemberRoleDto,
} from './dto/organization.dto.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('Organizations & RBAC Workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard)
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new SME organization workspace' })
  async create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.organizationsService.createOrganization(dto, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List organizations accessible to the authenticated user' })
  async list(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.organizationsService.listUserOrganizations(user.userId, user.isPlatformAdmin);
  }

  @Get(':orgId')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({ summary: 'Get organization profile and memberships' })
  async getById(@Param('orgId') orgId: string) {
    return this.organizationsService.getOrganizationById(orgId);
  }

  @Post(':orgId/members')
  @Roles(RoleType.PLATFORM_ADMIN, RoleType.BUSINESS_OWNER, RoleType.FINANCE_MANAGER)
  @ApiOperation({ summary: 'Add a user to the organization with one of the 7 platform roles' })
  async addMember(
    @Param('orgId') orgId: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.organizationsService.addMember(orgId, dto, user.userId);
  }

  @Patch(':orgId/members/:membershipId')
  @Roles(RoleType.PLATFORM_ADMIN, RoleType.BUSINESS_OWNER)
  @ApiOperation({ summary: 'Update a member role or membership status' })
  async updateMemberRole(
    @Param('orgId') orgId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.organizationsService.updateMemberRole(orgId, membershipId, dto, user.userId);
  }
}
