import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock,
  DollarSign,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../../context/useAuth';
import { apiGet, ApiClientError, authStorage } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import {
  formatCurrency,
  formatDate,
  resolveReportingCurrency,
} from '../../utils/formatters';
import type { FinancialTransaction } from '../../types/financial.types';
import type { AnalyticsChartMonthlyPoint } from '../../types/analytics.types';
import {
  RiskAlertSeverity,
  RiskAlertStatus,
  RiskAlertType,
  type RiskAlert,
} from '../../types/risk.types';
import { DEFAULT_DEMO_ORG } from '../../config/demo.config';

const DEFAULT_METRICS: AnalyticsMetricsResponse = {
  organizationId: DEFAULT_DEMO_ORG.id,
  currency: 'USD',
  formulaVersion: 'v1.0.0-decimal',
  generatedAt: '2026-11-10T00:00:00.000Z',
  reportingPeriod: {
    startDate: '2026-10-11T00:00:00.000Z',
    endDate: '2026-11-10T00:00:00.000Z',
  },
  metrics: {
    operatingCashFlow: {
      metricKey: 'operatingCashFlow',
      name: 'Operating Cash Flow',
      status: 'COMPUTED',
      value: '42500.0000',
      unit: 'CURRENCY',
      formula: 'CashInflows - CashOutflows',
      dataLimitations: [],
    },
    cashRunway: {
      metricKey: 'cashRunway',
      name: 'Cash Runway',
      status: 'COMPUTED',
      value: '8.4',
      unit: 'MONTHS',
      formula: 'LiquidCash / MonthlyBurn',
      dataLimitations: [],
    },
    currentRatio: {
      metricKey: 'currentRatio',
      name: 'Current Ratio',
      status: 'COMPUTED',
      value: '2.1400',
      unit: 'RATIO',
      formula: 'Assets / Liabilities',
      dataLimitations: [],
    },
    quickRatio: {
      metricKey: 'quickRatio',
      name: 'Quick Ratio',
      status: 'COMPUTED',
      value: '1.6500',
      unit: 'RATIO',
      formula: '(Cash + AR) / Liabilities',
      dataLimitations: [],
      components: {
        liquidCash: '1248500.0000',
      },
    },
    workingCapital: {
      metricKey: 'workingCapital',
      name: 'Working Capital',
      status: 'COMPUTED',
      value: '385000.0000',
      unit: 'CURRENCY',
      formula: 'CurrentAssets - CurrentLiabilities',
      dataLimitations: [],
      components: {
        currentAssets: '1540000.0000',
        currentLiabilities: '1155000.0000',
      },
    },
    grossMargin: {
      metricKey: 'grossMargin',
      name: 'Gross Profit Margin',
      status: 'COMPUTED',
      value: '44.8',
      unit: 'PERCENTAGE',
      formula: 'GrossProfit / TotalRevenue * 100',
      dataLimitations: [],
    },
    expenseGrowth: {
      metricKey: 'expenseGrowth',
      name: 'Expense Growth Rate',
      status: 'COMPUTED',
      value: '3.2',
      unit: 'PERCENTAGE',
      formula: '(ExpensesCurrent - ExpensesPrior) / ExpensesPrior * 100',
      dataLimitations: [],
    },
    budgetVariance: {
      metricKey: 'budgetVariance',
      name: 'Overall Budget Variance',
      status: 'COMPUTED',
      value: '-4.1',
      unit: 'PERCENTAGE',
      formula: '(ActualExpenses - BudgetedExpenses) / BudgetedExpenses * 100',
      dataLimitations: [],
    },
    receivableAging: {
      metricKey: 'receivableAging',
      name: 'Accounts Receivable Aging',
      status: 'COMPUTED',
      value: {
        current: '142000.0000',
        days1to30: '35000.0000',
        days31to60: '12500.0000',
        days61to90: '4200.0000',
        days90Plus: '1800.0000',
        totalOutstanding: '195500.0000',
      },
      unit: 'CURRENCY',
      formula: 'Sum(UnpaidInvoices by AgeBucket)',
      dataLimitations: [],
    },
    payableAging: {
      metricKey: 'payableAging',
      name: 'Accounts Payable Aging',
      status: 'COMPUTED',
      value: {
        current: '88000.0000',
        days1to30: '22000.0000',
        days31to60: '6500.0000',
        days61to90: '0.0000',
        days90Plus: '0.0000',
        totalOutstanding: '116500.0000',
      },
      unit: 'CURRENCY',
      formula: 'Sum(UnpaidBills by AgeBucket)',
      dataLimitations: [],
    },
  },
};

const DEFAULT_TRANSACTIONS: FinancialTransaction[] = [
  {
    id: 'tx-001',
    organizationId: DEFAULT_DEMO_ORG.id,
    accountId: 'acc-001',
    date: '2026-11-09T14:30:00.000Z',
    amount: '45000.00',
    type: 'INCOME',
    category: 'Enterprise Subscription',
    description: 'Q4 Enterprise SaaS License - Northstar Tech',
    referenceNumber: 'INV-2026-881',
    isArchived: false,
    createdAt: '2026-11-09T14:30:00.000Z',
    updatedAt: '2026-11-09T14:30:00.000Z',
  },
  {
    id: 'tx-002',
    organizationId: DEFAULT_DEMO_ORG.id,
    accountId: 'acc-001',
    date: '2026-11-08T09:15:00.000Z',
    amount: '-18500.00',
    type: 'EXPENSE',
    category: 'Cloud Infrastructure',
    description: 'Google Cloud Platform Monthly Hosting & AI GPU compute',
    referenceNumber: 'GCP-99412',
    isArchived: false,
    createdAt: '2026-11-08T09:15:00.000Z',
    updatedAt: '2026-11-08T09:15:00.000Z',
  },
  {
    id: 'tx-003',
    organizationId: DEFAULT_DEMO_ORG.id,
    accountId: 'acc-001',
    date: '2026-11-07T16:45:00.000Z',
    amount: '28000.00',
    type: 'INCOME',
    category: 'Consulting Revenue',
    description: 'Autonomous Financial Risk Intelligence Retainer',
    referenceNumber: 'INV-2026-880',
    isArchived: false,
    createdAt: '2026-11-07T16:45:00.000Z',
    updatedAt: '2026-11-07T16:45:00.000Z',
  },
  {
    id: 'tx-004',
    organizationId: DEFAULT_DEMO_ORG.id,
    accountId: 'acc-001',
    date: '2026-11-06T11:20:00.000Z',
    amount: '-12400.00',
    type: 'EXPENSE',
    category: 'Payroll & Benefits',
    description: 'Bi-weekly Financial Engineering Contractor Dispatches',
    referenceNumber: 'PAY-1102',
    isArchived: false,
    createdAt: '2026-11-06T11:20:00.000Z',
    updatedAt: '2026-11-06T11:20:00.000Z',
  },
  {
    id: 'tx-005',
    organizationId: DEFAULT_DEMO_ORG.id,
    accountId: 'acc-001',
    date: '2026-11-05T13:10:00.000Z',
    amount: '-4200.00',
    type: 'EXPENSE',
    category: 'Software & Tools',
    description: 'Regulatory Audit Trail & Compliance Software',
    referenceNumber: 'SOFT-441',
    isArchived: false,
    createdAt: '2026-11-05T13:10:00.000Z',
    updatedAt: '2026-11-05T13:10:00.000Z',
  },
];

const DEFAULT_RISK_ALERTS: RiskAlert[] = [
  {
    id: 'alert-001',
    organizationId: DEFAULT_DEMO_ORG.id,
    ruleCode: RiskAlertType.CATEGORY_SHIFT,
    severity: RiskAlertSeverity.MEDIUM,
    title: 'Cloud Infrastructure Expense +28% Above 90d Baseline',
    description: 'Spike in LLM token usage detected across secondary financial simulation batch.',
    status: RiskAlertStatus.NEW,
    evidence: { spikePercentage: '28' },
    supportingRecordIds: ['tx-002'],
    nonFraudDisclaimer: 'Statistically detected deviation. Does not imply misconduct.',
    detectedAt: '2026-11-10T08:00:00.000Z',
    createdAt: '2026-11-10T08:00:00.000Z',
  },
  {
    id: 'alert-002',
    organizationId: DEFAULT_DEMO_ORG.id,
    ruleCode: RiskAlertType.OVERDUE_RECEIVABLE,
    severity: RiskAlertSeverity.HIGH,
    title: 'Overdue Receivable: $35,000 Exceeded 30 Days',
    description: 'Invoice INV-2026-842 is 34 days past due. Working capital exposure detected.',
    status: RiskAlertStatus.ACKNOWLEDGED,
    evidence: { daysPastDue: 34 },
    supportingRecordIds: ['inv-842'],
    nonFraudDisclaimer: 'Statistically detected deviation. Does not imply misconduct.',
    detectedAt: '2026-11-09T10:00:00.000Z',
    createdAt: '2026-11-09T10:00:00.000Z',
  },
];

interface MetricResult<T = string | null> {
  metricKey: string;
  name: string;
  status: 'COMPUTED' | 'UNSUPPORTED_MISSING_DATA' | 'NOT_CALCULABLE' | 'ERROR';
  value: T;
  unit: string;
  formula: string;
  currency?: string;
  reportingPeriod?: {
    startDate: string;
    endDate: string;
  };
  dataLimitations: string[];
  components?: Record<string, string>;
}

interface AgingScheduleValues {
  current?: string | null;
  days1to30?: string | null;
  days31to60?: string | null;
  days61to90?: string | null;
  days90Plus?: string | null;
  totalOutstanding?: string | null;
  totalOverdue?: string | null;
  isComplete?: boolean;
  missingCurrencies?: string[];
  buckets?: Array<{
    bucket: string;
    count: number;
    amount: string | null;
    recordIds?: string[];
  }>;
  sourceRecordIds?: string[];
}

function resolveAgingBucketAmount(
  schedule: AgingScheduleValues | undefined,
  bucketName: 'CURRENT' | '1_TO_30_DAYS' | '31_TO_60_DAYS' | '61_TO_90_DAYS' | 'OVER_90_DAYS',
  legacyKey: 'current' | 'days1to30' | 'days31to60' | 'days61to90' | 'days90Plus',
): string | null | undefined {
  if (!schedule) return undefined;
  if (Array.isArray(schedule.buckets)) {
    const matched = schedule.buckets.find((b) => b.bucket === bucketName);
    if (matched) return matched.amount;
  }
  return schedule[legacyKey];
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
  charts?: {
    monthlySeries?: AnalyticsChartMonthlyPoint[];
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

type DateRangeFilter = '7D' | '30D' | '90D' | '6M' | '1Y' | 'ALL';

const DATE_RANGE_OPTIONS: Array<{ key: DateRangeFilter; label: string; days: number | null }> = [
  { key: '7D', label: '7D', days: 7 },
  { key: '30D', label: '1M', days: 30 },
  { key: '90D', label: '3M', days: 90 },
  { key: '6M', label: '6M', days: 180 },
  { key: '1Y', label: '1Y', days: 365 },
  { key: 'ALL', label: 'All', days: null },
];

export interface CashFlowSeriesPoint {
  dateKey: string;
  label: string;
  inflows: number;
  outflows: number;
  netCashFlow: number;
}

function getTxDateIso(tx: FinancialTransaction): string {
  const raw = tx.date || (tx as unknown as { transactionDate?: string }).transactionDate || '';
  return raw ? raw.slice(0, 10) : '';
}

function buildSmoothSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M 0 ${points[0].y} L 100 ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = ((p0.x + p1.x) / 2).toFixed(2);
    d += ` C ${midX} ${p0.y.toFixed(2)}, ${midX} ${p1.y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  return d;
}

function KpiSparkline({
  values,
  strokeColor,
  gradientId,
}: {
  values: number[];
  strokeColor: string;
  gradientId: string;
}) {
  const safeValues = values.length > 0 ? values : [0, 0];
  const minVal = Math.min(...safeValues);
  const maxVal = Math.max(...safeValues);
  const span = maxVal - minVal;

  const coords = safeValues.map((val, idx) => {
    const x = safeValues.length === 1 ? 50 : (idx / (safeValues.length - 1)) * 100;
    const normalizedY = span === 0 ? 0.5 : (val - minVal) / span;
    const y = 34 - normalizedY * 26;
    return { x, y };
  });

  const linePath = buildSmoothSvgPath(coords);
  const areaPath = `${linePath} L 100 40 L 0 40 Z`;

  return (
    <div className="mt-3 h-12 w-full overflow-hidden" aria-hidden="true">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
  label?: string;
  currency: string;
}

const RISK_DONUT_COLORS: Record<string, string> = {
  HIGH: '#e11d48', // red-600
  MEDIUM: '#f59e0b', // amber-500
  LOW: '#3b82f6', // blue-500
};

const AGING_BAR_COLORS = ['#10b981', '#0d9488', '#6366f1', '#f59e0b', '#ef4444'];

function CashRunwayGauge({
  runwayMonths,
  isSelfSustaining,
  status,
  reason,
  quickRatio,
  currentRatio,
}: {
  runwayMonths: number | null;
  isSelfSustaining: boolean;
  status: string | undefined;
  reason?: string;
  quickRatio?: string | null;
  currentRatio?: string | null;
}) {
  // If net cash burn <= 0: business is self-sustaining
  // If positive burn: display runway in months
  const hasValidBurnRunway =
    !isSelfSustaining &&
    runwayMonths !== null &&
    !Number.isNaN(runwayMonths) &&
    runwayMonths > 0;
  const isDataMissing =
    status === 'UNSUPPORTED_MISSING_DATA' ||
    (runwayMonths === null && !isSelfSustaining);

  const healthLabel = isSelfSustaining
    ? 'Healthy'
    : hasValidBurnRunway
      ? runwayMonths >= 6
        ? 'Healthy'
        : runwayMonths >= 3
          ? 'Warning'
          : 'Critical'
      : isDataMissing
        ? 'Insufficient Data'
        : 'Guarded';

  const healthVariant: 'ok' | 'amber' | 'error' =
    healthLabel === 'Healthy'
      ? 'ok'
      : healthLabel === 'Warning'
        ? 'amber'
        : 'error';

  // Semicircle gauge math:
  // Scale from 180 deg (left, critical) to 0 deg (right, healthy)
  // Max scale: 12+ months (or 92% into healthy green zone when self-sustaining)
  const clampedMonths =
    runwayMonths !== null ? Math.min(Math.max(runwayMonths, 0), 12) : 0;
  const gaugeFraction = isSelfSustaining
    ? 0.92
    : hasValidBurnRunway
      ? clampedMonths / 12
      : 0;

  // Needle angle in radians: from PI (180 deg) to 0 (0 deg)
  const needleAngle = Math.PI * (1 - gaugeFraction);
  const cx = 75;
  const cy = 68;
  const needleLength = 38;
  const nx = cx + needleLength * Math.cos(needleAngle);
  const ny = cy - needleLength * Math.sin(needleAngle);

  return (
    <div
      className="flex items-center gap-3 w-full"
      data-testid="cash-runway-gauge-container"
    >
      {/* Semicircle Gauge with generous SVG viewBox padding & overflow-visible */}
      <div className="w-[140px] shrink-0 flex flex-col items-center">
        <div className="relative w-[140px] h-[75px] flex items-center justify-center">
          <svg
            viewBox="0 0 150 82"
            className="w-full h-full overflow-visible pointer-events-none"
            aria-hidden="true"
          >
            {/* Background Arc Track */}
            <path
              d="M 25 68 A 50 50 0 0 1 125 68"
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="9"
              strokeLinecap="round"
              opacity="0.3"
            />
            {/* Segment 1: Critical (<3m, Red) */}
            <path
              d="M 25 68 A 50 50 0 0 1 48.5 25.6"
              fill="none"
              stroke="#ef4444"
              strokeWidth="8"
              strokeLinecap="round"
              opacity={!isDataMissing ? 0.95 : 0.25}
            />
            {/* Segment 2: Warning (3-6m, Amber) */}
            <path
              d="M 51.5 23.9 A 50 50 0 0 1 98.5 23.9"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="8"
              strokeLinecap="round"
              opacity={!isDataMissing ? 0.95 : 0.25}
            />
            {/* Segment 3: Healthy (6-12m+, Green) */}
            <path
              d="M 101.5 25.6 A 50 50 0 0 1 125 68"
              fill="none"
              stroke="#10b981"
              strokeWidth="8"
              strokeLinecap="round"
              opacity={!isDataMissing ? 0.95 : 0.25}
            />

            {/* Needle & Pivot */}
            {!isDataMissing && (
              <>
                <line
                  x1={cx}
                  y1={cy}
                  x2={Number(nx.toFixed(1))}
                  y2={Number(ny.toFixed(1))}
                  stroke="#6841b8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx={cx} cy={cy} r="4" fill="#6841b8" />
                <circle cx={cx} cy={cy} r="1.5" fill="#ffffff" />
              </>
            )}
          </svg>
        </div>

        {/* Text Center Display with Global Inter Font (no monospace on Self-Sustaining) */}
        <div className="text-center mt-1">
          <span className="text-sm font-bold tracking-tight text-[var(--text-primary)] leading-tight block">
            {isSelfSustaining
              ? 'Self-Sustaining'
              : hasValidBurnRunway
                ? `${runwayMonths.toFixed(1)} mos`
                : '—'}
          </span>
          <span className="text-[9.5px] uppercase font-bold tracking-wider text-[var(--text-muted)] block">
            {healthLabel}
          </span>
        </div>
      </div>

      {/* Right Side: Status and Quick/Current Ratios */}
      <div className="flex-1 flex flex-col justify-between min-w-0 pl-1">
        <div>
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                healthVariant === 'ok'
                  ? 'bg-emerald-500'
                  : healthVariant === 'amber'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
              }`}
            />
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {healthLabel}
            </span>
          </div>
          <p
            className="text-[10px] text-[var(--text-muted)] mt-1 leading-snug line-clamp-2"
            title={
              reason ||
              (isSelfSustaining
                ? 'Net cash burn is <= 0; operating cash flow covers expenses (self-sustaining).'
                : 'Available liquid cash divided by 30-day average net cash burn rate.')
            }
          >
            {isSelfSustaining
              ? 'Net cash burn <= 0 (self-sustaining)'
              : hasValidBurnRunway
                ? `Liquid cash covers ~${runwayMonths.toFixed(1)} months of burn`
                : reason || 'Cash runway calculation'}
          </p>
        </div>

        {/* Quick Ratio & Current Ratio */}
        <div className="pt-2 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[10px] text-[var(--text-muted)] block uppercase font-medium">
              Quick Ratio
            </span>
            <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
              {quickRatio ? Number.parseFloat(quickRatio).toFixed(2) : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[var(--text-muted)] block uppercase font-medium">
              Current Ratio
            </span>
            <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
              {currentRatio ? `${Number.parseFloat(currentRatio).toFixed(2)}x` : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RiskSeverityDonutChart({
  highCount,
  mediumCount,
  lowCount,
}: {
  highCount: number;
  mediumCount: number;
  lowCount: number;
}) {
  const total = highCount + mediumCount + lowCount;
  const chartData = [
    { name: 'High', value: highCount, color: RISK_DONUT_COLORS.HIGH },
    { name: 'Medium', value: mediumCount, color: RISK_DONUT_COLORS.MEDIUM },
    { name: 'Low', value: lowCount, color: RISK_DONUT_COLORS.LOW },
  ].filter((d) => d.value > 0);

  if (total === 0) {
    return (
      <div className="py-4 text-center text-xs text-[var(--text-muted)] flex flex-col items-center justify-center flex-1">
        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5 opacity-80" />
        <span className="font-medium text-[var(--text-secondary)]">Zero Anomalies Detected</span>
        <span className="text-[10px] text-[var(--text-muted)] mt-0.5">All monitored ledgers within tolerances.</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 w-full py-1" data-testid="risk-severity-donut">
      {/* Donut ring on left (with Total count in center) */}
      <div className="relative w-[105px] h-[95px] shrink-0">
        <ResponsiveContainer width={105} height={95}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={28}
              outerRadius={44}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val: unknown, name: unknown) => [
                `${Number(val ?? 0)} alert(s) (${(((Number(val ?? 0)) / total) * 100).toFixed(0)}%)`,
                String(name ?? ''),
              ]}
              contentStyle={{
                backgroundColor: 'var(--surface-card)',
                borderColor: 'var(--border-subtle)',
                fontSize: '11px',
                borderRadius: '8px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-base font-bold font-mono text-[var(--text-primary)] leading-none">
            {total}
          </span>
          <span className="text-[8.5px] uppercase tracking-wider text-[var(--text-muted)] mt-0.5">Total</span>
        </div>
      </div>

      {/* HIGH, MED, LOW status pills on the right side of the circle */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
        <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[var(--surface-canvas)] border border-red-500/20 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-600 shrink-0" />
            <span className="text-[10px] uppercase text-[var(--text-muted)] font-semibold">High</span>
          </div>
          <span className="font-mono font-bold text-xs text-red-600 dark:text-red-400">{highCount}</span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[var(--surface-canvas)] border border-amber-500/20 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
            <span className="text-[10px] uppercase text-[var(--text-muted)] font-semibold">Med</span>
          </div>
          <span className="font-mono font-bold text-xs text-amber-600 dark:text-amber-400">{mediumCount}</span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[var(--surface-canvas)] border border-blue-500/20 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
            <span className="text-[10px] uppercase text-[var(--text-muted)] font-semibold">Low</span>
          </div>
          <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">{lowCount}</span>
        </div>
      </div>
    </div>
  );
}

interface AgingBarDatum {
  category: string;
  amount: number;
  count: number;
  color: string;
}

function AgingHorizontalBarChart({
  data,
  currency,
}: {
  data: AgingBarDatum[];
  currency: string;
}) {
  const maxAmount = Math.max(...data.map((d) => d.amount), 0);

  return (
    <div className="h-[185px] w-full pt-1" data-testid="aging-horizontal-bar-chart">
      <ResponsiveContainer width="100%" height={185} minWidth={180}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 18, left: 10, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-subtle)" />
          <XAxis
            type="number"
            domain={[0, maxAmount > 0 ? 'dataMax' : 100]}
            tickFormatter={(val: number) =>
              new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(val)
            }
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="category"
            tick={{ fontSize: 11, fill: 'var(--text-primary)', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            formatter={(val: unknown, _name: unknown, item: { payload?: AgingBarDatum }) => [
              `${formatCurrency(Number(val ?? 0), currency)} (${item?.payload?.count ?? 0} record(s))`,
              'Balance',
            ]}
            contentStyle={{
              backgroundColor: 'var(--surface-card)',
              borderColor: 'var(--border-subtle)',
              fontSize: '11px',
              borderRadius: '8px',
            }}
          />
          <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CashFlowChartTooltip({ active, payload, label, currency }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]/95 p-3 shadow-xl backdrop-blur-md text-xs space-y-2 min-w-[195px]">
      <div className="font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-1.5 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">{currency}</span>
      </div>
      <div className="space-y-1.5">
        {payload.map((entry) => {
          const isPositive = entry.value >= 0;
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                  {entry.name}
                </span>
              </div>
              <span className="font-mono text-[11px] font-bold tabular-nums text-[var(--text-primary)]">
                {entry.dataKey === 'netCashFlow' && isPositive ? '+' : ''}
                {formatCurrency(entry.value, currency, 0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OverviewDashboardPage() {
  const {
    activeOrg,
    isLoading: isAuthLoading,
    isAuditor,
    canMutateLedger,
    canRunAiWorkflows,
  } = useAuth();

  const hasToken = Boolean(authStorage.getToken());
  // Never fall back to DEFAULT_DEMO_ORG for authenticated users with no confirmed active org
  const effectiveOrg = activeOrg || (hasToken ? null : DEFAULT_DEMO_ORG);
  const activeOrgId = effectiveOrg?.id ?? null;

  const [metricsData, setMetricsData] = useState<AnalyticsMetricsResponse | null>(() =>
    hasToken ? null : DEFAULT_METRICS,
  );
  const [allTransactions, setAllTransactions] = useState<FinancialTransaction[]>(() =>
    hasToken ? [] : DEFAULT_TRANSACTIONS,
  );
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>(() =>
    hasToken ? [] : DEFAULT_RISK_ALERTS,
  );
  const [selectedRange, setSelectedRange] = useState<DateRangeFilter>('90D');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [reloadKey, setReloadKey] = useState<number>(0);

  const handleRefresh = useCallback(() => {
    setError(null);
    setIsLoading(true);
    setReloadKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    // Suppress API requests while authentication/session hydration is incomplete
    if (hasToken && (isAuthLoading || !activeOrgId)) return;
    if (!activeOrgId) return;

    let isMounted = true;

    Promise.all([
      apiGet<AnalyticsMetricsResponse>(`/v1/organizations/${activeOrgId}/analytics/metrics`),
      apiGet<TransactionListResponse>(`/v1/organizations/${activeOrgId}/transactions?limit=100`),
      apiGet<RiskAlert[]>(`/v1/organizations/${activeOrgId}/risk-alerts`),
    ])
      .then(([metricsRes, txsRes, alertsRes]) => {
        if (!isMounted) return;
        setError(null);
        setMetricsData(metricsRes);
        setAllTransactions(txsRes.items || []);
        setRiskAlerts(alertsRes || []);
        setLastRefreshed(new Date());
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        // Gracefully fall back to demo workspace dataset if offline or database initialising
        setMetricsData((prev) => prev || DEFAULT_METRICS);
        setAllTransactions((prev) => (prev.length > 0 ? prev : DEFAULT_TRANSACTIONS));
        setRiskAlerts((prev) => (prev.length > 0 ? prev : DEFAULT_RISK_ALERTS));
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError(
            'Failed to fetch live financial intelligence data. Displaying cached demo baseline.',
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, reloadKey, hasToken, isAuthLoading]);

  const currency = resolveReportingCurrency(effectiveOrg?.baseCurrency, metricsData?.currency);
  const metrics = metricsData?.metrics;

  // Derive metrics safely
  const runwayMonths = metrics?.cashRunway?.value;
  const ocf = metrics?.operatingCashFlow?.value;
  const workingCapital = metrics?.workingCapital?.value;
  const quickRatio = metrics?.quickRatio?.value;
  const currentRatio = metrics?.currentRatio?.value;

  // Compute liquid cash strictly from converted Organization.baseCurrency components (null when FX incomplete)
  const isCashIncomplete =
    metrics?.cashRunway?.status === 'UNSUPPORTED_MISSING_DATA' &&
    Boolean(metrics?.cashRunway?.dataLimitations?.[0]?.includes('missing exchange rate'));
  const liquidCash = isCashIncomplete
    ? null
    : metrics?.cashRunway?.components?.liquidCashBalance ||
      metrics?.quickRatio?.components?.liquidCash ||
      '0.00';

  const isAlertActive = (a: RiskAlert) =>
    a.status === RiskAlertStatus.NEW ||
    a.status === RiskAlertStatus.ACKNOWLEDGED ||
    a.status === RiskAlertStatus.INVESTIGATING ||
    (a.status as string) === 'OPEN';

  const activeRiskAlerts = riskAlerts.filter(isAlertActive);
  const highSeverityAlerts = activeRiskAlerts.filter(
    (a) => a.severity === 'HIGH' || (a.severity as string) === 'CRITICAL',
  );
  const mediumSeverityAlerts = activeRiskAlerts.filter((a) => a.severity === 'MEDIUM');
  const lowSeverityAlerts = activeRiskAlerts.filter((a) => a.severity === 'LOW');

  // Prepare AR and AP horizontal bar chart datasets
  const arAgingData = useMemo<AgingBarDatum[]>(() => {
    const sched = metrics?.receivableAging?.value;
    const currentAmt = Number.parseFloat(resolveAgingBucketAmount(sched, 'CURRENT', 'current') || '0') || 0;
    const d1to30Amt = Number.parseFloat(resolveAgingBucketAmount(sched, '1_TO_30_DAYS', 'days1to30') || '0') || 0;
    const d31to60Amt = Number.parseFloat(resolveAgingBucketAmount(sched, '31_TO_60_DAYS', 'days31to60') || '0') || 0;
    const d61to90Amt = Number.parseFloat(resolveAgingBucketAmount(sched, '61_TO_90_DAYS', 'days61to90') || '0') || 0;
    const d90PlusAmt = Number.parseFloat(resolveAgingBucketAmount(sched, 'OVER_90_DAYS', 'days90Plus') || '0') || 0;

    const findCount = (bucketName: string) =>
      sched?.buckets?.find((b) => b.bucket === bucketName)?.count ?? (bucketName === 'CURRENT' && currentAmt > 0 ? 1 : 0);

    return [
      { category: 'Current', amount: currentAmt, count: findCount('CURRENT'), color: AGING_BAR_COLORS[0] },
      { category: '1-30d', amount: d1to30Amt, count: findCount('1_TO_30_DAYS'), color: AGING_BAR_COLORS[1] },
      { category: '31-60d', amount: d31to60Amt, count: findCount('31_TO_60_DAYS'), color: AGING_BAR_COLORS[2] },
      { category: '61-90d', amount: d61to90Amt, count: findCount('61_TO_90_DAYS'), color: AGING_BAR_COLORS[3] },
      { category: '90d+', amount: d90PlusAmt, count: findCount('OVER_90_DAYS'), color: AGING_BAR_COLORS[4] },
    ];
  }, [metrics?.receivableAging?.value]);

  const apAgingData = useMemo<AgingBarDatum[]>(() => {
    const sched = metrics?.payableAging?.value;
    const currentAmt = Number.parseFloat(resolveAgingBucketAmount(sched, 'CURRENT', 'current') || '0') || 0;
    const d1to30Amt = Number.parseFloat(resolveAgingBucketAmount(sched, '1_TO_30_DAYS', 'days1to30') || '0') || 0;
    const d31to60Amt = Number.parseFloat(resolveAgingBucketAmount(sched, '31_TO_60_DAYS', 'days31to60') || '0') || 0;
    const d61to90Amt = Number.parseFloat(resolveAgingBucketAmount(sched, '61_TO_90_DAYS', 'days61to90') || '0') || 0;
    const d90PlusAmt = Number.parseFloat(resolveAgingBucketAmount(sched, 'OVER_90_DAYS', 'days90Plus') || '0') || 0;

    const findCount = (bucketName: string) =>
      sched?.buckets?.find((b) => b.bucket === bucketName)?.count ?? (bucketName === 'CURRENT' && currentAmt > 0 ? 1 : 0);

    return [
      { category: 'Current', amount: currentAmt, count: findCount('CURRENT'), color: AGING_BAR_COLORS[0] },
      { category: '1-30d', amount: d1to30Amt, count: findCount('1_TO_30_DAYS'), color: AGING_BAR_COLORS[1] },
      { category: '31-60d', amount: d31to60Amt, count: findCount('31_TO_60_DAYS'), color: AGING_BAR_COLORS[2] },
      { category: '61-90d', amount: d61to90Amt, count: findCount('61_TO_90_DAYS'), color: AGING_BAR_COLORS[3] },
      { category: '90d+', amount: d90PlusAmt, count: findCount('OVER_90_DAYS'), color: AGING_BAR_COLORS[4] },
    ];
  }, [metrics?.payableAging?.value]);

  const recentTransactions = useMemo(() => allTransactions.slice(0, 6), [allTransactions]);

  // Build grounded cash-flow series strictly from actual backend transactions or monthlySeries
  const cashFlowSeries = useMemo<CashFlowSeriesPoint[]>(() => {
    const datedTxs = allTransactions
      .map((tx) => {
        const dateKey = getTxDateIso(tx);
        const rawAmt = Math.abs(Number.parseFloat(tx.amount) || 0);
        return {
          dateKey,
          type: tx.type,
          amount: rawAmt,
        };
      })
      .filter((t) => Boolean(t.dateKey))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    if (datedTxs.length > 0) {
      const latestDateStr = datedTxs[datedTxs.length - 1].dateKey;
      const latestMs = new Date(`${latestDateStr}T23:59:59.999Z`).getTime();
      const rangeMeta = DATE_RANGE_OPTIONS.find((o) => o.key === selectedRange);
      const cutoffMs =
        rangeMeta?.days !== null && rangeMeta?.days !== undefined
          ? latestMs - rangeMeta.days * 24 * 60 * 60 * 1000
          : null;

      const filtered =
        cutoffMs !== null
          ? datedTxs.filter((t) => new Date(`${t.dateKey}T12:00:00Z`).getTime() >= cutoffMs)
          : datedTxs;

      const sourceTxs = filtered.length > 0 ? filtered : datedTxs;

      const grouped = new Map<string, { inflows: number; outflows: number }>();
      for (const tx of sourceTxs) {
        const bucket = grouped.get(tx.dateKey) || { inflows: 0, outflows: 0 };
        if (tx.type === 'INCOME') {
          bucket.inflows += tx.amount;
        } else if (tx.type === 'EXPENSE') {
          bucket.outflows += tx.amount;
        }
        grouped.set(tx.dateKey, bucket);
      }

      return Array.from(grouped.entries()).map(([dateKey, vals]) => {
        const parsed = new Date(`${dateKey}T12:00:00Z`);
        const label = Number.isNaN(parsed.getTime())
          ? dateKey
          : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return {
          dateKey,
          label,
          inflows: Math.round(vals.inflows * 100) / 100,
          outflows: Math.round(vals.outflows * 100) / 100,
          netCashFlow: Math.round((vals.inflows - vals.outflows) * 100) / 100,
        };
      });
    }

    const monthly = metricsData?.charts?.monthlySeries ?? [];
    return monthly.map((pt) => {
      const inflows = Number.parseFloat(pt.income) || 0;
      const outflows = Number.parseFloat(pt.expenses) || 0;
      const net = Number.parseFloat(pt.netCashFlow) || inflows - outflows;
      return {
        dateKey: pt.month,
        label: pt.label,
        inflows,
        outflows,
        netCashFlow: net,
      };
    });
  }, [allTransactions, metricsData?.charts?.monthlySeries, selectedRange]);

  // Derive historical sparkline arrays from actual cashFlowSeries and current KPI values
  const sparklines = useMemo(() => {
    const currentLiquid = Number.parseFloat(liquidCash ?? '0') || 0;
    const currentOcf = Number.parseFloat(ocf ?? '0') || 0;
    const currentWc = Number.parseFloat(workingCapital ?? '0') || 0;

    if (cashFlowSeries.length === 0) {
      return {
        cash: [currentLiquid, currentLiquid],
        ocf: [currentOcf, currentOcf],
        wc: [currentWc, currentWc],
      };
    }

    const netDeltas = cashFlowSeries.map((pt) => pt.netCashFlow);
    const totalDelta = netDeltas.reduce((acc, v) => acc + v, 0);

    let runningCash = currentLiquid - totalDelta;
    const cashPoints = netDeltas.map((delta) => {
      runningCash += delta;
      return runningCash;
    });

    let runningWc = currentWc - totalDelta;
    const wcPoints = netDeltas.map((delta) => {
      runningWc += delta;
      return runningWc;
    });

    return {
      cash: cashPoints.length >= 2 ? cashPoints : [currentLiquid - totalDelta, currentLiquid],
      ocf:
        netDeltas.length >= 2
          ? netDeltas
          : [cashFlowSeries[0]?.inflows ?? 0, cashFlowSeries[0]?.netCashFlow ?? currentOcf],
      wc: wcPoints.length >= 2 ? wcPoints : [currentWc - totalDelta, currentWc],
    };
  }, [cashFlowSeries, liquidCash, ocf, workingCapital]);

  const periodSummary = useMemo(() => {
    const totalInflows = cashFlowSeries.reduce((acc, p) => acc + p.inflows, 0);
    const totalOutflows = cashFlowSeries.reduce((acc, p) => acc + p.outflows, 0);
    const totalNet = cashFlowSeries.reduce((acc, p) => acc + p.netCashFlow, 0);
    return { totalInflows, totalOutflows, totalNet };
  }, [cashFlowSeries]);

  const compactAxisValue = (val: number) =>
    new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(val);

  const runwayNum = runwayMonths ? Number.parseFloat(runwayMonths) : null;
  const isCashRunwaySelfSustaining =
    Boolean(
      metrics?.cashRunway?.dataLimitations?.[0]?.includes('cash-flow positive or break-even') ||
      metrics?.cashRunway?.dataLimitations?.[0]?.includes('self-sustaining') ||
      metrics?.cashRunway?.components?.calculationReason?.includes('self-sustaining'),
    ) || (ocf !== null && ocf !== undefined && Number.parseFloat(ocf) >= 0 && runwayNum === null);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
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

      {/* 1. TOP SECTION: 3 Compact Financial KPI Cards with Historical Sparklines */}
      <section
        aria-label="Primary Financial KPI Cards"
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {isLoading && !metricsData ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-3"
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-36" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))
        ) : (
          <>
            {/* KPI Card 1: Liquid Cash & Bank */}
            <div
              data-testid="kpi-card-liquid-cash"
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-xs transition-all hover:border-[var(--accent-primary)]/40 hover:shadow-md flex flex-col justify-between"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-[var(--accent-primary)]/12 border border-[var(--accent-primary)]/25 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold tracking-tight text-[var(--text-primary)] block truncate">
                      Liquid Cash & Bank
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] block truncate">
                      Unencumbered operating cash
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-lg sm:text-xl font-bold tabular-nums tracking-tight text-[var(--text-primary)] block">
                    {formatCurrency(liquidCash, currency)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Active Reserve
                  </span>
                </div>
              </div>

              <KpiSparkline
                values={sparklines.cash}
                strokeColor="#6841b8"
                gradientId="spark-liquid-cash"
              />

              {(isCashIncomplete
                ? metrics?.cashRunway?.dataLimitations?.[0]
                : metrics?.quickRatio?.dataLimitations?.[0]) && (
                <div
                  className="mt-1.5 text-[10px] text-[var(--text-muted)] italic truncate"
                  title={
                    isCashIncomplete
                      ? metrics?.cashRunway?.dataLimitations?.[0]
                      : metrics?.quickRatio?.dataLimitations?.[0]
                  }
                >
                  Note:{' '}
                  {isCashIncomplete
                    ? metrics?.cashRunway?.dataLimitations?.[0]
                    : metrics?.quickRatio?.dataLimitations?.[0]}
                </div>
              )}
            </div>

            {/* KPI Card 2: Operating Cash Flow (30d) */}
            <div
              data-testid="kpi-card-operating-cash-flow"
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-xs transition-all hover:border-[var(--accent-primary)]/40 hover:shadow-md flex flex-col justify-between"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold tracking-tight text-[var(--text-primary)] block truncate">
                      Operating Cash Flow (30d)
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] block truncate">
                      {metrics?.operatingCashFlow?.reportingPeriod
                        ? `${formatDate(metrics.operatingCashFlow.reportingPeriod.startDate)} – ${formatDate(metrics.operatingCashFlow.reportingPeriod.endDate)}`
                        : 'Cash receipts minus payments'}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-lg sm:text-xl font-bold tabular-nums tracking-tight text-[var(--text-primary)] block">
                    {formatCurrency(ocf, metrics?.operatingCashFlow?.currency || currency)}
                  </span>
                  {ocf ? (
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                        Number.parseFloat(ocf) >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {Number.parseFloat(ocf) >= 0 ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                      {Number.parseFloat(ocf) >= 0 ? 'Cash Positive' : 'Cash Burn'}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--text-muted)]">30d Net Flow</span>
                  )}
                </div>
              </div>

              <KpiSparkline
                values={sparklines.ocf}
                strokeColor="#0d9488"
                gradientId="spark-operating-cf"
              />

              {metrics?.operatingCashFlow?.dataLimitations?.[0] && (
                <div
                  className="mt-1.5 text-[10px] text-[var(--text-muted)] italic truncate"
                  title={metrics.operatingCashFlow.dataLimitations[0]}
                >
                  Note: {metrics.operatingCashFlow.dataLimitations[0]}
                </div>
              )}
            </div>

            {/* KPI Card 3: Net Working Capital */}
            <div
              data-testid="kpi-card-working-capital"
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-xs transition-all hover:border-[var(--accent-primary)]/40 hover:shadow-md flex flex-col justify-between"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-indigo-500/12 border border-indigo-500/25 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <Scale className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold tracking-tight text-[var(--text-primary)] block truncate">
                      Net Working Capital
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] block truncate">
                      Current Assets - Current Liabilities
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-lg sm:text-xl font-bold tabular-nums tracking-tight text-[var(--text-primary)] block">
                    {formatCurrency(workingCapital, currency)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                      workingCapital && Number.parseFloat(workingCapital) < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-indigo-600 dark:text-indigo-400'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    {workingCapital && Number.parseFloat(workingCapital) < 0
                      ? 'Working Deficit'
                      : 'Liquidity Buffer'}
                  </span>
                </div>
              </div>

              <KpiSparkline
                values={sparklines.wc}
                strokeColor="#4f46e5"
                gradientId="spark-working-cap"
              />

              {metrics?.workingCapital?.dataLimitations?.[0] && (
                <div
                  className="mt-1.5 text-[10px] text-[var(--text-muted)] italic truncate"
                  title={metrics.workingCapital.dataLimitations[0]}
                >
                  Note: {metrics.workingCapital.dataLimitations[0]}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* 2. MAIN ANALYTICS ROW: Balanced 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: lg:col-span-8 for Cash Flow Performance */}
        <div
          data-testid="overview-cashflow-chart-card"
          className="lg:col-span-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 sm:p-6 shadow-xs flex flex-col justify-between"
        >
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-[var(--accent-primary)]/12 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                    Cash Flow Performance
                  </h2>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Historical inflows, outflows, and net trajectory ({currency})
                  </p>
                </div>
              </div>

              {/* Date-Range Filter Pills */}
              <div
                role="group"
                aria-label="Cash flow chart date range filters"
                className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-canvas)] p-1 border border-[var(--border-subtle)] self-start sm:self-auto"
              >
                {DATE_RANGE_OPTIONS.map((opt) => {
                  const isActive = selectedRange === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSelectedRange(opt.key)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer ${
                        isActive
                          ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Series Legend Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 mb-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)] text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-[#6841b8]" />
                  Inflows
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)] text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-[#e11d48]" />
                  Outflows
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)] text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-[#0d9488]" />
                  Net
                </span>
              </div>
              <Link
                to="/cash-flow"
                className="text-[11px] font-semibold text-[var(--accent-teal)] hover:underline inline-flex items-center gap-1"
              >
                Forecasting Engine <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Multi-Series Interactive Recharts AreaChart with clean balanced natural height (h-[280px]) */}
            {cashFlowSeries.length > 0 ? (
              <div className="w-full mt-1 h-[280px]">
                <ResponsiveContainer width="100%" height={280} minWidth={180}>
                  <AreaChart
                    data={cashFlowSeries}
                    margin={{ top: 8, right: 10, left: -6, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="cfInflowsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6841b8" stopOpacity={0.26} />
                        <stop offset="95%" stopColor="#6841b8" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="cfOutflowsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e11d48" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#e11d48" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="cfNetGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0d9488" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border-subtle)"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={compactAxisValue}
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      width={46}
                    />
                    <Tooltip content={<CashFlowChartTooltip currency={currency} />} />
                    <Area
                      type="monotone"
                      dataKey="inflows"
                      name="Inflows"
                      stroke="#6841b8"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#cfInflowsGrad)"
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="outflows"
                      name="Outflows"
                      stroke="#e11d48"
                      strokeWidth={1.75}
                      fillOpacity={1}
                      fill="url(#cfOutflowsGrad)"
                      activeDot={{ r: 3, strokeWidth: 0 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="netCashFlow"
                      name="Net Cash Flow"
                      stroke="#0d9488"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#cfNetGrad)"
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[280px] flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-canvas)]/40 text-xs text-[var(--text-muted)]">
                <Activity className="w-5 h-5 mb-2 opacity-60" />
                <span>No cash flow series recorded for the selected window.</span>
              </div>
            )}
          </div>

          {/* Period Totals Footer */}
          <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] grid grid-cols-3 gap-2 text-xs">
            <div className="p-2 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
              <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block">
                Period Inflows
              </span>
              <span className="font-mono font-bold text-xs text-[var(--text-primary)] tabular-nums mt-0.5 block truncate">
                {formatCurrency(periodSummary.totalInflows, currency, 0)}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
              <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block">
                Period Outflows
              </span>
              <span className="font-mono font-bold text-xs text-[var(--text-primary)] tabular-nums mt-0.5 block truncate">
                {formatCurrency(periodSummary.totalOutflows, currency, 0)}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
              <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block">
                Net Cash Flow
              </span>
              <span
                className={`font-mono font-bold text-xs tabular-nums mt-0.5 block truncate ${
                  periodSummary.totalNet >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {periodSummary.totalNet >= 0 ? '+' : ''}
                {formatCurrency(periodSummary.totalNet, currency, 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: lg:col-span-4 with flex flex-col gap-5 stacking Cash Runway on top and Risk & Anomaly below */}
        <div className="lg:col-span-4 flex flex-col gap-5 justify-between">
          {/* Top: Cash Runway with Compact Gauge on Left & Status/Ratios on Right */}
          <div
            data-testid="overview-liquidity-health-card"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:p-5 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[var(--accent-primary)]" />
                  <div>
                    <h2 className="text-sm font-bold text-[var(--text-primary)]">
                      Cash Runway
                    </h2>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {isCashRunwaySelfSustaining
                        ? 'Self-Sustaining'
                        : 'Available cash / net burn'}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={
                    isCashRunwaySelfSustaining
                      ? 'ok'
                      : runwayNum !== null && runwayNum >= 6
                        ? 'ok'
                        : runwayNum !== null && runwayNum >= 3
                          ? 'amber'
                          : 'error'
                  }
                >
                  {isCashRunwaySelfSustaining
                    ? 'Healthy'
                    : runwayNum !== null && runwayNum >= 6
                      ? 'Healthy'
                      : runwayNum !== null && runwayNum >= 3
                        ? 'Warning'
                        : 'Critical'}
                </Badge>
              </div>

              {/* Gauge on left with status and Quick/Current Ratios neatly on the right */}
              <div className="pt-2.5">
                <CashRunwayGauge
                  runwayMonths={runwayNum}
                  isSelfSustaining={isCashRunwaySelfSustaining}
                  status={metrics?.cashRunway?.status}
                  reason={
                    metrics?.cashRunway?.dataLimitations?.[0] ||
                    metrics?.cashRunway?.components?.calculationReason
                  }
                  quickRatio={quickRatio}
                  currentRatio={currentRatio}
                />
              </div>
            </div>
          </div>

          {/* Bottom: Compact Risk & Anomaly Card (Donut ring on left, HIGH/MED/LOW pills on right, View All Anomalies at bottom) */}
          <div
            data-testid="overview-risk-summary-card"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:p-5 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <div>
                    <h2 className="text-sm font-bold text-[var(--text-primary)]">
                      Risk &amp; Anomaly
                    </h2>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {activeRiskAlerts.length} Total Anomalies Detected
                    </p>
                  </div>
                </div>
                <Badge variant={highSeverityAlerts.length > 0 ? 'error' : 'ok'}>
                  {highSeverityAlerts.length > 0
                    ? `${highSeverityAlerts.length} High Priority`
                    : 'Guarded'}
                </Badge>
              </div>

              {/* Donut ring on left, HIGH/MED/LOW status pills on right */}
              <div className="pt-2">
                <RiskSeverityDonutChart
                  highCount={highSeverityAlerts.length}
                  mediumCount={mediumSeverityAlerts.length}
                  lowCount={lowSeverityAlerts.length}
                />
              </div>
            </div>

            <div className="mt-2.5 pt-2.5 border-t border-[var(--border-subtle)]">
              <Link to="/risk-center">
                <Button variant="outline" size="sm" className="w-full justify-center text-xs py-1.5 h-8">
                  View All Anomalies
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM SECTION: Accounts Receivable Aging, Accounts Payable Aging & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Accounts Receivable Aging (AR) */}
        <div
          data-testid="overview-ar-aging-card"
          className="p-5 sm:p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs flex flex-col justify-between"
        >
          <div>
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
              <div className="mt-3 space-y-3">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold text-[var(--text-secondary)]">
                    Total Outstanding AR
                  </span>
                  <span className="font-mono font-bold text-base text-[var(--text-primary)] tabular-nums">
                    {formatCurrency(metrics.receivableAging.value.totalOutstanding, currency)}
                  </span>
                </div>

                {metrics.receivableAging.value.isComplete === false &&
                  Array.isArray(metrics.receivableAging.value.missingCurrencies) &&
                  metrics.receivableAging.value.missingCurrencies.length > 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1">
                      Missing FX rate(s) to {currency}:{' '}
                      {metrics.receivableAging.value.missingCurrencies.join(', ')}
                    </p>
                  )}

                {/* Horizontal Bar Chart across the 5 categories */}
                <AgingHorizontalBarChart data={arAgingData} currency={currency} />

                {/* Aging Bucket Metric Pills for Accessible Value Display */}
                <div className="grid grid-cols-5 gap-1.5 pt-1 text-center text-xs">
                  {arAgingData.map((b) => (
                    <div
                      key={b.category}
                      className="p-1.5 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-subtle)]"
                    >
                      <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                        {b.category}
                      </span>
                      <span className="font-mono font-semibold text-[11px] text-[var(--text-primary)] mt-0.5 block truncate">
                        {formatCurrency(b.amount, currency, 0)}
                      </span>
                    </div>
                  ))}
                </div>

                {Number(metrics.receivableAging.components?.draftCount || 0) > 0 && (
                  <p className="text-[11px] text-[var(--text-muted)] pt-1">
                    Drafts excluded from AR ({metrics.receivableAging.components?.draftCount}):{' '}
                    <span className="font-mono font-semibold text-[var(--text-secondary)]">
                      {formatCurrency(metrics.receivableAging.components?.draftTotal, currency)}
                    </span>
                  </p>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                No open customer receivables recorded.
              </div>
            )}
          </div>
        </div>

        {/* Accounts Payable Aging (AP) */}
        <div
          data-testid="overview-ap-aging-card"
          className="p-5 sm:p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs flex flex-col justify-between"
        >
          <div>
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
              <div className="mt-3 space-y-3">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold text-[var(--text-secondary)]">
                    Total Outstanding AP
                  </span>
                  <span className="font-mono font-bold text-base text-[var(--text-primary)] tabular-nums">
                    {formatCurrency(metrics.payableAging.value.totalOutstanding, currency)}
                  </span>
                </div>

                {metrics.payableAging.value.isComplete === false &&
                  Array.isArray(metrics.payableAging.value.missingCurrencies) &&
                  metrics.payableAging.value.missingCurrencies.length > 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1">
                      Missing FX rate(s) to {currency}:{' '}
                      {metrics.payableAging.value.missingCurrencies.join(', ')}
                    </p>
                  )}

                {/* Horizontal Bar Chart across the 5 categories */}
                <AgingHorizontalBarChart data={apAgingData} currency={currency} />

                {/* Aging Bucket Metric Pills for Accessible Value Display */}
                <div className="grid grid-cols-5 gap-1.5 pt-1 text-center text-xs">
                  {apAgingData.map((b) => (
                    <div
                      key={b.category}
                      className="p-1.5 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-subtle)]"
                    >
                      <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                        {b.category}
                      </span>
                      <span className="font-mono font-semibold text-[11px] text-[var(--text-primary)] mt-0.5 block truncate">
                        {formatCurrency(b.amount, currency, 0)}
                      </span>
                    </div>
                  ))}
                </div>

                {Number(metrics.payableAging.components?.draftCount || 0) > 0 && (
                  <p className="text-[11px] text-[var(--text-muted)] pt-1">
                    Drafts excluded from AP ({metrics.payableAging.components?.draftCount}):{' '}
                    <span className="font-mono font-semibold text-[var(--text-secondary)]">
                      {formatCurrency(metrics.payableAging.components?.draftTotal, currency)}
                    </span>
                  </p>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                No open supplier payables recorded.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Ledger Transactions Card */}
      <div
        data-testid="overview-recent-transactions"
        className="p-5 sm:p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs"
      >
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
                  <th className="py-2.5 pr-3 font-semibold">Transaction ID</th>
                  <th className="py-2.5 px-3 font-semibold">Description</th>
                  <th className="py-2.5 px-3 font-semibold">Date</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 pl-3 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {recentTransactions.map((tx) => {
                  const isIncome = tx.type === 'INCOME';
                  const isExpense = tx.type === 'EXPENSE';
                  const txDate =
                    tx.date || (tx as unknown as { transactionDate?: string }).transactionDate;
                  const shortId = tx.id ? (tx.id.length > 12 ? `${tx.id.slice(0, 8)}...` : tx.id) : '—';

                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                    >
                      <td className="py-3 pr-3 font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap" title={tx.id}>
                        {shortId}
                      </td>
                      <td className="py-3 px-3 font-medium text-[var(--text-primary)] max-w-[280px]">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                              isIncome
                                ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                                : 'bg-[var(--accent-primary)]/12 text-[var(--accent-primary)]'
                            }`}
                          >
                            {isIncome ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                          </span>
                          <span className="truncate">{tx.description}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-[var(--text-secondary)] whitespace-nowrap">
                        {formatDate(txDate)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                          Posted
                        </span>
                      </td>
                      <td className="py-3 pl-3 text-right font-mono font-semibold whitespace-nowrap">
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
                          {formatCurrency(
                            tx.amount,
                            tx.currency || tx.account?.currency || currency,
                          )}
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
    </div>
  );
}
