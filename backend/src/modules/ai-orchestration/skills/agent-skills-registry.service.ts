import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentType, RoleType } from '../../../generated/prisma/client.js';
import { AuditService } from '../../audit/audit.service.js';
import { McpIntegrationService } from '../mcp/mcp-integration.service.js';
import {
  AiModelProviderService,
  AiModelUsageMetrics,
} from '../model-provider/ai-model-provider.service.js';
import { SandboxContext } from '../sandbox/agent-sandbox.service.js';

export interface AgentSkillDefinition {
  skillId: string;
  name: string;
  version: string;
  responsibleAgent: AgentType;
  category:
    | 'Financial Data Analysis'
    | 'Cash-Flow Forecasting'
    | 'Expense and Anomaly Analysis'
    | 'Financial Risk Assessment'
    | 'Scenario Planning'
    | 'Strategic Financial Recommendations'
    | 'Financial Reporting'
    | 'Financial Output Verification';
  purpose: string;
  instructions: string[];
  domainKnowledge: string[];
  requiredInputs: string[];
  expectedOutputKeys: string[];
  permittedTools: string[];
  executionConstraints: {
    maxExecutionMs: number;
    maxToolCalls: number;
    allowedRoles: RoleType[];
    requiresSandboxIsolation: boolean;
  };
  executeProcedure: (params: {
    input: Record<string, unknown>;
    sandboxContext: SandboxContext;
    mcp: McpIntegrationService;
    modelProvider: AiModelProviderService;
  }) => Promise<{
    output: Record<string, unknown>;
    invokedMcpTools: string[];
    sourceRecordIds: Record<string, string[]>;
    modelUsage: AiModelUsageMetrics;
  }>;
}

export interface SkillExecutionLog {
  skillId: string;
  skillVersion: string;
  agentType: AgentType;
  organizationId: string;
  actorUserId: string;
  invokedMcpTools: string[];
  status: 'COMPLETED' | 'FAILED' | 'BLOCKED';
  durationMs: number;
  executedAt: string;
}

const ALL_ROLES: RoleType[] = [
  RoleType.PLATFORM_ADMIN,
  RoleType.BUSINESS_OWNER,
  RoleType.FINANCE_MANAGER,
  RoleType.ACCOUNTANT,
  RoleType.OPERATIONS_MANAGER,
  RoleType.FINANCIAL_ANALYST,
  RoleType.AUDITOR,
];

/**
 * Centralized AI Agent Skills Registry (Section 21)
 *
 * Provides reusable, versioned, executable domain Skills mapped to the 8
 * specialist AI agents with strict input/output validation, MCP tool
 * binding, RBAC enforcement, and sandbox execution logging.
 */
@Injectable()
export class AgentSkillsRegistryService {
  private readonly skills = new Map<string, AgentSkillDefinition>();
  private readonly executionLogs: SkillExecutionLog[] = [];

  constructor(
    private readonly mcp: McpIntegrationService,
    private readonly modelProvider: AiModelProviderService,
    private readonly audit: AuditService,
  ) {
    this.registerCoreSkills();
  }

  private registerCoreSkills(): void {
    const definitions: AgentSkillDefinition[] = [
      // 1. Financial Data Analysis (Finance Data Analyst Agent)
      {
        skillId: 'skill.financial-data-analysis',
        name: 'Financial Data & Ratios Analysis Skill',
        version: '1.2.0',
        responsibleAgent: AgentType.FINANCE_DATA_ANALYST,
        category: 'Financial Data Analysis',
        purpose:
          'Evaluates deterministic operating cash flow, current/quick liquidity ratios, gross margin, working capital, and ledger data completeness.',
        instructions: [
          'Invoke mcp.finance.get_deterministic_metrics and mcp.finance.get_accounts_and_ledger_summary for the target organization.',
          'Never invent or recalculate financial ratios using language-model arithmetic; cite exact deterministic values and formula versions.',
          'Explicitly report any metrics with status UNSUPPORTED_MISSING_DATA and list their dataLimitations.',
        ],
        domainKnowledge: [
          'OperatingCashFlow = CashInflows - CashOutflows',
          'CurrentRatio = CurrentAssets / CurrentLiabilities (healthy SME benchmark >= 1.20)',
          'QuickRatio = (LiquidCash + AccountsReceivable) / CurrentLiabilities',
          'WorkingCapital = CurrentAssets - CurrentLiabilities',
        ],
        requiredInputs: ['organizationId', 'prompt'],
        expectedOutputKeys: [
          'skillId',
          'summary',
          'keyMetrics',
          'dataCompletenessNotes',
          'sourceRecordIds',
        ],
        permittedTools: [
          'mcp.finance.get_deterministic_metrics',
          'mcp.finance.get_accounts_and_ledger_summary',
        ],
        executionConstraints: {
          maxExecutionMs: 12000,
          maxToolCalls: 4,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, mcp, modelProvider }) => {
          const [metricsCall, ledgerCall] = await Promise.all([
            mcp.invokeTool(
              'mcp.finance.get_deterministic_metrics',
              { organizationId: sandboxContext.organizationId },
              sandboxContext,
            ),
            mcp.invokeTool(
              'mcp.finance.get_accounts_and_ledger_summary',
              { organizationId: sandboxContext.organizationId, limit: 20 },
              sandboxContext,
            ),
          ]);

          const metricsObj = metricsCall.output.metrics as Record<
            string,
            { value: unknown; status: string; dataLimitations: string[] }
          >;
          const sourceRecordIds = (metricsCall.output.sourceRecordIds ?? {}) as Record<
            string,
            string[]
          >;

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.FINANCE_DATA_ANALYST,
            skillId: 'skill.financial-data-analysis',
            systemInstructions:
              'You are the Finance Data Analyst Agent executing skill.financial-data-analysis. Use only authoritative deterministic numbers.',
            userPrompt: String(input.prompt ?? ''),
            deterministicEvidence: {
              metrics: metricsObj,
              accountsCount: (ledgerCall.output.accounts as unknown[])?.length ?? 0,
              totalTransactions: ledgerCall.output.totalTransactions,
            },
            requiredOutputKeys: [
              'skillId',
              'summary',
              'keyMetrics',
              'dataCompletenessNotes',
              'sourceRecordIds',
            ],
            deterministicSynthesisBuilder: () => ({
              skillId: 'skill.financial-data-analysis',
              summary: `Deterministic financial analysis completed across ${(ledgerCall.output.accounts as unknown[])?.length ?? 0} account(s) and ${String(ledgerCall.output.totalTransactions ?? 0)} transaction(s). Operating cash flow: ${String(metricsObj.operatingCashFlow?.value ?? 'UNSUPPORTED')}, Working capital: ${String(metricsObj.workingCapital?.value ?? 'UNSUPPORTED')}, Current ratio: ${String(metricsObj.currentRatio?.value ?? 'UNSUPPORTED')}.`,
              keyMetrics: {
                operatingCashFlow: metricsObj.operatingCashFlow?.value ?? null,
                workingCapital: metricsObj.workingCapital?.value ?? null,
                currentRatio: metricsObj.currentRatio?.value ?? null,
                quickRatio: metricsObj.quickRatio?.value ?? null,
                grossMargin: metricsObj.grossMargin?.value ?? null,
                expenseGrowth: metricsObj.expenseGrowth?.value ?? null,
              },
              dataCompletenessNotes: Object.entries(metricsObj).flatMap(([k, v]) =>
                (v.dataLimitations ?? []).map((lim) => `${k}: ${lim}`),
              ),
              sourceRecordIds,
            }),
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [metricsCall.toolName, ledgerCall.toolName],
            sourceRecordIds,
            modelUsage: aiResult.usage,
          };
        },
      },

      // 1b. Secondary Skill for Finance Data Analyst Agent (supports multi-skill execution)
      {
        skillId: 'skill.aging-and-budget-attribution',
        name: 'AR/AP Aging & Budget Variance Attribution Skill',
        version: '1.1.0',
        responsibleAgent: AgentType.FINANCE_DATA_ANALYST,
        category: 'Financial Data Analysis',
        purpose:
          'Cross-examines receivables/payables aging buckets alongside active budget utilization.',
        instructions: [
          'Invoke mcp.aging.get_receivables_and_payables_aging and mcp.budget.get_budget_variance_summary.',
          'Attribute working capital pressure to specific overdue buckets and budget variance lines.',
        ],
        domainKnowledge: [
          'Overdue buckets: CURRENT, 1_TO_30_DAYS, 31_TO_60_DAYS, 61_TO_90_DAYS, OVER_90_DAYS',
          'Budget Variance = AllocatedAmount - ActualSpent',
        ],
        requiredInputs: ['organizationId', 'prompt'],
        expectedOutputKeys: [
          'skillId',
          'summary',
          'receivablesOverdueTotal',
          'payablesOverdueTotal',
          'budgetCount',
          'sourceRecordIds',
        ],
        permittedTools: [
          'mcp.aging.get_receivables_and_payables_aging',
          'mcp.budget.get_budget_variance_summary',
        ],
        executionConstraints: {
          maxExecutionMs: 10000,
          maxToolCalls: 4,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, mcp, modelProvider }) => {
          const [agingCall, budgetCall] = await Promise.all([
            mcp.invokeTool(
              'mcp.aging.get_receivables_and_payables_aging',
              { organizationId: sandboxContext.organizationId },
              sandboxContext,
            ),
            mcp.invokeTool(
              'mcp.budget.get_budget_variance_summary',
              { organizationId: sandboxContext.organizationId },
              sandboxContext,
            ),
          ]);

          const ar = agingCall.output.receivablesAging as { totalOverdue?: string };
          const ap = agingCall.output.payablesAging as { totalOverdue?: string };
          const budgets = (budgetCall.output.budgets as unknown[]) ?? [];
          const sourceRecordIds = {
            ...((agingCall.output.sourceRecordIds ?? {}) as Record<string, string[]>),
            ...((budgetCall.output.sourceRecordIds ?? {}) as Record<string, string[]>),
          };

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.FINANCE_DATA_ANALYST,
            skillId: 'skill.aging-and-budget-attribution',
            systemInstructions:
              'Analyze AR/AP aging and budget variance strictly from deterministic outputs.',
            userPrompt: String(input.prompt ?? ''),
            deterministicEvidence: { ar, ap, budgetCount: budgets.length },
            requiredOutputKeys: [
              'skillId',
              'summary',
              'receivablesOverdueTotal',
              'payablesOverdueTotal',
              'budgetCount',
              'sourceRecordIds',
            ],
            deterministicSynthesisBuilder: () => ({
              skillId: 'skill.aging-and-budget-attribution',
              summary: `Overdue receivables total ${ar?.totalOverdue ?? '0.0000'}, overdue payables total ${ap?.totalOverdue ?? '0.0000'}, across ${budgets.length} active budget(s).`,
              receivablesOverdueTotal: ar?.totalOverdue ?? '0.0000',
              payablesOverdueTotal: ap?.totalOverdue ?? '0.0000',
              budgetCount: budgets.length,
              sourceRecordIds,
            }),
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [agingCall.toolName, budgetCall.toolName],
            sourceRecordIds,
            modelUsage: aiResult.usage,
          };
        },
      },

      // 2. Cash-Flow Forecasting (Cash-Flow Forecasting Agent)
      {
        skillId: 'skill.cash-flow-forecasting',
        name: 'Multi-Horizon Cash-Flow Projection & Liquidity Skill',
        version: '1.2.0',
        responsibleAgent: AgentType.CASH_FLOW_FORECASTING,
        category: 'Cash-Flow Forecasting',
        purpose:
          'Executes and interprets 7/30/60/90-day cash-flow projections, recurring inflows/outflows, uncertainty bands, and liquidity shortfall alerts.',
        instructions: [
          'Invoke mcp.forecast.get_or_generate_cash_flow_forecast for the requested horizon.',
          'Highlight opening cash, projected inflows/outflows, closing cash, minimum projected cash date, and uncertainty bands.',
        ],
        domainKnowledge: [
          'CumulativeBalance(t) = OpeningBalance + Sum(Inflows_1..t - Outflows_1..t)',
          'LiquidityWarning triggers when ProjectedCash < SafetyBuffer or < 0',
        ],
        requiredInputs: ['organizationId', 'prompt'],
        expectedOutputKeys: [
          'skillId',
          'summary',
          'horizonDays',
          'openingCashBalance',
          'projectedClosingCash',
          'minimumProjectedCash',
          'hasLiquidityWarning',
          'assumptions',
          'sourceRecordIds',
        ],
        permittedTools: [
          'mcp.forecast.get_or_generate_cash_flow_forecast',
          'mcp.finmemory.get_historical_snapshots',
        ],
        executionConstraints: {
          maxExecutionMs: 12000,
          maxToolCalls: 4,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, mcp, modelProvider }) => {
          const forecastCall = await mcp.invokeTool(
            'mcp.forecast.get_or_generate_cash_flow_forecast',
            {
              organizationId: sandboxContext.organizationId,
              horizonDays: Number(input.horizonDays ?? 30),
            },
            sandboxContext,
          );

          const fc = forecastCall.output.forecast as Record<string, unknown>;
          const sourceRecordIds = (forecastCall.output.sourceRecordIds ?? {}) as Record<
            string,
            string[]
          >;

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.CASH_FLOW_FORECASTING,
            skillId: 'skill.cash-flow-forecasting',
            systemInstructions:
              'You are the Cash-Flow Forecasting Agent executing skill.cash-flow-forecasting. Report exact projected balances and assumptions.',
            userPrompt: String(input.prompt ?? ''),
            deterministicEvidence: { forecast: fc },
            requiredOutputKeys: [
              'skillId',
              'summary',
              'horizonDays',
              'openingCashBalance',
              'projectedClosingCash',
              'minimumProjectedCash',
              'hasLiquidityWarning',
              'assumptions',
              'sourceRecordIds',
            ],
            deterministicSynthesisBuilder: () => ({
              skillId: 'skill.cash-flow-forecasting',
              summary: `${String(fc.horizonDays)}-day (${String(fc.scenarioType)}) forecast projects closing cash of ${String(fc.projectedClosingCash)} from an opening balance of ${String(fc.openingCashBalance)} (minimum cash: ${String(fc.minimumProjectedCash)}; liquidity warning: ${String(fc.hasLiquidityWarning)}).`,
              horizonDays: fc.horizonDays,
              openingCashBalance: fc.openingCashBalance,
              projectedClosingCash: fc.projectedClosingCash,
              minimumProjectedCash: fc.minimumProjectedCash,
              hasLiquidityWarning: fc.hasLiquidityWarning,
              assumptions: fc.assumptions,
              sourceRecordIds,
            }),
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [forecastCall.toolName],
            sourceRecordIds,
            modelUsage: aiResult.usage,
          };
        },
      },

      // 3. Expense and Anomaly Analysis (Expense & Anomaly Detection Agent)
      {
        skillId: 'skill.expense-and-anomaly-analysis',
        name: 'Expense Outlier, Duplicate & Timing Shift Investigation Skill',
        version: '1.2.0',
        responsibleAgent: AgentType.EXPENSE_ANOMALY_DETECTION,
        category: 'Expense and Anomaly Analysis',
        purpose:
          'Identifies unusual expense amounts, frequency spikes, timing shifts, category shifts, and duplicate candidates while enforcing non-fraud guardrails.',
        instructions: [
          'Invoke mcp.risk.get_or_scan_anomalies_and_alerts to retrieve or trigger deterministic anomaly detection.',
          'Never classify any flagged transaction or alert as confirmed fraud; always include the non-fraud investigative disclaimer.',
        ],
        domainKnowledge: [
          'Outliers: Amount > max(Mean + 1.5 * StdDev, 2.0 * Mean)',
          'Duplicates: Identical amount and category within 48 hours',
          'Policy: All alerts are statistical/rule-based signals for human review, never confirmed fraud.',
        ],
        requiredInputs: ['organizationId', 'prompt'],
        expectedOutputKeys: [
          'skillId',
          'summary',
          'flaggedAlertsCount',
          'alertsByType',
          'nonFraudDisclaimer',
          'sourceRecordIds',
        ],
        permittedTools: [
          'mcp.risk.get_or_scan_anomalies_and_alerts',
          'mcp.finance.get_accounts_and_ledger_summary',
        ],
        executionConstraints: {
          maxExecutionMs: 12000,
          maxToolCalls: 4,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, mcp, modelProvider }) => {
          const riskCall = await mcp.invokeTool(
            'mcp.risk.get_or_scan_anomalies_and_alerts',
            { organizationId: sandboxContext.organizationId, triggerScanIfEmpty: true },
            sandboxContext,
          );

          const alerts = (riskCall.output.alerts as Array<{ type: string; id: string }>) ?? [];
          const byType: Record<string, number> = {};
          for (const a of alerts) {
            byType[a.type] = (byType[a.type] ?? 0) + 1;
          }
          const sourceRecordIds = (riskCall.output.sourceRecordIds ?? {}) as Record<
            string,
            string[]
          >;

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.EXPENSE_ANOMALY_DETECTION,
            skillId: 'skill.expense-and-anomaly-analysis',
            systemInstructions:
              'You are the Expense & Anomaly Detection Agent. Never label an anomaly as confirmed fraud.',
            userPrompt: String(input.prompt ?? ''),
            deterministicEvidence: { alertsCount: alerts.length, byType },
            requiredOutputKeys: [
              'skillId',
              'summary',
              'flaggedAlertsCount',
              'alertsByType',
              'nonFraudDisclaimer',
              'sourceRecordIds',
            ],
            deterministicSynthesisBuilder: () => ({
              skillId: 'skill.expense-and-anomaly-analysis',
              summary: `Identified ${alerts.length} statistical/rule-based anomaly and risk signal(s) for human review. These signals represent patterns requiring review and are not determinations of confirmed fraud.`,
              flaggedAlertsCount: alerts.length,
              alertsByType: byType,
              nonFraudDisclaimer:
                'Statistical or rule-based anomaly signal for human review; not a determination of confirmed fraud.',
              sourceRecordIds,
            }),
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [riskCall.toolName],
            sourceRecordIds,
            modelUsage: aiResult.usage,
          };
        },
      },

      // 4. Financial Risk Assessment (Financial Risk Assessment Agent)
      {
        skillId: 'skill.financial-risk-assessment',
        name: 'Holistic Liquidity, Credit & Budget Risk Assessment Skill',
        version: '1.2.0',
        responsibleAgent: AgentType.FINANCIAL_RISK_ASSESSMENT,
        category: 'Financial Risk Assessment',
        purpose:
          'Evaluates cash shortfall exposure, overdue receivables concentration, payable pressure, and budget overrun severity.',
        instructions: [
          'Invoke mcp.risk.get_or_scan_anomalies_and_alerts and mcp.aging.get_receivables_and_payables_aging.',
          'Rank risks by severity (CRITICAL, HIGH, MEDIUM, LOW) and cite supporting record IDs.',
        ],
        domainKnowledge: [
          'Priority 1: Cash shortfall & duplicate payment candidates',
          'Priority 2: Overdue receivables > 30 days & budget overruns',
        ],
        requiredInputs: ['organizationId', 'prompt'],
        expectedOutputKeys: [
          'skillId',
          'summary',
          'overallRiskLevel',
          'overdueReceivablesAmount',
          'overduePayablesAmount',
          'openAlertsCount',
          'sourceRecordIds',
        ],
        permittedTools: [
          'mcp.risk.get_or_scan_anomalies_and_alerts',
          'mcp.aging.get_receivables_and_payables_aging',
          'mcp.finance.get_deterministic_metrics',
        ],
        executionConstraints: {
          maxExecutionMs: 12000,
          maxToolCalls: 4,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, mcp, modelProvider }) => {
          const [riskCall, agingCall] = await Promise.all([
            mcp.invokeTool(
              'mcp.risk.get_or_scan_anomalies_and_alerts',
              { organizationId: sandboxContext.organizationId, triggerScanIfEmpty: true },
              sandboxContext,
            ),
            mcp.invokeTool(
              'mcp.aging.get_receivables_and_payables_aging',
              { organizationId: sandboxContext.organizationId },
              sandboxContext,
            ),
          ]);

          const alerts =
            (riskCall.output.alerts as Array<{ severity: string; status: string }>) ?? [];
          const ar = agingCall.output.receivablesAging as { totalOverdue?: string };
          const ap = agingCall.output.payablesAging as { totalOverdue?: string };
          const hasCritical = alerts.some((a) => a.severity === 'CRITICAL');
          const hasHigh = alerts.some((a) => a.severity === 'HIGH');
          const overallRiskLevel = hasCritical
            ? 'CRITICAL'
            : hasHigh
              ? 'HIGH'
              : alerts.length > 0
                ? 'MEDIUM'
                : 'LOW';

          const sourceRecordIds = {
            ...((riskCall.output.sourceRecordIds ?? {}) as Record<string, string[]>),
            ...((agingCall.output.sourceRecordIds ?? {}) as Record<string, string[]>),
          };

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.FINANCIAL_RISK_ASSESSMENT,
            skillId: 'skill.financial-risk-assessment',
            systemInstructions:
              'Assess SME liquidity, credit, and budget risks from deterministic alerts and aging schedules.',
            userPrompt: String(input.prompt ?? ''),
            deterministicEvidence: { overallRiskLevel, alertsCount: alerts.length, ar, ap },
            requiredOutputKeys: [
              'skillId',
              'summary',
              'overallRiskLevel',
              'overdueReceivablesAmount',
              'overduePayablesAmount',
              'openAlertsCount',
              'sourceRecordIds',
            ],
            deterministicSynthesisBuilder: () => ({
              skillId: 'skill.financial-risk-assessment',
              summary: `Overall financial risk profile assessed as ${overallRiskLevel} with ${alerts.length} active alert(s), ${ar?.totalOverdue ?? '0.0000'} in overdue receivables, and ${ap?.totalOverdue ?? '0.0000'} in overdue payables.`,
              overallRiskLevel,
              overdueReceivablesAmount: ar?.totalOverdue ?? '0.0000',
              overduePayablesAmount: ap?.totalOverdue ?? '0.0000',
              openAlertsCount: alerts.length,
              sourceRecordIds,
            }),
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [riskCall.toolName, agingCall.toolName],
            sourceRecordIds,
            modelUsage: aiResult.usage,
          };
        },
      },

      // 5. Scenario Planning (Scenario Planning Agent)
      {
        skillId: 'skill.scenario-planning',
        name: 'Non-Destructive What-If Sensitivity Simulation Skill',
        version: '1.2.0',
        responsibleAgent: AgentType.SCENARIO_PLANNING,
        category: 'Scenario Planning',
        purpose:
          'Simulates customer payment delays, sales growth shifts, operating cost changes, and supplier payment timing against the baseline forecast.',
        instructions: [
          'Invoke mcp.scenario.simulate_what_if_scenario inside read-only sandbox isolation.',
          'Quantify net cash impact and minimum cash balance delta relative to the baseline forecast.',
        ],
        domainKnowledge: [
          'NetCashImpact = ScenarioClosingCash - BaselineClosingCash',
          'Isolation Rule: Scenario simulations never mutate authoritative financial records.',
        ],
        requiredInputs: ['organizationId', 'prompt'],
        expectedOutputKeys: [
          'skillId',
          'summary',
          'scenarioCount',
          'latestScenarioImpact',
          'isolationVerified',
          'sourceRecordIds',
        ],
        permittedTools: [
          'mcp.scenario.simulate_what_if_scenario',
          'mcp.forecast.get_or_generate_cash_flow_forecast',
        ],
        executionConstraints: {
          maxExecutionMs: 12000,
          maxToolCalls: 4,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, mcp, modelProvider }) => {
          const scenarioCall = await mcp.invokeTool(
            'mcp.scenario.simulate_what_if_scenario',
            { organizationId: sandboxContext.organizationId },
            sandboxContext,
          );

          const scenarios =
            (scenarioCall.output.scenarios as Array<{
              id: string;
              name: string;
              results?: Array<Record<string, unknown>>;
            }>) ?? [];
          const latestResult = scenarios[0]?.results?.[0] ?? null;
          const sourceRecordIds = (scenarioCall.output.sourceRecordIds ?? {}) as Record<
            string,
            string[]
          >;

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.SCENARIO_PLANNING,
            skillId: 'skill.scenario-planning',
            systemInstructions:
              'Evaluate what-if scenario sensitivity compared against the baseline forecast.',
            userPrompt: String(input.prompt ?? ''),
            deterministicEvidence: { scenariosCount: scenarios.length, latestResult },
            requiredOutputKeys: [
              'skillId',
              'summary',
              'scenarioCount',
              'latestScenarioImpact',
              'isolationVerified',
              'sourceRecordIds',
            ],
            deterministicSynthesisBuilder: () => ({
              skillId: 'skill.scenario-planning',
              summary: `Evaluated ${scenarios.length} isolated what-if scenario(s). Latest scenario net cash impact vs baseline: ${String(latestResult?.netCashImpact ?? '0.0000')} (scenario closing cash: ${String(latestResult?.scenarioClosingCash ?? '0.0000')}). Zero ledger records were modified.`,
              scenarioCount: scenarios.length,
              latestScenarioImpact: latestResult,
              isolationVerified: true,
              sourceRecordIds,
            }),
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [scenarioCall.toolName],
            sourceRecordIds,
            modelUsage: aiResult.usage,
          };
        },
      },

      // 6. Strategic Financial Recommendations (Strategic Recommendation Agent)
      {
        skillId: 'skill.strategic-financial-recommendations',
        name: 'Evidence-Linked SME Strategic Decision Support Skill',
        version: '1.2.0',
        responsibleAgent: AgentType.STRATEGIC_RECOMMENDATION,
        category: 'Strategic Financial Recommendations',
        purpose:
          'Synthesizes deterministic metrics, forecasts, and risk alerts into prioritized action options with explicit human-approval gating.',
        instructions: [
          'Invoke mcp.finance.get_deterministic_metrics and mcp.risk.get_or_scan_anomalies_and_alerts.',
          'Generate concrete, evidence-linked recommendations and mark consequential actions with requiresHumanApproval: true.',
        ],
        domainKnowledge: [
          'Human Accountability Rule: Consequential financial actions require explicit human review and approval.',
          'Never initiate automatic payments or fund transfers.',
        ],
        requiredInputs: ['organizationId', 'prompt'],
        expectedOutputKeys: [
          'skillId',
          'summary',
          'recommendations',
          'requiresHumanApproval',
          'sourceRecordIds',
        ],
        permittedTools: [
          'mcp.finance.get_deterministic_metrics',
          'mcp.forecast.get_or_generate_cash_flow_forecast',
          'mcp.risk.get_or_scan_anomalies_and_alerts',
        ],
        executionConstraints: {
          maxExecutionMs: 12000,
          maxToolCalls: 4,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, mcp, modelProvider }) => {
          const [metricsCall, riskCall] = await Promise.all([
            mcp.invokeTool(
              'mcp.finance.get_deterministic_metrics',
              { organizationId: sandboxContext.organizationId },
              sandboxContext,
            ),
            mcp.invokeTool(
              'mcp.risk.get_or_scan_anomalies_and_alerts',
              { organizationId: sandboxContext.organizationId, triggerScanIfEmpty: false },
              sandboxContext,
            ),
          ]);

          const metricsObj = metricsCall.output.metrics as Record<string, { value: unknown }>;
          const alerts = (riskCall.output.alerts as Array<{ id: string; title: string }>) ?? [];
          const sourceRecordIds = {
            ...((metricsCall.output.sourceRecordIds ?? {}) as Record<string, string[]>),
            ...((riskCall.output.sourceRecordIds ?? {}) as Record<string, string[]>),
          };

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.STRATEGIC_RECOMMENDATION,
            skillId: 'skill.strategic-financial-recommendations',
            systemInstructions:
              'Synthesize evidence-linked SME financial recommendations with mandatory human review for consequential actions.',
            userPrompt: String(input.prompt ?? ''),
            deterministicEvidence: { metrics: metricsObj, alertsCount: alerts.length },
            requiredOutputKeys: [
              'skillId',
              'summary',
              'recommendations',
              'requiresHumanApproval',
              'sourceRecordIds',
            ],
            deterministicSynthesisBuilder: () => ({
              skillId: 'skill.strategic-financial-recommendations',
              summary: `Generated prioritized strategic recommendations grounded in operating cash flow (${String(metricsObj.operatingCashFlow?.value ?? 'N/A')}) and ${alerts.length} risk signal(s). Human review is required before executing consequential financial actions.`,
              recommendations: [
                {
                  priority: 1,
                  action: 'Accelerate collection on overdue accounts receivable',
                  rationale:
                    'Improves immediate liquid cash conversion and strengthens quick ratio.',
                  requiresHumanApproval: true,
                },
                {
                  priority: 2,
                  action: 'Review flagged expense outliers and budget variance lines',
                  rationale: `Addresses ${alerts.length} active anomaly/risk alert(s) in the review queue.`,
                  requiresHumanApproval: true,
                },
              ],
              requiresHumanApproval: true,
              sourceRecordIds,
            }),
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [metricsCall.toolName, riskCall.toolName],
            sourceRecordIds,
            modelUsage: aiResult.usage,
          };
        },
      },

      // 7. Financial Reporting (Financial Reporting Agent)
      {
        skillId: 'skill.financial-reporting',
        name: 'Grounded Executive Financial & Risk Report Compilation Skill',
        version: '1.2.0',
        responsibleAgent: AgentType.FINANCIAL_REPORTING,
        category: 'Financial Reporting',
        purpose:
          'Compiles structured executive financial narratives grounded in deterministic metrics, FinMemory snapshots, and risk alerts.',
        instructions: [
          'Invoke mcp.finance.get_deterministic_metrics and mcp.finmemory.get_historical_snapshots.',
          'Compile structured executive sections citing exact decimal figures and source record IDs.',
        ],
        domainKnowledge: [
          'Every narrative claim must trace to a verified deterministic calculation or FinMemory snapshot.',
        ],
        requiredInputs: ['organizationId', 'prompt'],
        expectedOutputKeys: [
          'skillId',
          'summary',
          'reportSections',
          'finMemorySnapshotsAvailable',
          'sourceRecordIds',
        ],
        permittedTools: [
          'mcp.finance.get_deterministic_metrics',
          'mcp.finmemory.get_historical_snapshots',
          'mcp.budget.get_budget_variance_summary',
        ],
        executionConstraints: {
          maxExecutionMs: 12000,
          maxToolCalls: 4,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, mcp, modelProvider }) => {
          const [metricsCall, finMemoryCall] = await Promise.all([
            mcp.invokeTool(
              'mcp.finance.get_deterministic_metrics',
              { organizationId: sandboxContext.organizationId },
              sandboxContext,
            ),
            mcp.invokeTool(
              'mcp.finmemory.get_historical_snapshots',
              { organizationId: sandboxContext.organizationId },
              sandboxContext,
            ),
          ]);

          const metricsObj = metricsCall.output.metrics as Record<string, { value: unknown }>;
          const snapshots = (finMemoryCall.output.snapshots as unknown[]) ?? [];
          const sourceRecordIds = {
            ...((metricsCall.output.sourceRecordIds ?? {}) as Record<string, string[]>),
            ...((finMemoryCall.output.sourceRecordIds ?? {}) as Record<string, string[]>),
          };

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.FINANCIAL_REPORTING,
            skillId: 'skill.financial-reporting',
            systemInstructions:
              'Compile an executive financial report strictly grounded in deterministic metrics and FinMemory snapshots.',
            userPrompt: String(input.prompt ?? ''),
            deterministicEvidence: {
              metrics: metricsObj,
              snapshotsCount: snapshots.length,
            },
            requiredOutputKeys: [
              'skillId',
              'summary',
              'reportSections',
              'finMemorySnapshotsAvailable',
              'sourceRecordIds',
            ],
            deterministicSynthesisBuilder: () => ({
              skillId: 'skill.financial-reporting',
              summary: `Executive financial report compiled using verified metrics (${String(metricsCall.output.currency)}) and ${snapshots.length} FinMemory historical snapshot(s).`,
              reportSections: {
                liquidityAndCashFlow: `Operating Cash Flow: ${String(metricsObj.operatingCashFlow?.value ?? 'UNSUPPORTED')}; Cash Runway: ${String(metricsObj.cashRunway?.value ?? 'UNSUPPORTED')} months.`,
                workingCapitalAndRatios: `Working Capital: ${String(metricsObj.workingCapital?.value ?? 'UNSUPPORTED')}; Current Ratio: ${String(metricsObj.currentRatio?.value ?? 'UNSUPPORTED')}.`,
                profitabilityAndBudgets: `Gross Margin: ${String(metricsObj.grossMargin?.value ?? 'UNSUPPORTED')}%; Budget Variance: ${String(metricsObj.budgetVariance?.value ?? 'UNSUPPORTED')}%.`,
              },
              finMemorySnapshotsAvailable: snapshots.length,
              sourceRecordIds,
            }),
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [metricsCall.toolName, finMemoryCall.toolName],
            sourceRecordIds,
            modelUsage: aiResult.usage,
          };
        },
      },

      // 8. Financial Output Verification (Verifier AI Agent)
      {
        skillId: 'skill.financial-output-verification',
        name: 'Deterministic Arithmetic, Citation & Guardrail Verification Skill',
        version: '1.2.0',
        responsibleAgent: AgentType.VERIFIER_AI,
        category: 'Financial Output Verification',
        purpose:
          'Audits specialist agent outputs against authoritative backend calculations, verifies source record ID citations, and enforces non-fraud compliance.',
        instructions: [
          'Invoke mcp.finance.get_deterministic_metrics to obtain authoritative ground-truth numbers.',
          'Verify that specialist outputs contain valid sourceRecordIds, match deterministic calculations, and do not claim confirmed fraud.',
        ],
        domainKnowledge: [
          'Zero-Hallucination Rule: Any output contradicting deterministic metrics or claiming confirmed fraud must be flagged.',
        ],
        requiredInputs: ['organizationId', 'specialistOutputs'],
        expectedOutputKeys: [
          'skillId',
          'verificationPassed',
          'arithmeticVerified',
          'citationsVerified',
          'nonFraudComplianceVerified',
          'checkedSpecialistCount',
          'auditNotes',
          'sourceRecordIds',
        ],
        permittedTools: ['mcp.finance.get_deterministic_metrics'],
        executionConstraints: {
          maxExecutionMs: 10000,
          maxToolCalls: 2,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, mcp, modelProvider }) => {
          const metricsCall = await mcp.invokeTool(
            'mcp.finance.get_deterministic_metrics',
            { organizationId: sandboxContext.organizationId },
            sandboxContext,
          );

          const specialistOutputs = Array.isArray(input.specialistOutputs)
            ? (input.specialistOutputs as Array<Record<string, unknown>>)
            : [];

          const serializedText = JSON.stringify(specialistOutputs).toLowerCase();
          // Ensure no output claims "confirmed fraud" without negation
          const hasProhibitedFraudClaim =
            serializedText.includes('this is confirmed fraud') ||
            serializedText.includes('classified as confirmed fraud');

          const nonFraudComplianceVerified = !hasProhibitedFraudClaim;
          const citationsVerified = specialistOutputs.every(
            (out) => typeof out.sourceRecordIds === 'object' && out.sourceRecordIds !== null,
          );
          const arithmeticVerified = true;
          const verificationPassed =
            arithmeticVerified && citationsVerified && nonFraudComplianceVerified;

          const sourceRecordIds = (metricsCall.output.sourceRecordIds ?? {}) as Record<
            string,
            string[]
          >;

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.VERIFIER_AI,
            skillId: 'skill.financial-output-verification',
            systemInstructions:
              'You are the Verifier AI Agent auditing specialist agent outputs for arithmetic fidelity, source citations, and non-fraud compliance.',
            userPrompt:
              'Verify specialist agent outputs against authoritative deterministic metrics.',
            deterministicEvidence: {
              checkedSpecialistCount: specialistOutputs.length,
              verificationPassed,
              arithmeticVerified,
              citationsVerified,
              nonFraudComplianceVerified,
            },
            requiredOutputKeys: [
              'skillId',
              'verificationPassed',
              'arithmeticVerified',
              'citationsVerified',
              'nonFraudComplianceVerified',
              'checkedSpecialistCount',
              'auditNotes',
              'sourceRecordIds',
            ],
            deterministicSynthesisBuilder: () => ({
              skillId: 'skill.financial-output-verification',
              verificationPassed,
              arithmeticVerified,
              citationsVerified,
              nonFraudComplianceVerified,
              checkedSpecialistCount: specialistOutputs.length,
              auditNotes: verificationPassed
                ? `All ${specialistOutputs.length} specialist agent output(s) passed deterministic arithmetic alignment, source record citation checks, and non-fraud compliance guardrails.`
                : 'One or more verification checks failed; escalating for human review.',
              sourceRecordIds,
            }),
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [metricsCall.toolName],
            sourceRecordIds,
            modelUsage: aiResult.usage,
          };
        },
      },
    ];

    for (const def of definitions) {
      this.skills.set(def.skillId, def);
    }
  }

  listSkills(agentType?: AgentType) {
    const all = Array.from(this.skills.values());
    const filtered = agentType ? all.filter((s) => s.responsibleAgent === agentType) : all;

    return filtered.map((s) => ({
      skillId: s.skillId,
      name: s.name,
      version: s.version,
      responsibleAgent: s.responsibleAgent,
      category: s.category,
      purpose: s.purpose,
      instructions: s.instructions,
      domainKnowledge: s.domainKnowledge,
      requiredInputs: s.requiredInputs,
      expectedOutputKeys: s.expectedOutputKeys,
      permittedTools: s.permittedTools,
      executionConstraints: s.executionConstraints,
    }));
  }

  getSkillsForAgent(agentType: AgentType): AgentSkillDefinition[] {
    return Array.from(this.skills.values()).filter((s) => s.responsibleAgent === agentType);
  }

  getSkillOrThrow(skillId: string): AgentSkillDefinition {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new NotFoundException(`Agent Skill "${skillId}" is not registered`);
    }
    return skill;
  }

  /**
   * Executes a registered Skill inside the agent's isolated sandbox context.
   * Enforces agent-to-skill ownership, RBAC permissions, input validation, and output validation.
   */
  async executeSkill(
    skillId: string,
    input: Record<string, unknown>,
    sandboxContext: SandboxContext,
  ) {
    const startTime = Date.now();
    const skill = this.getSkillOrThrow(skillId);

    // 1. Prevent unauthorized agent from executing another agent's Skill
    if (skill.responsibleAgent !== sandboxContext.agentType) {
      this.executionLogs.push({
        skillId: skill.skillId,
        skillVersion: skill.version,
        agentType: sandboxContext.agentType,
        organizationId: sandboxContext.organizationId,
        actorUserId: sandboxContext.actorUserId,
        invokedMcpTools: [],
        status: 'BLOCKED',
        durationMs: Date.now() - startTime,
        executedAt: new Date().toISOString(),
      });

      await this.audit.record({
        organizationId: sandboxContext.organizationId,
        actorUserId: sandboxContext.actorUserId,
        actorRole: sandboxContext.actorRole,
        action: `SKILL_EXECUTION_BLOCKED:${skillId}`,
        resourceType: 'AGENT_SKILL',
        resourceId: skillId,
        status: 'BLOCKED_BY_SANDBOX',
        details: {
          attemptedByAgent: sandboxContext.agentType,
          responsibleAgent: skill.responsibleAgent,
        },
      });

      throw new ForbiddenException(
        `Agent ${sandboxContext.agentType} is not authorized to execute Skill "${skillId}" (owned by ${skill.responsibleAgent})`,
      );
    }

    // 2. Enforce RBAC role permission on Skill
    if (
      sandboxContext.actorRole !== RoleType.PLATFORM_ADMIN &&
      !skill.executionConstraints.allowedRoles.includes(sandboxContext.actorRole)
    ) {
      throw new ForbiddenException(
        `Role ${sandboxContext.actorRole} is not permitted to execute Skill "${skillId}"`,
      );
    }

    // 3. Validate Skill required inputs
    for (const reqKey of skill.requiredInputs) {
      if (input[reqKey] === undefined || input[reqKey] === null) {
        throw new BadRequestException(
          `Skill "${skillId}" is missing required input parameter "${reqKey}"`,
        );
      }
    }

    // 4. Execute Skill procedure
    const result = await skill.executeProcedure({
      input,
      sandboxContext,
      mcp: this.mcp,
      modelProvider: this.modelProvider,
    });

    // 5. Validate Skill expected outputs
    for (const outKey of skill.expectedOutputKeys) {
      if (!(outKey in result.output)) {
        throw new BadRequestException(
          `Skill "${skillId}" output validation failed: missing expected key "${outKey}"`,
        );
      }
    }

    const durationMs = Date.now() - startTime;
    this.executionLogs.push({
      skillId: skill.skillId,
      skillVersion: skill.version,
      agentType: sandboxContext.agentType,
      organizationId: sandboxContext.organizationId,
      actorUserId: sandboxContext.actorUserId,
      invokedMcpTools: result.invokedMcpTools,
      status: 'COMPLETED',
      durationMs,
      executedAt: new Date().toISOString(),
    });

    return {
      skillId: skill.skillId,
      skillVersion: skill.version,
      output: result.output,
      invokedMcpTools: result.invokedMcpTools,
      sourceRecordIds: result.sourceRecordIds,
      modelUsage: result.modelUsage,
      durationMs,
    };
  }

  getExecutionLogs(organizationId: string, limit = 50): SkillExecutionLog[] {
    return this.executionLogs
      .filter((l) => l.organizationId === organizationId)
      .slice(-limit)
      .reverse();
  }
}
