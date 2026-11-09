import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Health Monitoring Endpoints (E2E)', () => {
  let app: INestApplication;
  let mockConnected = true;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.DATABASE_URL ??=
      'postgresql://postgres:postgrespassword@localhost:5432/sme_financial_intelligence_dev?schema=public';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
        checkReadiness: async () =>
          mockConnected ? { connected: true, latencyMs: 2 } : { connected: false },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, {
      frontendUrl: 'http://localhost:5173',
      enableSwagger: true,
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('returns 200 OK with status, service name, and ISO-8601 timestamp even if DB is down', async () => {
      mockConnected = false;

      const response = await request(app.getHttpServer()).get('/api/health').expect(200);

      expect(response.body).toEqual({
        status: 'ok',
        service: 'SME Financial Intelligence API',
        timestamp: expect.any(String),
      });
      expect(Number.isNaN(Date.parse(response.body.timestamp as string))).toBe(false);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('GET /api/health/ready', () => {
    it('returns 200 OK with connected database status when PostgreSQL responds', async () => {
      mockConnected = true;

      const response = await request(app.getHttpServer()).get('/api/health/ready').expect(200);

      expect(response.body).toEqual({
        status: 'ready',
        service: 'SME Financial Intelligence API',
        database: {
          status: 'connected',
          latencyMs: 2,
        },
        timestamp: expect.any(String),
      });
    });

    it('returns 503 Service Unavailable when PostgreSQL is unreachable', async () => {
      mockConnected = false;

      const response = await request(app.getHttpServer()).get('/api/health/ready').expect(503);

      expect(response.body).toMatchObject({
        statusCode: 503,
        error: 'SERVICE_UNAVAILABLE',
        message: 'Database connection is not ready',
        database: {
          status: 'disconnected',
        },
        path: '/api/health/ready',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Error Handling & CORS', () => {
    it('returns a structured 404 JSON response for unknown routes', async () => {
      const response = await request(app.getHttpServer()).get('/api/unknown-route').expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        error: 'NOT_FOUND',
        path: '/api/unknown-route',
        timestamp: expect.any(String),
      });
    });

    it('sets Access-Control-Allow-Origin for configured FRONTEND_URL', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });
});
