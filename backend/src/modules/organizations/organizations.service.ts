import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, RoleType } from '../../generated/prisma/client.js';
import { SecurityUtil } from '../../common/utils/security.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  AddMemberDto,
  CreateOrganizationDto,
  UpdateMemberRoleDto,
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

    const organization = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.name.trim(),
          slug,
          registrationNumber: dto.registrationNumber?.trim() ?? null,
          industry: dto.industry?.trim() ?? null,
          baseCurrency: (dto.baseCurrency ?? 'USD').toUpperCase(),
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
}
