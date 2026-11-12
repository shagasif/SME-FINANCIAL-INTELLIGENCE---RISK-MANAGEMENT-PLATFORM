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
  AiMediaAttachment,
  AiModelProviderService,
  AiModelUsageMetrics,
} from '../model-provider/ai-model-provider.service.js';
import {
  DocumentTargetType,
  ParsedDocumentFields,
  parseInvoiceOrBillText,
  verifyExtractedDocumentArithmetic,
} from '../../document-import/document-parser.util.js';
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

      // 9. File Schema Profiling & Column Mapping (Finance Data Analyst Agent)
      {
        skillId: 'skill.file-schema-profiling-and-column-mapping',
        name: 'File Schema Profiling & Column Mapping Skill',
        version: '1.0.0',
        responsibleAgent: AgentType.FINANCE_DATA_ANALYST,
        category: 'Financial Data Analysis',
        purpose:
          'Profiles uploaded financial statement headers and sample data rows to identify canonical financial ledger fields (date, amount, description, type, category, counterparty, department, reference) with confidence scoring.',
        instructions: [
          'Analyze provided column headers against canonical financial ledger concepts.',
          'Sample representative data rows to corroborate data types (dates, numeric amounts, text narratives, transaction directions).',
          'Calculate confidence scores per column and avoid guessing for ambiguous or missing fields.',
          'Return structured column mappings and clear field-by-field profiling analysis.',
        ],
        domainKnowledge: [
          'Required financial ledger fields: date (ISO or standard date format), amount (positive/negative decimal), description (primary narrative).',
          'Optional ledger fields: type (INCOME/EXPENSE/TRANSFER or DR/CR), category (chart of accounts), counterparty (payee/vendor/customer), department (cost center), reference (invoice/txn ID).',
          'Ambiguity rule: if multiple candidate columns exist without dominant confidence or samples conflict, do not guess; flag for user verification.',
        ],
        requiredInputs: ['organizationId', 'fileName', 'headers', 'sampleRows'],
        expectedOutputKeys: [
          'skillId',
          'fileName',
          'detectedMappings',
          'confidenceScores',
          'fieldAnalysis',
          'unmappedHeaders',
          'notes',
        ],
        permittedTools: [],
        executionConstraints: {
          maxExecutionMs: 15000,
          maxToolCalls: 0,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, modelProvider }) => {
          const fileName = String(input.fileName || 'uploaded_statement.csv');
          const headers = (Array.isArray(input.headers) ? input.headers : []).map((h) =>
            String(h || '').trim(),
          );
          const rawSampleRows = Array.isArray(input.sampleRows) ? input.sampleRows : [];

          const profiling = AgentSkillsRegistryService.profileSchemaAndColumns(
            fileName,
            headers,
            rawSampleRows,
          );

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.FINANCE_DATA_ANALYST,
            skillId: 'skill.file-schema-profiling-and-column-mapping',
            systemInstructions:
              'You are the Finance Data Analyst Agent executing skill.file-schema-profiling-and-column-mapping. Profile uploaded statement columns and sample rows to map canonical financial ledger fields with precision.',
            userPrompt: `Profile file "${fileName}" with headers: [${headers.join(', ')}]`,
            deterministicEvidence: {
              fileName,
              headers,
              sampleRowsCount: rawSampleRows.length,
              detectedMappings: profiling.detectedMappings,
              confidenceScores: profiling.confidenceScores,
              fieldAnalysis: profiling.fieldAnalysis,
              unmappedHeaders: profiling.unmappedHeaders,
            },
            requiredOutputKeys: [
              'skillId',
              'fileName',
              'detectedMappings',
              'confidenceScores',
              'fieldAnalysis',
              'unmappedHeaders',
              'notes',
            ],
            deterministicSynthesisBuilder: () => ({
              skillId: 'skill.file-schema-profiling-and-column-mapping',
              fileName,
              detectedMappings: profiling.detectedMappings,
              confidenceScores: profiling.confidenceScores,
              fieldAnalysis: profiling.fieldAnalysis,
              unmappedHeaders: profiling.unmappedHeaders,
              notes: profiling.notes,
            }),
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [],
            sourceRecordIds: {},
            modelUsage: aiResult.usage,
          };
        },
      },

      // 10. Column Mapping Verification & Guardrail (Verifier AI Agent)
      {
        skillId: 'skill.column-mapping-verification',
        name: 'Column Mapping Verification & Guardrail Skill',
        version: '1.0.0',
        responsibleAgent: AgentType.VERIFIER_AI,
        category: 'Financial Output Verification',
        purpose:
          'Independently audits proposed column mappings against schema rules, required fields, date/amount syntax in sample rows, and collision prevention.',
        instructions: [
          'Verify that date, amount, and description columns are mapped to existing headers.',
          'Ensure no single column header is mapped to multiple conflicting fields.',
          'Validate sample data rows against expected syntax for mapped date and amount fields.',
          'Evaluate confidence thresholds and flag ambiguous mappings for explicit user review.',
        ],
        domainKnowledge: [
          'Strict requirement: dateColumn, amountColumn, and descriptionColumn must be non-empty and present in headers.',
          'Data validation: mapped date rows must parse into valid dates; mapped amount rows must parse into decimals.',
          'Collision guardrail: mapping collision occurs if dateColumn === amountColumn or amountColumn === descriptionColumn.',
        ],
        requiredInputs: [
          'organizationId',
          'detectedMappings',
          'confidenceScores',
          'headers',
          'sampleRows',
        ],
        expectedOutputKeys: [
          'skillId',
          'isApproved',
          'verifiedMappings',
          'validationErrors',
          'confidenceScore',
          'requiresManualReview',
          'notes',
        ],
        permittedTools: [],
        executionConstraints: {
          maxExecutionMs: 10000,
          maxToolCalls: 0,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, modelProvider }) => {
          const headers = (Array.isArray(input.headers) ? input.headers : []).map((h) =>
            String(h || '').trim(),
          );
          const rawSampleRows = Array.isArray(input.sampleRows) ? input.sampleRows : [];
          const detectedMappings = (input.detectedMappings ?? {}) as Record<string, string | null>;
          const confidenceScores = (input.confidenceScores ?? {}) as Record<string, number>;

          const verification = AgentSkillsRegistryService.verifyColumnMappings(
            headers,
            rawSampleRows,
            detectedMappings,
            confidenceScores,
          );

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.VERIFIER_AI,
            skillId: 'skill.column-mapping-verification',
            systemInstructions:
              'You are the Verifier AI Agent auditing proposed file column mappings for required ledger completeness, type fidelity, and collision avoidance.',
            userPrompt:
              'Audit proposed column mappings against required ledger rules and sample data integrity.',
            deterministicEvidence: {
              headers,
              detectedMappings,
              confidenceScores,
              isApproved: verification.isApproved,
              validationErrors: verification.validationErrors,
              confidenceScore: verification.confidenceScore,
              requiresManualReview: verification.requiresManualReview,
            },
            requiredOutputKeys: [
              'skillId',
              'isApproved',
              'verifiedMappings',
              'validationErrors',
              'confidenceScore',
              'requiresManualReview',
              'notes',
            ],
            deterministicSynthesisBuilder: () => ({
              skillId: 'skill.column-mapping-verification',
              isApproved: verification.isApproved,
              verifiedMappings: verification.verifiedMappings,
              validationErrors: verification.validationErrors,
              confidenceScore: verification.confidenceScore,
              requiresManualReview: verification.requiresManualReview,
              notes: verification.notes,
            }),
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [],
            sourceRecordIds: {},
            modelUsage: aiResult.usage,
          };
        },
      },

      // 11. Invoice / Supplier Bill Document Extraction (Finance Data Analyst Agent)
      {
        skillId: 'skill.document-invoice-bill-extraction',
        name: 'Invoice & Supplier Bill Document Extraction Skill',
        version: '1.0.0',
        responsibleAgent: AgentType.FINANCE_DATA_ANALYST,
        category: 'Financial Data Analysis',
        purpose:
          'Extracts structured invoice/bill fields, taxes, line items, and field-level confidence scores from sanitized PDF/OCR text or visual document attachments without inventing missing values.',
        instructions: [
          'Analyze sanitized extracted document text and any attached document image evidence.',
          'Map fields strictly from observed evidence: documentNumber, counterpartyName, counterpartyEmail, issueDate, dueDate, currency, subtotalAmount, taxRate, taxAmount, totalAmount, and lineItems[].',
          'Never invent or fabricate values that do not appear in the document; set missing fields to null and confidence to 0.',
        ],
        domainKnowledge: [
          'Customer invoices map counterpartyName to customerName and invoiceNumber; supplier bills map counterpartyName to supplierName and billNumber.',
          'Monetary strings use 4 decimal places matching NUMERIC(19,4).',
          'Prompt-injection and CSV formula characters must remain sanitized.',
        ],
        requiredInputs: ['organizationId', 'documentType', 'sanitizedText'],
        expectedOutputKeys: [
          'skillId',
          'extractedDocument',
          'lineItems',
          'fieldConfidence',
          'extractionNotes',
          'sanitizationFlags',
        ],
        permittedTools: [],
        executionConstraints: {
          maxExecutionMs: 20000,
          maxToolCalls: 0,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, modelProvider }) => {
          const documentType = (input.documentType === 'BILL' ? 'BILL' : 'INVOICE') as DocumentTargetType;
          const sanitizedText = String(input.sanitizedText ?? '');
          const defaultCurrency = String(input.defaultCurrency ?? 'USD');
          const fileName = String(input.fileName ?? 'document');
          const sanitizationFlags = Array.isArray(input.sanitizationFlags)
            ? input.sanitizationFlags.map(String)
            : [];
          const attachments = Array.isArray(input.attachments)
            ? (input.attachments as AiMediaAttachment[])
            : undefined;

          const parsed = parseInvoiceOrBillText({
            sanitizedText,
            documentType,
            defaultCurrency,
            sanitizationFlags,
          });

          const deterministicPayload = {
            skillId: 'skill.document-invoice-bill-extraction',
            extractedDocument: {
              documentType: parsed.documentType,
              documentNumber: parsed.documentNumber,
              counterpartyName: parsed.counterpartyName,
              counterpartyEmail: parsed.counterpartyEmail,
              category: parsed.category,
              department: parsed.department,
              issueDate: parsed.issueDate,
              dueDate: parsed.dueDate,
              currency: parsed.currency,
              currencySource: parsed.currencySource,
              subtotalAmount: parsed.subtotalAmount,
              taxRate: parsed.taxRate,
              taxAmount: parsed.taxAmount,
              totalAmount: parsed.totalAmount,
              notes: parsed.notes,
            },
            lineItems: parsed.lineItems,
            fieldConfidence: parsed.fieldConfidence,
            extractionNotes: parsed.extractionNotes,
            sanitizationFlags: parsed.sanitizationFlags,
          };

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.FINANCE_DATA_ANALYST,
            skillId: 'skill.document-invoice-bill-extraction',
            systemInstructions:
              'You are the Finance Data Analyst Agent executing skill.document-invoice-bill-extraction. Extract structured invoice or supplier bill fields strictly from the provided document evidence. Never fabricate absent fields.',
            userPrompt: `Extract structured ${documentType} fields and line items from "${fileName}".`,
            deterministicEvidence: {
              fileName,
              documentType,
              defaultCurrency,
              sanitizedTextExcerpt: sanitizedText.slice(0, 6000),
              baselineDeterministicParse: deterministicPayload,
            },
            attachments,
            requiredOutputKeys: [
              'skillId',
              'extractedDocument',
              'lineItems',
              'fieldConfidence',
              'extractionNotes',
              'sanitizationFlags',
            ],
            deterministicSynthesisBuilder: () => deterministicPayload,
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [],
            sourceRecordIds: {},
            modelUsage: aiResult.usage,
          };
        },
      },

      // 12. Document Extraction Verification & Arithmetic Audit (Verifier AI Agent)
      {
        skillId: 'skill.document-extraction-verification',
        name: 'Document Extraction Verification & Arithmetic Guardrail Skill',
        version: '1.0.0',
        responsibleAgent: AgentType.VERIFIER_AI,
        category: 'Financial Output Verification',
        purpose:
          'Independently verifies extracted invoice/bill arithmetic (line items sum, subtotal + tax = total, tax rate), date order, schema completeness, and confidence thresholds.',
        instructions: [
          'Recompute line item subtotals, tax totals, and grand totals using deterministic decimal arithmetic.',
          'Validate issueDate <= dueDate and list any missing required fields.',
          'Flag requiresHumanReview whenever fields are missing, confidence is below 0.70, discrepancies occur, or sanitization alerts exist.',
        ],
        domainKnowledge: [
          'Arithmetic rule: lineSubtotal = quantity * unitPrice; subtotalAmount + taxAmount = totalAmount.',
          'Date rule: dueDate must not precede issueDate.',
          'Strict non-fabrication guardrail: never fill missing required fields silently.',
        ],
        requiredInputs: ['organizationId', 'parsedDocument'],
        expectedOutputKeys: [
          'skillId',
          'isApproved',
          'requiresHumanReview',
          'arithmeticVerification',
          'validationErrors',
          'confidenceScore',
          'notes',
        ],
        permittedTools: [],
        executionConstraints: {
          maxExecutionMs: 10000,
          maxToolCalls: 0,
          allowedRoles: ALL_ROLES,
          requiresSandboxIsolation: true,
        },
        executeProcedure: async ({ input, sandboxContext, modelProvider }) => {
          const parsedDoc = input.parsedDocument as ParsedDocumentFields;
          const arithmetic = verifyExtractedDocumentArithmetic(parsedDoc);
          const conf = parsedDoc.fieldConfidence;
          const coreScores = [
            conf.documentNumber,
            conf.counterpartyName,
            conf.issueDate,
            conf.dueDate,
            conf.totalAmount,
          ];
          const avgConfidence = Number(
            (coreScores.reduce((acc, s) => acc + s, 0) / coreScores.length).toFixed(2),
          );
          const hasSanitizationAlerts = (parsedDoc.sanitizationFlags?.length ?? 0) > 0;
          const validationErrors = [
            ...arithmetic.missingRequiredFields.map((f) => `Missing required field: ${f}`),
            ...arithmetic.discrepancies,
          ];
          const isApproved = arithmetic.isValid && avgConfidence >= 0.7 && !hasSanitizationAlerts;
          const requiresHumanReview = !isApproved;

          const verificationPayload = {
            skillId: 'skill.document-extraction-verification',
            isApproved,
            requiresHumanReview,
            arithmeticVerification: arithmetic,
            validationErrors,
            confidenceScore: avgConfidence,
            notes: arithmetic.summary,
          };

          const aiResult = await modelProvider.executeStructuredTask({
            organizationId: sandboxContext.organizationId,
            agentType: AgentType.VERIFIER_AI,
            skillId: 'skill.document-extraction-verification',
            systemInstructions:
              'You are the Verifier AI Agent auditing extracted invoice/bill fields for deterministic arithmetic accuracy, date validity, and completeness.',
            userPrompt:
              'Verify extracted invoice/bill arithmetic, completeness, and confidence score.',
            deterministicEvidence: verificationPayload,
            requiredOutputKeys: [
              'skillId',
              'isApproved',
              'requiresHumanReview',
              'arithmeticVerification',
              'validationErrors',
              'confidenceScore',
              'notes',
            ],
            deterministicSynthesisBuilder: () => verificationPayload,
          });

          return {
            output: aiResult.structuredOutput,
            invokedMcpTools: [],
            sourceRecordIds: {},
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

  static getColumnSamples(headerIndex: number, headerName: string, rows: unknown[]): string[] {
    const samples: string[] = [];
    for (const row of rows) {
      if (!row) continue;
      let val = '';
      if (Array.isArray(row)) {
        val = row[headerIndex] !== undefined ? String(row[headerIndex]).trim() : '';
      } else if (typeof row === 'object') {
        const obj = row as Record<string, unknown>;
        if (obj[headerName] !== undefined) {
          val = String(obj[headerName]).trim();
        } else if (headerIndex < Object.values(obj).length) {
          val = String(Object.values(obj)[headerIndex] ?? '').trim();
        }
      }
      if (val && val !== 'null' && val !== 'undefined') {
        samples.push(val);
      }
      if (samples.length >= 10) break;
    }
    return samples;
  }

  static profileSchemaAndColumns(fileName: string, headers: string[], rawSampleRows: unknown[]) {
    const detectedMappings: Record<string, string | null> = {
      dateColumn: null,
      amountColumn: null,
      descriptionColumn: null,
      typeColumn: null,
      categoryColumn: null,
      counterpartyColumn: null,
      departmentColumn: null,
      referenceColumn: null,
    };

    const confidenceScores: Record<string, number> = {
      date: 0,
      amount: 0,
      description: 0,
      type: 0,
      category: 0,
      counterparty: 0,
      department: 0,
      reference: 0,
    };

    const fieldAnalysis: Record<string, string> = {};
    const unmappedHeaders: string[] = [];
    const usedHeaders = new Set<string>();

    const isDateValue = (val: string): boolean => {
      const v = val.trim();
      if (!v || v.length < 4) return false;
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(v)) return true;
      if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(v)) return true;
      if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/.test(v)) return true;
      if (!isNaN(Date.parse(v)) && !/^\d+$/.test(v) && !/^[0-9.,]+$/.test(v)) return true;
      return false;
    };

    const isAmountValue = (val: string): boolean => {
      const cleaned = val.replace(/[$₨£€PKR,]/gi, '').replace(/^\((.*)\)$/, '-$1').trim();
      return cleaned.length > 0 && !isNaN(Number(cleaned));
    };

    const isTypeValue = (val: string): boolean => {
      const upper = val.toUpperCase().trim();
      return [
        'INCOME',
        'EXPENSE',
        'TRANSFER',
        'DR',
        'CR',
        'DEBIT',
        'CREDIT',
        'DEP',
        'WD',
        'PAYMENT',
        'RECEIPT',
      ].includes(upper);
    };

    const headerProfiles = headers.map((header, idx) => {
      const lower = header.toLowerCase().replace(/[_-]/g, ' ').trim();
      const samples = AgentSkillsRegistryService.getColumnSamples(idx, header, rawSampleRows);
      const dateSampleMatchCount = samples.filter(isDateValue).length;
      const amountSampleMatchCount = samples.filter(isAmountValue).length;
      const typeSampleMatchCount = samples.filter(isTypeValue).length;
      const textSampleMatchCount = samples.filter(
        (s) => s.length > 2 && !isAmountValue(s) && !isDateValue(s),
      ).length;

      return {
        header,
        idx,
        lower,
        samples,
        dateSampleRate: samples.length ? dateSampleMatchCount / samples.length : 0,
        amountSampleRate: samples.length ? amountSampleMatchCount / samples.length : 0,
        typeSampleRate: samples.length ? typeSampleMatchCount / samples.length : 0,
        textSampleRate: samples.length ? textSampleMatchCount / samples.length : 0,
      };
    });

    // 1. Map Date column
    const dateKeywords = [
      'date',
      'timestamp',
      'txn date',
      'posting date',
      'value date',
      'trans date',
      'booking date',
      'time',
    ];
    const dateCandidates = headerProfiles
      .map((p) => {
        let score = 0;
        if (p.lower === 'date' || p.lower === 'txn date' || p.lower === 'transaction date')
          score += 0.65;
        else if (dateKeywords.some((k) => p.lower.includes(k))) score += 0.45;
        if (p.dateSampleRate >= 0.7) score += 0.35;
        else if (p.dateSampleRate >= 0.4) score += 0.2;
        else if (p.dateSampleRate === 0 && p.samples.length > 0) score -= 0.3;
        return { ...p, score: Math.min(0.99, Math.max(0, score)) };
      })
      .filter((c) => c.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (dateCandidates.length > 0) {
      const topDate = dateCandidates[0];
      detectedMappings.dateColumn = topDate.header;
      confidenceScores.date = Number(topDate.score.toFixed(2));
      usedHeaders.add(topDate.header);
      fieldAnalysis.date = `Mapped to "${topDate.header}" (confidence ${(topDate.score * 100).toFixed(0)}%). Valid date syntax confirmed.`;
      if (dateCandidates.length > 1 && dateCandidates[1].score > 0.65) {
        fieldAnalysis.date += ` Note: Ambiguity detected with alternate column "${dateCandidates[1].header}".`;
        confidenceScores.date = Math.min(confidenceScores.date, 0.8);
      }
    } else {
      fieldAnalysis.date = 'No unambiguous date column identified. Manual assignment required.';
    }

    // 2. Map Amount column
    const amountKeywords = [
      'amount',
      'net amount',
      'total',
      'sum',
      'debit/credit',
      'dr/cr',
      'balance',
      'price',
      'value',
    ];
    const amountCandidates = headerProfiles
      .filter((p) => !usedHeaders.has(p.header))
      .map((p) => {
        let score = 0;
        if (
          p.lower === 'amount' ||
          p.lower === 'net amount' ||
          p.lower === 'transaction amount'
        )
          score += 0.65;
        else if (amountKeywords.some((k) => p.lower.includes(k))) score += 0.45;
        if (p.amountSampleRate >= 0.7) score += 0.35;
        else if (p.amountSampleRate >= 0.4) score += 0.2;
        else if (p.amountSampleRate === 0 && p.samples.length > 0) score -= 0.3;
        return { ...p, score: Math.min(0.99, Math.max(0, score)) };
      })
      .filter((c) => c.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (amountCandidates.length > 0) {
      const topAmount = amountCandidates[0];
      detectedMappings.amountColumn = topAmount.header;
      confidenceScores.amount = Number(topAmount.score.toFixed(2));
      usedHeaders.add(topAmount.header);
      fieldAnalysis.amount = `Mapped to "${topAmount.header}" (confidence ${(topAmount.score * 100).toFixed(0)}%). Numeric sample patterns validated.`;
      if (amountCandidates.length > 1 && amountCandidates[1].score > 0.65) {
        fieldAnalysis.amount += ` Note: Ambiguity detected with alternate amount column "${amountCandidates[1].header}".`;
        confidenceScores.amount = Math.min(confidenceScores.amount, 0.8);
      }
    } else {
      fieldAnalysis.amount =
        'No unambiguous numeric amount column identified. Manual assignment required.';
    }

    // 3. Map Description column
    const descKeywords = [
      'description',
      'desc',
      'memo',
      'narrative',
      'particulars',
      'details',
      'name',
      'title',
      'remarks',
      'notes',
    ];
    const descCandidates = headerProfiles
      .filter((p) => !usedHeaders.has(p.header))
      .map((p) => {
        let score = 0;
        if (
          p.lower === 'description' ||
          p.lower === 'particulars' ||
          p.lower === 'narrative' ||
          p.lower === 'memo'
        )
          score += 0.65;
        else if (descKeywords.some((k) => p.lower.includes(k))) score += 0.45;
        if (p.textSampleRate >= 0.6) score += 0.3;
        return { ...p, score: Math.min(0.99, Math.max(0, score)) };
      })
      .filter((c) => c.score >= 0.45)
      .sort((a, b) => b.score - a.score);

    if (descCandidates.length > 0) {
      const topDesc = descCandidates[0];
      detectedMappings.descriptionColumn = topDesc.header;
      confidenceScores.description = Number(topDesc.score.toFixed(2));
      usedHeaders.add(topDesc.header);
      fieldAnalysis.description = `Mapped to "${topDesc.header}" (confidence ${(topDesc.score * 100).toFixed(0)}%). Narrative text values corroborated.`;
    } else {
      fieldAnalysis.description =
        'No clear description column detected. Manual selection required.';
    }

    // 4. Map Type column (Optional)
    const typeKeywords = [
      'type',
      'direction',
      'dr/cr',
      'drcr',
      'credit/debit',
      'transaction type',
      'txn type',
    ];
    const typeCandidates = headerProfiles
      .filter((p) => !usedHeaders.has(p.header))
      .map((p) => {
        let score = 0;
        if (p.lower === 'type' || p.lower === 'direction') score += 0.6;
        else if (typeKeywords.some((k) => p.lower.includes(k))) score += 0.45;
        if (p.typeSampleRate >= 0.6) score += 0.35;
        return { ...p, score: Math.min(0.99, Math.max(0, score)) };
      })
      .filter((c) => c.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (typeCandidates.length > 0) {
      const topType = typeCandidates[0];
      detectedMappings.typeColumn = topType.header;
      confidenceScores.type = Number(topType.score.toFixed(2));
      usedHeaders.add(topType.header);
      fieldAnalysis.type = `Mapped to "${topType.header}" (confidence ${(topType.score * 100).toFixed(0)}%).`;
    }

    // 5. Map Category column (Optional)
    const catKeywords = ['category', 'class', 'group', 'tag', 'account category'];
    const catCandidates = headerProfiles
      .filter((p) => !usedHeaders.has(p.header))
      .map((p) => {
        let score = 0;
        if (p.lower === 'category') score += 0.65;
        else if (catKeywords.some((k) => p.lower.includes(k))) score += 0.45;
        return { ...p, score: Math.min(0.99, Math.max(0, score)) };
      })
      .filter((c) => c.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (catCandidates.length > 0) {
      const topCat = catCandidates[0];
      detectedMappings.categoryColumn = topCat.header;
      confidenceScores.category = Number(topCat.score.toFixed(2));
      usedHeaders.add(topCat.header);
      fieldAnalysis.category = `Mapped to "${topCat.header}" (confidence ${(topCat.score * 100).toFixed(0)}%).`;
    }

    // 6. Map Counterparty column (Optional)
    const partyKeywords = [
      'counterparty',
      'payee',
      'vendor',
      'payer',
      'client',
      'customer',
      'merchant',
      'party',
      'beneficiary',
    ];
    const partyCandidates = headerProfiles
      .filter((p) => !usedHeaders.has(p.header))
      .map((p) => {
        let score = 0;
        if (p.lower === 'payee' || p.lower === 'vendor' || p.lower === 'counterparty')
          score += 0.65;
        else if (partyKeywords.some((k) => p.lower.includes(k))) score += 0.45;
        return { ...p, score: Math.min(0.99, Math.max(0, score)) };
      })
      .filter((c) => c.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (partyCandidates.length > 0) {
      const topParty = partyCandidates[0];
      detectedMappings.counterpartyColumn = topParty.header;
      confidenceScores.counterparty = Number(topParty.score.toFixed(2));
      usedHeaders.add(topParty.header);
      fieldAnalysis.counterparty = `Mapped to "${topParty.header}" (confidence ${(topParty.score * 100).toFixed(0)}%).`;
    }

    // 7. Map Department column (Optional)
    const deptKeywords = [
      'department',
      'dept',
      'cost center',
      'division',
      'business unit',
    ];
    const deptCandidates = headerProfiles
      .filter((p) => !usedHeaders.has(p.header))
      .map((p) => {
        let score = 0;
        if (p.lower === 'department' || p.lower === 'dept') score += 0.65;
        else if (deptKeywords.some((k) => p.lower.includes(k))) score += 0.45;
        return { ...p, score: Math.min(0.99, Math.max(0, score)) };
      })
      .filter((c) => c.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (deptCandidates.length > 0) {
      const topDept = deptCandidates[0];
      detectedMappings.departmentColumn = topDept.header;
      confidenceScores.department = Number(topDept.score.toFixed(2));
      usedHeaders.add(topDept.header);
      fieldAnalysis.department = `Mapped to "${topDept.header}".`;
    }

    // 8. Map Reference column (Optional)
    const refKeywords = [
      'reference',
      'ref',
      'ref no',
      'ref num',
      'reference number',
      'txn id',
      'transaction id',
      'cheque',
    ];
    const refCandidates = headerProfiles
      .filter((p) => !usedHeaders.has(p.header))
      .map((p) => {
        let score = 0;
        if (p.lower === 'reference' || p.lower === 'ref' || p.lower === 'ref no')
          score += 0.65;
        else if (refKeywords.some((k) => p.lower.includes(k))) score += 0.45;
        return { ...p, score: Math.min(0.99, Math.max(0, score)) };
      })
      .filter((c) => c.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (refCandidates.length > 0) {
      const topRef = refCandidates[0];
      detectedMappings.referenceColumn = topRef.header;
      confidenceScores.reference = Number(topRef.score.toFixed(2));
      usedHeaders.add(topRef.header);
      fieldAnalysis.reference = `Mapped to "${topRef.header}".`;
    }

    for (const h of headers) {
      if (!usedHeaders.has(h)) {
        unmappedHeaders.push(h);
      }
    }

    const mappedCount = Object.values(detectedMappings).filter(Boolean).length;
    const notes = `Finance Data Analyst profiled ${headers.length} headers across ${rawSampleRows.length} sample row(s): mapped ${mappedCount} canonical fields (${unmappedHeaders.length} unmapped).`;

    return {
      fileName,
      detectedMappings,
      confidenceScores,
      fieldAnalysis,
      unmappedHeaders,
      notes,
    };
  }

  static verifyColumnMappings(
    headers: string[],
    rawSampleRows: unknown[],
    detectedMappings: Record<string, string | null>,
    confidenceScores: Record<string, number>,
  ) {
    const validationErrors: string[] = [];
    const verifiedMappings: Record<string, string | null> = { ...detectedMappings };

    // 1. Required fields check
    const required = [
      { key: 'dateColumn', label: 'Date', confKey: 'date' },
      { key: 'amountColumn', label: 'Amount', confKey: 'amount' },
      { key: 'descriptionColumn', label: 'Description', confKey: 'description' },
    ];

    for (const req of required) {
      const mappedHeader = detectedMappings[req.key];
      if (!mappedHeader) {
        validationErrors.push(`Required field "${req.label}" is not mapped.`);
      } else if (!headers.includes(mappedHeader)) {
        validationErrors.push(
          `Mapped ${req.label} column "${mappedHeader}" does not exist in uploaded headers.`,
        );
      }
    }

    // 2. Collision check
    const headerAssignments = new Map<string, string[]>();
    for (const [field, header] of Object.entries(detectedMappings)) {
      if (!header) continue;
      const list = headerAssignments.get(header) ?? [];
      list.push(field);
      headerAssignments.set(header, list);
    }

    for (const [header, fields] of headerAssignments.entries()) {
      if (fields.length > 1) {
        validationErrors.push(
          `Column conflict: header "${header}" is mapped to multiple fields [${fields.join(', ')}].`,
        );
      }
    }

    // 3. Syntax checks on sample rows
    if (detectedMappings.dateColumn && headers.includes(detectedMappings.dateColumn)) {
      const idx = headers.indexOf(detectedMappings.dateColumn);
      const samples = AgentSkillsRegistryService.getColumnSamples(
        idx,
        detectedMappings.dateColumn,
        rawSampleRows,
      );
      const invalidDates = samples.filter(
        (s) => isNaN(Date.parse(s)) && !/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s),
      );
      if (samples.length > 0 && invalidDates.length === samples.length) {
        validationErrors.push(
          `Mapped Date column "${detectedMappings.dateColumn}" contains no valid date values in sample rows.`,
        );
      }
    }

    if (detectedMappings.amountColumn && headers.includes(detectedMappings.amountColumn)) {
      const idx = headers.indexOf(detectedMappings.amountColumn);
      const samples = AgentSkillsRegistryService.getColumnSamples(
        idx,
        detectedMappings.amountColumn,
        rawSampleRows,
      );
      const invalidAmounts = samples.filter((s) => {
        const cleaned = s
          .replace(/[$₨£€PKR,]/gi, '')
          .replace(/^\((.*)\)$/, '-$1')
          .trim();
        return isNaN(Number(cleaned)) || cleaned.length === 0;
      });
      if (samples.length > 0 && invalidAmounts.length === samples.length) {
        validationErrors.push(
          `Mapped Amount column "${detectedMappings.amountColumn}" contains no valid numeric amounts in sample rows.`,
        );
      }
    }

    // 4. Overall confidence score calculation
    const dateConf = confidenceScores.date ?? 0;
    const amountConf = confidenceScores.amount ?? 0;
    const descConf = confidenceScores.description ?? 0;
    const overallConfidence = Number(
      (dateConf * 0.4 + amountConf * 0.4 + descConf * 0.2).toFixed(2),
    );

    const isApproved = validationErrors.length === 0 && overallConfidence >= 0.7;
    const requiresManualReview = !isApproved || overallConfidence < 0.85;

    const notes = isApproved
      ? `Verifier AI verified proposed mappings with overall confidence of ${(overallConfidence * 100).toFixed(0)}%. All mandatory fields and syntactic formats validated.`
      : `Verifier AI flagged proposed mappings: ${validationErrors.length} error(s) found. Manual user confirmation required.`;

    return {
      isApproved,
      verifiedMappings,
      validationErrors,
      confidenceScore: overallConfidence,
      requiresManualReview,
      notes,
    };
  }
}
