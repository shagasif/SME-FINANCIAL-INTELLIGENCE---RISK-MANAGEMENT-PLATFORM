import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const RATE_LIMIT_KEY = 'sme_rate_limit_options';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? { windowMs: 60_000, maxRequests: 120 };

    const request = context.switchToHttp().getRequest<Request & { user?: { userId?: string } }>();
    const identity = request.user?.userId ?? request.ip ?? 'anonymous';
    const key = `${identity}:${request.method}:${request.baseUrl}${request.path}`;
    const now = Date.now();

    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    if (current.count >= options.maxRequests) {
      throw new HttpException(
        'Rate limit exceeded. Please wait before sending additional requests.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count += 1;
    return true;
  }
}
