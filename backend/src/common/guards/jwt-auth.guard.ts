import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import { AuthenticatedPrincipal, IS_PUBLIC_KEY } from '../decorators/auth.decorators.js';
import { SecurityUtil } from '../utils/security.util.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedPrincipal }>();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication token is required (Bearer JWT)');
    }

    const token = authHeader.slice(7).trim();
    const secret =
      this.config.get<string>('JWT_SECRET') ?? 'sme-financial-intelligence-dev-jwt-secret-key-2026';

    const claims = SecurityUtil.verifyJwt(token, secret);
    if (!claims) {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    // Verify session is active and not revoked in PostgreSQL
    const tokenHash = SecurityUtil.sha256(token);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException('Session has expired or has been revoked');
    }

    request.user = {
      userId: session.user.id,
      email: session.user.email,
      sessionId: session.id,
      isPlatformAdmin: session.user.isPlatformAdmin,
    };

    return true;
  }
}
