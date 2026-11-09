import { ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AgentType, RoleType } from '../../../generated/prisma/client.js';
import { SecurityUtil } from '../../../common/utils/security.util.js';
import { AuditService } from '../../audit/audit.service.js';

export interface BlockedOperationRecord {
  timestamp: string;
  agentType: AgentType;
  attemptedOperation: string;
  reason: string;
}

export interface SandboxContext {
  sandboxId: string;
  workflowRunId: string;
  organizationId: string;
  actorUserId: string;
  actorRole: RoleType;
  agentType: AgentType;
  allowedTools: string[];
  invokedTools: Array<{
    toolName: string;
    invokedAt: string;
    durationMs: number;
    status: 'SUCCESS' | 'ERROR';
  }>;
  blockedOperations: BlockedOperationRecord[];
  maxExecutionMs: number;
  maxToolCalls: number;
  startedAt: number;
  cancelled: boolean;
}

/**
 * Mandatory Agent Execution Sandbox
 *
 * Enforces:
 * - Isolated agent execution contexts
 * - Per-agent narrow tool allowlists
 * - Strict organization-scoped data access
 * - Prohibition of direct DB/Prisma, shell, secret, or automatic payment operations
 * - Input/output validation, timeouts, cancellation, and rate limits
 * - Immutable audit logging of blocked operations
 */
@Injectable()
export class AgentSandboxService {
  private static readonly PROHIBITED_CAPABILITIES = new Set([
    'raw_database_query',
    'prisma_direct_access',
    'shell_execute',
    'child_process_exec',
    'read_env_secrets',
    'unrestricted_network_fetch',
    'initiate_payment_transfer',
    'automatic_fund_transfer',
  ]);

  private static readonly AGENT_TOOL_ALLOWLISTS: Record<AgentType, string[]> = {
    [AgentType.SUPERVISOR_ORCHESTRATOR]: [],
    [AgentType.FINANCE_DATA_ANALYST]: [
      'mcp.finance.get_deterministic_metrics',
      'mcp.finance.get_accounts_and_ledger_summary',
      'mcp.aging.get_receivables_and_payables_aging',
      'mcp.budget.get_budget_variance_summary',
    ],
    [AgentType.CASH_FLOW_FORECASTING]: [
      'mcp.forecast.get_or_generate_cash_flow_forecast',
      'mcp.finance.get_accounts_and_ledger_summary',
      'mcp.finmemory.get_historical_snapshots',
    ],
    [AgentType.EXPENSE_ANOMALY_DETECTION]: [
      'mcp.risk.get_or_scan_anomalies_and_alerts',
      'mcp.finance.get_accounts_and_ledger_summary',
      'mcp.budget.get_budget_variance_summary',
    ],
    [AgentType.FINANCIAL_RISK_ASSESSMENT]: [
      'mcp.risk.get_or_scan_anomalies_and_alerts',
      'mcp.finance.get_deterministic_metrics',
      'mcp.aging.get_receivables_and_payables_aging',
      'mcp.forecast.get_or_generate_cash_flow_forecast',
    ],
    [AgentType.SCENARIO_PLANNING]: [
      'mcp.scenario.simulate_what_if_scenario',
      'mcp.forecast.get_or_generate_cash_flow_forecast',
    ],
    [AgentType.STRATEGIC_RECOMMENDATION]: [
      'mcp.finance.get_deterministic_metrics',
      'mcp.forecast.get_or_generate_cash_flow_forecast',
      'mcp.risk.get_or_scan_anomalies_and_alerts',
      'mcp.finmemory.get_historical_snapshots',
    ],
    [AgentType.FINANCIAL_REPORTING]: [
      'mcp.finance.get_deterministic_metrics',
      'mcp.forecast.get_or_generate_cash_flow_forecast',
      'mcp.risk.get_or_scan_anomalies_and_alerts',
      'mcp.budget.get_budget_variance_summary',
      'mcp.finmemory.get_historical_snapshots',
    ],
    [AgentType.VERIFIER_AI]: [
      'mcp.finance.get_deterministic_metrics',
      'mcp.finance.get_accounts_and_ledger_summary',
    ],
  };

  private readonly activeSandboxes = new Map<string, SandboxContext>();
  private readonly orgRateBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly audit: AuditService) {}

  getAllowedToolsForAgent(agentType: AgentType): string[] {
    return [...(AgentSandboxService.AGENT_TOOL_ALLOWLISTS[agentType] ?? [])];
  }

  createSandboxContext(params: {
    workflowRunId: string;
    organizationId: string;
    actorUserId: string;
    actorRole: RoleType;
    agentType: AgentType;
    maxExecutionMs?: number;
    maxToolCalls?: number;
  }): SandboxContext {
    this.enforceOrganizationRateLimit(params.organizationId);

    const sandboxId = `sbx_${SecurityUtil.generateRandomToken(8)}`;
    const context: SandboxContext = {
      sandboxId,
      workflowRunId: params.workflowRunId,
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      agentType: params.agentType,
      allowedTools: this.getAllowedToolsForAgent(params.agentType),
      invokedTools: [],
      blockedOperations: [],
      maxExecutionMs: params.maxExecutionMs ?? 15_000,
      maxToolCalls: params.maxToolCalls ?? 8,
      startedAt: Date.now(),
      cancelled: false,
    };

    this.activeSandboxes.set(sandboxId, context);
    return context;
  }

  cancelSandbox(sandboxId: string): boolean {
    const ctx = this.activeSandboxes.get(sandboxId);
    if (!ctx) return false;
    ctx.cancelled = true;
    return true;
  }

  releaseSandbox(sandboxId: string): void {
    this.activeSandboxes.delete(sandboxId);
  }

  /**
   * Validates whether an operation or tool call is permitted inside the agent's sandbox.
   * Logs and blocks any unauthorized tool, cross-organization access, shell/DB/secret access,
   * or automatic fund transfer attempt.
   */
  async assertToolExecutionPermitted(
    context: SandboxContext,
    toolName: string,
    targetOrganizationId: string,
  ): Promise<void> {
    if (context.cancelled) {
      await this.recordBlockedOperation(
        context,
        toolName,
        'Sandbox execution was cancelled before tool invocation',
      );
      throw new ForbiddenException('Sandbox execution has been cancelled');
    }

    if (Date.now() - context.startedAt > context.maxExecutionMs) {
      await this.recordBlockedOperation(
        context,
        toolName,
        `Sandbox execution exceeded timeout limit of ${context.maxExecutionMs}ms`,
      );
      throw new HttpException('Agent sandbox execution timed out', HttpStatus.REQUEST_TIMEOUT);
    }

    if (context.invokedTools.length >= context.maxToolCalls) {
      await this.recordBlockedOperation(
        context,
        toolName,
        `Sandbox exceeded maximum tool invocation limit (${context.maxToolCalls})`,
      );
      throw new ForbiddenException(
        `Sandbox tool call limit (${context.maxToolCalls}) exceeded for agent ${context.agentType}`,
      );
    }

    if (targetOrganizationId !== context.organizationId) {
      await this.recordBlockedOperation(
        context,
        toolName,
        `Cross-organization access blocked: sandbox scoped to ${context.organizationId}, attempted ${targetOrganizationId}`,
      );
      throw new ForbiddenException(
        'Sandbox violation: cross-organization data access is strictly prohibited',
      );
    }

    if (AgentSandboxService.PROHIBITED_CAPABILITIES.has(toolName)) {
      await this.recordBlockedOperation(
        context,
        toolName,
        `Capability "${toolName}" is globally prohibited by platform security boundaries (no direct DB, shell, secret, or payment initiation access)`,
      );
      throw new ForbiddenException(
        `Sandbox violation: operation "${toolName}" is prohibited by platform security policy`,
      );
    }

    if (!context.allowedTools.includes(toolName)) {
      await this.recordBlockedOperation(
        context,
        toolName,
        `Tool "${toolName}" is not in the least-privilege allowlist for ${context.agentType}`,
      );
      throw new ForbiddenException(
        `Sandbox violation: agent ${context.agentType} is not authorized to invoke tool "${toolName}"`,
      );
    }
  }

  async executeWithinTimeout<T>(
    context: SandboxContext,
    operationName: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (context.cancelled) {
      throw new ForbiddenException('Sandbox execution was cancelled');
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new HttpException(
            `Sandbox operation "${operationName}" timed out after ${context.maxExecutionMs}ms`,
            HttpStatus.REQUEST_TIMEOUT,
          ),
        );
      }, context.maxExecutionMs);
    });

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  async recordBlockedOperation(
    context: SandboxContext,
    attemptedOperation: string,
    reason: string,
  ): Promise<void> {
    const entry: BlockedOperationRecord = {
      timestamp: new Date().toISOString(),
      agentType: context.agentType,
      attemptedOperation,
      reason,
    };
    context.blockedOperations.push(entry);

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      actorRole: context.actorRole,
      action: `SANDBOX_BLOCKED:${attemptedOperation}`,
      resourceType: 'AGENT_SANDBOX',
      resourceId: context.sandboxId,
      status: 'BLOCKED_BY_SANDBOX',
      details: {
        workflowRunId: context.workflowRunId,
        agentType: context.agentType,
        attemptedOperation,
        reason,
      },
    });
  }

  getSecurityBoundaryDocumentation() {
    return {
      isolatedExecutionContexts: true,
      directDatabaseAccessAllowed: false,
      shellExecutionAllowed: false,
      secretAccessAllowed: false,
      automaticPaymentInitiationAllowed: false,
      organizationScopedDataIsolation: true,
      defaultTimeoutMs: 15_000,
      maxToolCallsPerAgentRun: 8,
      maxWorkflowsPerMinutePerOrg: 30,
      prohibitedCapabilities: Array.from(AgentSandboxService.PROHIBITED_CAPABILITIES),
      agentToolAllowlists: AgentSandboxService.AGENT_TOOL_ALLOWLISTS,
    };
  }

  private enforceOrganizationRateLimit(organizationId: string): void {
    const now = Date.now();
    const windowMs = 60_000;
    const maxRequests = 30;
    const current = this.orgRateBuckets.get(organizationId);
    if (!current || current.resetAt <= now) {
      this.orgRateBuckets.set(organizationId, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (current.count >= maxRequests) {
      throw new HttpException(
        'Organization AI sandbox rate limit exceeded (max 30 agent executions per minute)',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    current.count += 1;
  }
}
