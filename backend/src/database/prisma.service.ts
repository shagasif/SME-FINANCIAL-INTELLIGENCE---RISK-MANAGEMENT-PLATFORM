import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { EnvConfig } from '../config/env.validation.js';

export interface DatabaseReadinessResult {
  connected: boolean;
  latencyMs?: number;
}

/**
 * Prisma Database Infrastructure Service
 *
 * Uses the Prisma 7 PostgreSQL driver adapter (@prisma/adapter-pg) with
 * validated environment configuration. Provides an explicit readiness probe
 * that executes a live `SELECT 1` query against PostgreSQL.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
      this.logger.log('PostgreSQL database connection verified via Prisma');
    } catch (error) {
      if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
        throw error;
      }
      this.logger.warn(
        `PostgreSQL is not reachable at startup (${error instanceof Error ? error.message : 'connection failed'}). ` +
          'The /api/health liveness probe remains available; /api/health/ready will report 503 until PostgreSQL is online.',
      );
    }
  }

  /**
   * Executes a live lightweight round-trip query against PostgreSQL.
   * Never reports connected=true unless the database responds.
   */
  async checkReadiness(): Promise<DatabaseReadinessResult> {
    const start = Date.now();
    try {
      await this.$queryRaw`SELECT 1`;
      return {
        connected: true,
        latencyMs: Date.now() - start,
      };
    } catch {
      return {
        connected: false,
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
