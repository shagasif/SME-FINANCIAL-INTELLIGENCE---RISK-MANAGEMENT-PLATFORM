import { jest } from '@jest/globals';
import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROLES_KEY } from '../../common/decorators/auth.decorators.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import { MembershipStatus, RoleType } from '../../generated/prisma/client.js';
import { UpdateOrganizationDto } from './dto/organization.dto.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

describe('OrganizationsController & OrganizationsService (Organization Settings & Currency)', () => {
  const makeOrgService = (existingOrg: Record<string, unknown> | null) => {
    const auditLogs: Array<Record<string, unknown>> = [];
    const txUpdateSpy = jest.fn();
    const accountUpdateSpy = jest.fn();
    const invoiceUpdateSpy = jest.fn();
    const billUpdateSpy = jest.fn();

    const prismaStub = {
      organization: {
        findUnique: jest.fn(async () => existingOrg),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...(existingOrg ?? {}),
          ...data,
          updatedAt: new Date(),
        })),
      },
      financialTransaction: { updateMany: txUpdateSpy },
      financialAccount: { updateMany: accountUpdateSpy },
      invoice: { updateMany: invoiceUpdateSpy },
      bill: { updateMany: billUpdateSpy },
    };

    const auditStub = {
      record: jest.fn(async (entry: Record<string, unknown>) => {
        auditLogs.push(entry);
      }),
    };

    const service = new OrganizationsService(prismaStub as never, auditStub as never);
    return {
      service,
      prismaStub,
      auditLogs,
      nonMutationSpies: { txUpdateSpy, accountUpdateSpy, invoiceUpdateSpy, billUpdateSpy },
    };
  };

  it('persists updated baseCurrency (USD -> PKR) and organization settings without altering financial records', async () => {
    const { service, prismaStub, auditLogs, nonMutationSpies } = makeOrgService({
      id: 'org-star',
      name: 'star',
      slug: 'star',
      baseCurrency: 'USD',
      fiscalYearStartMonth: 1,
    });

    const updated = await service.updateOrganization(
      'org-star',
      {
        name: 'star',
        baseCurrency: 'pkr',
        fiscalYearStartMonth: 7,
      },
      'usr-owner',
      RoleType.BUSINESS_OWNER,
    );

    expect(updated.baseCurrency).toBe('PKR');
    expect(updated.fiscalYearStartMonth).toBe(7);
    expect(prismaStub.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-star' },
      data: {
        name: 'star',
        baseCurrency: 'PKR',
        fiscalYearStartMonth: 7,
      },
    });
    expect(auditLogs[0]).toMatchObject({
      organizationId: 'org-star',
      actorUserId: 'usr-owner',
      action: 'ORGANIZATION_SETTINGS_UPDATED',
      details: {
        previousBaseCurrency: 'USD',
        newBaseCurrency: 'PKR',
        previousFiscalYearStartMonth: 1,
        newFiscalYearStartMonth: 7,
      },
    });

    // Must never overwrite or convert native transactions, accounts, invoices, or bills
    expect(nonMutationSpies.txUpdateSpy).not.toHaveBeenCalled();
    expect(nonMutationSpies.accountUpdateSpy).not.toHaveBeenCalled();
    expect(nonMutationSpies.invoiceUpdateSpy).not.toHaveBeenCalled();
    expect(nonMutationSpies.billUpdateSpy).not.toHaveBeenCalled();
  });

  it('validates UpdateOrganizationDto and rejects empty or non-existent organization updates', async () => {
    const invalidCurrencyDto = plainToInstance(UpdateOrganizationDto, { baseCurrency: 'US' });
    const currencyErrors = await validate(invalidCurrencyDto);
    expect(currencyErrors.length).toBeGreaterThan(0);

    const validCurrencyDto = plainToInstance(UpdateOrganizationDto, {
      name: 'star',
      baseCurrency: 'PKR',
      fiscalYearStartMonth: 1,
    });
    expect(await validate(validCurrencyDto)).toHaveLength(0);

    const { service: missingService } = makeOrgService(null);
    await expect(
      missingService.updateOrganization('org-missing', { baseCurrency: 'PKR' }, 'usr-owner'),
    ).rejects.toThrow(NotFoundException);

    const { service: emptyUpdateService } = makeOrgService({
      id: 'org-star',
      name: 'star',
      baseCurrency: 'USD',
      fiscalYearStartMonth: 1,
    });
    await expect(
      emptyUpdateService.updateOrganization('org-star', {}, 'usr-owner'),
    ).rejects.toThrow(BadRequestException);
  });

  it('restricts PATCH /organizations/:orgId to PLATFORM_ADMIN & BUSINESS_OWNER and enforces cross-organization isolation via OrgRbacGuard', async () => {
    const allowedRoles = Reflect.getMetadata(
      ROLES_KEY,
      OrganizationsController.prototype.updateOrganization,
    ) as RoleType[];

    expect(allowedRoles).toEqual([RoleType.PLATFORM_ADMIN, RoleType.BUSINESS_OWNER]);
    expect(allowedRoles).not.toContain(RoleType.FINANCE_MANAGER);
    expect(allowedRoles).not.toContain(RoleType.ACCOUNTANT);
    expect(allowedRoles).not.toContain(RoleType.AUDITOR);

    const reflector = new Reflector();
    const auditDenied: unknown[] = [];
    const prismaGuardStub = {
      organizationMembership: {
        findUnique: jest.fn(async ({ where }: { where: { organizationId_userId: { organizationId: string; userId: string } } }) => {
          const { organizationId, userId } = where.organizationId_userId;
          if (organizationId === 'org-star' && userId === 'usr-owner') {
            return { role: RoleType.BUSINESS_OWNER, status: MembershipStatus.ACTIVE };
          }
          if (organizationId === 'org-star' && userId === 'usr-accountant') {
            return { role: RoleType.ACCOUNTANT, status: MembershipStatus.ACTIVE };
          }
          return null;
        }),
      },
    };
    const guard = new OrgRbacGuard(
      reflector,
      prismaGuardStub as never,
      { record: async (e: unknown) => { auditDenied.push(e); } } as never,
    );

    const makeCtx = (orgId: string, userId: string) =>
      ({
        getHandler: () => OrganizationsController.prototype.updateOrganization,
        getClass: () => OrganizationsController,
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'PATCH',
            path: `/api/v1/organizations/${orgId}`,
            params: { orgId },
            headers: {},
            ip: '127.0.0.1',
            user: { userId, isPlatformAdmin: false },
          }),
        }),
      }) as unknown as ExecutionContext;

    // Authorized owner of org-star passes
    await expect(guard.canActivate(makeCtx('org-star', 'usr-owner'))).resolves.toBe(true);

    // Non-owner role (Accountant) is blocked
    await expect(guard.canActivate(makeCtx('org-star', 'usr-accountant'))).rejects.toThrow(
      ForbiddenException,
    );

    // Cross-organization user without membership in org-other is blocked
    await expect(guard.canActivate(makeCtx('org-other', 'usr-owner'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(auditDenied.length).toBeGreaterThanOrEqual(2);
  });
});
