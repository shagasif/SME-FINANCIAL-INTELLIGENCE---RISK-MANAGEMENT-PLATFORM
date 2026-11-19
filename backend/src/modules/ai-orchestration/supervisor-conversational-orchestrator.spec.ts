import { jest } from '@jest/globals';
import {
  AgentType,
  ExecutionStatus,
  MembershipStatus,
  Prisma,
  RoleType,
  VerificationStatus,
} from '../../generated/prisma/client.js';
import { ValidationPipe } from '@nestjs/common';
import { ExecuteAiWorkflowDto } from './dto/ai-orchestration.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { WorkflowHookService } from './hooks/workflow-hooks.service.js';
import { AgentSandboxService } from './sandbox/agent-sandbox.service.js';
import { AgentSkillsRegistryService } from './skills/agent-skills-registry.service.js';
import { SupervisorOrchestratorService } from './supervisor-orchestrator.service.js';

describe('SupervisorOrchestratorService - Conversational AI Assistant Behavior', () => {
  function buildHarness() {
    const workflowRuns: Array<Record<string, unknown>> = [];
    const agentRuns: Array<Record<string, unknown>> = [];
    const auditLogs: Array<Record<string, unknown>> = [];

    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-1', baseCurrency: 'PKR', isActive: true }),
      },
      organizationMembership: {
        findUnique: jest.fn().mockResolvedValue({ status: MembershipStatus.ACTIVE }),
      },
      financialAccount: {
        count: jest.fn().mockResolvedValue(2),
      },
      financialTransaction: {
        count: jest.fn().mockResolvedValue(50),
      },
      invoice: {
        count: jest.fn().mockResolvedValue(10),
      },
      bill: {
        count: jest.fn().mockResolvedValue(5),
      },
      budget: {
        count: jest.fn().mockResolvedValue(2),
      },
      financialMetricSnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(null),
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      },
      workflowRun: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const rec = { id: `wf-${workflowRuns.length + 1}`, startedAt: new Date(), ...data };
          workflowRuns.push(rec);
          return rec;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const target = workflowRuns.find((w) => w.id === where.id)!;
          Object.assign(target, data);
          return {
            ...target,
            agentRuns: agentRuns.filter((a) => a.workflowRunId === where.id),
          };
        }),
      },
      agentRun: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const rec = { id: `ar-${agentRuns.length + 1}`, startedAt: new Date(), ...data };
          agentRuns.push(rec);
          return rec;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const target = agentRuns.find((a) => a.id === where.id)!;
          Object.assign(target, data);
          return target;
        }),
      },
    };

    const auditStub = {
      record: jest.fn().mockImplementation(async (entry: Record<string, unknown>) => {
        auditLogs.push(entry);
        return { id: `aud-${auditLogs.length}`, ...entry };
      }),
    } as unknown as AuditService;

    const hooks = new WorkflowHookService(prisma as unknown as any, auditStub);
    const sandbox = new AgentSandboxService(auditStub);

    const skillsRegistry = {
      getSkillsForAgent: jest.fn().mockImplementation((agentType: AgentType) => {
        return [
          {
            skillId: `skill.${agentType.toLowerCase()}`,
            requiredInputs: ['organizationId', 'prompt', 'horizonDays'],
          },
        ];
      }),
      executeSkill: jest.fn().mockImplementation(async (skillId: string) => {
        if (skillId.includes('verifier') || skillId === 'skill.financial-output-verification') {
          return {
            output: {
              verificationPassed: true,
              arithmeticVerified: true,
              citationsVerified: true,
              nonFraudComplianceVerified: true,
              auditNotes: 'Verified deterministic outputs',
            },
            invokedMcpTools: [],
            sourceRecordIds: {},
            modelUsage: {
              provider: 'deterministic-grounded',
              model: 'grounded-v1',
              promptTokens: 10,
              completionTokens: 10,
              totalTokens: 20,
              estimatedCostUsd: '0.000000',
              latencyMs: 5,
              status: 'SUCCESS',
              attempts: 1,
              timestamp: new Date().toISOString(),
            },
          };
        }

        return {
          output: {
            skillId,
            currency: 'PKR',
            keyMetrics: {
              operatingCashFlow: '612200.0000',
              workingCapital: '2615400.0000',
              currentRatio: '2.4000',
              quickRatio: '1.9500',
              grossMargin: '42.5000',
              cashRunway: '14.2000',
            },
            receivablesOverdueTotal: '150000.0000',
            payablesOverdueTotal: '45000.0000',
            activeAlertsCount: 2,
            highSeverityCount: 1,
            anomalousExpensesCount: 0,
            summary: 'Grounded metrics computed.',
          },
          invokedMcpTools: ['mcp.finance.get_deterministic_metrics'],
          sourceRecordIds: { accountIds: ['acc-1'] },
          modelUsage: {
            provider: 'deterministic-grounded',
            model: 'grounded-v1',
            promptTokens: 25,
            completionTokens: 25,
            totalTokens: 50,
            estimatedCostUsd: '0.000000',
            latencyMs: 12,
            status: 'SUCCESS',
            attempts: 1,
            timestamp: new Date().toISOString(),
          },
        };
      }),
    } as unknown as AgentSkillsRegistryService;

    const supervisor = new SupervisorOrchestratorService(
      prisma as unknown as any,
      hooks,
      sandbox,
      skillsRegistry,
      auditStub,
    );

    return { supervisor, prisma, workflowRuns, auditLogs };
  }

  describe('1. Greetings & Politeness', () => {
    it('responds naturally and immediately to short greetings like "Hi", "Hello", "Hey", "Good morning"', async () => {
      const { supervisor, workflowRuns } = buildHarness();

      const greetings = ['Hi', 'Hello', 'Hey', 'Good morning', 'Good afternoon', 'Hi there'];
      for (const greeting of greetings) {
        const result = await supervisor.executeWorkflow({
          organizationId: 'org-1',
          userId: 'user-1',
          userRole: RoleType.BUSINESS_OWNER,
          isPlatformAdmin: false,
          dto: { prompt: greeting },
        });

        expect(result.status).toBe(ExecutionStatus.COMPLETED);
        expect(result.verificationStatus).toBe(VerificationStatus.APPROVED);
        expect(result.answer).toBeDefined();
        expect(typeof result.answer).toBe('string');
        expect(result.answer.toLowerCase()).toMatch(/hello|good morning|good afternoon|how can i help/);
      }

      // Verify that all runs completed with CONVERSATIONAL_GREETING task classification
      expect(workflowRuns.length).toBe(greetings.length);
      for (const run of workflowRuns) {
        expect(run.taskClassification).toBe('CONVERSATIONAL_GREETING');
      }
    });

    it('responds politely to "Thanks", "Thank you", and similar messages', async () => {
      const { supervisor } = buildHarness();

      const thanksMessages = ['Thanks', 'Thank you', 'Thank you so much', 'Much appreciated', 'thx'];
      for (const msg of thanksMessages) {
        const result = await supervisor.executeWorkflow({
          organizationId: 'org-1',
          userId: 'user-1',
          userRole: RoleType.FINANCE_MANAGER,
          isPlatformAdmin: false,
          dto: { prompt: msg },
        });

        expect(result.status).toBe(ExecutionStatus.COMPLETED);
        expect(result.answer).toContain("You're welcome!");
      }
    });
  });

  describe('2. Short Messages (1-2 characters)', () => {
    it('accepts short prompts such as "Hi" without validation failures and responds naturally', async () => {
      const { supervisor } = buildHarness();

      const result = await supervisor.executeWorkflow({
        organizationId: 'org-1',
        userId: 'user-1',
        userRole: RoleType.BUSINESS_OWNER,
        isPlatformAdmin: false,
        dto: { prompt: 'Hi' },
      });

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.answer).toMatch(/hello|how can i help/i);
    });
  });

  describe('3. Irrelevant Messages', () => {
    it('politely indicates the assistant can only help with business-related queries when given out-of-scope prompts', async () => {
      const { supervisor } = buildHarness();

      const irrelevantPrompts = [
        'What is the capital of France?',
        'Write a poem about trees',
        'Who won the 2022 World Cup?',
        'Tell me a funny joke',
      ];

      for (const prompt of irrelevantPrompts) {
        const result = await supervisor.executeWorkflow({
          organizationId: 'org-1',
          userId: 'user-1',
          userRole: RoleType.FINANCE_MANAGER,
          isPlatformAdmin: false,
          dto: { prompt },
        });

        expect(result.status).toBe(ExecutionStatus.COMPLETED);
        expect(result.answer).toContain('I am your business finance assistant');
        expect(result.answer).toContain('financial data, reports, transactions, alerts, expenses, cash flow');
      }
    });
  });

  describe('4. Business Questions & Concise Responses', () => {
    it('answers cash runway question directly and concisely using actual application data', async () => {
      const { supervisor } = buildHarness();

      const result = await supervisor.executeWorkflow({
        organizationId: 'org-1',
        userId: 'user-1',
        userRole: RoleType.FINANCE_MANAGER,
        isPlatformAdmin: false,
        dto: { prompt: 'What is our current cash runway?' },
      });

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.answer).toContain('14.2 months');
      expect(result.answer).toContain('active liquid cash reserves');
      // Must not dump boilerplate "Deterministic financial analysis completed across..."
      expect(result.answer).not.toContain('Deterministic financial analysis');
    });

    it('answers overdue receivables questions directly with formatted currency', async () => {
      const { supervisor } = buildHarness();

      const result = await supervisor.executeWorkflow({
        organizationId: 'org-1',
        userId: 'user-1',
        userRole: RoleType.ACCOUNTANT,
        isPlatformAdmin: false,
        dto: { prompt: 'What are our total overdue receivables?' },
      });

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.answer).toContain('PKR 150,000.00');
    });

    it('answers risk alert questions with exact alert count', async () => {
      const { supervisor } = buildHarness();

      const result = await supervisor.executeWorkflow({
        organizationId: 'org-1',
        userId: 'user-1',
        userRole: RoleType.BUSINESS_OWNER,
        isPlatformAdmin: false,
        dto: { prompt: 'How many active risk alerts do we have?' },
      });

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.answer).toContain('2 active risk alert(s)');
      expect(result.answer).toContain('1 high severity');
    });

    it('answers gross margin questions directly with percentage format', async () => {
      const { supervisor } = buildHarness();

      const result = await supervisor.executeWorkflow({
        organizationId: 'org-1',
        userId: 'user-1',
        userRole: RoleType.FINANCIAL_ANALYST,
        isPlatformAdmin: false,
        dto: { prompt: 'What is our gross margin?' },
      });

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.answer).toContain('42.50%');
    });
  });

  describe('5. Context Awareness', () => {
    it('understands follow-up questions using recent conversation history', async () => {
      const { supervisor } = buildHarness();

      const result = await supervisor.executeWorkflow({
        organizationId: 'org-1',
        userId: 'user-1',
        userRole: RoleType.BUSINESS_OWNER,
        isPlatformAdmin: false,
        dto: {
          prompt: 'How is that calculated?',
          history: [
            { sender: 'USER', text: 'What is our current cash runway?' },
            { sender: 'ASSISTANT', text: 'Your current cash runway is 14.2 months based on active liquid cash reserves.' },
          ],
        },
      });

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.answer).toContain('Cash runway is calculated');
      expect(result.answer).toContain('liquid cash balance');
      expect(result.answer).toContain('burn rate');
    });

    it('explains gross margin calculation when followed up with "Why?"', async () => {
      const { supervisor } = buildHarness();

      const result = await supervisor.executeWorkflow({
        organizationId: 'org-1',
        userId: 'user-1',
        userRole: RoleType.FINANCE_MANAGER,
        isPlatformAdmin: false,
        dto: {
          prompt: 'Why?',
          history: [
            { sender: 'USER', text: 'What is our current gross margin?' },
            { sender: 'ASSISTANT', text: 'Current gross margin is 42.50%.' },
          ],
        },
      });

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.answer).toContain('Gross margin is calculated');
      expect(result.answer).toContain('Revenue');
    });
  });

  describe('6. ValidationPipe and ExecuteAiWorkflowDto whitelist enforcement', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });

    it('successfully validates DTO with prompt and nested history', async () => {
      const validPayload = {
        prompt: 'hello',
        history: [
          { sender: 'USER', text: 'hi' },
          { sender: 'ASSISTANT', text: 'Hello! How can I help you today?' },
        ],
      };

      const result = (await pipe.transform(validPayload, {
        type: 'body',
        metatype: ExecuteAiWorkflowDto,
      })) as ExecuteAiWorkflowDto;

      expect(result).toBeInstanceOf(ExecuteAiWorkflowDto);
      expect(result.prompt).toBe('hello');
      expect(result.history).toHaveLength(2);
      expect(result.history![0].sender).toBe('USER');
      expect(result.history![0].text).toBe('hi');
    });

    it('rejects forbidden non-whitelisted properties like unknownProperty', async () => {
      const invalidPayload = {
        prompt: 'hello',
        unknownProperty: 'should not exist',
      };

      try {
        await pipe.transform(invalidPayload, {
          type: 'body',
          metatype: ExecuteAiWorkflowDto,
        });
        throw new Error('Should have thrown BadRequestException');
      } catch (err: any) {
        const response = err.getResponse ? err.getResponse() : err;
        const messages = Array.isArray(response.message) ? response.message : [response.message];
        expect(messages).toContain('property unknownProperty should not exist');
      }
    });

    it('validates and accepts query alias with history', async () => {
      const validPayload = {
        query: 'What is our current cash runway?',
        history: [{ sender: 'USER', text: 'What is our current cash runway?' }],
      };

      const result = (await pipe.transform(validPayload, {
        type: 'body',
        metatype: ExecuteAiWorkflowDto,
      })) as ExecuteAiWorkflowDto;

      expect(result.query).toBe('What is our current cash runway?');
      expect(result.history).toHaveLength(1);
    });
  });
});
