import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { SecurityUtil } from '../../common/utils/security.util.js';
import { PrismaService } from '../../database/prisma.service.js';

export interface RecordAuditParams {
  organizationId?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  status?: 'SUCCESS' | 'DENIED' | 'BLOCKED_BY_SANDBOX' | 'ERROR';
  ipAddress?: string | null;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordAuditParams) {
    const status = params.status ?? 'SUCCESS';
    const timestampIso = new Date().toISOString();
    const payloadToHash = JSON.stringify({
      organizationId: params.organizationId ?? null,
      actorUserId: params.actorUserId ?? null,
      actorRole: params.actorRole ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      status,
      details: params.details ?? {},
      timestampIso,
    });
    const integrityHash = SecurityUtil.sha256(payloadToHash);

    return this.prisma.auditEvent.create({
      data: {
        organizationId: params.organizationId ?? null,
        actorUserId: params.actorUserId ?? null,
        actorRole: params.actorRole ?? null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId ?? null,
        status,
        ipAddress: params.ipAddress ?? null,
        details: (params.details ?? {}) as Prisma.InputJsonValue,
        integrityHash,
      },
    });
  }

  async listOrganizationAuditEvents(
    organizationId: string,
    options: { page?: number; limit?: number; status?: string; action?: string } = {},
  ) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditEventWhereInput = {
      organizationId,
      ...(options.status ? { status: options.status } : {}),
      ...(options.action ? { action: { contains: options.action, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
