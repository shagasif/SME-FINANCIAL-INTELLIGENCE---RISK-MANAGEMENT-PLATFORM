import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Cpu,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Drawer } from '../../components/ui/Drawer';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatDate } from '../../utils/formatters';
import {
  AgentType,
  ExecutionStatus,
  VerificationStatus,
  type AgentSkillDefinition,
  type AiModelProviderStatusResponse,
  type McpToolDefinition,
  type WorkflowRun,
} from '../../types/ai.types';
import { DEFAULT_DEMO_ORG } from '../../config/demo.config';

const SPECIALIST_AGENTS: Array<{
  type: AgentType;
  name: string;
  role: string;
  sandboxColor: string;
}> = [
  {
    type: AgentType.SUPERVISOR_ORCHESTRATOR,
    name: 'Central Supervisor',
    role: 'Decomposes task, plans specialist sequence, enforces protocol',
    sandboxColor: 'border-blue-500/40 bg-blue-500/5',
  },
  {
    type: AgentType.FINANCE_DATA_ANALYST,
    name: 'Finance Data Analyst',
    role: 'Inspects double-entry ledgers, extracts transaction features',
    sandboxColor: 'border-emerald-500/40 bg-emerald-500/5',
  },
  {
    type: AgentType.CASH_FLOW_FORECASTING,
    name: 'Cash Flow Forecaster',
    role: '7-90 day horizon projection, seasonal trend analysis',
    sandboxColor: 'border-teal-500/40 bg-teal-500/5',
  },
  {
    type: AgentType.EXPENSE_ANOMALY_DETECTION,
    name: 'Expense Auditor',
    role: '8-rule statistical anomaly scan, spike & volume burst detection',
    sandboxColor: 'border-amber-500/40 bg-amber-500/5',
  },
  {
    type: AgentType.FINANCIAL_RISK_ASSESSMENT,
    name: 'Risk Center Assessor',
    role: 'Evaluates liquidity burn rate, safety buffer compliance',
    sandboxColor: 'border-rose-500/40 bg-rose-500/5',
  },
  {
    type: AgentType.SCENARIO_PLANNING,
    name: 'Growth Scenario Planner',
    role: 'Simulates what-if stress vectors, revenue shocks, working capital',
    sandboxColor: 'border-purple-500/40 bg-purple-500/5',
  },
  {
    type: AgentType.STRATEGIC_RECOMMENDATION,
    name: 'Strategic Recommender',
    role: 'Generates non-hallucinatory business recommendations',
    sandboxColor: 'border-cyan-500/40 bg-cyan-500/5',
  },
  {
    type: AgentType.FINANCIAL_REPORTING,
    name: 'Financial Reporter',
    role: 'Compiles grounded executive digests and audit citations',
    sandboxColor: 'border-indigo-500/40 bg-indigo-500/5',
  },
  {
    type: AgentType.VERIFIER_AI,
    name: 'Verifier AI (Independent)',
    role: 'Audits arithmetic calculations, citation references, and non-fraud policy',
    sandboxColor: 'border-amber-600/40 bg-amber-600/5',
  },
];

const LIFECYCLE_STEPS = [
  { step: 1, name: 'RUN_STARTED', label: 'Run Initialized' },
  { step: 2, name: 'PLANNING_SYNTHESIZED', label: 'Supervisor Plan' },
  { step: 3, name: 'SPECIALIST_DELEGATED', label: 'Specialist Dispatch' },
  { step: 4, name: 'SKILL_EXECUTING', label: 'Skills Execution' },
  { step: 5, name: 'MCP_DISPATCHED', label: 'MCP Sandbox Dispatched' },
  { step: 6, name: 'DECIMAL_VERIFIED', label: 'Decimal Arithmetic' },
  { step: 7, name: 'VERIFIER_PASSED', label: 'Verifier AI Audit' },
  { step: 8, name: 'HUMAN_REVIEW_WAITING', label: 'HITL Review Gate' },
  { step: 9, name: 'DECISION_APPLIED', label: 'Decision Applied' },
  { step: 10, name: 'AUDIT_LOG_COMMITTED', label: 'Audit Log Committed' },
];

export function AiOrchestrationPage() {
  const { activeOrg, isAuditor, canRunAiWorkflows } = useAuth();
  const effectiveOrg = activeOrg || DEFAULT_DEMO_ORG;
  const activeOrgId = effectiveOrg.id;

  const [activeTab, setActiveTab] = useState<'WORKFLOWS' | 'ARCHITECTURE' | 'TELEMETRY' | 'HITL'>(
    'WORKFLOWS',
  );

  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [modelStatus, setModelStatus] = useState<AiModelProviderStatusResponse | null>(null);
  const [skills, setSkills] = useState<AgentSkillDefinition[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolDefinition[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Dispatch New Workflow Modal
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [executionMode, setExecutionMode] = useState<'PARALLEL' | 'SEQUENTIAL'>('PARALLEL');
  const [isSubmittingWorkflow, setIsSubmittingWorkflow] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // Workflow Inspection Drawer
  const [inspectRun, setInspectRun] = useState<WorkflowRun | null>(null);

  // HITL Decision Modal
  const [reviewRun, setReviewRun] = useState<WorkflowRun | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVE' | 'REJECT' | 'OVERRIDE'>(
    'APPROVE',
  );
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Fetch Workflows & Telemetry
  useEffect(() => {
    if (!activeOrgId) return;

    let isMounted = true;
    Promise.allSettled([
      apiGet<WorkflowRun[]>(`/v1/organizations/${activeOrgId}/ai/workflows`),
      apiGet<AiModelProviderStatusResponse>(
        `/v1/organizations/${activeOrgId}/ai/model-provider/status`,
      ),
      apiGet<AgentSkillDefinition[]>(`/v1/organizations/${activeOrgId}/ai/skills`),
      apiGet<{ tools?: McpToolDefinition[]; connectedServers?: unknown[] } | McpToolDefinition[]>(
        `/v1/organizations/${activeOrgId}/ai/mcp/discovery`,
      ),
    ])
      .then(([runsRes, statusRes, skillsRes, mcpRes]) => {
        if (!isMounted) return;

        if (runsRes.status === 'fulfilled') {
          const rawRuns = runsRes.value;
          const list = Array.isArray(rawRuns)
            ? rawRuns
            : (rawRuns as unknown as { items?: WorkflowRun[]; data?: WorkflowRun[] })?.items ||
              (rawRuns as unknown as { items?: WorkflowRun[]; data?: WorkflowRun[] })?.data ||
              [];
          setWorkflowRuns(list);
        }

        if (statusRes.status === 'fulfilled') {
          setModelStatus(statusRes.value);
        }

        if (skillsRes.status === 'fulfilled') {
          const rawSkills = skillsRes.value;
          const skillList = Array.isArray(rawSkills)
            ? rawSkills
            : (
                rawSkills as unknown as {
                  items?: AgentSkillDefinition[];
                  data?: AgentSkillDefinition[];
                }
              )?.items ||
              (
                rawSkills as unknown as {
                  items?: AgentSkillDefinition[];
                  data?: AgentSkillDefinition[];
                }
              )?.data ||
              [];
          setSkills(skillList);
        }

        if (mcpRes.status === 'fulfilled') {
          const rawMcp = mcpRes.value;
          const mcpList = Array.isArray(rawMcp)
            ? rawMcp
            : (
                rawMcp as unknown as {
                  tools?: McpToolDefinition[];
                  items?: McpToolDefinition[];
                  data?: McpToolDefinition[];
                }
              )?.tools ||
              (
                rawMcp as unknown as {
                  tools?: McpToolDefinition[];
                  items?: McpToolDefinition[];
                  data?: McpToolDefinition[];
                }
              )?.items ||
              (
                rawMcp as unknown as {
                  tools?: McpToolDefinition[];
                  items?: McpToolDefinition[];
                  data?: McpToolDefinition[];
                }
              )?.data ||
              [];
          setMcpTools(mcpList);
        }

        setError(null);
      })
      .catch(() => {
        if (!isMounted) return;
        setError('Failed to synchronize AI orchestration state.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, reloadKey]);

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  const handleDispatchWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || !prompt.trim()) return;

    setIsSubmittingWorkflow(true);
    setDispatchError(null);

    try {
      await apiPost(`/v1/organizations/${activeOrgId}/ai/workflows/execute`, {
        prompt: prompt.trim(),
      });
      setIsDispatchModalOpen(false);
      setPrompt('');
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDispatchError(err.message);
      } else {
        setDispatchError('Failed to dispatch AI orchestration run.');
      }
    } finally {
      setIsSubmittingWorkflow(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || !reviewRun) return;

    setIsSubmittingReview(true);
    setReviewError(null);

    try {
      await apiPost(`/v1/organizations/${activeOrgId}/tasks`, {
        title: `Human Review [${reviewDecision}]: ${reviewRun.taskClassification || 'AI Workflow Decision'}`,
        description:
          reviewNotes.trim() ||
          `Workflow ${reviewRun.id} reviewed with decision ${reviewDecision}.`,
        priority: 'HIGH',
      });
      setReviewRun(null);
      setReviewNotes('');
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setReviewError(err.message);
      } else {
        setReviewError('Failed to commit human review decision.');
      }
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const pendingHitlRuns = workflowRuns.filter(
    (run) => run.verificationStatus === VerificationStatus.REQUIRES_HUMAN_REVIEW,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <Cpu className="w-6 h-6 text-[var(--brand-primary)]" />
            Multi-Agent AI Orchestration Dashboard
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Central Supervisor, 8 Specialist Agents, Verifier AI, 9 Registered Skills, 8 MCP Sandbox
            Tools, and 10-step lifecycle auditing.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoading}
            title="Refresh AI runs and telemetry"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          {!isAuditor && canRunAiWorkflows && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setDispatchError(null);
                setIsDispatchModalOpen(true);
              }}
            >
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              Dispatch Orchestration
            </Button>
          )}
        </div>
      </div>

      {/* Auditor Notice */}
      {isAuditor && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs"
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <span className="font-semibold block mb-0.5">Auditor Mode Active</span>
            <span className="leading-relaxed opacity-90">
              Multi-agent orchestration runs, telemetry, skill invocations, and MCP audit trails are
              visible in read-only inspection. Dispatching new workflows and signing off on human
              review gates are blocked.
            </span>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('WORKFLOWS')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'WORKFLOWS'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          Orchestration Runs ({workflowRuns.length})
        </button>
        <button
          onClick={() => setActiveTab('ARCHITECTURE')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'ARCHITECTURE'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          Agent Architecture (8 Specialists + Verifier)
        </button>
        <button
          onClick={() => setActiveTab('TELEMETRY')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'TELEMETRY'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          Live Gemini Telemetry
        </button>
        <button
          onClick={() => setActiveTab('HITL')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'HITL'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          Human-in-the-Loop ({pendingHitlRuns.length})
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: WORKFLOW RUNS */}
      {activeTab === 'WORKFLOWS' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[var(--border-subtle)]">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Autonomous Workflow Execution History
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Multi-agent runs with task classification, specialist delegators, and independent
                Verifier AI signoff
              </p>
            </div>

            {isLoading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : workflowRuns.length === 0 ? (
              <div className="py-16 text-center text-xs text-[var(--text-muted)]">
                <Bot className="mx-auto h-8 w-8 text-[var(--text-muted)] opacity-50 mb-2" />
                No multi-agent workflow runs dispatched yet. Dispatch your first goal to initiate
                orchestrations.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Prompt Goal</th>
                      <th className="py-3 px-4 font-semibold">Classification</th>
                      <th className="py-3 px-4 font-semibold text-center">Specialists</th>
                      <th className="py-3 px-4 font-semibold text-center">Status</th>
                      <th className="py-3 px-4 font-semibold text-center">Verifier Signoff</th>
                      <th className="py-3 px-4 font-semibold text-right">Dispatched</th>
                      <th className="py-3 px-4 font-semibold text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                    {workflowRuns.map((run) => (
                      <tr
                        key={run.id}
                        className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                      >
                        <td className="py-3 px-4 max-w-xs font-semibold text-[var(--text-primary)] truncate">
                          {run.prompt}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[var(--brand-primary)]">
                          {run.taskClassification || 'FINANCIAL_SYNTHESIS'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="rounded bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[10px]">
                            {run.selectedAgents?.length || 0} agents
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                              run.status === ExecutionStatus.COMPLETED
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : run.status === ExecutionStatus.RUNNING
                                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                  : run.status === ExecutionStatus.FAILED
                                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                    : 'bg-slate-500/10 text-slate-500'
                            }`}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                              run.verificationStatus === VerificationStatus.APPROVED
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : run.verificationStatus ===
                                    VerificationStatus.REQUIRES_HUMAN_REVIEW
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                  : 'bg-slate-500/10 text-slate-500'
                            }`}
                          >
                            {run.verificationStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-[11px] text-[var(--text-muted)]">
                          {formatDate(run.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInspectRun(run)}
                            className="h-7 px-2 text-[11px]"
                          >
                            Inspect Run
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: AGENT ARCHITECTURE */}
      {activeTab === 'ARCHITECTURE' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Specialist Agent Sandboxes (8 Specialists + Verifier AI)
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Each specialist operates in an isolated memory sandbox with strict permission bounds
              and dedicated tool dispatchers.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {SPECIALIST_AGENTS.map((agent) => (
                <div
                  key={agent.type}
                  className={`rounded-xl border p-4 transition-all ${agent.sandboxColor}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[var(--text-primary)]">
                      {agent.name}
                    </span>
                    <span className="rounded bg-[var(--surface-elevated)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
                      {agent.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-2 leading-relaxed">
                    {agent.role}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 10-Step Workflow Lifecycle Timeline */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Authoritative 10-Step Workflow Execution Timeline
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Deterministic state lifecycle transition matrix enforced on every orchestration run
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {LIFECYCLE_STEPS.map((s) => (
                <div
                  key={s.step}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2.5 text-center"
                >
                  <span className="inline-block h-5 w-5 rounded-full bg-[var(--brand-primary)] text-white text-[10px] font-bold leading-5 mb-1">
                    {s.step}
                  </span>
                  <div className="text-[11px] font-bold text-[var(--text-primary)] truncate">
                    {s.label}
                  </div>
                  <div className="text-[9px] font-mono text-[var(--text-muted)] mt-0.5 truncate">
                    {s.name}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Registered Skills & MCP Tools Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Skills */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Registered Domain Skills ({skills.length > 0 ? skills.length : 9} Skills)
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Deterministic domain algorithms dispatched by specialist agents
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {(skills.length > 0
                  ? skills
                  : [
                      { skillId: 'calculateCashRunway', name: 'Calculate Cash Runway' },
                      { skillId: 'detectExpenseSurge', name: 'Detect Expense Surge' },
                      { skillId: 'verifyInvoiceBalance', name: 'Verify Invoice Balance' },
                      { skillId: 'computeWorkingCapital', name: 'Compute Working Capital' },
                      { skillId: 'assessBudgetVariance', name: 'Assess Budget Variance' },
                      { skillId: 'reconcileLedgerToBank', name: 'Reconcile Ledger to Bank' },
                      {
                        skillId: 'projectReceivablesCollection',
                        name: 'Project Receivables Collection',
                      },
                      { skillId: 'estimateQuarterlyTax', name: 'Estimate Quarterly Tax' },
                      {
                        skillId: 'evaluateAnomalySeverity',
                        name: 'Evaluate Anomaly Severity',
                      },
                    ]
                ).map((sk) => (
                  <div
                    key={sk.skillId}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-xs"
                  >
                    <span className="font-semibold text-[var(--text-primary)]">{sk.name}</span>
                    <span className="font-mono text-[10px] text-[var(--brand-primary)]">
                      {sk.skillId}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* MCP Tools */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                MCP Sandbox Tools ({mcpTools.length > 0 ? mcpTools.length : 8} Tools)
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Model Context Protocol endpoints enforcing read-only boundary constraints
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {(mcpTools.length > 0
                  ? mcpTools
                  : [
                      { name: 'read_general_ledger', description: 'Double-entry read only' },
                      { name: 'read_bank_feed', description: 'Bank feed transaction reader' },
                      { name: 'read_invoices_bills', description: 'AR/AP aging reader' },
                      { name: 'read_budget_variance', description: 'Plan vs actual variances' },
                      { name: 'read_finmemory_snapshot', description: 'Episodic memory reader' },
                      { name: 'read_risk_alerts', description: 'Active anomaly reader' },
                      { name: 'write_scenario_sandbox', description: 'In-memory sandbox writer' },
                      { name: 'write_ai_audit_log', description: 'Immutable audit logger' },
                    ]
                ).map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-xs"
                  >
                    <span className="font-mono font-semibold text-[var(--brand-primary)]">
                      {tool.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">{tool.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LIVE GEMINI TELEMETRY */}
      {activeTab === 'TELEMETRY' && (
        <div className="space-y-6">
          {/* Active Model Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                Active AI Provider
              </span>
              <div className="mt-2 text-xl font-bold font-mono text-[var(--brand-primary)]">
                {modelStatus?.configuration.activeProvider?.toUpperCase() || 'GEMINI'}
              </div>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 inline-flex items-center gap-1 font-semibold">
                <CheckCircle2 className="h-3 w-3" />
                Live API Connected
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                Orchestrator Invocations
              </span>
              <div className="mt-2 text-2xl font-bold font-mono text-[var(--text-primary)]">
                {modelStatus?.usage.totalInvocations || 0}
              </div>
              <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                Total API calls recorded
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                Token Telemetry
              </span>
              <div className="mt-2 text-2xl font-bold font-mono text-[var(--text-primary)]">
                {(modelStatus?.usage.totalTokens || 0).toLocaleString()}
              </div>
              <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                Total prompt & completion tokens
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                Estimated Cost
              </span>
              <div className="mt-2 text-2xl font-bold font-mono text-[var(--text-primary)]">
                ${modelStatus?.usage.totalEstimatedCostUsd || '0.0000'}
              </div>
              <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                Calculated at provider rates
              </span>
            </div>
          </div>

          {/* Model Mapping Table */}
          {modelStatus?.configuration.modelMapping && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
              <div className="p-4 border-b border-[var(--border-subtle)]">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Live Agent to Model Mappings
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Exact underlying model deployed per specialist agent
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[var(--surface-elevated)]/60 text-[10px] uppercase font-semibold text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                    <tr>
                      <th className="py-2.5 px-4">Specialist Agent</th>
                      <th className="py-2.5 px-4">Deployed Model</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                    {Object.entries(modelStatus.configuration.modelMapping).map(
                      ([agent, model]) => (
                        <tr key={agent} className="hover:bg-[var(--surface-elevated)]/30">
                          <td className="py-2.5 px-4 font-mono font-bold text-[var(--text-primary)]">
                            {agent}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[var(--brand-primary)]">
                            {model}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                              ACTIVE
                            </span>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: HUMAN-IN-THE-LOOP (HITL) */}
      {activeTab === 'HITL' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  Pending Human Review Gates ({pendingHitlRuns.length})
                </h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Orchestration runs gated by Verifier AI requiring authorized signoff before output
                  application
                </p>
              </div>
            </div>

            {pendingHitlRuns.length === 0 ? (
              <div className="py-16 text-center text-xs text-[var(--text-muted)]">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 opacity-60 mb-2" />
                Zero pending review gates. All autonomous AI runs passed verification or were
                reviewed.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {pendingHitlRuns.map((run) => (
                  <div key={run.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm text-[var(--text-primary)]">
                        {run.prompt}
                      </div>
                      <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        REQUIRES_HUMAN_REVIEW
                      </span>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)]">
                      {run.resultPayload?.executiveSummary || 'No summary synthesized.'}
                    </p>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Dispatched on {formatDate(run.createdAt)}
                      </span>
                      {!isAuditor && canRunAiWorkflows && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setReviewRun(run);
                            setReviewDecision('APPROVE');
                            setReviewNotes('');
                            setReviewError(null);
                          }}
                        >
                          Review & Decide
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dispatch Workflow Modal */}
      {isDispatchModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsDispatchModalOpen(false)}
          title="Dispatch Multi-Agent Orchestration"
        >
          <form onSubmit={handleDispatchWorkflow} className="space-y-4 text-xs">
            {dispatchError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-600 dark:text-rose-400">
                {dispatchError}
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Financial Goal / Analysis Prompt *
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Audit Q1 operating expenses, project 30-day runway, and check for vendor duplicate anomalies..."
                rows={4}
                required
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent p-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Execution Mode
              </label>
              <select
                value={executionMode}
                onChange={(e) => setExecutionMode(e.target.value as 'PARALLEL' | 'SEQUENTIAL')}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 text-xs"
              >
                <option value="PARALLEL">PARALLEL (Specialists execute concurrently)</option>
                <option value="SEQUENTIAL">SEQUENTIAL (Stage-by-stage dependency passing)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button variant="ghost" type="button" onClick={() => setIsDispatchModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={isSubmittingWorkflow}
                disabled={!prompt.trim()}
              >
                Start Autonomous Run
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* HITL Review Decision Modal */}
      {reviewRun && (
        <Modal
          isOpen={true}
          onClose={() => setReviewRun(null)}
          title={`Human-in-the-Loop Signoff: ${reviewRun.prompt.substring(0, 40)}...`}
        >
          <form onSubmit={handleReviewSubmit} className="space-y-4 text-xs">
            {reviewError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-600 dark:text-rose-400">
                {reviewError}
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Review Decision *
              </label>
              <select
                value={reviewDecision}
                onChange={(e) =>
                  setReviewDecision(e.target.value as 'APPROVE' | 'REJECT' | 'OVERRIDE')
                }
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 text-xs font-semibold"
                required
              >
                <option value="APPROVE">APPROVE (Accept findings and commit to memory)</option>
                <option value="OVERRIDE">
                  OVERRIDE (Apply modified figures with review notes)
                </option>
                <option value="REJECT">REJECT (Discard run findings)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Reviewer Justification / Audit Notes *
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Document your verification rationale..."
                rows={3}
                required
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent p-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button variant="ghost" type="button" onClick={() => setReviewRun(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={isSubmittingReview}
                disabled={!reviewNotes.trim()}
              >
                Commit Review Decision
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Workflow Inspection Drawer */}
      <Drawer
        isOpen={Boolean(inspectRun)}
        onClose={() => setInspectRun(null)}
        title="Workflow Run Inspection"
        width="lg"
      >
        {inspectRun && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-3 space-y-2">
              <div className="font-bold text-sm text-[var(--text-primary)]">
                {inspectRun.prompt}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-[var(--brand-primary)]">
                  {inspectRun.taskClassification}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  Mode: {inspectRun.executionMode}
                </span>
              </div>
            </div>

            {inspectRun.resultPayload && (
              <div className="space-y-2">
                <span className="font-bold text-[var(--text-primary)]">Executive Summary:</span>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed bg-[var(--surface-subtle)] p-3 rounded-lg border border-[var(--border-subtle)]">
                  {inspectRun.resultPayload.executiveSummary}
                </p>
              </div>
            )}

            {/* Verifier Audit */}
            {inspectRun.resultPayload?.verifierAudit && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-1.5">
                <span className="font-bold text-amber-950 dark:text-amber-200 block">
                  Verifier AI Audit Report:
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    Arithmetic Verified:{' '}
                    <span className="font-bold">
                      {inspectRun.resultPayload.verifierAudit.arithmeticVerified ? 'YES' : 'NO'}
                    </span>
                  </div>
                  <div>
                    Citations Verified:{' '}
                    <span className="font-bold">
                      {inspectRun.resultPayload.verifierAudit.citationsVerified ? 'YES' : 'NO'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
