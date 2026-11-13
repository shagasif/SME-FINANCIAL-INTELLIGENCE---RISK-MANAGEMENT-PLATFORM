import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, Maximize2 } from 'lucide-react';
import { formatCurrency, formatPercentage } from '../../utils/formatters';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import type { AgingScheduleMetricValue, AllMetricsResponse } from '../../types/analytics.types';

const DONUT_COLORS = [
  '#2563eb',
  '#0f766e',
  '#7c3aed',
  '#d97706',
  '#dc2626',
  '#0891b2',
  '#4f46e5',
  '#65a30d',
];

const AGING_BUCKET_LABELS: Array<{ key: string; label: string }> = [
  { key: 'CURRENT', label: 'Current' },
  { key: '1_30', label: '1–30d' },
  { key: '31_60', label: '31–60d' },
  { key: '61_90', label: '61–90d' },
  { key: '90_PLUS', label: '90+d' },
];

function extractAgingChartData(value: unknown) {
  if (!value || typeof value !== 'object') {
    return { isComplete: true, totalOutstanding: 0, totalOverdue: 0, rows: [] };
  }
  const sched = value as AgingScheduleMetricValue;
  const bucketMap = new Map<string, { amount: number; count: number }>();
  if (Array.isArray(sched.buckets)) {
    for (const b of sched.buckets) {
      const normalized = b.bucket.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      bucketMap.set(normalized, {
        amount: Number.parseFloat(b.amount ?? '0') || 0,
        count: b.count ?? 0,
      });
    }
  }
  const rows = AGING_BUCKET_LABELS.map((b) => {
    const entry = bucketMap.get(b.key);
    return {
      bucket: b.label,
      amount: entry?.amount ?? 0,
      count: entry?.count ?? 0,
    };
  });
  return {
    isComplete: sched.isComplete !== false,
    totalOutstanding: Number.parseFloat(sched.totalOutstanding ?? '0') || 0,
    totalOverdue: Number.parseFloat(sched.totalOverdue ?? '0') || 0,
    rows,
  };
}

function ChartEmptyState({
  message,
  height = 'h-[175px]',
}: {
  message: string;
  height?: string;
}) {
  return (
    <div
      className={`flex ${height} flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-canvas)]/40 px-3 text-center`}
    >
      <AlertCircle className="h-4 w-4 text-[var(--text-muted)]" />
      <p className="max-w-md text-[11px] text-[var(--text-muted)] leading-relaxed">{message}</p>
    </div>
  );
}

export type ExpandedChartKey =
  | 'income-vs-expenses'
  | 'cash-flow-trend'
  | 'expense-breakdown'
  | 'aging-schedule'
  | 'profitability-trend'
  | 'budget-vs-actual';

interface AnalyticsChartsSectionProps {
  metricsData: AllMetricsResponse | null;
  selectedCategory: string;
  currency: string;
}

export function AnalyticsChartsSection({
  metricsData,
  selectedCategory,
  currency,
}: AnalyticsChartsSectionProps) {
  const [expandedChart, setExpandedChart] = useState<ExpandedChartKey | null>(null);

  if (!metricsData) return null;

  const monthlyData = (metricsData.charts?.monthlySeries ?? []).map((pt) => ({
    month: pt.label,
    income: Number.parseFloat(pt.income) || 0,
    expenses: Number.parseFloat(pt.expenses) || 0,
    netCashFlow: Number.parseFloat(pt.netCashFlow) || 0,
    grossMarginPct: pt.grossMarginPct !== null ? Number.parseFloat(pt.grossMarginPct) : null,
  }));

  const expenseBreakdown = (metricsData.charts?.expenseBreakdown ?? []).map((item) => ({
    category: item.category,
    amount: Number.parseFloat(item.amount) || 0,
    percentage: Number.parseFloat(item.percentage) || 0,
    count: item.count,
  }));

  const arAging = extractAgingChartData(metricsData.metrics.receivableAging?.value);
  const apAging = extractAgingChartData(metricsData.metrics.payableAging?.value);
  const combinedAgingRows = AGING_BUCKET_LABELS.map((b, idx) => ({
    bucket: b.label,
    receivables: arAging.rows[idx]?.amount ?? 0,
    payables: apAging.rows[idx]?.amount ?? 0,
  }));
  const agingComplete = arAging.isComplete && apAging.isComplete;
  const hasAnyAgingBalance = arAging.totalOutstanding > 0 || apAging.totalOutstanding > 0;

  const profitabilityTrend = metricsData.charts?.profitabilityTrend;
  const budgetComparison = metricsData.charts?.budgetComparison;

  const showIncomeVsExpenses =
    selectedCategory === 'ALL' ||
    selectedCategory === 'Liquidity' ||
    selectedCategory === 'Operational';
  const showCashFlowTrend = selectedCategory === 'ALL' || selectedCategory === 'Liquidity';
  const showExpenseBreakdown =
    selectedCategory === 'ALL' ||
    selectedCategory === 'Profitability' ||
    selectedCategory === 'Operational';
  const showCombinedAging = selectedCategory === 'ALL' || selectedCategory === 'Efficiency';
  const showProfitabilityTrend = selectedCategory === 'ALL' || selectedCategory === 'Profitability';
  const showBudgetVsActual = selectedCategory === 'ALL' || selectedCategory === 'Operational';

  const compactCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(val);

  // Aggregated totals for expanded modals
  const totalIncome = monthlyData.reduce((acc, curr) => acc + curr.income, 0);
  const totalExpenses = monthlyData.reduce((acc, curr) => acc + curr.expenses, 0);
  const totalNetCashFlow = monthlyData.reduce((acc, curr) => acc + curr.netCashFlow, 0);
  const totalCategorizedExpenses = expenseBreakdown.reduce((acc, curr) => acc + curr.amount, 0);

  const getModalMeta = (chartKey: ExpandedChartKey) => {
    switch (chartKey) {
      case 'income-vs-expenses':
        return {
          title: 'Income vs Expenses',
          description: `Monthly actual inflows vs operating expenses (${currency})`,
        };
      case 'cash-flow-trend':
        return {
          title: 'Cash Flow Trend',
          description: `Monthly net cash flow movement (${currency})`,
        };
      case 'expense-breakdown':
        return {
          title: 'Expense Breakdown',
          description: `Expense distribution by category (${currency})`,
        };
      case 'aging-schedule':
        return {
          title: 'Accounts Receivable & Payable Aging',
          description: `Open AR vs AP balances by overdue bucket (${currency})`,
        };
      case 'profitability-trend':
        return {
          title: 'Profitability Trend',
          description: `Monthly gross profit margin (%) from classified COGS`,
        };
      case 'budget-vs-actual':
        return {
          title: 'Budget vs Actual',
          description: budgetComparison
            ? `${budgetComparison.budgetName} (${budgetComparison.currency})`
            : `Approved allocation vs actual spending (${currency})`,
        };
    }
  };

  return (
    <section aria-label="Financial Analytics Charts" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Financial Analytics Charts
          </h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            Live {currency} performance and aging breakdown for the selected reporting period
          </p>
        </div>
      </div>

      {/* 3 charts per row on desktop (xl), 2 on tablet (md), 1 on mobile */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* Chart 1: Income vs Expenses */}
        {showIncomeVsExpenses && (
          <div
            role="button"
            tabIndex={0}
            data-testid="chart-card-income-vs-expenses"
            onClick={() => setExpandedChart('income-vs-expenses')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpandedChart('income-vs-expenses');
              }
            }}
            className="group relative cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3.5 shadow-xs transition-all hover:border-[var(--brand-primary)]/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--brand-primary)] transition-colors">
                  Income vs Expenses
                </h3>
                <p className="text-[10px] text-[var(--text-muted)]">
                  Monthly actual inflows vs operating expenses ({currency})
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedChart('income-vs-expenses');
                }}
                aria-label="Expand Income vs Expenses chart"
                title="Click to expand chart"
                className="shrink-0 rounded-md p-1 text-[var(--text-muted)] opacity-60 transition-all hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] hover:opacity-100 group-hover:opacity-100"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {monthlyData.length === 0 ? (
              <ChartEmptyState message="No income or expense transactions recorded in this period." />
            ) : (
              <div className="h-[175px] w-full">
                <ResponsiveContainer width="100%" height={175} minWidth={180}>
                  <BarChart data={monthlyData} margin={{ top: 4, right: 6, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <YAxis
                      tickFormatter={compactCurrency}
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      width={48}
                    />
                    <Tooltip
                      formatter={(val: unknown) => formatCurrency(Number(val ?? 0), currency)}
                      contentStyle={{
                        backgroundColor: 'var(--surface-card)',
                        borderColor: 'var(--border-subtle)',
                        fontSize: '11px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="income" name="Income" fill="#0f766e" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Chart 2: Cash Flow Trend */}
        {showCashFlowTrend && (
          <div
            role="button"
            tabIndex={0}
            data-testid="chart-card-cash-flow-trend"
            onClick={() => setExpandedChart('cash-flow-trend')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpandedChart('cash-flow-trend');
              }
            }}
            className="group relative cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3.5 shadow-xs transition-all hover:border-[var(--brand-primary)]/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--brand-primary)] transition-colors">
                  Cash Flow Trend
                </h3>
                <p className="text-[10px] text-[var(--text-muted)]">
                  Monthly net cash flow movement ({currency})
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedChart('cash-flow-trend');
                }}
                aria-label="Expand Cash Flow Trend chart"
                title="Click to expand chart"
                className="shrink-0 rounded-md p-1 text-[var(--text-muted)] opacity-60 transition-all hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] hover:opacity-100 group-hover:opacity-100"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {monthlyData.length === 0 ? (
              <ChartEmptyState message="No cash-flow transactions recorded in this period." />
            ) : (
              <div className="h-[175px] w-full">
                <ResponsiveContainer width="100%" height={175} minWidth={180}>
                  <AreaChart data={monthlyData} margin={{ top: 4, right: 6, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <YAxis
                      tickFormatter={compactCurrency}
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      width={48}
                    />
                    <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="3 3" />
                    <Tooltip
                      formatter={(val: unknown) => formatCurrency(Number(val ?? 0), currency)}
                      contentStyle={{
                        backgroundColor: 'var(--surface-card)',
                        borderColor: 'var(--border-subtle)',
                        fontSize: '11px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Area
                      type="monotone"
                      dataKey="netCashFlow"
                      name="Net Cash Flow"
                      stroke="#2563eb"
                      fill="#2563eb"
                      fillOpacity={0.12}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Chart 3: Expense Breakdown */}
        {showExpenseBreakdown && (
          <div
            role="button"
            tabIndex={0}
            data-testid="chart-card-expense-breakdown"
            onClick={() => setExpandedChart('expense-breakdown')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpandedChart('expense-breakdown');
              }
            }}
            className="group relative cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3.5 shadow-xs transition-all hover:border-[var(--brand-primary)]/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--brand-primary)] transition-colors">
                  Expense Breakdown
                </h3>
                <p className="text-[10px] text-[var(--text-muted)]">
                  Expense distribution by category ({currency})
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedChart('expense-breakdown');
                }}
                aria-label="Expand Expense Breakdown chart"
                title="Click to expand chart"
                className="shrink-0 rounded-md p-1 text-[var(--text-muted)] opacity-60 transition-all hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] hover:opacity-100 group-hover:opacity-100"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {expenseBreakdown.length === 0 ? (
              <ChartEmptyState message="No expense transactions recorded in this period." />
            ) : (
              <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-12">
                <div className="h-[175px] w-full sm:col-span-5">
                  <ResponsiveContainer width="100%" height={175} minWidth={120}>
                    <PieChart>
                      <Pie
                        data={expenseBreakdown}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={62}
                        paddingAngle={2}
                      >
                        {expenseBreakdown.map((entry, idx) => (
                          <Cell
                            key={entry.category}
                            fill={DONUT_COLORS[idx % DONUT_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(
                          val: unknown,
                          _name: unknown,
                          item: { payload?: { percentage?: number } },
                        ) =>
                          `${formatCurrency(Number(val ?? 0), currency)} (${(item?.payload?.percentage ?? 0).toFixed(1)}%)`
                        }
                        contentStyle={{
                          backgroundColor: 'var(--surface-card)',
                          borderColor: 'var(--border-subtle)',
                          fontSize: '11px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="max-h-[175px] space-y-1 overflow-y-auto pr-1 text-[10px] sm:col-span-7">
                  {expenseBreakdown.map((item, idx) => (
                    <li
                      key={item.category}
                      className="flex items-center justify-between gap-1.5 border-b border-[var(--border-subtle)]/50 pb-1"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                        />
                        <span className="truncate text-[var(--text-primary)]">{item.category}</span>
                      </div>
                      <div className="shrink-0 text-right font-mono">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {formatCurrency(item.amount, currency)}
                        </span>{' '}
                        <span className="text-[var(--text-muted)]">
                          ({formatPercentage(item.percentage)})
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Chart 4: Combined Accounts Receivable & Accounts Payable Aging */}
        {showCombinedAging && (
          <div
            role="button"
            tabIndex={0}
            data-testid="chart-card-aging-schedule"
            onClick={() => setExpandedChart('aging-schedule')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpandedChart('aging-schedule');
              }
            }}
            className="group relative cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3.5 shadow-xs transition-all hover:border-[var(--brand-primary)]/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--brand-primary)] transition-colors">
                  Accounts Receivable &amp; Payable Aging
                </h3>
                <p className="text-[10px] text-[var(--text-muted)]">
                  Open AR vs AP balances by overdue bucket ({currency})
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {agingComplete && (
                  <div className="text-right font-mono text-[10px] leading-tight hidden sm:block">
                    <div className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      AR: {formatCurrency(arAging.totalOutstanding, currency)}
                    </div>
                    <div className="text-amber-700 dark:text-amber-400 font-semibold">
                      AP: {formatCurrency(apAging.totalOutstanding, currency)}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedChart('aging-schedule');
                  }}
                  aria-label="Expand Accounts Receivable & Payable Aging chart"
                  title="Click to expand chart"
                  className="shrink-0 rounded-md p-1 text-[var(--text-muted)] opacity-60 transition-all hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] hover:opacity-100 group-hover:opacity-100"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {!agingComplete ? (
              <ChartEmptyState message="Aging schedule is incomplete due to missing exchange rates." />
            ) : !hasAnyAgingBalance ? (
              <ChartEmptyState message="No open customer receivables or supplier payables on record." />
            ) : (
              <div className="h-[175px] w-full">
                <ResponsiveContainer width="100%" height={175} minWidth={180}>
                  <BarChart
                    data={combinedAgingRows}
                    margin={{ top: 4, right: 6, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <YAxis
                      tickFormatter={compactCurrency}
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      width={48}
                    />
                    <Tooltip
                      formatter={(val: unknown) => formatCurrency(Number(val ?? 0), currency)}
                      contentStyle={{
                        backgroundColor: 'var(--surface-card)',
                        borderColor: 'var(--border-subtle)',
                        fontSize: '11px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Bar
                      dataKey="receivables"
                      name="Receivables (AR)"
                      fill="#0f766e"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="payables"
                      name="Payables (AP)"
                      fill="#7c3aed"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Chart 5: Profitability Trend */}
        {showProfitabilityTrend && (
          <div
            role="button"
            tabIndex={0}
            data-testid="chart-card-profitability-trend"
            onClick={() => setExpandedChart('profitability-trend')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpandedChart('profitability-trend');
              }
            }}
            className="group relative cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3.5 shadow-xs transition-all hover:border-[var(--brand-primary)]/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--brand-primary)] transition-colors">
                  Profitability Trend
                </h3>
                <p className="text-[10px] text-[var(--text-muted)]">
                  Monthly gross profit margin (%) from classified COGS
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedChart('profitability-trend');
                }}
                aria-label="Expand Profitability Trend chart"
                title="Click to expand chart"
                className="shrink-0 rounded-md p-1 text-[var(--text-muted)] opacity-60 transition-all hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] hover:opacity-100 group-hover:opacity-100"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {!profitabilityTrend?.isAvailable ||
            monthlyData.every((m) => m.grossMarginPct === null) ? (
              <ChartEmptyState
                message={
                  profitabilityTrend?.reason ??
                  'Classified Cost of Goods Sold (isCostOfGoodsSold=true) data not recorded; gross profit margin is not calculable.'
                }
              />
            ) : (
              <div className="h-[175px] w-full">
                <ResponsiveContainer width="100%" height={175} minWidth={180}>
                  <LineChart data={monthlyData} margin={{ top: 4, right: 6, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <YAxis
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      width={42}
                    />
                    <Tooltip
                      formatter={(val: unknown) => `${Number(val ?? 0).toFixed(2)}%`}
                      contentStyle={{
                        backgroundColor: 'var(--surface-card)',
                        borderColor: 'var(--border-subtle)',
                        fontSize: '11px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Line
                      type="monotone"
                      dataKey="grossMarginPct"
                      name="Gross Margin (%)"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Chart 6: Budget vs Actual */}
        {showBudgetVsActual && (
          <div
            role="button"
            tabIndex={0}
            data-testid="chart-card-budget-vs-actual"
            onClick={() => setExpandedChart('budget-vs-actual')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpandedChart('budget-vs-actual');
              }
            }}
            className="group relative cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3.5 shadow-xs transition-all hover:border-[var(--brand-primary)]/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--brand-primary)] transition-colors">
                  Budget vs Actual
                </h3>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {budgetComparison
                    ? `${budgetComparison.budgetName} (${budgetComparison.currency})`
                    : `Approved allocation vs actual spending (${currency})`}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedChart('budget-vs-actual');
                }}
                aria-label="Expand Budget vs Actual chart"
                title="Click to expand chart"
                className="shrink-0 rounded-md p-1 text-[var(--text-muted)] opacity-60 transition-all hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] hover:opacity-100 group-hover:opacity-100"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {!budgetComparison ||
            !budgetComparison.isComplete ||
            budgetComparison.lines.length === 0 ? (
              <ChartEmptyState
                message={
                  metricsData.metrics.budgetVariance?.dataLimitations?.[0] ??
                  'No active budget overlaps the selected reporting period.'
                }
              />
            ) : (
              <div className="h-[175px] w-full">
                <ResponsiveContainer width="100%" height={175} minWidth={180}>
                  <BarChart
                    data={budgetComparison.lines.map((l) => ({
                      category: l.category,
                      allocated: Number.parseFloat(l.allocatedAmount) || 0,
                      actual: Number.parseFloat(l.actualSpent) || 0,
                    }))}
                    margin={{ top: 4, right: 6, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="category" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <YAxis
                      tickFormatter={compactCurrency}
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      width={48}
                    />
                    <Tooltip
                      formatter={(val: unknown) =>
                        formatCurrency(Number(val ?? 0), budgetComparison.currency || currency)
                      }
                      contentStyle={{
                        backgroundColor: 'var(--surface-card)',
                        borderColor: 'var(--border-subtle)',
                        fontSize: '11px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Bar
                      dataKey="allocated"
                      name="Allocated"
                      fill="#2563eb"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="actual"
                      name="Actual Spent"
                      fill="#7c3aed"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expanded Chart Modal */}
      {expandedChart && (
        <Modal
          isOpen={true}
          onClose={() => setExpandedChart(null)}
          title={getModalMeta(expandedChart).title}
          description={getModalMeta(expandedChart).description}
          size="2xl"
          footer={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedChart(null)}
              data-testid="chart-modal-close-button"
            >
              Close
            </Button>
          }
        >
          <div className="space-y-4">
            {/* Expanded Chart 1: Income vs Expenses */}
            {expandedChart === 'income-vs-expenses' && (
              <div>
                {/* Metric Summary Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                      Total Period Income
                    </span>
                    <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(totalIncome, currency)}
                    </span>
                  </div>
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                      Total Period Expenses
                    </span>
                    <span className="text-base font-bold font-mono text-blue-600 dark:text-blue-400">
                      {formatCurrency(totalExpenses, currency)}
                    </span>
                  </div>
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                      Net Period Margin
                    </span>
                    <span
                      className={`text-base font-bold font-mono ${
                        totalIncome - totalExpenses >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatCurrency(totalIncome - totalExpenses, currency)}
                    </span>
                  </div>
                </div>

                {monthlyData.length === 0 ? (
                  <ChartEmptyState
                    height="h-[340px] sm:h-[400px]"
                    message="No income or expense transactions recorded in this period."
                  />
                ) : (
                  <div className="h-[340px] sm:h-[420px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={240}>
                      <BarChart
                        data={monthlyData}
                        margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                        />
                        <YAxis
                          tickFormatter={compactCurrency}
                          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                          width={60}
                        />
                        <Tooltip
                          formatter={(val: unknown) => formatCurrency(Number(val ?? 0), currency)}
                          contentStyle={{
                            backgroundColor: 'var(--surface-card)',
                            borderColor: 'var(--border-subtle)',
                            fontSize: '12px',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Bar
                          dataKey="income"
                          name="Income"
                          fill="#0f766e"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="expenses"
                          name="Expenses"
                          fill="#2563eb"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Expanded Chart 2: Cash Flow Trend */}
            {expandedChart === 'cash-flow-trend' && (
              <div>
                {/* Metric Summary Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                      Cumulative Net Cash Flow
                    </span>
                    <span
                      className={`text-base font-bold font-mono ${
                        totalNetCashFlow >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatCurrency(totalNetCashFlow, currency)}
                    </span>
                  </div>
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                      Monthly Average Net Flow
                    </span>
                    <span className="text-base font-bold font-mono text-[var(--text-primary)]">
                      {formatCurrency(
                        monthlyData.length ? totalNetCashFlow / monthlyData.length : 0,
                        currency,
                      )}
                    </span>
                  </div>
                </div>

                {monthlyData.length === 0 ? (
                  <ChartEmptyState
                    height="h-[340px] sm:h-[400px]"
                    message="No cash-flow transactions recorded in this period."
                  />
                ) : (
                  <div className="h-[340px] sm:h-[420px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={240}>
                      <AreaChart
                        data={monthlyData}
                        margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                        />
                        <YAxis
                          tickFormatter={compactCurrency}
                          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                          width={60}
                        />
                        <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="3 3" />
                        <Tooltip
                          formatter={(val: unknown) => formatCurrency(Number(val ?? 0), currency)}
                          contentStyle={{
                            backgroundColor: 'var(--surface-card)',
                            borderColor: 'var(--border-subtle)',
                            fontSize: '12px',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Area
                          type="monotone"
                          dataKey="netCashFlow"
                          name="Net Cash Flow"
                          stroke="#2563eb"
                          fill="#2563eb"
                          fillOpacity={0.16}
                          strokeWidth={2.5}
                          dot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Expanded Chart 3: Expense Breakdown */}
            {expandedChart === 'expense-breakdown' && (
              <div>
                {/* Metric Summary Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                      Total Operating Expenses
                    </span>
                    <span className="text-base font-bold font-mono text-[var(--text-primary)]">
                      {formatCurrency(totalCategorizedExpenses, currency)}
                    </span>
                  </div>
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                      Active Categories
                    </span>
                    <span className="text-base font-bold font-mono text-[var(--brand-primary)]">
                      {expenseBreakdown.length} Categories
                    </span>
                  </div>
                </div>

                {expenseBreakdown.length === 0 ? (
                  <ChartEmptyState
                    height="h-[340px] sm:h-[400px]"
                    message="No expense transactions recorded in this period."
                  />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    <div className="h-[300px] sm:h-[380px] w-full lg:col-span-6">
                      <ResponsiveContainer width="100%" height="100%" minWidth={200}>
                        <PieChart>
                          <Pie
                            data={expenseBreakdown}
                            dataKey="amount"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={125}
                            paddingAngle={2}
                          >
                            {expenseBreakdown.map((entry, idx) => (
                              <Cell
                                key={entry.category}
                                fill={DONUT_COLORS[idx % DONUT_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(
                              val: unknown,
                              _name: unknown,
                              item: { payload?: { percentage?: number } },
                            ) =>
                              `${formatCurrency(Number(val ?? 0), currency)} (${(item?.payload?.percentage ?? 0).toFixed(1)}%)`
                            }
                            contentStyle={{
                              backgroundColor: 'var(--surface-card)',
                              borderColor: 'var(--border-subtle)',
                              fontSize: '12px',
                              borderRadius: '8px',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="lg:col-span-6 max-h-[380px] overflow-y-auto space-y-2 pr-2">
                      <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide">
                        Category Allocation
                      </h4>
                      <ul className="space-y-1.5 text-xs">
                        {expenseBreakdown.map((item, idx) => (
                          <li
                            key={item.category}
                            className="flex flex-col gap-1 p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)]"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="h-3 w-3 shrink-0 rounded-full"
                                  style={{
                                    backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length],
                                  }}
                                />
                                <span className="font-semibold text-[var(--text-primary)] truncate">
                                  {item.category}
                                </span>
                                {item.count !== undefined && (
                                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                                    ({item.count} txns)
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-right shrink-0">
                                <span className="font-bold text-[var(--text-primary)]">
                                  {formatCurrency(item.amount, currency)}
                                </span>{' '}
                                <span className="text-[var(--brand-primary)] font-semibold text-[11px]">
                                  ({formatPercentage(item.percentage)})
                                </span>
                              </div>
                            </div>
                            <div className="w-full bg-[var(--border-subtle)]/50 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.min(100, item.percentage)}%`,
                                  backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length],
                                }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Expanded Chart 4: Accounts Receivable & Payable Aging */}
            {expandedChart === 'aging-schedule' && (
              <div>
                {/* Metric Summary Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                      Total Receivables (AR)
                    </span>
                    <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(arAging.totalOutstanding, currency)}
                    </span>
                  </div>
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                      Total Payables (AP)
                    </span>
                    <span className="text-base font-bold font-mono text-purple-600 dark:text-purple-400">
                      {formatCurrency(apAging.totalOutstanding, currency)}
                    </span>
                  </div>
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                      Net Aging Working Gap
                    </span>
                    <span className="text-base font-bold font-mono text-[var(--text-primary)]">
                      {formatCurrency(
                        arAging.totalOutstanding - apAging.totalOutstanding,
                        currency,
                      )}
                    </span>
                  </div>
                </div>

                {!agingComplete ? (
                  <ChartEmptyState
                    height="h-[340px] sm:h-[400px]"
                    message="Aging schedule is incomplete due to missing exchange rates."
                  />
                ) : !hasAnyAgingBalance ? (
                  <ChartEmptyState
                    height="h-[340px] sm:h-[400px]"
                    message="No open customer receivables or supplier payables on record."
                  />
                ) : (
                  <div className="h-[340px] sm:h-[420px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={240}>
                      <BarChart
                        data={combinedAgingRows}
                        margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis
                          dataKey="bucket"
                          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                        />
                        <YAxis
                          tickFormatter={compactCurrency}
                          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                          width={60}
                        />
                        <Tooltip
                          formatter={(val: unknown) => formatCurrency(Number(val ?? 0), currency)}
                          contentStyle={{
                            backgroundColor: 'var(--surface-card)',
                            borderColor: 'var(--border-subtle)',
                            fontSize: '12px',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Bar
                          dataKey="receivables"
                          name="Receivables (AR)"
                          fill="#0f766e"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="payables"
                          name="Payables (AP)"
                          fill="#7c3aed"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Expanded Chart 5: Profitability Trend */}
            {expandedChart === 'profitability-trend' && (
              <div>
                {!profitabilityTrend?.isAvailable ||
                monthlyData.every((m) => m.grossMarginPct === null) ? (
                  <ChartEmptyState
                    height="h-[340px] sm:h-[400px]"
                    message={
                      profitabilityTrend?.reason ??
                      'Classified Cost of Goods Sold (isCostOfGoodsSold=true) data not recorded; gross profit margin is not calculable.'
                    }
                  />
                ) : (
                  <div className="h-[340px] sm:h-[420px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={240}>
                      <LineChart
                        data={monthlyData}
                        margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                        />
                        <YAxis
                          tickFormatter={(v) => `${v}%`}
                          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                          width={52}
                        />
                        <Tooltip
                          formatter={(val: unknown) => `${Number(val ?? 0).toFixed(2)}%`}
                          contentStyle={{
                            backgroundColor: 'var(--surface-card)',
                            borderColor: 'var(--border-subtle)',
                            fontSize: '12px',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Line
                          type="monotone"
                          dataKey="grossMarginPct"
                          name="Gross Margin (%)"
                          stroke="#7c3aed"
                          strokeWidth={2.5}
                          dot={{ r: 4 }}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Expanded Chart 6: Budget vs Actual */}
            {expandedChart === 'budget-vs-actual' && (
              <div>
                {!budgetComparison ||
                !budgetComparison.isComplete ||
                budgetComparison.lines.length === 0 ? (
                  <ChartEmptyState
                    height="h-[340px] sm:h-[400px]"
                    message={
                      metricsData.metrics.budgetVariance?.dataLimitations?.[0] ??
                      'No active budget overlaps the selected reporting period.'
                    }
                  />
                ) : (
                  <div>
                    {/* Summary Header */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                          Active Budget Scope
                        </span>
                        <span className="text-sm font-bold text-[var(--text-primary)]">
                          {budgetComparison.budgetName} ({budgetComparison.currency})
                        </span>
                      </div>
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                          Tracked Expense Categories
                        </span>
                        <span className="text-sm font-bold font-mono text-[var(--brand-primary)]">
                          {budgetComparison.lines.length} Line Items
                        </span>
                      </div>
                    </div>

                    <div className="h-[340px] sm:h-[420px] w-full">
                      <ResponsiveContainer width="100%" height="100%" minWidth={240}>
                        <BarChart
                          data={budgetComparison.lines.map((l) => ({
                            category: l.category,
                            allocated: Number.parseFloat(l.allocatedAmount) || 0,
                            actual: Number.parseFloat(l.actualSpent) || 0,
                          }))}
                          margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                          <XAxis
                            dataKey="category"
                            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                          />
                          <YAxis
                            tickFormatter={compactCurrency}
                            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                            width={60}
                          />
                          <Tooltip
                            formatter={(val: unknown) =>
                              formatCurrency(
                                Number(val ?? 0),
                                budgetComparison.currency || currency,
                              )
                            }
                            contentStyle={{
                              backgroundColor: 'var(--surface-card)',
                              borderColor: 'var(--border-subtle)',
                              fontSize: '12px',
                              borderRadius: '8px',
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                          <Bar
                            dataKey="allocated"
                            name="Allocated"
                            fill="#2563eb"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="actual"
                            name="Actual Spent"
                            fill="#7c3aed"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
