export const AgentType = {
  SUPERVISOR_ORCHESTRATOR: 'SUPERVISOR_ORCHESTRATOR',
  FINANCE_DATA_ANALYST: 'FINANCE_DATA_ANALYST',
  CASH_FLOW_FORECASTING: 'CASH_FLOW_FORECASTING',
  EXPENSE_ANOMALY_DETECTION: 'EXPENSE_ANOMALY_DETECTION',
  FINANCIAL_RISK_ASSESSMENT: 'FINANCIAL_RISK_ASSESSMENT',
  SCENARIO_PLANNING: 'SCENARIO_PLANNING',
  STRATEGIC_RECOMMENDATION: 'STRATEGIC_RECOMMENDATION',
  FINANCIAL_REPORTING: 'FINANCIAL_REPORTING',
  VERIFIER_AI: 'VERIFIER_AI',
} as const;

export type AgentType = (typeof AgentType)[keyof typeof AgentType];

export const ExecutionStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
} as const;

export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

export const VerificationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REQUIRES_HUMAN_REVIEW: 'REQUIRES_HUMAN_REVIEW',
  REJECTED: 'REJECTED',
} as const;

export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export interface AiModelUsageMetrics {
  provider: 'openai' | 'gemini' | 'anthropic' | 'deterministic-grounded';
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: string;
  latencyMs: number;
  status: 'SUCCESS' | 'FALLBACK_USED' | 'ERROR';
  attempts: number;
  timestamp: string;
}

export interface AgentRun {
  id: string;
  workflowRunId: string;
  agentType: AgentType;
  sandboxId: string;
  status: ExecutionStatus;
  loadedSkills: string[];
  allowedTools: string[];
  invokedTools: string[];
  mcpToolCalls?: Array<{ toolName: string; durationMs: number; status: string }>;
  blockedOperations?: Array<{ operation: string; timestamp: string; reason: string }>;
  modelUsage?: AiModelUsageMetrics;
  outputPayload?: Record<string, unknown>;
  evidenceCitations?: Record<string, string[]>;
  durationMs?: number;
  errorMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface VerifierAuditReport {
  verificationStatus: VerificationStatus;
  verificationPassed: boolean;
  arithmeticVerified: boolean;
  citationsVerified: boolean;
  nonFraudComplianceVerified: boolean;
  discrepanciesFound?: Array<{ field: string; expected: unknown; actual: unknown }>;
  approvedForPresentation: boolean;
}

export interface WorkflowRun {
  id: string;
  organizationId: string;
  requestedByUserId: string;
  prompt: string;
  taskClassification: string;
  selectedAgents: AgentType[];
  executionMode: string;
  status: ExecutionStatus;
  verificationStatus: VerificationStatus;
  preHookLog?: Record<string, unknown>;
  duringHookLog?: Record<string, unknown>;
  postHookLog?: Record<string, unknown>;
  errorHookLog?: Record<string, unknown>;
  resultPayload?: {
    executiveSummary: string;
    taskClassification: string;
    selectedSpecialistAgents: AgentType[];
    specialistFindings: Array<Record<string, unknown>>;
    verifierAudit: VerifierAuditReport;
    humanReviewRequired: boolean;
    nonFraudPolicy: string;
    sourceRecordIds: Record<string, string[]>;
  };
  modelUsageSummary?: {
    invocationsCount: number;
    totalTokens: number;
    totalEstimatedCostUsd: string;
    records: AiModelUsageMetrics[];
  };
  agentRuns?: AgentRun[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentSkillDefinition {
  skillId: string;
  name: string;
  version: string;
  responsibleAgent: AgentType;
  category: string;
  purpose: string;
  permittedTools: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface McpToolDefinition {
  name: string;
  serverId: string;
  description: string;
  allowedAgentTypes: AgentType[];
  parametersSchema: Record<string, unknown>;
}

export interface McpServerInfo {
  serverId: string;
  status: 'CONNECTED' | 'UNAVAILABLE';
  protocolVersion: string;
  toolsCount: number;
}

export interface AiModelProviderConfigurationSummary {
  activeProvider: string;
  externalCredentialsConfigured: boolean;
  secretsExposed: boolean;
  timeoutMs: number;
  maxRetries: number;
  rateLimitPerMinute: number;
  modelMapping: Record<AgentType, string>;
}

export interface AiModelOrganizationUsageSummary {
  organizationId: string;
  totalInvocations: number;
  totalTokens: number;
  totalEstimatedCostUsd: string;
  recentInvocations: Array<AiModelUsageMetrics & { agentType: AgentType }>;
}

export interface AiModelProviderStatusResponse {
  configuration: AiModelProviderConfigurationSummary;
  usage: AiModelOrganizationUsageSummary;
}
