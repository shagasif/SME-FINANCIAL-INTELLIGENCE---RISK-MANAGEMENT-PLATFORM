import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  AgentType,
  ForecastScenarioType,
  ReportType,
  RoleType,
} from '../../../generated/prisma/client.js';
import { BudgetsService } from '../../budgets/budgets.service.js';
import { CashFlowForecastingService } from '../../cash-flow-forecasting/cash-flow-forecasting.service.js';
import { FinancialAnalyticsService } from '../../financial-analytics/financial-analytics.service.js';
import { FinancialTransactionsService } from '../../financial-transactions/financial-transactions.service.js';
import { FinMemoryService } from '../../finmemory/finmemory.service.js';
import { InvoicesPayablesService } from '../../invoices-payables/invoices-payables.service.js';
import { ReportsService } from '../../reports/reports.service.js';
import { RiskMonitoringService } from '../../risk-monitoring/risk-monitoring.service.js';
import { ScenarioPlanningService } from '../../scenario-planning/scenario-planning.service.js';
import { AgentSandboxService, SandboxContext } from '../sandbox/agent-sandbox.service.js';

export interface McpToolSchema {
  requiredFields: string[];
  allowedFields: string[];
}

export interface RegisteredMcpTool {
  name: string;
  serverId: string;
  description: string;
  version: string;
  allowedAgents: AgentType[];
  requiredRoles: RoleType[];
  timeoutMs: number;
  inputSchema: McpToolSchema;
  outputRequiredKeys: string[];
  handler: (
    input: Record<string, unknown>,
    context: SandboxContext,
  ) => Promise<Record<string, unknown>>;
}

const ALL_READ_CAPABLE_ROLES: RoleType[] = [
  RoleType.PLATFORM_ADMIN,
  RoleType.BUSINESS_OWNER,
  RoleType.FINANCE_MANAGER,
  RoleType.ACCOUNTANT,
  RoleType.OPERATIONS_MANAGER,
  RoleType.FINANCIAL_ANALYST,
  RoleType.AUDITOR,
];

/**
 * Centralized MCP Tool Registry (Section 20)
 *
 * Registers and exposes only approved MCP tools, maps them to authorized
 * specialist agents and RBAC roles, validates input and output schemas,
 * and executes strictly through approved backend domain services.
 */
@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, RegisteredMcpTool>();

  constructor(
    private readonly sandbox: AgentSandboxService,
    private readonly analytics: FinancialAnalyticsService,
    private readonly transactions: FinancialTransactionsService,
    private readonly forecasting: CashFlowForecastingService,
    private readonly riskMonitoring: RiskMonitoringService,
    private readonly invoicesPayables: InvoicesPayablesService,
    private readonly budgets: BudgetsService,
    private readonly scenarioPlanning: ScenarioPlanningService,
    private readonly finMemory: FinMemoryService,
    @Optional() private readonly reports?: ReportsService,
  ) {
    this.registerCoreMcpTools();
  }

  private registerCoreMcpTools(): void {
    const definitions: RegisteredMcpTool[] = [
      {
        name: 'mcp.finance.get_deterministic_metrics',
        serverId: 'sme-financial-mcp-core',
        description:
          'Computes all 10 deterministic financial metrics (operating cash flow, runway, current/quick ratios, gross margin, expense growth, working capital, budget variance, AR/AP aging) with formulas and source record IDs.',
        version: '1.0.0',
        allowedAgents: [
          AgentType.FINANCE_DATA_ANALYST,
          AgentType.FINANCIAL_RISK_ASSESSMENT,
          AgentType.STRATEGIC_RECOMMENDATION,
          AgentType.FINANCIAL_REPORTING,
          AgentType.VERIFIER_AI,
        ],
        requiredRoles: ALL_READ_CAPABLE_ROLES,
        timeoutMs: 8000,
        inputSchema: {
          requiredFields: ['organizationId'],
          allowedFields: ['organizationId', 'startDate', 'endDate'],
        },
        outputRequiredKeys: ['organizationId', 'currency', 'metrics', 'sourceRecordIds'],
        handler: async (input, ctx) => {
          const bundle = await this.analytics.computeAllMetrics(ctx.organizationId, {
            startDate: typeof input.startDate === 'string' ? new Date(input.startDate) : undefined,
            endDate: typeof input.endDate === 'string' ? new Date(input.endDate) : undefined,
          });
          const m = bundle.metrics;
          return {
            organizationId: bundle.organizationId,
            currency: bundle.currency,
            baseCurrency: bundle.currency,
            conversionContext: bundle.conversionContext,
            formulaVersion: bundle.formulaVersion,
            reportingPeriod: bundle.reportingPeriod,
            metrics: bundle.metrics,
            sourceRecordIds: {
              accountIds: m.workingCapital.sourceRecordIds.accountIds ?? [],
              transactionIds: m.operatingCashFlow.sourceRecordIds.transactionIds ?? [],
              invoiceIds: m.receivableAging.sourceRecordIds.invoiceIds ?? [],
              billIds: m.payableAging.sourceRecordIds.billIds ?? [],
              budgetIds: m.budgetVariance.sourceRecordIds.budgetIds ?? [],
            },
          };
        },
      },
      {
        name: 'mcp.finance.get_accounts_and_ledger_summary',
        serverId: 'sme-financial-mcp-core',
        description:
          'Retrieves organization financial accounts, liquid balances, and recent ledger transactions.',
        version: '1.0.0',
        allowedAgents: [
          AgentType.FINANCE_DATA_ANALYST,
          AgentType.CASH_FLOW_FORECASTING,
          AgentType.EXPENSE_ANOMALY_DETECTION,
          AgentType.VERIFIER_AI,
        ],
        requiredRoles: ALL_READ_CAPABLE_ROLES,
        timeoutMs: 8000,
        inputSchema: {
          requiredFields: ['organizationId'],
          allowedFields: ['organizationId', 'limit'],
        },
        outputRequiredKeys: ['accounts', 'transactions', 'sourceRecordIds'],
        handler: async (input, ctx) => {
          const [accounts, txPage] = await Promise.all([
            this.transactions.listAccounts(ctx.organizationId, false),
            this.transactions.listTransactions(ctx.organizationId, {
              page: 1,
              limit: typeof input.limit === 'number' ? Math.min(50, input.limit) : 25,
            }),
          ]);
          return {
            baseCurrency: txPage.summary?.currency ?? 'USD',
            accounts,
            transactions: txPage.items,
            totalTransactions: txPage.pagination.total,
            summary: txPage.summary,
            sourceRecordIds: {
              accountIds: accounts.map((a) => a.id),
              transactionIds: txPage.items.map((t) => t.id),
            },
          };
        },
      },
      {
        name: 'mcp.forecast.get_or_generate_cash_flow_forecast',
        serverId: 'sme-financial-mcp-core',
        description:
          'Retrieves latest or generates a deterministic 7, 30, 60, or 90-day cash-flow forecast with liquidity warnings and assumptions.',
        version: '1.0.0',
        allowedAgents: [
          AgentType.CASH_FLOW_FORECASTING,
          AgentType.FINANCIAL_RISK_ASSESSMENT,
          AgentType.SCENARIO_PLANNING,
          AgentType.STRATEGIC_RECOMMENDATION,
          AgentType.FINANCIAL_REPORTING,
        ],
        requiredRoles: ALL_READ_CAPABLE_ROLES,
        timeoutMs: 10000,
        inputSchema: {
          requiredFields: ['organizationId'],
          allowedFields: ['organizationId', 'horizonDays', 'scenarioType', 'forceRefresh'],
        },
        outputRequiredKeys: ['forecast', 'sourceRecordIds'],
        handler: async (input, ctx) => {
          const horizonRaw = Number(input.horizonDays ?? 30);
          const horizonDays: 7 | 30 | 60 | 90 =
            horizonRaw === 7 || horizonRaw === 30 || horizonRaw === 60 || horizonRaw === 90
              ? horizonRaw
              : 30;
          const forceRefresh = input.forceRefresh === true;
          const existing = forceRefresh
            ? []
            : await this.forecasting.listForecasts(ctx.organizationId, horizonDays);
          const latestExisting = existing[0];
          const shouldGenerateFresh = !latestExisting || latestExisting.isStale === true;
          const forecast = shouldGenerateFresh
            ? await this.forecasting.generateForecast(
                ctx.organizationId,
                {
                  horizonDays,
                  scenarioType: ForecastScenarioType.BASE,
                },
                ctx.actorUserId,
              )
            : await this.forecasting.getForecastById(ctx.organizationId, latestExisting.id);
          return {
            forecast,
            sourceRecordIds: {
              forecastIds: [forecast.id],
              ...(typeof forecast.sourceRecordIds === 'object' && forecast.sourceRecordIds !== null
                ? (forecast.sourceRecordIds as Record<string, string[]>)
                : {}),
            },
          };
        },
      },
      {
        name: 'mcp.risk.get_or_scan_anomalies_and_alerts',
        serverId: 'sme-financial-mcp-core',
        description:
          'Retrieves active anomaly and financial risk alerts or triggers a deterministic risk scan with non-fraud guardrails.',
        version: '1.0.0',
        allowedAgents: [
          AgentType.EXPENSE_ANOMALY_DETECTION,
          AgentType.FINANCIAL_RISK_ASSESSMENT,
          AgentType.STRATEGIC_RECOMMENDATION,
          AgentType.FINANCIAL_REPORTING,
        ],
        requiredRoles: ALL_READ_CAPABLE_ROLES,
        timeoutMs: 10000,
        inputSchema: {
          requiredFields: ['organizationId'],
          allowedFields: ['organizationId', 'triggerScanIfEmpty', 'forceRefresh'],
        },
        outputRequiredKeys: ['alerts', 'nonFraudPolicy', 'sourceRecordIds'],
        handler: async (input, ctx) => {
          const forceRefresh = input.forceRefresh === true;
          let alerts = forceRefresh
            ? []
            : await this.riskMonitoring.listAlerts(ctx.organizationId, {});
          if (forceRefresh || (alerts.length === 0 && input.triggerScanIfEmpty !== false)) {
            const scanResult = await this.riskMonitoring.runAnomalyAndRiskScan(
              ctx.organizationId,
              ctx.actorUserId,
            );
            alerts = scanResult.alerts;
          }
          return {
            alerts,
            nonFraudPolicy:
              'Statistical or rule-based anomaly signal for human review; not a determination of confirmed fraud.',
            sourceRecordIds: {
              riskAlertIds: alerts.map((a) => a.id),
            },
          };
        },
      },
      {
        name: 'mcp.aging.get_receivables_and_payables_aging',
        serverId: 'sme-financial-mcp-core',
        description:
          'Computes deterministic accounts receivable and accounts payable aging schedules across overdue buckets.',
        version: '1.0.0',
        allowedAgents: [AgentType.FINANCE_DATA_ANALYST, AgentType.FINANCIAL_RISK_ASSESSMENT],
        requiredRoles: ALL_READ_CAPABLE_ROLES,
        timeoutMs: 8000,
        inputSchema: {
          requiredFields: ['organizationId'],
          allowedFields: ['organizationId'],
        },
        outputRequiredKeys: ['receivablesAging', 'payablesAging', 'sourceRecordIds'],
        handler: async (_input, ctx) => {
          const aging = await this.invoicesPayables.computeAgingReport(ctx.organizationId);
          return {
            ...aging,
            sourceRecordIds: {
              invoiceIds: aging.receivablesAging.sourceRecordIds,
              billIds: aging.payablesAging.sourceRecordIds,
            },
          };
        },
      },
      {
        name: 'mcp.budget.get_budget_variance_summary',
        serverId: 'sme-financial-mcp-core',
        description:
          'Retrieves active budgets and deterministic actual-vs-budget variance calculations.',
        version: '1.0.0',
        allowedAgents: [
          AgentType.FINANCE_DATA_ANALYST,
          AgentType.EXPENSE_ANOMALY_DETECTION,
          AgentType.FINANCIAL_REPORTING,
        ],
        requiredRoles: ALL_READ_CAPABLE_ROLES,
        timeoutMs: 8000,
        inputSchema: {
          requiredFields: ['organizationId'],
          allowedFields: ['organizationId'],
        },
        outputRequiredKeys: ['budgets', 'varianceReports', 'sourceRecordIds'],
        handler: async (_input, ctx) => {
          const budgets = await this.budgets.listBudgets(ctx.organizationId);
          const varianceReports = [];
          for (const b of budgets.slice(0, 2)) {
            varianceReports.push(
              await this.budgets.calculateBudgetVariance(ctx.organizationId, b.id),
            );
          }
          return {
            budgets,
            varianceReports,
            sourceRecordIds: {
              budgetIds: budgets.map((b) => b.id),
              transactionIds: varianceReports.flatMap((v) =>
                v.lines.flatMap((l) => l.sourceTransactionIds),
              ),
            },
          };
        },
      },
      {
        name: 'mcp.scenario.simulate_what_if_scenario',
        serverId: 'sme-financial-mcp-core',
        description:
          'Executes a non-destructive what-if scenario simulation against the organization baseline forecast.',
        version: '1.0.0',
        allowedAgents: [AgentType.SCENARIO_PLANNING],
        requiredRoles: ALL_READ_CAPABLE_ROLES,
        timeoutMs: 10000,
        inputSchema: {
          requiredFields: ['organizationId'],
          allowedFields: [
            'organizationId',
            'customerPaymentDelayDays',
            'salesGrowthPct',
            'operatingCostChangePct',
            'supplierPaymentTimingDays',
          ],
        },
        outputRequiredKeys: ['scenarios', 'sourceRecordIds'],
        handler: async (input, ctx) => {
          const existingScenarios = await this.scenarioPlanning.listScenarios(ctx.organizationId);
          if (existingScenarios.length > 0 && input.customerPaymentDelayDays === undefined) {
            return {
              scenarios: existingScenarios,
              sourceRecordIds: {
                scenarioIds: existingScenarios.map((s) => s.id),
              },
            };
          }

          let forecasts = await this.forecasting.listForecasts(ctx.organizationId, 30);
          if (forecasts.length === 0) {
            const generated = await this.forecasting.generateForecast(
              ctx.organizationId,
              { horizonDays: 30, scenarioType: ForecastScenarioType.BASE },
              ctx.actorUserId,
            );
            forecasts = [generated];
          }

          const simulated = await this.scenarioPlanning.runScenarioSimulation(
            ctx.organizationId,
            {
              baselineForecastId: forecasts[0].id,
              name: 'AI Agent Stress-Test Scenario',
              customerPaymentDelayDays: Number(input.customerPaymentDelayDays ?? 14),
              salesGrowthPct: String(input.salesGrowthPct ?? '-5.0000'),
              operatingCostChangePct: String(input.operatingCostChangePct ?? '8.0000'),
              supplierPaymentTimingDays: Number(input.supplierPaymentTimingDays ?? 0),
            },
            ctx.actorUserId,
          );

          return {
            scenarios: [simulated, ...existingScenarios],
            sourceRecordIds: {
              scenarioIds: [simulated.id],
              forecastIds: [forecasts[0].id],
            },
          };
        },
      },
      {
        name: 'mcp.finmemory.get_historical_snapshots',
        serverId: 'sme-financial-mcp-core',
        description:
          'Retrieves FinMemory historical financial snapshots, period comparisons, and forecast accuracy logs.',
        version: '1.0.0',
        allowedAgents: [
          AgentType.CASH_FLOW_FORECASTING,
          AgentType.STRATEGIC_RECOMMENDATION,
          AgentType.FINANCIAL_REPORTING,
        ],
        requiredRoles: ALL_READ_CAPABLE_ROLES,
        timeoutMs: 8000,
        inputSchema: {
          requiredFields: ['organizationId'],
          allowedFields: ['organizationId'],
        },
        outputRequiredKeys: ['snapshots', 'sourceRecordIds'],
        handler: async (_input, ctx) => {
          const snapshots = await this.finMemory.listSnapshots(ctx.organizationId);
          return {
            snapshots,
            sourceRecordIds: {
              snapshotIds: snapshots.map((s) => s.id),
            },
          };
        },
      },
      {
        name: 'mcp.report.generate_executive_brief',
        serverId: 'sme-financial-mcp-core',
        description:
          'Generates and persists a grounded Executive Financial Brief ReportRecord from current organization ledger, forecast, and risk data.',
        version: '1.0.0',
        allowedAgents: [AgentType.FINANCIAL_REPORTING],
        requiredRoles: ALL_READ_CAPABLE_ROLES.filter((r) => r !== RoleType.AUDITOR),
        timeoutMs: 12000,
        inputSchema: {
          requiredFields: ['organizationId'],
          allowedFields: ['organizationId', 'reportType', 'title'],
        },
        outputRequiredKeys: ['report', 'sourceRecordIds'],
        handler: async (input, ctx) => {
          if (!this.reports) {
            throw new NotFoundException('ReportsService is unavailable in current module context');
          }
          const rawType = typeof input.reportType === 'string' ? input.reportType : 'BUSINESS_HEALTH';
          const type =
            rawType in ReportType
              ? (rawType as ReportType)
              : ReportType.BUSINESS_HEALTH;
          const title =
            typeof input.title === 'string' && input.title.trim()
              ? input.title.trim()
              : undefined;
          const report = await this.reports.generateReport(
            ctx.organizationId,
            { type, title },
            ctx.actorUserId,
          );
          return {
            report,
            sourceRecordIds: {
              reportIds: [report.id],
            },
          };
        },
      },
    ];

    for (const def of definitions) {
      this.tools.set(def.name, def);
    }
  }

  listRegisteredTools(agentType?: AgentType) {
    const all = Array.from(this.tools.values());
    const filtered = agentType ? all.filter((t) => t.allowedAgents.includes(agentType)) : all;

    return filtered.map((t) => ({
      name: t.name,
      serverId: t.serverId,
      description: t.description,
      version: t.version,
      allowedAgents: t.allowedAgents,
      requiredRoles: t.requiredRoles,
      timeoutMs: t.timeoutMs,
      inputSchema: t.inputSchema,
      outputRequiredKeys: t.outputRequiredKeys,
    }));
  }

  getToolOrThrow(toolName: string): RegisteredMcpTool {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new NotFoundException(`MCP tool "${toolName}" is not registered in the Tool Registry`);
    }
    return tool;
  }

  validateToolInput(tool: RegisteredMcpTool, input: Record<string, unknown>): void {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException(`MCP tool "${tool.name}" input must be a JSON object`);
    }

    for (const reqField of tool.inputSchema.requiredFields) {
      if (input[reqField] === undefined || input[reqField] === null || input[reqField] === '') {
        throw new BadRequestException(
          `MCP tool "${tool.name}" is missing required input field "${reqField}"`,
        );
      }
    }

    for (const key of Object.keys(input)) {
      if (!tool.inputSchema.allowedFields.includes(key)) {
        throw new BadRequestException(
          `MCP tool "${tool.name}" rejected unpermitted input field "${key}"`,
        );
      }
    }
  }

  validateToolOutput(tool: RegisteredMcpTool, output: Record<string, unknown>): void {
    if (!output || typeof output !== 'object') {
      throw new BadRequestException(
        `MCP tool "${tool.name}" returned an invalid non-object payload`,
      );
    }

    for (const reqKey of tool.outputRequiredKeys) {
      if (!(reqKey in output)) {
        throw new BadRequestException(
          `MCP tool "${tool.name}" output validation failed: missing required key "${reqKey}"`,
        );
      }
    }
  }

  async invokeRegisteredTool(
    toolName: string,
    input: Record<string, unknown>,
    context: SandboxContext,
  ): Promise<Record<string, unknown>> {
    const startTime = Date.now();
    const targetOrgId =
      typeof input.organizationId === 'string' ? input.organizationId : context.organizationId;

    // 1. Assert sandbox & agent tool allowlist
    await this.sandbox.assertToolExecutionPermitted(context, toolName, targetOrgId);

    const tool = this.getToolOrThrow(toolName);

    // 2. Enforce RBAC role permission on tool
    if (
      context.actorRole !== RoleType.PLATFORM_ADMIN &&
      !tool.requiredRoles.includes(context.actorRole)
    ) {
      await this.sandbox.recordBlockedOperation(
        context,
        toolName,
        `Actor role ${context.actorRole} lacks permission for tool ${toolName}`,
      );
      throw new ForbiddenException(
        `Role ${context.actorRole} is not permitted to invoke MCP tool "${toolName}"`,
      );
    }

    // 3. Validate input schema
    this.validateToolInput(tool, input);

    try {
      // 4. Execute within sandbox timeout
      const output = await this.sandbox.executeWithinTimeout(context, toolName, () =>
        tool.handler(input, context),
      );

      // 5. Validate output schema
      this.validateToolOutput(tool, output);

      context.invokedTools.push({
        toolName,
        invokedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        status: 'SUCCESS',
      });

      return output;
    } catch (error) {
      context.invokedTools.push({
        toolName,
        invokedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        status: 'ERROR',
      });
      throw error;
    }
  }
}
