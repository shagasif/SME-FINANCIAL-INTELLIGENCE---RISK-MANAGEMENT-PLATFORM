import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { HealthResponseDto, ReadinessResponseDto } from './dto/health-response.dto.js';

export const SERVICE_NAME = 'SME Financial Intelligence API';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness check: confirms the API process is running and responsive.
   * Operates independently of PostgreSQL availability.
   */
  getLiveness(): HealthResponseDto {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness check: verifies live PostgreSQL connectivity via Prisma.
   * Throws HTTP 503 ServiceUnavailableException if the database connection fails.
   */
  async getReadiness(): Promise<ReadinessResponseDto> {
    const dbCheck = await this.prisma.checkReadiness();

    if (!dbCheck.connected) {
      throw new ServiceUnavailableException({
        message: 'Database connection is not ready',
        database: {
          status: 'disconnected',
        },
      });
    }

    return {
      status: 'ready',
      service: SERVICE_NAME,
      database: {
        status: 'connected',
        latencyMs: dbCheck.latencyMs,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
