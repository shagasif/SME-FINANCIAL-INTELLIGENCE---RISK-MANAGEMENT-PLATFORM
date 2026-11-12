import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, MembershipStatus, Prisma, RoleType } from '../../generated/prisma/client.js';
import { SecurityUtil } from '../../common/utils/security.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  AddMemberDto,
  CreateOrganizationDto,
  UpdateMemberRoleDto,
  UpdateOrganizationDto,
} from './dto/organization.dto.js';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createOrganization(dto: CreateOrganizationDto, creatorUserId: string) {
    const baseSlug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug || 'org'}-${SecurityUtil.generateRandomToken(3)}`;

    const resolvedBaseCurrency = this.resolveOrganizationCurrency(
      dto.baseCurrency,
      dto.country,
    );

    const organization = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.name.trim(),
          slug,
          registrationNumber: dto.registrationNumber?.trim() ?? null,
          industry: dto.industry?.trim() ?? null,
          baseCurrency: resolvedBaseCurrency,
          fiscalYearStartMonth: dto.fiscalYearStartMonth ?? 1,
          isSyntheticDemo: dto.isSyntheticDemo ?? false,
        },
      });

      await tx.organizationMembership.create({
        data: {
          organizationId: org.id,
          userId: creatorUserId,
          role: RoleType.BUSINESS_OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      // Seed initial starter accounts in organization's base currency
      await tx.financialAccount.createMany({
        data: [
          {
            organizationId: org.id,
            code: '1010',
            name: 'Operating Account',
            type: AccountType.BANK,
            currency: resolvedBaseCurrency,
            openingBalance: new Prisma.Decimal('0.0000'),
            currentBalance: new Prisma.Decimal('0.0000'),
            isLiquid: true,
          },
          {
            organizationId: org.id,
            code: '1020',
            name: 'Payroll Reserve',
            type: AccountType.BANK,
            currency: resolvedBaseCurrency,
            openingBalance: new Prisma.Decimal('0.0000'),
            currentBalance: new Prisma.Decimal('0.0000'),
            isLiquid: true,
          },
          {
            organizationId: org.id,
            code: '1030',
            name: 'Petty Cash',
            type: AccountType.CASH,
            currency: resolvedBaseCurrency,
            openingBalance: new Prisma.Decimal('0.0000'),
            currentBalance: new Prisma.Decimal('0.0000'),
            isLiquid: true,
          },
        ],
      });

      return org;
    });

    await this.audit.record({
      organizationId: organization.id,
      actorUserId: creatorUserId,
      actorRole: RoleType.BUSINESS_OWNER,
      action: 'ORGANIZATION_CREATED',
      resourceType: 'ORGANIZATION',
      resourceId: organization.id,
      details: { name: organization.name, baseCurrency: organization.baseCurrency },
    });

    return organization;
  }

  async listUserOrganizations(userId: string, isPlatformAdmin: boolean) {
    if (isPlatformAdmin) {
      return this.prisma.organization.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }

    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      include: { organization: true },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((m) => ({
      ...m.organization,
      membershipRole: m.role,
      department: m.department,
    }));
  }

  async getOrganizationById(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, email: true, fullName: true, isActive: true },
            },
          },
        },
      },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async addMember(organizationId: string, dto: AddMemberDto, actorUserId: string) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(`No registered user found with email ${email}`);
    }

    const existing = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: user.id,
        },
      },
    });

    if (existing) {
      throw new ConflictException('User is already a member of this organization');
    }

    const membership = await this.prisma.organizationMembership.create({
      data: {
        organizationId,
        userId: user.id,
        role: dto.role,
        department: dto.department ?? null,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'ORGANIZATION_MEMBER_ADDED',
      resourceType: 'ORGANIZATION_MEMBERSHIP',
      resourceId: membership.id,
      details: { targetUserId: user.id, assignedRole: dto.role },
    });

    return membership;
  }

  async updateMemberRole(
    organizationId: string,
    membershipId: string,
    dto: UpdateMemberRoleDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Organization membership not found');
    }

    const updated = await this.prisma.organizationMembership.update({
      where: { id: membershipId },
      data: {
        role: dto.role,
        ...(dto.status ? { status: dto.status } : {}),
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'ORGANIZATION_MEMBER_ROLE_UPDATED',
      resourceType: 'ORGANIZATION_MEMBERSHIP',
      resourceId: membershipId,
      details: {
        previousRole: existing.role,
        newRole: dto.role,
        status: updated.status,
      },
    });

    return updated;
  }

  async updateOrganization(
    organizationId: string,
    dto: UpdateOrganizationDto,
    actorUserId: string,
    actorRole?: RoleType,
  ) {
    const existing = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Organization not found');
    }

    const updateData: Prisma.OrganizationUpdateInput = {};

    if (dto.name !== undefined) {
      const cleanName = dto.name.trim();
      if (cleanName.length < 2) {
        throw new BadRequestException('Organization name must be at least 2 characters');
      }
      updateData.name = cleanName;
    }

    if (dto.baseCurrency !== undefined) {
      const cleanCurrency = dto.baseCurrency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(cleanCurrency)) {
        throw new BadRequestException('baseCurrency must be a valid 3-letter ISO-4217 currency code');
      }
      updateData.baseCurrency = cleanCurrency;
    }

    if (dto.fiscalYearStartMonth !== undefined) {
      updateData.fiscalYearStartMonth = dto.fiscalYearStartMonth;
    }

    if (dto.registrationNumber !== undefined) {
      updateData.registrationNumber = dto.registrationNumber.trim() || null;
    }

    if (dto.industry !== undefined) {
      updateData.industry = dto.industry.trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('At least one organization setting field must be provided');
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: updateData,
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      actorRole,
      action: 'ORGANIZATION_SETTINGS_UPDATED',
      resourceType: 'ORGANIZATION',
      resourceId: organizationId,
      details: {
        previousName: existing.name,
        newName: updated.name,
        previousBaseCurrency: existing.baseCurrency,
        newBaseCurrency: updated.baseCurrency,
        previousFiscalYearStartMonth: existing.fiscalYearStartMonth,
        newFiscalYearStartMonth: updated.fiscalYearStartMonth,
      },
    });

    return updated;
  }

  private resolveOrganizationCurrency(baseCurrency?: string, country?: string): string {
    if (baseCurrency?.trim()) {
      return baseCurrency.trim().toUpperCase();
    }
    const normalizedCountry = country?.trim().toLowerCase();
    if (
      !normalizedCountry ||
      normalizedCountry === 'pakistan' ||
      normalizedCountry === 'pk' ||
      normalizedCountry === 'pak'
    ) {
      return 'PKR';
    }
    if (
      normalizedCountry === 'united states' ||
      normalizedCountry === 'us' ||
      normalizedCountry === 'usa'
    ) {
      return 'USD';
    }
    if (
      normalizedCountry === 'united kingdom' ||
      normalizedCountry === 'uk' ||
      normalizedCountry === 'gb' ||
      normalizedCountry === 'great britain'
    ) {
      return 'GBP';
    }
    if (normalizedCountry === 'european union' || normalizedCountry === 'eu') {
      return 'EUR';
    }
    if (
      normalizedCountry === 'united arab emirates' ||
      normalizedCountry === 'uae' ||
      normalizedCountry === 'ae'
    ) {
      return 'AED';
    }
    return 'PKR';
  }
}
