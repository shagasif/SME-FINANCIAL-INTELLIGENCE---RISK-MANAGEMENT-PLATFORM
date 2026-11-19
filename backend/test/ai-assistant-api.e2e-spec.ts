import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../src/common/guards/org-rbac.guard.js';
import { ExecutionStatus, MembershipStatus, RoleType, VerificationStatus } from '../src/generated/prisma/client.js';

describe('AI Assistant API Validation & Execution (E2E API Tests)', () => {
  let app: INestApplication;
  const workflowRuns: Array<Record<string, unknown>> = [];
  const agentRuns: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.DATABASE_URL ??=
      'postgresql://postgres:postgrespassword@localhost:5432/sme_financial_intelligence_dev?schema=public';

    const mockPrisma = {
      $queryRaw: async () => [{ 1: 1 }],
      checkReadiness: async () => ({ connected: true, latencyMs: 2 }),
      organization: {
        findUnique: async () => ({ id: 'org-test-1', baseCurrency: 'PKR', isActive: true }),
      },
      organizationMembership: {
        findUnique: async () => ({ status: MembershipStatus.ACTIVE, role: RoleType.BUSINESS_OWNER }),
      },
      financialAccount: {
        count: async () => 2,
      },
      financialTransaction: {
        count: async () => 15,
        findFirst: async () => null,
        findMany: async () => [],
      },
      financialAccount: {
        count: async () => 2,
        findFirst: async () => null,
        findMany: async () => [],
      },
      paymentRecord: {
        findFirst: async () => null,
      },
      cashFlowForecast: {
        findMany: async () => [],
        findFirst: async () => null,
        create: async ({ data }: { data: any }) => ({
          id: 'fc-1',
          generatedAt: new Date(),
          ...data,
          items: data?.items?.create?.map((it: any, idx: number) => ({ id: `fci-${idx}`, ...it })) ?? [],
        }),
      },
      riskAlert: {
        findMany: async () => [],
        count: async () => 0,
      },
      riskProfile: {
        findFirst: async () => null,
      },
      reconciliationJob: {
        findMany: async () => [],
      },
      exchangeRate: {
        findMany: async () => [],
      },
      invoice: {
        count: async () => 5,
        findFirst: async () => null,
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
      bill: {
        count: async () => 3,
        findFirst: async () => null,
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
      budget: {
        count: async () => 1,
        findMany: async () => [],
      },
      financialMetricSnapshot: {
        findFirst: async () => null,
        update: async () => null,
      },
      notification: {
        create: async () => ({ id: 'notif-1' }),
      },
      workflowRun: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const rec = { id: `wf-${workflowRuns.length + 1}`, startedAt: new Date(), ...data };
          workflowRuns.push(rec);
          return rec;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const target = workflowRuns.find((w) => w.id === where.id) || { id: where.id, ...data };
          Object.assign(target, data);
          return {
            ...target,
            agentRuns: agentRuns.filter((a) => a.workflowRunId === where.id),
          };
        },
      },
      agentRun: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const rec = { id: `ar-${agentRuns.length + 1}`, startedAt: new Date(), ...data };
          agentRuns.push(rec);
          return rec;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const target = agentRuns.find((a) => a.id === where.id) || { id: where.id, ...data };
          Object.assign(target, data);
          return target;
        },
      },
      auditEvent: {
        create: async () => ({ id: 'audit-1' }),
        findMany: async () => [],
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            userId: 'usr-owner-1',
            email: 'owner@smetest.org',
            organizationRole: RoleType.BUSINESS_OWNER,
            isPlatformAdmin: false,
          };
          return true;
        },
      })
      .overrideGuard(OrgRbacGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    // Configures real ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    configureApp(app, {
      frontendUrl: 'http://localhost:5173',
      enableSwagger: false,
    });
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('ValidationPipe with nested history validation', () => {
    it('accepts "hello" with conversational history without rejecting "history"', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/organizations/org-test-1/ai/workflows/execute')
        .send({
          prompt: 'hello',
          history: [
            { sender: 'USER', text: 'hello' },
          ],
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe(ExecutionStatus.COMPLETED);
      expect(response.body.verificationStatus).toBe(VerificationStatus.APPROVED);
      expect(response.body.answer).toMatch(/hello|how can i help/i);
    });

    it('understands follow-up questions with conversation context', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/organizations/org-test-1/ai/workflows/execute')
        .send({
          prompt: 'How is that calculated?',
          history: [
            { sender: 'USER', text: 'What is our current cash runway?' },
            { sender: 'ASSISTANT', text: 'Your current cash runway is 14.2 months based on active liquid cash reserves.' },
          ],
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe(ExecutionStatus.COMPLETED);
      expect(response.body.answer).toContain('Cash runway is calculated');
      expect(response.body.answer).toContain('liquid cash');
    }, 30000);

    it('rejects forbidden non-whitelisted properties (strict forbidNonWhitelisted security check preserved)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/organizations/org-test-1/ai/workflows/execute')
        .send({
          prompt: 'hello',
          unrecognizedProperty: 'malicious payload',
        })
        .expect(400);

      const messages = Array.isArray(response.body.message)
        ? response.body.message
        : [response.body.message];
      expect(messages).toContain('property unrecognizedProperty should not exist');
    });

    it('rejects malformed items inside history array (nested validation check preserved)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/organizations/org-test-1/ai/workflows/execute')
        .send({
          prompt: 'hello',
          history: [
            { sender: '', text: 12345 }, // invalid sender and text type
          ],
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('accepts requests sent to the /ai-assistant/query alias endpoint', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/organizations/org-test-1/ai-assistant/query')
        .send({
          prompt: 'hello',
          history: [
            { sender: 'USER', text: 'hi' },
            { sender: 'ASSISTANT', text: 'Hello!' },
          ],
        })
        .expect(201);

      expect(response.body.status).toBe(ExecutionStatus.COMPLETED);
      expect(response.body.answer).toMatch(/hello|how can i help/i);
    });

    it('accepts alternative "query" property with history through the API', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/organizations/org-test-1/ai-assistant/query')
        .send({
          query: 'hello',
          history: [
            { sender: 'USER', text: 'hello' },
          ],
        })
        .expect(201);

      expect(response.body.status).toBe(ExecutionStatus.COMPLETED);
      expect(response.body.answer).toMatch(/hello|how can i help/i);
    });
  });
});
