import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service.js';
import { HealthController } from './health.controller.js';
import { HealthService, SERVICE_NAME } from './health.service.js';

describe('HealthController', () => {
  const createController = (connected: boolean, latencyMs = 2): HealthController => {
    const mockPrisma = {
      checkReadiness: async () =>
        connected ? { connected: true, latencyMs } : { connected: false },
    } as unknown as PrismaService;
    const service = new HealthService(mockPrisma);
    return new HealthController(service);
  };

  describe('check (GET /api/health)', () => {
    it('returns status ok, service name, and a valid ISO-8601 timestamp', () => {
      const controller = createController(false);
      const result = controller.check();

      expect(result.status).toBe('ok');
      expect(result.service).toBe(SERVICE_NAME);
      expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
    });
  });

  describe('checkReadiness (GET /api/health/ready)', () => {
    it('returns status ready when PostgreSQL connection succeeds', async () => {
      const controller = createController(true, 4);
      const result = await controller.checkReadiness();

      expect(result.status).toBe('ready');
      expect(result.service).toBe(SERVICE_NAME);
      expect(result.database).toEqual({
        status: 'connected',
        latencyMs: 4,
      });
      expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
    });

    it('throws ServiceUnavailableException when PostgreSQL connection fails', async () => {
      const controller = createController(false);
      await expect(controller.checkReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
