import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipStatus, RoleType } from '../../generated/prisma/client.js';
import { SecurityUtil } from '../../common/utils/security.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  ConfirmPasswordResetDto,
  LoginDto,
  RegisterUserDto,
  RequestPasswordResetDto,
} from './dto/auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private getJwtSecret(): string {
    return (
      this.config.get<string>('JWT_SECRET') ?? 'sme-financial-intelligence-dev-jwt-secret-key-2026'
    );
  }

  async register(dto: RegisterUserDto, ipAddress?: string, userAgent?: string) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email address already exists');
    }

    const passwordHash = SecurityUtil.hashPassword(dto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: dto.fullName.trim(),
          lastLoginAt: new Date(),
        },
      });

      let organization = null;
      let membership = null;

      if (dto.organizationName) {
        const baseSlug = dto.organizationName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const slug = `${baseSlug || 'org'}-${SecurityUtil.generateRandomToken(3)}`;

        organization = await tx.organization.create({
          data: {
            name: dto.organizationName.trim(),
            slug,
            baseCurrency: (dto.baseCurrency ?? 'USD').toUpperCase(),
          },
        });

        membership = await tx.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: RoleType.BUSINESS_OWNER,
            status: MembershipStatus.ACTIVE,
          },
        });
      }

      return { user, organization, membership };
    });

    const sessionPayload = await this.createSessionAndToken(
      result.user.id,
      result.user.email,
      result.user.isPlatformAdmin,
      result.organization?.id,
      ipAddress,
      userAgent,
    );

    await this.audit.record({
      organizationId: result.organization?.id ?? null,
      actorUserId: result.user.id,
      actorRole: result.membership?.role ?? 'USER',
      action: 'AUTH_REGISTER',
      resourceType: 'USER',
      resourceId: result.user.id,
      status: 'SUCCESS',
      ipAddress,
      details: { email: result.user.email, organizationCreated: Boolean(result.organization) },
    });

    return {
      accessToken: sessionPayload.accessToken,
      expiresAt: sessionPayload.expiresAt,
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        isPlatformAdmin: result.user.isPlatformAdmin,
      },
      organization: result.organization
        ? {
            id: result.organization.id,
            name: result.organization.name,
            slug: result.organization.slug,
            baseCurrency: result.organization.baseCurrency,
            role: result.membership?.role,
          }
        : null,
    };
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          include: { organization: true },
        },
      },
    });

    if (!user || !user.isActive || !SecurityUtil.verifyPassword(dto.password, user.passwordHash)) {
      await this.audit.record({
        action: 'AUTH_LOGIN_FAILED',
        resourceType: 'USER',
        status: 'DENIED',
        ipAddress,
        details: { email },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const primaryMembership = user.memberships[0];
    const sessionPayload = await this.createSessionAndToken(
      user.id,
      user.email,
      user.isPlatformAdmin,
      primaryMembership?.organizationId,
      ipAddress,
      userAgent,
    );

    await this.audit.record({
      organizationId: primaryMembership?.organizationId ?? null,
      actorUserId: user.id,
      actorRole: primaryMembership?.role ?? (user.isPlatformAdmin ? 'PLATFORM_ADMIN' : 'USER'),
      action: 'AUTH_LOGIN_SUCCESS',
      resourceType: 'SESSION',
      resourceId: sessionPayload.sessionId,
      status: 'SUCCESS',
      ipAddress,
    });

    return {
      accessToken: sessionPayload.accessToken,
      expiresAt: sessionPayload.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      memberships: user.memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        baseCurrency: m.organization.baseCurrency,
        role: m.role,
      })),
    };
  }

  async logout(sessionId: string, userId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.record({
      actorUserId: userId,
      action: 'AUTH_LOGOUT',
      resourceType: 'SESSION',
      resourceId: sessionId,
      status: 'SUCCESS',
    });

    return { status: 'revoked', sessionId };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          include: { organization: true },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException('User account not found');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isPlatformAdmin: user.isPlatformAdmin,
      lastLoginAt: user.lastLoginAt,
      memberships: user.memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        baseCurrency: m.organization.baseCurrency,
        role: m.role,
        department: m.department,
      })),
    };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      // Return uniform response to prevent user enumeration
      return {
        status: 'accepted',
        message: 'If an active account exists for this email, a reset token has been generated.',
      };
    }

    const rawToken = SecurityUtil.generateRandomToken(24);
    const tokenHash = SecurityUtil.sha256(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      resourceType: 'USER',
      resourceId: user.id,
      status: 'SUCCESS',
    });

    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
    return {
      status: 'accepted',
      message: 'If an active account exists for this email, a reset token has been generated.',
      ...(nodeEnv !== 'production' ? { resetTokenForDevOrTest: rawToken } : {}),
    };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    const tokenHash = SecurityUtil.sha256(dto.token.trim());
    const resetRecord = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (
      !resetRecord ||
      resetRecord.usedAt !== null ||
      resetRecord.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const newPasswordHash = SecurityUtil.hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash: newPasswordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all active sessions on password reset
      this.prisma.session.updateMany({
        where: { userId: resetRecord.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      actorUserId: resetRecord.userId,
      action: 'AUTH_PASSWORD_RESET_COMPLETED',
      resourceType: 'USER',
      resourceId: resetRecord.userId,
      status: 'SUCCESS',
    });

    return {
      status: 'password_updated',
      message: 'Password has been updated and prior sessions have been revoked.',
    };
  }

  private async createSessionAndToken(
    userId: string,
    email: string,
    isPlatformAdmin: boolean,
    organizationId?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const expiresInSeconds = 86400; // 24 hours
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const tempSessionId = SecurityUtil.generateRandomToken(16);

    const accessToken = SecurityUtil.signJwt(
      {
        sub: userId,
        email,
        sessionId: tempSessionId,
        isPlatformAdmin,
      },
      this.getJwtSecret(),
      expiresInSeconds,
    );

    const tokenHash = SecurityUtil.sha256(accessToken);
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        organizationId: organizationId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        expiresAt,
      },
    });

    return {
      sessionId: session.id,
      accessToken,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
