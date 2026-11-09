import { ConfigService } from '@nestjs/config';
import { AgentType, RoleType } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { McpIntegrationService } from './mcp/mcp-integration.service.js';
import { ToolRegistryService } from './mcp/tool-registry.service.js';
import { AiModelProviderService } from './model-provider/ai-model-provider.service.js';
import { AgentSandboxService } from './sandbox/agent-sandbox.service.js';
import { AgentSkillsRegistryService } from './skills/agent-skills-registry.service.js';

describe('MCP, Agent Skills, AI Model Provider & Sandbox Restrictions (Section 12 & 24 Unit Tests)', () => {
  let auditStub: AuditService;
  let sandbox: AgentSandboxService;
  let toolRegistry: ToolRegistryService;
  let mcp: McpIntegrationService;
  let modelProvider: AiModelProviderService;
  let skillsRegistry: AgentSkillsRegistryService;
  const recordedAudits: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    recordedAudits.length = 0;
    auditStub = {
      record: async (params: Record<string, unknown>) => {
        recordedAudits.push(params);
        return { id: 'audit-1', ...params };
      },
    } as unknown as AuditService;

    sandbox = new AgentSandboxService(auditStub);

    const analyticsStub = {
      computeAllMetrics: async (orgId: string) => ({
        organizationId: orgId,
        currency: 'USD',
        formulaVersion: 'v1.0.0-decimal',
        reportingPeriod: {
          startDate: '2026-10-01T00:00:00.000Z',
          endDate: '2026-10-31T00:00:00.000Z',
        },
        metrics: {
          operatingCashFlow: {
            value: '25000.0000',
            status: 'COMPUTED',
            dataLimitations: [],
            sourceRecordIds: { transactionIds: ['tx-1'] },
          },
          cashRunway: {
            value: '18.5000',
            status: 'COMPUTED',
            dataLimitations: [],
            sourceRecordIds: { accountIds: ['acc-1'] },
          },
          currentRatio: {
            value: '2.1000',
            status: 'COMPUTED',
            dataLimitations: [],
            sourceRecordIds: { accountIds: ['acc-1'] },
          },
          quickRatio: {
            value: '1.9000',
            status: 'COMPUTED',
            dataLimitations: [],
            sourceRecordIds: { accountIds: ['acc-1'] },
          },
          grossMargin: {
            value: '68.0000',
            status: 'COMPUTED',
            dataLimitations: [],
            sourceRecordIds: { transactionIds: ['tx-1'] },
          },
          expenseGrowth: {
            value: '4.2000',
            status: 'COMPUTED',
            dataLimitations: [],
            sourceRecordIds: { transactionIds: ['tx-1'] },
          },
          workingCapital: {
            value: '85000.0000',
            status: 'COMPUTED',
            dataLimitations: [],
            sourceRecordIds: { accountIds: ['acc-1'] },
          },
          budgetVariance: {
            value: '12.0000',
            status: 'COMPUTED',
            dataLimitations: [],
            sourceRecordIds: { budgetIds: ['bud-1'] },
          },
          receivableAging: {
            value: { totalOverdue: '4500.0000' },
            status: 'COMPUTED',
            dataLimitations: [],
            sourceRecordIds: { invoiceIds: ['inv-1'] },
          },
          payableAging: {
            value: { totalOverdue: '1200.0000' },
            status: 'COMPUTED',
            dataLimitations: [],
            sourceRecordIds: { billIds: ['bill-1'] },
          },
        },
      }),
    };

    const transactionsStub = {
      listAccounts: async () => [
        { id: 'acc-1', name: 'Operating Account', currentBalance: '95000.0000' },
      ],
      listTransactions: async () => ({
        items: [{ id: 'tx-1', amount: '25000.0000' }],
        pagination: { total: 1 },
      }),
    };

    const forecastingStub = {
      listForecasts: async () => [
        {
          id: 'fc-1',
          horizonDays: 30,
          scenarioType: 'BASE',
          openingCashBalance: '95000.0000',
          projectedClosingCash: '112000.0000',
          minimumProjectedCash: '88000.0000',
          hasLiquidityWarning: false,
          assumptions: { scenarioType: 'BASE' },
          sourceRecordIds: { accountIds: ['acc-1'] },
        },
      ],
      getForecastById: async () => ({
        id: 'fc-1',
        horizonDays: 30,
        scenarioType: 'BASE',
        openingCashBalance: '95000.0000',
        projectedClosingCash: '112000.0000',
        minimumProjectedCash: '88000.0000',
        hasLiquidityWarning: false,
        assumptions: { scenarioType: 'BASE' },
        sourceRecordIds: { accountIds: ['acc-1'] },
      }),
    };

    const riskStub = {
      listAlerts: async () => [
        {
          id: 'alert-1',
          type: 'UNUSUAL_AMOUNT',
          severity: 'MEDIUM',
          status: 'OPEN',
          title: 'Outlier',
        },
      ],
      runAnomalyAndRiskScan: async () => ({
        alerts: [{ id: 'alert-1', type: 'UNUSUAL_AMOUNT', severity: 'MEDIUM', status: 'OPEN' }],
      }),
    };

    const agingStub = {
      computeAgingReport: async () => ({
        receivablesAging: { totalOverdue: '4500.0000', sourceRecordIds: ['inv-1'] },
        payablesAging: { totalOverdue: '1200.0000', sourceRecordIds: ['bill-1'] },
      }),
    };

    const budgetsStub = {
      listBudgets: async () => [{ id: 'bud-1', name: 'Q4 Budget' }],
      calculateBudgetVariance: async () => ({
        budgetId: 'bud-1',
        lines: [{ sourceTransactionIds: ['tx-1'] }],
      }),
    };

    const scenarioStub = {
      listScenarios: async () => [
        {
          id: 'scen-1',
          name: 'Stress Test',
          results: [{ netCashImpact: '-5000.0000', scenarioClosingCash: '107000.0000' }],
        },
      ],
    };

    const finMemoryStub = {
      listSnapshots: async () => [{ id: 'snap-1', periodKey: '2026-10' }],
    };

    toolRegistry = new ToolRegistryService(
      sandbox,
      analyticsStub as never,
      transactionsStub as never,
      forecastingStub as never,
      riskStub as never,
      agingStub as never,
      budgetsStub as never,
      scenarioStub as never,
      finMemoryStub as never,
    );

    const configStub = {
      get: (key: string) => {
        if (key === 'AI_PROVIDER') return 'deterministic-grounded';
        return undefined;
      },
    } as unknown as ConfigService;

    mcp = new McpIntegrationService(configStub, toolRegistry, auditStub);
    modelProvider = new AiModelProviderService(configStub);
    skillsRegistry = new AgentSkillsRegistryService(mcp, modelProvider, auditStub);
  });

  describe('1. Sandbox Restrictions & Blocked Operations Logging', () => {
    it('blocks direct database access, shell execution, secret access, and automatic fund transfers', async () => {
      const ctx = sandbox.createSandboxContext({
        workflowRunId: 'wf-1',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        actorRole: RoleType.FINANCIAL_ANALYST,
        agentType: AgentType.FINANCE_DATA_ANALYST,
      });

      await expect(
        sandbox.assertToolExecutionPermitted(ctx, 'raw_database_query', 'org-1'),
      ).rejects.toThrow(/prohibited by platform security policy/);

      await expect(
        sandbox.assertToolExecutionPermitted(ctx, 'shell_execute', 'org-1'),
      ).rejects.toThrow(/prohibited by platform security policy/);

      await expect(
        sandbox.assertToolExecutionPermitted(ctx, 'initiate_payment_transfer', 'org-1'),
      ).rejects.toThrow(/prohibited by platform security policy/);

      expect(ctx.blockedOperations).toHaveLength(3);
      expect(recordedAudits.filter((a) => a.status === 'BLOCKED_BY_SANDBOX').length).toBe(3);
    });

    it('blocks cross-organization data access attempts inside the sandbox', async () => {
      const ctx = sandbox.createSandboxContext({
        workflowRunId: 'wf-1',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        actorRole: RoleType.FINANCIAL_ANALYST,
        agentType: AgentType.FINANCE_DATA_ANALYST,
      });

      await expect(
        sandbox.assertToolExecutionPermitted(
          ctx,
          'mcp.finance.get_deterministic_metrics',
          'org-2-other-tenant',
        ),
      ).rejects.toThrow(/cross-organization data access is strictly prohibited/);

      expect(ctx.blockedOperations[0].reason).toContain('Cross-organization access blocked');
    });

    it('enforces cancellation and timeout boundaries on sandbox execution', async () => {
      const ctx = sandbox.createSandboxContext({
        workflowRunId: 'wf-1',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        actorRole: RoleType.FINANCIAL_ANALYST,
        agentType: AgentType.FINANCE_DATA_ANALYST,
        maxExecutionMs: 30,
      });

      await expect(
        sandbox.executeWithinTimeout(
          ctx,
          'slow_op',
          () => new Promise((resolve) => setTimeout(resolve, 120)),
        ),
      ).rejects.toThrow(/timed out/);

      sandbox.cancelSandbox(ctx.sandboxId);
      await expect(
        sandbox.assertToolExecutionPermitted(ctx, 'mcp.finance.get_deterministic_metrics', 'org-1'),
      ).rejects.toThrow(/cancelled/);
    });
  });

  describe('2. MCP Server Discovery, Tool Registry & Validation', () => {
    it('discovers connected MCP servers and maps approved tools to specialist agents', async () => {
      const discovery = mcp.discoverTools(AgentType.FINANCE_DATA_ANALYST);
      expect(discovery.connectedServers.length).toBeGreaterThanOrEqual(1);
      expect(discovery.tools.some((t) => t.name === 'mcp.finance.get_deterministic_metrics')).toBe(
        true,
      );
      expect(discovery.tools.some((t) => t.name === 'mcp.scenario.simulate_what_if_scenario')).toBe(
        false,
      );
    });

    it('blocks an agent from invoking an MCP tool outside its allowlist', async () => {
      const ctx = sandbox.createSandboxContext({
        workflowRunId: 'wf-1',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        actorRole: RoleType.FINANCIAL_ANALYST,
        agentType: AgentType.SCENARIO_PLANNING,
      });

      // SCENARIO_PLANNING is not authorized for mcp.budget.get_budget_variance_summary
      await expect(
        mcp.invokeTool('mcp.budget.get_budget_variance_summary', { organizationId: 'org-1' }, ctx),
      ).rejects.toThrow(/not authorized to invoke tool/);
    });

    it('validates MCP tool inputs, external MCP JSON-RPC responses, and handles unavailable MCP servers safely', async () => {
      const ctx = sandbox.createSandboxContext({
        workflowRunId: 'wf-1',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        actorRole: RoleType.FINANCIAL_ANALYST,
        agentType: AgentType.FINANCE_DATA_ANALYST,
      });

      // Rejects unpermitted input field
      await expect(
        mcp.invokeTool(
          'mcp.finance.get_deterministic_metrics',
          { organizationId: 'org-1', unpermittedField: 'bad' },
          ctx,
        ),
      ).rejects.toThrow(/rejected unpermitted input field/);

      // Validates external MCP response structure
      expect(() => mcp.validateExternalMcpResponse(null)).toThrow();
      expect(() => mcp.validateExternalMcpResponse({ error: 'Upstream failure' })).toThrow();
      expect(mcp.validateExternalMcpResponse({ jsonrpc: '2.0', result: { ok: true } })).toEqual({
        ok: true,
      });

      // Handles unavailable server safely
      mcp.setServerStatusForTesting('sme-financial-mcp-core', 'UNAVAILABLE');
      await expect(
        mcp.invokeTool('mcp.finance.get_deterministic_metrics', { organizationId: 'org-1' }, ctx),
      ).rejects.toThrow(/currently unavailable/);
      mcp.setServerStatusForTesting('sme-financial-mcp-core', 'CONNECTED');
    });
  });

  describe('3. Reusable AI Agent Skills Registry & Execution', () => {
    it('registers task-specific Skills for all 8 specialist agents and executes them with output validation', async () => {
      const allSkills = skillsRegistry.listSkills();
      expect(allSkills.length).toBeGreaterThanOrEqual(8);

      const specialistAgents = [
        AgentType.FINANCE_DATA_ANALYST,
        AgentType.CASH_FLOW_FORECASTING,
        AgentType.EXPENSE_ANOMALY_DETECTION,
        AgentType.FINANCIAL_RISK_ASSESSMENT,
        AgentType.SCENARIO_PLANNING,
        AgentType.STRATEGIC_RECOMMENDATION,
        AgentType.FINANCIAL_REPORTING,
        AgentType.VERIFIER_AI,
      ];

      for (const agent of specialistAgents) {
        const agentSkills = skillsRegistry.getSkillsForAgent(agent);
        expect(agentSkills.length).toBeGreaterThanOrEqual(1);
      }

      const ctx = sandbox.createSandboxContext({
        workflowRunId: 'wf-2',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        actorRole: RoleType.FINANCE_MANAGER,
        agentType: AgentType.FINANCE_DATA_ANALYST,
      });

      const execResult = await skillsRegistry.executeSkill(
        'skill.financial-data-analysis',
        { organizationId: 'org-1', prompt: 'Analyze current ratio and cash flow' },
        ctx,
      );

      expect(execResult.skillId).toBe('skill.financial-data-analysis');
      expect(execResult.output.keyMetrics).toBeDefined();
      expect(execResult.invokedMcpTools).toContain('mcp.finance.get_deterministic_metrics');
      expect(execResult.modelUsage.totalTokens).toBeGreaterThan(0);
    });

    it('prevents an agent from executing a Skill mapped to a different specialist agent', async () => {
      const ctx = sandbox.createSandboxContext({
        workflowRunId: 'wf-3',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        actorRole: RoleType.FINANCE_MANAGER,
        agentType: AgentType.EXPENSE_ANOMALY_DETECTION,
      });

      await expect(
        skillsRegistry.executeSkill(
          'skill.scenario-planning',
          { organizationId: 'org-1', prompt: 'Try running scenario skill' },
          ctx,
        ),
      ).rejects.toThrow(/not authorized to execute Skill/);
    });
  });

  describe('4. AI Model Provider Integration & Secret Protection', () => {
    it('tracks model usage, never exposes API secrets, and recovers gracefully when an external provider fails', async () => {
      const summary = modelProvider.getProviderConfigurationSummary();
      expect(summary.secretsExposed).toBe(false);
      expect(JSON.stringify(summary)).not.toContain('sk-');

      // Simulate external provider with unreachable endpoint to verify automatic fallback recovery
      const failingProviderConfig = {
        get: (key: string) => {
          if (key === 'AI_PROVIDER') return 'openai';
          if (key === 'AI_OPENAI_API_KEY') return 'sk-test-never-expose-key';
          if (key === 'AI_BASE_URL') return 'http://127.0.0.1:1/unreachable';
          if (key === 'AI_TIMEOUT_MS') return '500';
          if (key === 'AI_MAX_RETRIES') return '1';
          return undefined;
        },
      } as unknown as ConfigService;

      const resilientProvider = new AiModelProviderService(failingProviderConfig);
      const res = await resilientProvider.executeStructuredTask({
        organizationId: 'org-1',
        agentType: AgentType.FINANCE_DATA_ANALYST,
        skillId: 'skill.financial-data-analysis',
        systemInstructions: 'Return JSON',
        userPrompt: 'Analyze metrics',
        deterministicEvidence: { operatingCashFlow: '25000.0000' },
        requiredOutputKeys: ['summary', 'operatingCashFlow'],
        deterministicSynthesisBuilder: () => ({
          summary: 'Grounded fallback succeeded',
          operatingCashFlow: '25000.0000',
        }),
      });

      expect(res.structuredOutput.operatingCashFlow).toBe('25000.0000');
      expect(res.usage.status).toBe('FALLBACK_USED');
      expect(res.usage.attempts).toBe(2);
    });
  });
});
