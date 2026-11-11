import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  FileText,
  Layers,
  Lock,
  Moon,
  RefreshCw,
  Scale,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { StatusIndicator } from '../components/ui/StatusIndicator';
import { useAuth } from '../context/useAuth';
import { useSystemHealth } from '../hooks/useSystemHealth';
import { useTheme } from '../hooks/useTheme';
import type { PlatformCapabilityPillar } from '../types/health.types';
import { formatTimestamp } from '../utils/formatters';

const PLATFORM_PILLARS: readonly PlatformCapabilityPillar[] = [
  {
    id: 'financial-visibility',
    title: 'Financial visibility',
    summary:
      'Consolidates fragmented spreadsheets, transaction exports, invoices, payables, and departmental budgets into a single auditable financial workspace.',
    architecturalBoundary: 'Financial Records, Transactions, Invoices & Budget Modules',
  },
  {
    id: 'cash-flow-awareness',
    title: 'Cash-flow awareness',
    summary:
      'Monitors working-capital commitments, receivables aging, and configurable short-term cash-flow projections with explicit assumption tracking.',
    architecturalBoundary: 'Working-Capital & Cash-Flow Forecasting Modules',
  },
  {
    id: 'financial-risk-monitoring',
    title: 'Financial risk monitoring',
    summary:
      'Identifies unusual expense patterns, overdue receivables, and projected liquidity pressure with traceable source-record evidence and review priorities.',
    architecturalBoundary: 'Anomaly Detection & Risk Monitoring Modules',
  },
  {
    id: 'historical-financial-intelligence',
    title: 'Historical financial intelligence',
    summary:
      'Connects monthly financial snapshots, prior forecasts, and actual outcomes through FinMemory to explain how business financial conditions evolve over time.',
    architecturalBoundary: 'FinMemory Historical Intelligence Module',
  },
  {
    id: 'evidence-based-decisions',
    title: 'Evidence-based business decisions',
    summary:
      'Separates deterministic decimal-safe calculations from bounded AI interpretation, scenario comparisons, verifier checks, and human approval workflows.',
    architecturalBoundary: 'Scenario Planning, Reporting & AI Orchestration Modules',
  },
];

const SPECIALIST_AGENTS = [
  {
    id: 'supervisor',
    name: 'Central Supervisor',
    category: 'Orchestrator',
    description:
      'Classifies requests, verifies user permissions, coordinates specialist dispatch, and enforces verification boundaries.',
    icon: Brain,
    badge: 'Core Router',
  },
  {
    id: 'data-analyst',
    name: 'Finance Data Analyst Agent',
    category: 'Ingestion & Hygiene',
    description:
      'Normalizes bank transactions, auto-categorizes line items, and inspects reporting period completeness.',
    icon: FileSpreadsheet,
    badge: 'Read-Only Scoped',
  },
  {
    id: 'forecasting',
    name: 'Cash-Flow Forecasting Agent',
    category: 'Predictive Modeling',
    description:
      'Runs deterministic 30/60/90-day cash projections, seasonal modeling, and working capital decay simulations.',
    icon: TrendingUp,
    badge: 'Deterministic Math',
  },
  {
    id: 'anomaly',
    name: 'Expense & Anomaly Agent',
    category: 'Surveillance',
    description:
      'Flags unusual spending deviations, duplicate invoices, and vendor pricing drift with statistical Z-scores.',
    icon: AlertTriangle,
    badge: 'Real-Time Alerting',
  },
  {
    id: 'risk',
    name: 'Financial Risk Assessment Agent',
    category: 'Risk Intelligence',
    description:
      'Evaluates liquidity coverage, debt service capability, and overdue receivables concentration thresholds.',
    icon: ShieldAlert,
    badge: 'Prudential Check',
  },
  {
    id: 'scenario',
    name: 'Scenario Planning Agent',
    category: 'Simulation',
    description:
      'Models what-if assumptions: delayed receipts, revenue shocks, payroll growth, and capital expenditures.',
    icon: Layers,
    badge: 'Stress Testing',
  },
  {
    id: 'recommendation',
    name: 'Strategic Recommendation Agent',
    category: 'Advisory',
    description:
      'Synthesizes verified findings into prioritized managerial options with explicit rationale and confidence intervals.',
    icon: Sparkles,
    badge: 'Actionable Advice',
  },
  {
    id: 'reporting',
    name: 'Financial Reporting Agent',
    category: 'Documentation',
    description:
      'Generates executive briefings, P&L statements, and board decks with source record citations and audit references.',
    icon: FileText,
    badge: 'Audit-Ready',
  },
  {
    id: 'verifier',
    name: 'Verifier AI Agent',
    category: 'Guardrail & Governance',
    description:
      'Independent auditor validating mathematical formulas, hallucination guards, and strict policy adherence before output.',
    icon: ShieldCheck,
    badge: 'Security Gate',
  },
];

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Request Ingestion',
    desc: 'User query or automated telemetry triggers an execution envelope.',
  },
  {
    step: '02',
    title: 'Tenant Quarantine',
    desc: 'Verifies organization-scoping and enforces zero cross-tenant leakage.',
  },
  {
    step: '03',
    title: 'Supervisor Routing',
    desc: 'Classifies analytical intent and builds a DAG execution plan.',
  },
  {
    step: '04',
    title: 'Specialist Execution',
    desc: 'Dispatches tasks across specialized financial agents concurrently.',
  },
  {
    step: '05',
    title: 'Deterministic Math',
    desc: 'Calculates exact decimal balances outside the LLM to prevent arithmetic drift.',
  },
  {
    step: '06',
    title: 'Verifier AI Audit',
    desc: 'Cross-checks every calculation and claim against immutable database records.',
  },
  {
    step: '07',
    title: 'Human Review Gate',
    desc: 'High-risk actions require explicit Owner or Finance Manager confirmation.',
  },
  {
    step: '08',
    title: 'Strategic Synthesis',
    desc: 'Compiles grounded recommendations, executive takeaways, and caveats.',
  },
  {
    step: '09',
    title: 'FinMemory Snapshot',
    desc: 'Embeds decision context into longitudinal organizational memory.',
  },
  {
    step: '10',
    title: 'Audited Dispatch',
    desc: 'Delivers results to UI with verifiable audit trail and execution metadata.',
  },
];

const ROLES_INFO = [
  {
    role: 'Business Owner',
    desc: 'Full administrative authority, strategic scenario approvals, organization settings, and unrestricted financial intelligence oversight.',
    access: 'Unrestricted Access',
  },
  {
    role: 'System Administrator',
    desc: 'Workspace provisioning, user role management, security policies, integration hooks, and system health monitoring.',
    access: 'Workspace Admin',
  },
  {
    role: 'Finance Manager',
    desc: 'Budget allocation, cash-flow forecasting dispatch, payment run scheduling, and multi-agent scenario orchestration.',
    access: 'Financial Operations',
  },
  {
    role: 'Accountant',
    desc: 'Transaction entry, CSV import ledger reconciliations, invoice categorization, and expense classification.',
    access: 'Ledger & Transactions',
  },
  {
    role: 'Auditor',
    desc: 'Strict read-only oversight across all financial records, audit logs, and risk reports with disabled mutating actions and locked exports.',
    access: 'Read-Only Governance',
  },
];

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const { state, refresh } = useSystemHealth();
  const { theme, toggleTheme } = useTheme();

  const launchAppDestination = isAuthenticated ? '/overview' : '/login';

  return (
    <div className="min-h-screen bg-[var(--surface-bg)] text-[var(--text-primary)] transition-colors selection:bg-[var(--accent-teal)]/20 selection:text-[var(--accent-teal)]">
      {/* 1. PUBLIC NAVIGATION BAR */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[var(--surface-card)]/90 border-b border-[var(--border-subtle)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#12372A] to-[#0D9488] flex items-center justify-center text-white font-bold shadow-md shadow-[#0D9488]/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 text-[#FBFBFA]" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-[var(--text-primary)] block">
                ApexFin AI
              </span>
              <span className="text-[10px] uppercase tracking-wider text-[var(--accent-teal)] font-semibold block">
                SME Financial Intelligence
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[var(--text-secondary)]">
            <a href="#features" className="hover:text-[var(--text-primary)] transition-colors">
              Features
            </a>
            <a
              href="#ai-architecture"
              className="hover:text-[var(--text-primary)] transition-colors"
            >
              AI Multi-Agent
            </a>
            <a href="#analytics" className="hover:text-[var(--text-primary)] transition-colors">
              Risk &amp; Analytics
            </a>
            <a href="#security" className="hover:text-[var(--text-primary)] transition-colors">
              Security &amp; RBAC
            </a>
            <a href="#status" className="hover:text-[var(--text-primary)] transition-colors">
              System Status
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)] transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            <Link
              to="/login"
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors"
            >
              Sign In
            </Link>

            <Link
              to={launchAppDestination}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-primary)] hover:bg-[#12372A]/90 text-white shadow-sm transition-all shadow-[#12372A]/20 hover:scale-[1.02]"
            >
              <span>Launch App</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none opacity-40 dark:opacity-20"
        >
          <div className="w-[800px] h-[400px] bg-gradient-to-tr from-[#12372A]/30 via-[#0D9488]/20 to-transparent blur-3xl rounded-full" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] border border-[var(--accent-teal)]/20">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span>Next-Generation Autonomous Financial Operations for SMEs</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.15]">
              AI-Powered SME Financial Intelligence &amp; Risk Management Platform
            </h1>

            <p className="text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl mx-auto">
              Empower your enterprise with deterministic cash-flow forecasting, autonomous
              multi-agent financial surveillance, and real-time risk intelligence. Eliminate
              spreadsheet fragmentation with audit-grade accuracy.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Link
                to={launchAppDestination}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl bg-[var(--accent-primary)] hover:bg-[#12372A]/90 text-white shadow-lg shadow-[#12372A]/25 transition-all hover:-translate-y-0.5"
              >
                <span>Launch Live Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm transition-all"
              >
                <span>Sign In to Platform</span>
                <Users className="w-4 h-4 text-[var(--accent-teal)]" />
              </Link>
            </div>

            <p className="text-xs text-[var(--text-muted)] pt-1">
              Enterprise-grade role-based access for Business Owners, Finance Managers, Accountants,
              and Auditors.
            </p>
          </div>

          {/* LIVE METRICS PREVIEW BANNER */}
          <div className="mt-14 max-w-6xl mx-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-[var(--surface-elevated)]/60 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400/80" />
                <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
                <span className="ml-2 font-mono text-[11px] text-[var(--text-muted)]">
                  apex-fin-intelligence // live-telemetry-engine
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Live Financial Telemetry Active
                </span>
              </div>
            </div>

            <div className="p-6 sm:p-8 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 bg-gradient-to-b from-[var(--surface-card)] to-[var(--surface-elevated)]/40">
              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-1">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Cash Balance</span>
                  <Wallet className="w-4 h-4 text-[var(--accent-teal)]" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                  $1,248,500
                </div>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                  <TrendingUp className="w-3 h-3" />
                  <span>+12.4% vs last month</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-1">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Cash Runway</span>
                  <Clock className="w-4 h-4 text-[var(--accent-teal)]" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                  8.2 Months
                </div>
                <div className="text-[11px] font-medium text-[var(--text-muted)]">
                  Low burn rate · Safe buffer
                </div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-1">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Working Capital</span>
                  <Scale className="w-4 h-4 text-[var(--accent-teal)]" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                  $482,000
                </div>
                <div className="text-[11px] font-semibold text-emerald-600">
                  Current Ratio: 2.4x
                </div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-1">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>AI Risk Guard</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                  0 Critical
                </div>
                <div className="text-[11px] font-medium text-[var(--text-muted)]">
                  2 Anomaly alerts triaged
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-[var(--surface-elevated)]/70 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <Sparkles className="w-4 h-4 text-[var(--accent-teal)]" />
                <span>Explore all 13 specialized modules with one unified interface.</span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/cash-flow"
                  className="text-xs font-semibold text-[var(--accent-teal)] hover:underline inline-flex items-center gap-1"
                >
                  <span>Forecast Models</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
                <span className="text-[var(--text-muted)]">•</span>
                <Link
                  to="/risk-center"
                  className="text-xs font-semibold text-[var(--accent-teal)] hover:underline inline-flex items-center gap-1"
                >
                  <span>Risk Center</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
                <span className="text-[var(--text-muted)]">•</span>
                <Link
                  to="/ai-orchestration"
                  className="text-xs font-semibold text-[var(--accent-teal)] hover:underline inline-flex items-center gap-1"
                >
                  <span>Multi-Agent AI</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. CORE PLATFORM PILLARS */}
      <section
        id="features"
        className="py-16 sm:py-24 border-t border-[var(--border-subtle)] bg-[var(--surface-card)]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <Badge variant="teal">Platform Architecture</Badge>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Engineered for Audit-Grade Financial Accuracy
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Five foundational pillars designed to eliminate spreadsheet fragility, prevent
              liquidity shortfalls, and power decisive SME leadership.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PLATFORM_PILLARS.map((pillar) => (
              <div
                key={pillar.id}
                className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/50 hover:bg-[var(--surface-elevated)] transition-all hover:shadow-md space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-teal)]" />
                    <h3 className="text-base font-bold text-[var(--text-primary)]">
                      {pillar.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    {pillar.summary}
                  </p>
                </div>
                <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
                  <span>Scope Boundary:</span>
                  <span className="text-[var(--text-secondary)] font-medium text-right truncate max-w-[180px]">
                    {pillar.architecturalBoundary}
                  </span>
                </div>
              </div>
            ))}

            <div className="p-6 rounded-2xl border border-[var(--accent-teal)]/30 bg-gradient-to-br from-[var(--surface-elevated)] to-[var(--accent-teal)]/5 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Autonomous Multi-Agent AI
                  </h3>
                </div>
                <p className="mt-3 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                  Supervisor-orchestrated specialist agents collaborate across 9 analytical skills
                  and 8 MCP tools, protected by a Verifier AI gate to guarantee zero hallucinations.
                </p>
              </div>
              <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
                <span>Guardrail Gate:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Verifier AI &amp; HITL
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. MULTI-AGENT AI ARCHITECTURE SECTION */}
      <section
        id="ai-architecture"
        className="py-16 sm:py-24 border-t border-[var(--border-subtle)]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <Badge variant="ok">Multi-Agent Intelligence</Badge>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
              Central Supervisor &amp; 8 Specialist AI Agents
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)]">
              Unlike generic chatbots, our platform runs a deterministic multi-agent pipeline.
              Requests are classified by a Central Supervisor, executed by specialist models,
              verified by an independent AI auditor, and bound by strict decimal arithmetic.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-center space-y-1">
              <div className="text-3xl font-extrabold text-[var(--accent-teal)]">1</div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Central Supervisor
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">Intent Router &amp; Policy</div>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-center space-y-1">
              <div className="text-3xl font-extrabold text-[var(--accent-teal)]">8</div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Specialist Agents
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">Scoped Analytical Roles</div>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-center space-y-1">
              <div className="text-3xl font-extrabold text-[var(--accent-teal)]">9</div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Financial Skills
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">Deterministic Calculations</div>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-center space-y-1">
              <div className="text-3xl font-extrabold text-[var(--accent-teal)]">8</div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Registered MCP Tools
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">Secure Database Connectors</div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SPECIALIST_AGENTS.map((agent) => {
              const Icon = agent.icon;
              return (
                <div
                  key={agent.id}
                  className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-[var(--accent-teal)]/50 transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-9 h-9 rounded-xl bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      {agent.badge}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">{agent.name}</h4>
                    <p className="text-[11px] font-medium text-[var(--accent-teal)]">
                      {agent.category}
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                      {agent.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-6 sm:p-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-6">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  10-Stage Auditable Workflow Lifecycle
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  From user ingestion through arithmetic sandboxing to immutable audit recording.
                </p>
              </div>
              <Badge variant="teal">Deterministic Pipeline</Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {WORKFLOW_STEPS.map((step) => (
                <div
                  key={step.step}
                  className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/60 space-y-1.5"
                >
                  <span className="font-mono text-xs font-bold text-[var(--accent-teal)]">
                    {step.step}
                  </span>
                  <h5 className="text-xs font-bold text-[var(--text-primary)] leading-tight">
                    {step.title}
                  </h5>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)]">
                    Verifier AI &amp; Human-in-the-Loop (HITL) Guardrails
                  </h4>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Calculations must reconcile to the penny against ledger records. All high-impact
                    scenario actions require explicit human approval.
                  </p>
                </div>
              </div>
              <Link
                to="/ai-orchestration"
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent-teal)] text-white hover:opacity-90 transition-opacity"
              >
                Inspect Orchestration UI
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 5. FINANCIAL ANALYTICS & RISK CENTER HIGHLIGHTS */}
      <section
        id="analytics"
        className="py-16 sm:py-24 border-t border-[var(--border-subtle)] bg-[var(--surface-card)]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <Badge variant="amber">Financial Intelligence</Badge>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Continuous Risk Surveillance &amp; Scenario Planning
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Identify cash cliffs months before they happen with automated receivables aging,
              statistical anomaly detection, and interactive stress tests.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Autonomous Anomaly Engine
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Flags unusual spending spikes, duplicate payment hazards, supplier price inflation,
                and out-of-policy line items using statistical standard deviations.
              </p>
              <Link
                to="/risk-center"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-teal)] hover:underline"
              >
                <span>View Risk Center</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                30/60/90-Day Cash-Flow Modeling
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Project deterministic cash positions based on real invoices, supplier terms,
                recurring payroll, and collections delay assumptions.
              </p>
              <Link
                to="/cash-flow"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-teal)] hover:underline"
              >
                <span>View Cash-Flow Forecast</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                What-If Scenario Stress Testing
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Simulate revenue shocks (-20%), delayed collections (+30 days), or planned hiring
                rounds to evaluate liquidity resiliency before committing capital.
              </p>
              <Link
                to="/scenarios"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-teal)] hover:underline"
              >
                <span>Explore Scenarios</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 6. ENTERPRISE SECURITY & RBAC */}
      <section id="security" className="py-16 sm:py-24 border-t border-[var(--border-subtle)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <Badge variant="teal">Governance &amp; RBAC</Badge>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Enterprise Role Governance &amp; Tenant Isolation
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Every request is strictly bounded by user identity and organization tenancy. Full
              compliance with financial audit separation of concerns.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {ROLES_INFO.map((r) => (
              <div
                key={r.role}
                className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[var(--accent-teal)]" />
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">{r.role}</h3>
                  </div>
                  <span className="inline-block mt-1 text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                    {r.access}
                  </span>
                  <p className="mt-3 text-xs text-[var(--text-secondary)] leading-relaxed">
                    {r.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] grid grid-cols-1 sm:grid-cols-3 gap-6 text-center sm:text-left">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-[var(--accent-teal)] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-[var(--text-primary)]">
                  Multi-Tenant Quarantine
                </h4>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Hardware and database-enforced organization schema boundaries with cryptographic
                  request tokens.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-[var(--accent-teal)] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-[var(--text-primary)]">
                  Immutable Audit Trail
                </h4>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Every user action, import, AI suggestion, and verifier audit is logged with
                  tamper-evident timestamps.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[var(--accent-teal)] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-[var(--text-primary)]">
                  Auditor Lock Restrictions
                </h4>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Auditor persona is prohibited from dispatching mutations or exporting confidential
                  summaries without authorization.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. LIVE INFRASTRUCTURE CONNECTIVITY STATUS */}
      <section
        id="status"
        className="py-16 border-t border-[var(--border-subtle)] bg-[var(--surface-card)]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[var(--accent-teal)]" />
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  Infrastructure &amp; API Connectivity Status
                </h2>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Live verification against NestJS REST endpoints (<code>GET /api/health</code> and{' '}
                <code>GET /api/health/ready</code>)
              </p>
            </div>

            <button
              type="button"
              onClick={refresh}
              disabled={state.apiStatus === 'loading'}
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)] transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${state.apiStatus === 'loading' ? 'animate-spin' : ''}`}
              />
              <span>{state.apiStatus === 'loading' ? 'Checking...' : 'Verify Connection'}</span>
            </button>
          </div>

          {state.apiStatus === 'offline' && state.errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-medium text-red-600 dark:text-red-400 space-y-1"
            >
              <p className="font-semibold">Backend API Unreachable</p>
              <p>{state.errorMessage}</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                REST API Liveness (/api/health)
              </span>
              <div>
                {state.apiStatus === 'loading' && (
                  <StatusIndicator tone="loading" label="Checking API liveness..." />
                )}
                {state.apiStatus === 'online' && (
                  <StatusIndicator tone="ok" label="Operational (ok)" />
                )}
                {state.apiStatus === 'offline' && (
                  <StatusIndicator tone="error" label="Offline / Unreachable" />
                )}
              </div>
              <p className="font-mono text-xs text-[var(--text-secondary)]">
                Service: {state.serviceName ?? 'SME Financial Intelligence API'}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                PostgreSQL &amp; Prisma (/api/health/ready)
              </span>
              <div>
                {state.databaseStatus === 'loading' && (
                  <StatusIndicator tone="loading" label="Verifying PostgreSQL..." />
                )}
                {state.databaseStatus === 'connected' && (
                  <StatusIndicator
                    tone="ok"
                    label={`Connected (${state.databaseLatencyMs ?? 0} ms)`}
                  />
                )}
                {state.databaseStatus === 'disconnected' && (
                  <StatusIndicator tone="error" label="Database disconnected" />
                )}
                {state.databaseStatus === 'unverified' && (
                  <StatusIndicator tone="warning" label="Readiness unverified" />
                )}
              </div>
              <p className="font-mono text-xs text-[var(--text-secondary)]">
                Engine: PostgreSQL Prisma Client
              </p>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Telemetry Heartbeat
              </span>
              <p className="font-mono text-xs text-[var(--text-primary)]">
                {state.timestamp ? formatTimestamp(state.timestamp) : 'Awaiting check...'}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Continuous active probe against backend health endpoints.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 8. ENTERPRISE FOOTER */}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface-bg)] py-12 text-xs text-[var(--text-secondary)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="space-y-3 col-span-2 md:col-span-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[var(--accent-primary)] flex items-center justify-center text-white font-bold text-xs">
                  AF
                </div>
                <span className="font-bold text-sm text-[var(--text-primary)]">ApexFin AI</span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                AI-Powered SME Financial Intelligence &amp; Risk Management Platform. Deterministic
                calculations, autonomous multi-agent surveillance, and auditable governance.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] mb-3">
                Core Modules
              </h4>
              <ul className="space-y-2 text-[11px]">
                <li>
                  <Link to="/overview" className="hover:text-[var(--accent-teal)]">
                    Overview Dashboard
                  </Link>
                </li>
                <li>
                  <Link to="/transactions" className="hover:text-[var(--accent-teal)]">
                    Transactions &amp; CSV
                  </Link>
                </li>
                <li>
                  <Link to="/invoices-payables" className="hover:text-[var(--accent-teal)]">
                    Invoices &amp; Payables
                  </Link>
                </li>
                <li>
                  <Link to="/budgets" className="hover:text-[var(--accent-teal)]">
                    Budgets
                  </Link>
                </li>
                <li>
                  <Link to="/cash-flow" className="hover:text-[var(--accent-teal)]">
                    Cash Flow Forecast
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] mb-3">
                Intelligence
              </h4>
              <ul className="space-y-2 text-[11px]">
                <li>
                  <Link to="/analytics" className="hover:text-[var(--accent-teal)]">
                    Financial Analytics
                  </Link>
                </li>
                <li>
                  <Link to="/finmemory" className="hover:text-[var(--accent-teal)]">
                    FinMemory Longitudinal
                  </Link>
                </li>
                <li>
                  <Link to="/risk-center" className="hover:text-[var(--accent-teal)]">
                    Risk Center
                  </Link>
                </li>
                <li>
                  <Link to="/ai-orchestration" className="hover:text-[var(--accent-teal)]">
                    AI Orchestration
                  </Link>
                </li>
                <li>
                  <Link to="/scenarios" className="hover:text-[var(--accent-teal)]">
                    Scenario Planning
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] mb-3">
                Governance &amp; Auth
              </h4>
              <ul className="space-y-2 text-[11px]">
                <li>
                  <Link to="/login" className="hover:text-[var(--accent-teal)]">
                    Sign In
                  </Link>
                </li>
                <li>
                  <Link to="/register" className="hover:text-[var(--accent-teal)]">
                    Register Account
                  </Link>
                </li>
                <li>
                  <Link to="/reports" className="hover:text-[var(--accent-teal)]">
                    Audit Reports
                  </Link>
                </li>
                <li>
                  <Link to="/admin" className="hover:text-[var(--accent-teal)]">
                    Administration
                  </Link>
                </li>
                <li>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-semibold text-[10px]">
                    SOC-2 Type II Ready
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[var(--text-muted)]">
            <p>
              © 2026 ApexFin AI Inc. All rights reserved. Enterprise-grade SME financial
              intelligence.
            </p>
            <div className="flex items-center gap-4">
              <span>Tenant-Isolated Scoping</span>
              <span>•</span>
              <span>Zero-Hallucination Guardrails</span>
              <span>•</span>
              <span>256-bit TLS</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
