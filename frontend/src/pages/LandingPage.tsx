import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { StatusIndicator } from '../components/ui/StatusIndicator';
import { useSystemHealth } from '../hooks/useSystemHealth';
import type { FutureAgentBoundaryItem, PlatformCapabilityPillar } from '../types/health.types';
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

const FUTURE_AGENT_BOUNDARIES: readonly FutureAgentBoundaryItem[] = [
  {
    name: 'Central Supervisor / AI Orchestrator',
    role: 'Classifies authorized requests, invokes deterministic calculation services, and coordinates specialist handoffs.',
    accessBoundary: 'Workflow Router & Policy Gate',
  },
  {
    name: 'Finance Data Analyst Agent',
    role: 'Inspects normalized financial records, categories, and reporting period coverage.',
    accessBoundary: 'Read-Only Scoped Backend Tools',
  },
  {
    name: 'Cash-Flow Forecasting Agent',
    role: 'Explains approved forecasting methods, scenario assumptions, and confidence intervals.',
    accessBoundary: 'Read-Only Forecast Calculation Tools',
  },
  {
    name: 'Expense & Anomaly Detection Agent',
    role: 'Flags unusual spending patterns, duplicate-like entries, and category shifts for human review.',
    accessBoundary: 'Read-Only Transaction & Budget Tools',
  },
  {
    name: 'Financial Risk Assessment Agent',
    role: 'Evaluates liquidity pressure, receivables aging, and budget overrun indicators.',
    accessBoundary: 'Read-Only Risk & Aging Tools',
  },
  {
    name: 'Scenario Planning Agent',
    role: 'Compares user-adjusted assumptions against baseline cash-flow and working-capital projections.',
    accessBoundary: 'Read-Only Scenario Simulation Tools',
  },
  {
    name: 'Strategic Recommendation Agent',
    role: 'Synthesizes verified findings into prioritized options with explicit rationale and caveats.',
    accessBoundary: 'Read-Only Verified Findings Context',
  },
  {
    name: 'Financial Reporting Agent',
    role: 'Prepares structured financial and risk report drafts with methodology and data-freshness notes.',
    accessBoundary: 'Read-Only Reporting Service Tools',
  },
  {
    name: 'Verifier AI Agent',
    role: 'Validates output schemas, arithmetic references, source record citations, and policy boundaries.',
    accessBoundary: 'Schema & Citation Verification Gate',
  },
];

export function LandingPage() {
  const { state, refresh } = useSystemHealth();

  return (
    <div className="space-y-10">
      {/* Hero & Introduction Section */}
      <Card as="section" aria-labelledby="platform-title" className="p-8 sm:p-10">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge variant="ok">Phase 1 Foundation Initialized</Badge>
          <Badge variant="teal">Modular Monolithic Architecture</Badge>
          <Badge variant="neutral">Strict Scope Control Active</Badge>
        </div>

        <h1
          id="platform-title"
          className="mt-5 text-2xl font-bold tracking-tight sm:text-4xl"
          style={{ color: 'var(--text-primary)' }}
        >
          AI-Powered SME Financial Intelligence &amp; Risk Management Platform
        </h1>

        <p
          className="mt-4 max-w-3xl text-base leading-relaxed sm:text-lg"
          style={{ color: 'var(--text-secondary)' }}
        >
          An industrial-grade, browser-based financial intelligence and decision-support foundation
          designed for small and medium-sized enterprises. Built on deterministic calculation
          principles, strict organization-level isolation, and traceable historical evidence, the
          platform is architected to provide:
        </p>

        <ul
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Core platform objectives"
        >
          {PLATFORM_PILLARS.map((pillar) => (
            <li
              key={pillar.id}
              style={{
                backgroundColor: 'var(--surface-elevated)',
                borderColor: 'var(--border-subtle)',
              }}
              className="rounded-lg border p-4"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: 'var(--accent-teal)' }}
                  className="h-2 w-2 rounded-full"
                />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {pillar.title}
                </h2>
              </div>
              <p
                className="mt-2 text-xs leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {pillar.summary}
              </p>
              <p className="mt-3 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Boundary: {pillar.architecturalBoundary}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      {/* Live Backend & Database Connectivity Verification Panel */}
      <Card as="section" aria-labelledby="connectivity-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2
              id="connectivity-heading"
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Infrastructure &amp; API Connectivity Status
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Live verification against NestJS REST endpoints (<code>GET /api/health</code> and{' '}
              <code>GET /api/health/ready</code>)
            </p>
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={state.apiStatus === 'loading'}
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: '#f6f3ec',
            }}
            className="cursor-pointer rounded-lg px-4 py-2 text-xs font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.apiStatus === 'loading' ? 'Checking...' : 'Verify Connection'}
          </button>
        </div>

        {/* Error Alert State */}
        {state.apiStatus === 'offline' && state.errorMessage && (
          <div
            role="alert"
            style={{
              backgroundColor: 'var(--status-err-bg)',
              color: 'var(--status-err-text)',
            }}
            className="mt-4 rounded-lg p-4 text-xs font-medium"
          >
            <p className="font-semibold">Backend API Unreachable</p>
            <p className="mt-1">{state.errorMessage}</p>
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {/* API Liveness Card */}
          <div
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
            className="rounded-lg border p-4"
          >
            <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>
              REST API Liveness (/api/health)
            </p>
            <div className="mt-2">
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
            <p className="mt-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
              Service: {state.serviceName ?? 'SME Financial Intelligence API'}
            </p>
          </div>

          {/* PostgreSQL & Prisma Readiness Card */}
          <div
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
            className="rounded-lg border p-4"
          >
            <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>
              PostgreSQL &amp; Prisma (/api/health/ready)
            </p>
            <div className="mt-2">
              {state.databaseStatus === 'loading' && (
                <StatusIndicator tone="loading" label="Verifying PostgreSQL..." />
              )}
              {state.databaseStatus === 'connected' && (
                <StatusIndicator
                  tone="ok"
                  label={`Connected${state.databaseLatencyMs !== null ? ` (${state.databaseLatencyMs} ms)` : ''}`}
                />
              )}
              {state.databaseStatus === 'disconnected' && (
                <StatusIndicator tone="warning" label="Database Not Ready (503)" />
              )}
              {state.databaseStatus === 'unverified' && (
                <StatusIndicator tone="warning" label="Unverified (API Offline)" />
              )}
            </div>
            <p className="mt-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
              Provider: PostgreSQL + Prisma 7
            </p>
          </div>

          {/* Last Verification Timestamp Card */}
          <div
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
            className="rounded-lg border p-4"
          >
            <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>
              Last Health Timestamp
            </p>
            <p
              className="mt-2 font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {formatTimestamp(state.timestamp)}
            </p>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Helmet headers, DTO validation &amp; CORS active
            </p>
          </div>
        </div>
      </Card>

      {/* Prepared Future AI Orchestration Boundaries (Architectural Reference Only) */}
      <Card as="section" aria-labelledby="ai-boundaries-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2
              id="ai-boundaries-heading"
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Prepared Multi-Agent &amp; Domain Architectural Boundaries
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Logical boundaries reserved for subsequent development phases. No AI agents, financial
              ledgers, or dashboards are active in Phase 1. Future agents will access scoped data
              strictly via permission-checked backend service tools.
            </p>
          </div>
          <Badge variant="amber">Phase 2+ Roadmap Boundary</Badge>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FUTURE_AGENT_BOUNDARIES.map((agent) => (
            <div
              key={agent.name}
              style={{
                backgroundColor: 'var(--surface-elevated)',
                borderColor: 'var(--border-subtle)',
              }}
              className="rounded-lg border p-3.5"
            >
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                {agent.name}
              </p>
              <p
                className="mt-1 text-xs leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {agent.role}
              </p>
              <p className="mt-2 font-mono text-[11px]" style={{ color: 'var(--accent-teal)' }}>
                Access: {agent.accessBoundary}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
