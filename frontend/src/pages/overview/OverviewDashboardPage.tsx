import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  DollarSign,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { FinancialTransaction } from '../../types/financial.types';
import { RiskAlertStatus, type RiskAlert } from '../../types/risk.types';

interface MetricResult<T = string | null> {
  metricKey: string;
  name: string;
  status: 'COMPUTED' | 'UNSUPPORTED_MISSING_DATA';
  value: T;
  unit: string;
  formula: string;
  dataLimitations: string[];
  components?: Record<string, string>;
}

interface AgingScheduleValues {
  current: string;
  days1to30: string;
  days31to60: string;
  days61to90: string;
  days90Plus: string;
  totalOutstanding: string;
  sourceRecordIds?: string[];
}

interface AnalyticsMetricsResponse {
  organizationId: string;
  currency: string;
  formulaVersion: string;
  generatedAt: string;
  reportingPeriod: {
    startDate: string;
    endDate: string;
  };
  metrics: {
    operatingCashFlow: MetricResult<string | null>;
    cashRunway: MetricResult<string | null>;
    currentRatio: MetricResult<string | null>;
    quickRatio: MetricResult<string | null>;
    grossMargin: MetricResult<string | null>;
    expenseGrowth: MetricResult<string | null>;
    workingCapital: MetricResult<string | null>;
    budgetVariance: MetricResult<string | null>;
    receivableAging: MetricResult<AgingScheduleValues>;
    payableAging: MetricResult<AgingScheduleValues>;
  };
}

interface TransactionListResponse {
  items: FinancialTransaction[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function OverviewDashboardPage() {
  const { activeOrg, isAuditor, canMutateLedger, canRunAiWorkflows } = useAuth();

  const [metricsData, setMetricsData] = useState<AnalyticsMetricsResponse | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<FinancialTransaction[]>([]);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [reloadKey, setReloadKey] = useState<number>(0);

  const activeOrgId = activeOrg?.id;

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setReloadKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!activeOrgId) return;

    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) {
        setIsLoading(true);
        setError(null);
      }
    });

    Promise.all([
      apiGet<AnalyticsMetricsResponse>(`/v1/organizations/${activeOrgId}/analytics/metrics`),
      apiGet<TransactionListResponse>(`/v1/organizations/${activeOrgId}/transactions?limit=6`),
      apiGet<RiskAlert[]>(`/v1/organizations/${activeOrgId}/risk-alerts`),
    ])
      .then(([metricsRes, txsRes, alertsRes]) => {
        if (!isMounted) return;
        setMetricsData(metricsRes);
        setRecentTransactions(txsRes.items || []);
        setRiskAlerts(alertsRes || []);
        setLastRefreshed(new Date());
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError(
            'Failed to fetch financial intelligence data. Please check network connectivity.',
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, reloadKey]);

  if (!activeOrg) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">No Active Organization</h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Please select or create an SME workspace from the header menu.
        </p>
      </div>
    );
  }

  const currency = activeOrg.baseCurrency || 'USD';
  const metrics = metricsData?.metrics;

  // Derive metrics safely
  const runwayMonths = metrics?.cashRunway?.value;
  const ocf = metrics?.operatingCashFlow?.value;
  const workingCapital = metrics?.workingCapital?.value;
  const quickRatio = metrics?.quickRatio?.value;

  // Compute liquid cash from working capital components or default to 0
  const liquidCash =
    metrics?.quickRatio?.components?.liquidCash ||
    metrics?.workingCapital?.components?.currentAssets ||
    '0.00';

  const isAlertActive = (a: RiskAlert) =>
    a.status === RiskAlertStatus.NEW ||
    a.status === RiskAlertStatus.ACKNOWLEDGED ||
    a.status === RiskAlertStatus.INVESTIGATING ||
    (a.status as string) === 'OPEN';

  const activeRiskAlerts = riskAlerts.filter(isAlertActive);
  const highSeverityAlerts = activeRiskAlerts.filter((a) => a.severity === 'HIGH');
  const mediumSeverityAlerts = activeRiskAlerts.filter((a) => a.severity === 'MEDIUM');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Financial Intelligence Overview
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--accent-teal)] font-semibold">
              {currency}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-2">
            <span>Deterministic financial intelligence & continuous risk telemetry</span>
            <span>•</span>
            <span>Refreshed: {lastRefreshed.toLocaleTimeString()}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoading}
            title="Refresh dashboard metrics"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          {canMutateLedger && (
            <Link to="/transactions">
              <Button variant="primary" size="sm">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Entry
              </Button>
            </Link>
          )}

          {canRunAiWorkflows && (
            <Link to="/ai-assistant">
              <Button variant="secondary" size="sm">
                <Bot className="w-3.5 h-3.5 mr-1.5 text-[var(--accent-teal)]" />
                AI Assistant
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Auditor Read-Only Notice Banner */}
      {isAuditor && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs"
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <span className="font-semibold block mb-0.5">
              Auditor Mode Active (Strict Read-Only)
            </span>
            <span className="leading-relaxed opacity-90">
              You are signed in under the Auditor profile. Financial mutations, approvals, and
              report exports are blocked by backend RBAC policy (HTTP 403). All audit trails and
              historical records are strictly immutable.
            </span>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            Try Again
          </Button>
        </div>
      )}

      {/* KPI StatCards Grid (6 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && !metricsData ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-3"
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))
        ) : (
          <>
            {/* Card 1: Liquid Cash Balance */}
            <StatCard
              title="Liquid Cash & Bank"
              value={formatCurrency(liquidCash, currency)}
              subtitle="Unencumbered operating cash"
              icon={<Wallet className="w-5 h-5" />}
              dataLimitation={metrics?.quickRatio?.dataLimitations?.[0]}
            />

            {/* Card 2: Cash Runway */}
            <StatCard
              title="Cash Runway"
              value={runwayMonths ? `${runwayMonths} mos` : '—'}
              subtitle="Based on 30-day net cash burn"
              icon={<Clock className="w-5 h-5" />}
              statusBadge={{
                label:
                  runwayMonths && Number.parseFloat(runwayMonths) < 3
                    ? 'Critical'
                    : runwayMonths && Number.parseFloat(runwayMonths) < 6
                      ? 'Watch'
                      : 'Healthy',
                variant:
                  runwayMonths && Number.parseFloat(runwayMonths) < 3
                    ? 'error'
                    : runwayMonths && Number.parseFloat(runwayMonths) < 6
                      ? 'amber'
                      : 'ok',
              }}
              dataLimitation={metrics?.cashRunway?.dataLimitations?.[0]}
            />

            {/* Card 3: Operating Cash Flow */}
            <StatCard
              title="Operating Cash Flow (30d)"
              value={formatCurrency(ocf, currency)}
              subtitle="Cash receipts minus cash payments"
              icon={<DollarSign className="w-5 h-5" />}
              change={
                ocf
                  ? {
                      value: Number.parseFloat(ocf) >= 0 ? 'Cash Positive' : 'Cash Burn',
                      isPositive: Number.parseFloat(ocf) >= 0,
                    }
                  : undefined
              }
              dataLimitation={metrics?.operatingCashFlow?.dataLimitations?.[0]}
            />

            {/* Card 4: Net Working Capital */}
            <StatCard
              title="Net Working Capital"
              value={formatCurrency(workingCapital, currency)}
              subtitle="Current Assets - Current Liabilities"
              icon={<Scale className="w-5 h-5" />}
              dataLimitation={metrics?.workingCapital?.dataLimitations?.[0]}
            />

            {/* Card 5: Quick Ratio */}
            <StatCard
              title="Quick Ratio (Acid-Test)"
              value={quickRatio ? Number.parseFloat(quickRatio).toFixed(2) : '—'}
              subtitle="Target >= 1.00 for short-term liquidity"
              icon={<Activity className="w-5 h-5" />}
              statusBadge={{
                label:
                  quickRatio && Number.parseFloat(quickRatio) < 1.0
                    ? 'Sub-Optimal (<1.0)'
                    : 'Solvent (>=1.0)',
                variant: quickRatio && Number.parseFloat(quickRatio) < 1.0 ? 'amber' : 'ok',
              }}
              dataLimitation={metrics?.quickRatio?.dataLimitations?.[0]}
            />

            {/* Card 6: Active Risk Anomalies */}
            <StatCard
              title="Risk & Anomaly Detections"
              value={activeRiskAlerts.length}
              subtitle={`${highSeverityAlerts.length} High Priority • ${mediumSeverityAlerts.length} Medium`}
              icon={<AlertTriangle className="w-5 h-5" />}
              statusBadge={{
                label: highSeverityAlerts.length > 0 ? 'Action Required' : 'Guarded',
                variant: highSeverityAlerts.length > 0 ? 'error' : 'ok',
              }}
            />
          </>
        )}
      </div>

      {/* Middle Row: AR / AP Aging & Working Capital Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Receivables Aging Summary */}
        <div className="p-5 sm:p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Accounts Receivable Aging (AR)
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Outstanding customer invoices categorized by days past due
              </p>
            </div>
            <Link
              to="/invoices-payables"
              className="text-xs font-semibold text-[var(--accent-teal)] hover:underline inline-flex items-center gap-1"
            >
              View Invoices <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {metrics?.receivableAging?.value ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold text-[var(--text-secondary)]">
                  Total Outstanding AR
                </span>
                <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
                  {formatCurrency(metrics.receivableAging.value.totalOutstanding, currency)}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2 pt-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                    Current
                  </span>
                  <span className="font-mono font-semibold text-[var(--text-primary)] mt-0.5 block truncate">
                    {formatCurrency(metrics.receivableAging.value.current, currency, 0)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                    1-30d
                  </span>
                  <span className="font-mono font-semibold text-[var(--text-primary)] mt-0.5 block truncate">
                    {formatCurrency(metrics.receivableAging.value.days1to30, currency, 0)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                    31-60d
                  </span>
                  <span className="font-mono font-semibold text-[var(--text-primary)] mt-0.5 block truncate">
                    {formatCurrency(metrics.receivableAging.value.days31to60, currency, 0)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-canvas)] border border-amber-500/20 text-amber-700 dark:text-amber-400">
                  <span className="text-[10px] uppercase block opacity-80">61-90d</span>
                  <span className="font-mono font-semibold mt-0.5 block truncate">
                    {formatCurrency(metrics.receivableAging.value.days61to90, currency, 0)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-canvas)] border border-red-500/20 text-red-600 dark:text-red-400">
                  <span className="text-[10px] uppercase block opacity-80">90d+</span>
                  <span className="font-mono font-semibold mt-0.5 block truncate">
                    {formatCurrency(metrics.receivableAging.value.days90Plus, currency, 0)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              No open customer receivables recorded.
            </div>
          )}
        </div>

        {/* Payables Aging Summary */}
        <div className="p-5 sm:p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Accounts Payable Aging (AP)
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Outstanding supplier bills categorized by days past due
              </p>
            </div>
            <Link
              to="/invoices-payables"
              className="text-xs font-semibold text-[var(--accent-teal)] hover:underline inline-flex items-center gap-1"
            >
              View Bills <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {metrics?.payableAging?.value ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold text-[var(--text-secondary)]">
                  Total Outstanding AP
                </span>
                <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
                  {formatCurrency(metrics.payableAging.value.totalOutstanding, currency)}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2 pt-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                    Current
                  </span>
                  <span className="font-mono font-semibold text-[var(--text-primary)] mt-0.5 block truncate">
                    {formatCurrency(metrics.payableAging.value.current, currency, 0)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                    1-30d
                  </span>
                  <span className="font-mono font-semibold text-[var(--text-primary)] mt-0.5 block truncate">
                    {formatCurrency(metrics.payableAging.value.days1to30, currency, 0)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                    31-60d
                  </span>
                  <span className="font-mono font-semibold text-[var(--text-primary)] mt-0.5 block truncate">
                    {formatCurrency(metrics.payableAging.value.days31to60, currency, 0)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-canvas)] border border-amber-500/20 text-amber-700 dark:text-amber-400">
                  <span className="text-[10px] uppercase block opacity-80">61-90d</span>
                  <span className="font-mono font-semibold mt-0.5 block truncate">
                    {formatCurrency(metrics.payableAging.value.days61to90, currency, 0)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-canvas)] border border-red-500/20 text-red-600 dark:text-red-400">
                  <span className="text-[10px] uppercase block opacity-80">90d+</span>
                  <span className="font-mono font-semibold mt-0.5 block truncate">
                    {formatCurrency(metrics.payableAging.value.days90Plus, currency, 0)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              No open supplier payables recorded.
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Recent Ledger Transactions & Active Risk Center Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions (2 cols on lg) */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Recent Ledger Activity
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Latest journal entries recorded in the organization chart of accounts
              </p>
            </div>
            <Link
              to="/transactions"
              className="text-xs font-semibold text-[var(--accent-teal)] hover:underline inline-flex items-center gap-1"
            >
              Full Ledger <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentTransactions.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 pr-3 font-semibold">Date</th>
                    <th className="py-2.5 px-3 font-semibold">Description</th>
                    <th className="py-2.5 px-3 font-semibold">Category</th>
                    <th className="py-2.5 px-3 font-semibold">Account</th>
                    <th className="py-2.5 pl-3 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {recentTransactions.map((tx) => {
                    const isIncome = tx.type === 'INCOME';
                    const isExpense = tx.type === 'EXPENSE';
                    const txDate =
                      tx.date || (tx as unknown as { transactionDate?: string }).transactionDate;
                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                      >
                        <td className="py-2.5 pr-3 text-[var(--text-secondary)] whitespace-nowrap">
                          {formatDate(txDate)}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[var(--text-primary)] max-w-[180px] truncate">
                          {tx.description}
                        </td>
                        <td className="py-2.5 px-3 text-[var(--text-muted)] whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-[var(--surface-canvas)] border border-[var(--border-subtle)] text-[10px]">
                            {tx.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[var(--text-secondary)] whitespace-nowrap">
                          {tx.account?.name || 'General'}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono font-semibold whitespace-nowrap">
                          <span
                            className={
                              isIncome
                                ? 'text-[var(--status-ok-text)]'
                                : isExpense
                                  ? 'text-[var(--text-primary)]'
                                  : 'text-[var(--accent-teal)]'
                            }
                          >
                            {isIncome ? '+' : isExpense ? '-' : ''}
                            {formatCurrency(tx.amount, currency)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              No transactions recorded yet in this workspace.
            </div>
          )}
        </div>

        {/* Active Risk Alerts Box (1 col on lg) */}
        <div className="p-5 sm:p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Active Risk Alerts</h2>
              </div>
              <Link
                to="/risk-center"
                className="text-xs font-semibold text-[var(--accent-teal)] hover:underline inline-flex items-center gap-1"
              >
                Risk Center <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {activeRiskAlerts.slice(0, 4).length > 0 ? (
                activeRiskAlerts.slice(0, 4).map((alert) => {
                  const alertDesc =
                    alert.description ||
                    (alert as unknown as { explanation?: string }).explanation ||
                    '';
                  return (
                    <div
                      key={alert.id}
                      className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)]/60 text-xs space-y-1 hover:border-[var(--accent-teal)] transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          {alert.title}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded-md font-mono uppercase font-bold shrink-0 ${
                            alert.severity === 'HIGH'
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {alert.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                        {alertDesc}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <span>
                    No active anomaly alerts detected across current transactions and accounts.
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
            <Link to="/risk-center">
              <Button variant="outline" size="sm" className="w-full justify-center">
                Review All Risk Signals
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
