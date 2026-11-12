import { ReportType } from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';

export interface ExecutiveKpiCard {
  label: string;
  value: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  status: 'VERIFIED' | 'MISSING_DATA';
  subtext?: string;
}

export interface ExecutiveTableColumn {
  label: string;
  align?: 'left' | 'right' | 'center';
  isNumeric?: boolean;
}

export interface ExecutiveTableRow {
  cells: string[];
  tone?: 'normal' | 'positive' | 'warning' | 'danger';
  isTotal?: boolean;
}

export interface ExecutiveTable {
  title: string;
  columns: ExecutiveTableColumn[];
  rows: ExecutiveTableRow[];
  note?: string;
}

export interface ExecutiveRiskItem {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  detail: string;
  sourceTag: string;
}

export interface ExecutiveActionItem {
  priority: number;
  title: string;
  rationale: string;
  targetArea: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ExecutiveDataGrounding {
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  currency: string;
  recordCounts: {
    accounts: number;
    transactions: number;
    invoices: number;
    bills: number;
    budgets: number;
    riskAlerts: number;
    forecasts: number;
  };
  dataSources: string[];
  missingInputs: string[];
  methodologyNote: string;
}

export interface ExecutiveBrief {
  schemaVersion: '2.0';
  reportType: ReportType;
  executiveSummary: string[];
  kpis: ExecutiveKpiCard[];
  tables: ExecutiveTable[];
  risksAndAnomalies: ExecutiveRiskItem[];
  prioritizedActionPlan: ExecutiveActionItem[];
  dataGrounding: ExecutiveDataGrounding;
}

export interface AgingBucketSummary {
  bucket?: string;
  label?: string;
  count: number;
  amount: string;
}

export interface BriefAnalyticsSnapshot {
  currency: string;
  conversionContext: {
    isComplete: boolean;
    missingCurrencies: string[];
  };
  metrics: {
    operatingCashFlow: {
      status: string;
      value: string | null;
      dataLimitations: string[];
      components?: Record<string, string>;
    };
    cashRunway: {
      status: string;
      value: string | null;
      dataLimitations: string[];
      components?: Record<string, string>;
    };
    currentRatio: {
      status: string;
      value: string | null;
      dataLimitations: string[];
      components?: Record<string, string>;
    };
    quickRatio: {
      status: string;
      value: string | null;
      dataLimitations: string[];
      components?: Record<string, string>;
    };
    grossMargin: {
      status: string;
      value: string | null;
      dataLimitations: string[];
      components?: Record<string, string>;
    };
    expenseGrowth: {
      status: string;
      value: string | null;
      dataLimitations: string[];
      components?: Record<string, string>;
    };
    workingCapital: {
      status: string;
      value: string | null;
      dataLimitations: string[];
      components?: Record<string, string>;
    };
    budgetVariance: {
      status: string;
      value: string | null;
      dataLimitations: string[];
      components?: Record<string, string>;
    };
    receivableAging: {
      status: string;
      value: {
        totalOutstanding: string;
        totalOverdue: string;
        buckets: AgingBucketSummary[];
        missingCurrencies?: string[];
      } | null;
      dataLimitations: string[];
      components?: Record<string, string>;
    };
    payableAging: {
      status: string;
      value: {
        totalOutstanding: string;
        totalOverdue: string;
        buckets: AgingBucketSummary[];
        missingCurrencies?: string[];
      } | null;
      dataLimitations: string[];
      components?: Record<string, string>;
    };
  };
}

export interface BriefAlertInput {
  id: string;
  severity: string;
  status: string;
  title: string;
  explanation: string;
  type: string;
}

export interface BriefForecastInput {
  id: string;
  openingCashBalance: unknown;
  projectedClosingCash: unknown;
  minimumProjectedCash: unknown;
  hasLiquidityWarning: boolean;
  forecastPoints?: Array<{
    date?: string;
    projectedBalance?: string;
    projectedInflows?: string;
    projectedOutflows?: string;
  }>;
}

export interface BriefBudgetVarianceInput {
  budgetName?: string;
  totalAllocated: string;
  totalActualSpent: string;
  totalVarianceAmount: string;
  totalUtilizationPct: string;
  missingCurrencies?: string[];
  isComplete?: boolean;
  lines?: Array<{
    category: string;
    department?: string | null;
    budgetedAmount?: string;
    allocatedAmount?: string;
    actualSpent?: string;
    actualAmount?: string;
    varianceAmount: string;
    utilizationPct: string;
    status: string;
  }>;
}

export interface BuildBriefInput {
  reportType: ReportType;
  periodStart: Date;
  periodEnd: Date;
  metricsBundle: BriefAnalyticsSnapshot;
  liquidCashBalance: string | null;
  liquidAccountsCount: number;
  recordCounts: ExecutiveDataGrounding['recordCounts'];
  alerts?: BriefAlertInput[];
  forecast?: BriefForecastInput | null;
  expensesByCategory?: Record<string, string>;
  expenseCount?: number;
  totalExpenses?: string | null;
  expenseMissingCurrencies?: string[];
  budgetVariances?: BriefBudgetVarianceInput[];
}

function fmtMoney(val: string | number | null | undefined, currency: string): string {
  if (val === null || val === undefined) return 'Unavailable';
  const num = typeof val === 'number' ? val : Number.parseFloat(String(val));
  if (Number.isNaN(num)) return String(val);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}

function fmtPct(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return 'Unavailable';
  const num = typeof val === 'number' ? val : Number.parseFloat(String(val));
  if (Number.isNaN(num)) return String(val);
  return `${num.toFixed(1)}%`;
}

function fmtRatio(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return 'Unavailable';
  const num = typeof val === 'number' ? val : Number.parseFloat(String(val));
  if (Number.isNaN(num)) return String(val);
  return `${num.toFixed(2)}x`;
}

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = Number.parseFloat(String(val));
  return Number.isNaN(n) ? 0 : n;
}

function fmtShortDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function severityRank(sev: string): number {
  switch (sev.toUpperCase()) {
    case 'CRITICAL':
      return 0;
    case 'HIGH':
      return 1;
    case 'MEDIUM':
      return 2;
    default:
      return 3;
  }
}

function normalizeSeverity(sev: string): ExecutiveRiskItem['severity'] {
  const upper = sev.toUpperCase();
  if (upper === 'CRITICAL' || upper === 'HIGH' || upper === 'MEDIUM' || upper === 'LOW') {
    return upper;
  }
  return 'MEDIUM';
}

function dedupeStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((i) => i.trim()).filter(Boolean)));
}

function buildAgingTable(
  metricsBundle: BriefAnalyticsSnapshot,
  currency: string,
): ExecutiveTable | null {
  const ar = metricsBundle.metrics.receivableAging.value;
  const ap = metricsBundle.metrics.payableAging.value;
  if (!ar && !ap) return null;

  const arTotal = toNum(ar?.totalOutstanding);
  const apTotal = toNum(ap?.totalOutstanding);
  const arBuckets = ar?.buckets ?? [];
  const apBuckets = ap?.buckets ?? [];
  const arBucketCount = arBuckets.reduce((acc, b) => acc + (b.count ?? 0), 0);
  const apBucketCount = apBuckets.reduce((acc, b) => acc + (b.count ?? 0), 0);

  if (arTotal === 0 && apTotal === 0 && arBucketCount === 0 && apBucketCount === 0) {
    return null;
  }

  const bucketDefs: Array<{ bucketKey: string; label: string }> = [
    { bucketKey: 'CURRENT', label: 'Current' },
    { bucketKey: '1_TO_30_DAYS', label: '1-30 Days' },
    { bucketKey: '31_TO_60_DAYS', label: '31-60 Days' },
    { bucketKey: '61_TO_90_DAYS', label: '61-90 Days' },
    { bucketKey: 'OVER_90_DAYS', label: '90+ Days' },
  ];
  const findBucket = (buckets: AgingBucketSummary[], def: { bucketKey: string; label: string }) =>
    buckets.find((b) => b.bucket === def.bucketKey || b.label === def.label);

  const rows: ExecutiveTableRow[] = bucketDefs.map((def) => {
    const arMatch = findBucket(arBuckets, def);
    const apMatch = findBucket(apBuckets, def);
    const arOverdue = def.bucketKey !== 'CURRENT' && toNum(arMatch?.amount) > 0;
    return {
      cells: [
        def.label,
        String(arMatch?.count ?? 0),
        fmtMoney(arMatch?.amount ?? '0', currency),
        String(apMatch?.count ?? 0),
        fmtMoney(apMatch?.amount ?? '0', currency),
      ],
      tone:
        arOverdue && (def.bucketKey === '61_TO_90_DAYS' || def.bucketKey === 'OVER_90_DAYS')
          ? 'danger'
          : 'normal',
    };
  });

  rows.push({
    cells: [
      'Total Outstanding',
      String(arBucketCount),
      fmtMoney(ar?.totalOutstanding ?? '0', currency),
      String(apBucketCount),
      fmtMoney(ap?.totalOutstanding ?? '0', currency),
    ],
    isTotal: true,
  });

  const draftNotes: string[] = [];
  const arDraftCount = Number(metricsBundle.metrics.receivableAging.components?.draftCount ?? 0);
  const arDraftTotal = metricsBundle.metrics.receivableAging.components?.draftTotal;
  if (arDraftCount > 0 && arDraftTotal) {
    draftNotes.push(
      `Excludes ${arDraftCount} draft invoice(s) (${fmtMoney(arDraftTotal, currency)})`,
    );
  }
  const apDraftCount = Number(metricsBundle.metrics.payableAging.components?.draftCount ?? 0);
  const apDraftTotal = metricsBundle.metrics.payableAging.components?.draftTotal;
  if (apDraftCount > 0 && apDraftTotal) {
    draftNotes.push(`Excludes ${apDraftCount} draft bill(s) (${fmtMoney(apDraftTotal, currency)})`);
  }

  return {
    title: 'Receivables & Payables Aging',
    columns: [
      { label: 'Aging Bucket', align: 'left' },
      { label: 'AR Count', align: 'right', isNumeric: true },
      { label: 'AR Amount', align: 'right', isNumeric: true },
      { label: 'AP Count', align: 'right', isNumeric: true },
      { label: 'AP Amount', align: 'right', isNumeric: true },
    ],
    rows,
    ...(draftNotes.length > 0 ? { note: `${draftNotes.join(' · ')}.` } : {}),
  };
}

function collectCommonRisks(input: BuildBriefInput): ExecutiveRiskItem[] {
  const { metricsBundle, alerts = [], forecast, expenseMissingCurrencies = [] } = input;
  const m = metricsBundle.metrics;
  const currency = metricsBundle.currency;
  const risks: ExecutiveRiskItem[] = [];

  const activeAlerts = alerts
    .filter((a) => a.status !== 'RESOLVED' && a.status !== 'DISMISSED')
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  for (const alert of activeAlerts.slice(0, 4)) {
    risks.push({
      severity: normalizeSeverity(alert.severity),
      title: alert.title,
      detail: alert.explanation.replace(/\s*Statistical or rule-based anomaly signal.*$/i, '').trim(),
      sourceTag: 'Risk Alert',
    });
  }

  const missingCurrencies = dedupeStrings([
    ...metricsBundle.conversionContext.missingCurrencies,
    ...expenseMissingCurrencies,
  ]);
  if (missingCurrencies.length > 0) {
    risks.push({
      severity: 'HIGH',
      title: `Missing FX Rates (${missingCurrencies.join(', ')} -> ${currency})`,
      detail: `Consolidated totals exclude unconvertible ${missingCurrencies.join(', ')} records until exchange rates are added.`,
      sourceTag: 'FX Coverage',
    });
  }

  const overdueAr = toNum(m.receivableAging.value?.totalOverdue);
  const totalAr = toNum(m.receivableAging.value?.totalOutstanding);
  if (overdueAr > 0) {
    const share = totalAr > 0 ? ` (${((overdueAr / totalAr) * 100).toFixed(0)}% of open AR)` : '';
    risks.push({
      severity: overdueAr >= totalAr * 0.5 ? 'HIGH' : 'MEDIUM',
      title: 'Overdue Customer Receivables',
      detail: `${fmtMoney(overdueAr, currency)} in issued customer invoices is past due${share}.`,
      sourceTag: 'AR Aging',
    });
  }

  const overdueAp = toNum(m.payableAging.value?.totalOverdue);
  if (overdueAp > 0) {
    risks.push({
      severity: 'MEDIUM',
      title: 'Overdue Supplier Payables',
      detail: `${fmtMoney(overdueAp, currency)} in open supplier bills has passed its due date.`,
      sourceTag: 'AP Aging',
    });
  }

  if (m.operatingCashFlow.status === 'COMPUTED' && toNum(m.operatingCashFlow.value) < 0) {
    risks.push({
      severity: 'HIGH',
      title: 'Negative Operating Cash Flow',
      detail: `Period cash outflows exceeded inflows by ${fmtMoney(Math.abs(toNum(m.operatingCashFlow.value)), currency)}.`,
      sourceTag: 'Cash Flow',
    });
  }

  if (m.workingCapital.status === 'COMPUTED' && toNum(m.workingCapital.value) < 0) {
    risks.push({
      severity: 'HIGH',
      title: 'Negative Working Capital',
      detail: `Current liabilities exceed current liquid assets and receivables by ${fmtMoney(Math.abs(toNum(m.workingCapital.value)), currency)}.`,
      sourceTag: 'Liquidity',
    });
  }

  if (forecast?.hasLiquidityWarning || toNum(forecast?.minimumProjectedCash) < 0) {
    risks.push({
      severity: 'CRITICAL',
      title: '30-Day Liquidity Shortfall Warning',
      detail: `Minimum projected cash balance reaches ${fmtMoney(String(forecast?.minimumProjectedCash ?? '0'), currency)} within the 30-day forecast horizon.`,
      sourceTag: 'Forecast',
    });
  }

  if (m.budgetVariance.status === 'COMPUTED' && toNum(m.budgetVariance.value) < 0) {
    risks.push({
      severity: 'MEDIUM',
      title: 'Budget Overrun Detected',
      detail: `Actual spending exceeded allocated budget by ${Math.abs(toNum(m.budgetVariance.value)).toFixed(1)}%.`,
      sourceTag: 'Budget Variance',
    });
  }

  return risks.slice(0, 6);
}

function buildActionPlan(input: BuildBriefInput, risks: ExecutiveRiskItem[]): ExecutiveActionItem[] {
  const { metricsBundle, forecast, expensesByCategory, budgetVariances = [] } = input;
  const m = metricsBundle.metrics;
  const currency = metricsBundle.currency;
  const actions: ExecutiveActionItem[] = [];

  const pushAction = (item: Omit<ExecutiveActionItem, 'priority'>) => {
    if (actions.some((a) => a.title === item.title)) return;
    actions.push({ ...item, priority: actions.length + 1 });
  };

  if (metricsBundle.conversionContext.missingCurrencies.length > 0) {
    pushAction({
      title: `Configure ${metricsBundle.conversionContext.missingCurrencies.join('/')} to ${currency} FX Rates`,
      rationale: `Add verified exchange rates in Organization Currency Settings so consolidated KPIs include all foreign-currency balances.`,
      targetArea: 'FX Governance',
      impact: 'HIGH',
    });
  }

  if (forecast?.hasLiquidityWarning || toNum(m.workingCapital.value) < 0) {
    pushAction({
      title: 'Preserve Near-Term Liquidity & Defer Non-Essential Outflows',
      rationale: `Tighten discretionary spending and sequence supplier payments to avoid negative cash buffer exposure.`,
      targetArea: 'Liquidity',
      impact: 'HIGH',
    });
  }

  const overdueAr = toNum(m.receivableAging.value?.totalOverdue);
  if (overdueAr > 0) {
    pushAction({
      title: `Accelerate Collection of ${fmtMoney(overdueAr, currency)} Overdue AR`,
      rationale: `Prioritize customer outreach on past-due invoices to convert open receivables into liquid bank cash.`,
      targetArea: 'Receivables',
      impact: 'HIGH',
    });
  }

  const arDraftCount = Number(m.receivableAging.components?.draftCount ?? 0);
  if (arDraftCount > 0) {
    pushAction({
      title: `Review & Issue ${arDraftCount} Pending Draft Invoice(s)`,
      rationale: `Draft invoices totaling ${fmtMoney(m.receivableAging.components?.draftTotal ?? '0', currency)} remain excluded from receivables until formally issued.`,
      targetArea: 'Billing Workflow',
      impact: 'MEDIUM',
    });
  }

  const openAlerts = risks.filter((r) => r.sourceTag === 'Risk Alert');
  if (openAlerts.length > 0) {
    pushAction({
      title: `Triage ${openAlerts.length} Flagged Anomaly Alert(s) in Risk Center`,
      rationale: `Assign finance review for "${openAlerts[0].title}" to verify supporting vouchers and rule out duplicate charges.`,
      targetArea: 'Risk Controls',
      impact: openAlerts[0].severity === 'CRITICAL' || openAlerts[0].severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
    });
  }

  if (expensesByCategory && Object.keys(expensesByCategory).length > 0) {
    const sorted = Object.entries(expensesByCategory).sort((a, b) => toNum(b[1]) - toNum(a[1]));
    const [topCat, topVal] = sorted[0];
    pushAction({
      title: `Audit Top Spend Category: ${topCat}`,
      rationale: `${topCat} accounts for ${fmtMoney(topVal, currency)} in period outflows; review recurring vendor terms for savings.`,
      targetArea: 'Cost Control',
      impact: 'MEDIUM',
    });
  }

  const overrunBudget = budgetVariances.find((b) => toNum(b.totalVarianceAmount) < 0);
  if (overrunBudget) {
    pushAction({
      title: `Rebalance Over-Budget Plan (${overrunBudget.budgetName ?? 'Active Budget'})`,
      rationale: `Utilization reached ${fmtPct(overrunBudget.totalUtilizationPct)}; reallocate unused line items or approve a formal revision.`,
      targetArea: 'Budget Governance',
      impact: 'HIGH',
    });
  }

  if (m.operatingCashFlow.status === 'COMPUTED' && toNum(m.operatingCashFlow.value) < 0) {
    pushAction({
      title: 'Close Operating Cash Deficit Through Margin & Spend Review',
      rationale: `Outflows exceeded inflows by ${fmtMoney(Math.abs(toNum(m.operatingCashFlow.value)), currency)} in the reporting window.`,
      targetArea: 'Operating Margin',
      impact: 'HIGH',
    });
  }

  const overdueAp = toNum(m.payableAging.value?.totalOverdue);
  if (overdueAp > 0) {
    pushAction({
      title: `Schedule Settlement for ${fmtMoney(overdueAp, currency)} Overdue Payables`,
      rationale: `Align supplier bill settlements with incoming AR collections to protect vendor credit terms.`,
      targetArea: 'Payables',
      impact: 'MEDIUM',
    });
  }

  // Ensure at least 3 concrete, grounded management actions without inventing fake issues
  if (actions.length < 3) {
    pushAction({
      title: 'Maintain Monthly Ledger & Bank Reconciliation Cadence',
      rationale: `Keep bank accounts, receipts, and supplier bills reconciled in ${currency} to sustain continuous audit readiness.`,
      targetArea: 'Financial Hygiene',
      impact: 'MEDIUM',
    });
  }
  if (actions.length < 3 && input.recordCounts.budgets === 0) {
    pushAction({
      title: 'Establish an Active Operating Budget for Variance Tracking',
      rationale: `No active budget overlapped this reporting period; creating category caps will enable automated overrun alerts.`,
      targetArea: 'Planning & Budgets',
      impact: 'MEDIUM',
    });
  }
  if (actions.length < 3) {
    pushAction({
      title: 'Run Periodic 30-to-90 Day Cash-Flow Stress Scenarios',
      rationale: `Simulate revenue slowdowns or supplier cost increases in Scenario Planning before committing new fixed overhead.`,
      targetArea: 'Treasury Planning',
      impact: 'LOW',
    });
  }

  return actions.slice(0, 4);
}

export function buildExecutiveBrief(input: BuildBriefInput): ExecutiveBrief {
  const {
    reportType,
    periodStart,
    periodEnd,
    metricsBundle,
    liquidCashBalance,
    liquidAccountsCount,
    recordCounts,
    alerts = [],
    forecast,
    expensesByCategory = {},
    expenseCount = 0,
    totalExpenses = null,
    expenseMissingCurrencies = [],
    budgetVariances = [],
  } = input;

  const currency = metricsBundle.currency;
  const m = metricsBundle.metrics;
  const periodLabel = `${fmtShortDate(periodStart)} to ${fmtShortDate(periodEnd)}`;
  const risks = collectCommonRisks(input);

  const missingInputs = dedupeStrings([
    ...m.operatingCashFlow.dataLimitations,
    ...m.workingCapital.dataLimitations,
    ...m.budgetVariance.dataLimitations,
    ...m.receivableAging.dataLimitations,
    ...m.payableAging.dataLimitations,
    ...(metricsBundle.conversionContext.missingCurrencies.length > 0
      ? [
          `Missing exchange rates for ${metricsBundle.conversionContext.missingCurrencies.join(', ')} -> ${currency}.`,
        ]
      : []),
    ...(expenseMissingCurrencies.length > 0
      ? [`Expense report missing FX conversion for ${expenseMissingCurrencies.join(', ')}.`]
      : []),
  ]).slice(0, 6);

  const dataSources = dedupeStrings([
    recordCounts.accounts > 0 ? `Financial Accounts (${recordCounts.accounts})` : '',
    recordCounts.transactions > 0 ? `Ledger Transactions (${recordCounts.transactions})` : '',
    recordCounts.invoices > 0 ? `Open AR Invoices (${recordCounts.invoices})` : '',
    recordCounts.bills > 0 ? `Open AP Bills (${recordCounts.bills})` : '',
    recordCounts.budgets > 0 ? `Active Budgets (${recordCounts.budgets})` : '',
    recordCounts.riskAlerts > 0 ? `Risk Surveillance (${recordCounts.riskAlerts})` : '',
    recordCounts.forecasts > 0 ? `Cash-Flow Forecast (${recordCounts.forecasts})` : '',
  ]);

  let executiveSummary: string[] = [];
  let kpis: ExecutiveKpiCard[] = [];
  const tables: ExecutiveTable[] = [];

  if (reportType === ReportType.BUSINESS_HEALTH) {
    const arTotal = m.receivableAging.value?.totalOutstanding ?? '0.0000';
    const arOverdue = m.receivableAging.value?.totalOverdue ?? '0.0000';
    const apTotal = m.payableAging.value?.totalOutstanding ?? '0.0000';
    const apOverdue = m.payableAging.value?.totalOverdue ?? '0.0000';

    const runwayText =
      m.cashRunway.status === 'COMPUTED'
        ? toNum(m.cashRunway.value) >= 999
          ? 'cash-flow self-sustaining'
          : `${Number(m.cashRunway.value).toFixed(1)} months of runway`
        : 'runway pending baseline transactions';

    executiveSummary = [
      liquidCashBalance !== null
        ? `As of ${fmtShortDate(periodEnd)}, consolidated liquid cash stands at ${fmtMoney(liquidCashBalance, currency)} across ${liquidAccountsCount} account(s) (${runwayText}).`
        : `Consolidated cash position for ${periodLabel} is incomplete due to missing account data or FX rates in ${currency}.`,
      m.operatingCashFlow.status === 'COMPUTED'
        ? `Operating cash flow in the period totaled ${fmtMoney(m.operatingCashFlow.value, currency)} from ${fmtMoney(m.operatingCashFlow.components?.cashInflows ?? '0', currency)} in inflows against ${fmtMoney(m.operatingCashFlow.components?.cashOutflows ?? '0', currency)} in outflows.`
        : `No verified income or expense transactions were posted during ${periodLabel} to establish period operating cash flow.`,
      m.workingCapital.status === 'COMPUTED'
        ? `Net working capital is ${fmtMoney(m.workingCapital.value, currency)}, supported by ${fmtMoney(arTotal, currency)} in open receivables and ${fmtMoney(apTotal, currency)} in open payables.`
        : `Open receivables total ${fmtMoney(arTotal, currency)} against ${fmtMoney(apTotal, currency)} in open supplier payables.`,
      risks.length > 0
        ? `Key concerns include ${risks.length} active signal(s), led by ${risks[0].title.toLowerCase()}.`
        : `No critical anomalies or FX consolidation gaps were detected in the current reporting snapshot.`,
    ];

    kpis = [
      {
        label: 'Cash Balance',
        value: fmtMoney(liquidCashBalance, currency),
        status: liquidCashBalance !== null ? 'VERIFIED' : 'MISSING_DATA',
        subtext:
          liquidAccountsCount > 0
            ? `Across ${liquidAccountsCount} liquid account(s)`
            : 'No liquid accounts configured',
      },
      {
        label: 'Operating Cash Flow',
        value: fmtMoney(m.operatingCashFlow.value, currency),
        status: m.operatingCashFlow.status === 'COMPUTED' ? 'VERIFIED' : 'MISSING_DATA',
        subtext:
          m.operatingCashFlow.components?.cashInflows !== undefined
            ? `In ${fmtMoney(m.operatingCashFlow.components.cashInflows, currency)} · Out ${fmtMoney(m.operatingCashFlow.components.cashOutflows ?? '0', currency)}`
            : 'No transactions in period',
      },
      {
        label: 'Working Capital',
        value: fmtMoney(m.workingCapital.value, currency),
        status: m.workingCapital.status === 'COMPUTED' ? 'VERIFIED' : 'MISSING_DATA',
        subtext:
          m.currentRatio.status === 'COMPUTED'
            ? `Current Ratio ${fmtRatio(m.currentRatio.value)}`
            : 'Assets minus current liabilities',
      },
      {
        label: 'Outstanding AR / AP',
        value: `AR ${fmtMoney(arTotal, currency)}`,
        secondaryLabel: 'AP',
        secondaryValue: fmtMoney(apTotal, currency),
        status:
          m.receivableAging.status === 'COMPUTED' && m.payableAging.status === 'COMPUTED'
            ? 'VERIFIED'
            : 'MISSING_DATA',
        subtext:
          toNum(arOverdue) > 0 || toNum(apOverdue) > 0
            ? `Overdue: AR ${fmtMoney(arOverdue, currency)} · AP ${fmtMoney(apOverdue, currency)}`
            : 'All open balances current',
      },
    ];

    const perfRows: ExecutiveTableRow[] = [];
    if (m.operatingCashFlow.status === 'COMPUTED') {
      const inflows = m.operatingCashFlow.components?.cashInflows ?? '0';
      const outflows = m.operatingCashFlow.components?.cashOutflows ?? '0';
      const ocf = toNum(m.operatingCashFlow.value);
      perfRows.push(
        { cells: ['Revenue (Cash Inflows)', fmtMoney(inflows, currency), 'Verified period inflows'] },
        { cells: ['Operating Expenses (Outflows)', fmtMoney(outflows, currency), 'Verified period outflows'] },
        {
          cells: [
            'Net Operating Cash Flow',
            fmtMoney(m.operatingCashFlow.value, currency),
            ocf >= 0 ? 'Cash-generative' : 'Net cash burn',
          ],
          tone: ocf >= 0 ? 'positive' : 'danger',
          isTotal: true,
        },
      );
    }
    if (m.grossMargin.status === 'COMPUTED') {
      perfRows.push({
        cells: [
          'Gross Margin',
          fmtPct(m.grossMargin.value),
          `Gross Profit ${fmtMoney(m.grossMargin.components?.grossProfit ?? '0', currency)}`,
        ],
      });
    }
    if (m.workingCapital.status === 'COMPUTED') {
      perfRows.push({
        cells: [
          'Current Assets vs Liabilities',
          fmtMoney(m.workingCapital.value, currency),
          `Assets ${fmtMoney(m.workingCapital.components?.currentAssets ?? '0', currency)} · Liab ${fmtMoney(m.workingCapital.components?.currentLiabilities ?? '0', currency)}`,
        ],
      });
    }
    if (m.budgetVariance.status === 'COMPUTED') {
      const varNum = toNum(m.budgetVariance.value);
      perfRows.push({
        cells: [
          'Budget Variance',
          fmtPct(m.budgetVariance.value),
          `Utilization ${fmtPct(m.budgetVariance.components?.totalUtilizationPct ?? '0')}`,
        ],
        tone: varNum < 0 ? 'warning' : 'positive',
      });
    }
    if (perfRows.length > 0) {
      tables.push({
        title: 'Financial Performance & Position',
        columns: [
          { label: 'Line Item', align: 'left' },
          { label: 'Verified Value', align: 'right', isNumeric: true },
          { label: 'Context', align: 'left' },
        ],
        rows: perfRows,
      });
    }

    const agingTable = buildAgingTable(metricsBundle, currency);
    if (agingTable) tables.push(agingTable);
  } else if (reportType === ReportType.CASH_FLOW) {
    const opening = forecast ? String(forecast.openingCashBalance ?? '0') : liquidCashBalance;
    const closing = forecast ? String(forecast.projectedClosingCash ?? '0') : null;
    const minCash = forecast ? String(forecast.minimumProjectedCash ?? '0') : null;

    executiveSummary = [
      `This 30-day liquidity brief opens with ${fmtMoney(opening, currency)} in verified liquid cash across ${liquidAccountsCount} account(s).`,
      closing !== null
        ? `Under baseline assumptions, projected 30-day closing cash reaches ${fmtMoney(closing, currency)} with a minimum projected balance of ${fmtMoney(minCash, currency)}.`
        : `Projected 30-day closing trajectory is unavailable until forecast points are generated.`,
      m.operatingCashFlow.status === 'COMPUTED'
        ? `Recent period operating cash flow registered ${fmtMoney(m.operatingCashFlow.value, currency)} (${fmtMoney(m.operatingCashFlow.components?.cashInflows ?? '0', currency)} in vs ${fmtMoney(m.operatingCashFlow.components?.cashOutflows ?? '0', currency)} out).`
        : `Recent period operating cash flow has insufficient transactions to establish a historical burn baseline.`,
      forecast?.hasLiquidityWarning
        ? `Attention required: projected cash drops below the minimum safety threshold during the 30-day horizon.`
        : `No liquidity shortfall threshold breach is projected within the next 30 days.`,
    ];

    kpis = [
      {
        label: 'Opening Cash Balance',
        value: fmtMoney(opening, currency),
        status: opening !== null ? 'VERIFIED' : 'MISSING_DATA',
        subtext: `${liquidAccountsCount} liquid account(s)`,
      },
      {
        label: '30-Day Projected Cash',
        value: fmtMoney(closing, currency),
        status: closing !== null ? 'VERIFIED' : 'MISSING_DATA',
        subtext: 'Base scenario horizon',
      },
      {
        label: 'Min Projected Cash',
        value: fmtMoney(minCash, currency),
        status: minCash !== null ? 'VERIFIED' : 'MISSING_DATA',
        subtext: forecast?.hasLiquidityWarning ? 'Shortfall alert active' : 'Above safety threshold',
      },
      {
        label: 'Operating Cash Flow',
        value: fmtMoney(m.operatingCashFlow.value, currency),
        status: m.operatingCashFlow.status === 'COMPUTED' ? 'VERIFIED' : 'MISSING_DATA',
        subtext: periodLabel,
      },
    ];

    const driverRows: ExecutiveTableRow[] = [
      { cells: ['Opening Liquid Cash', fmtMoney(opening, currency), 'Verified current cash'] },
    ];
    if (m.operatingCashFlow.status === 'COMPUTED') {
      driverRows.push(
        { cells: ['Period Inflows', fmtMoney(m.operatingCashFlow.components?.cashInflows ?? '0', currency), 'Recorded revenue'] },
        { cells: ['Period Outflows', fmtMoney(m.operatingCashFlow.components?.cashOutflows ?? '0', currency), 'Recorded expenses'] },
      );
    }
    if (closing !== null) {
      driverRows.push({
        cells: ['30-Day Projected Closing', fmtMoney(closing, currency), forecast?.hasLiquidityWarning ? 'Watch liquidity' : 'Positive buffer'],
        tone: forecast?.hasLiquidityWarning ? 'warning' : 'positive',
        isTotal: true,
      });
    }
    tables.push({
      title: 'Cash Flow & Horizon Drivers',
      columns: [
        { label: 'Driver', align: 'left' },
        { label: 'Amount', align: 'right', isNumeric: true },
        { label: 'Status', align: 'left' },
      ],
      rows: driverRows,
    });

    const pts = forecast?.forecastPoints ?? [];
    if (pts.length > 0) {
      const indices = Array.from(
        new Set([0, Math.floor(pts.length / 3), Math.floor((pts.length * 2) / 3), pts.length - 1]),
      ).filter((i) => i >= 0 && i < pts.length);
      tables.push({
        title: 'Forecast Checkpoints',
        columns: [
          { label: 'Date', align: 'left' },
          { label: 'Projected Inflow', align: 'right', isNumeric: true },
          { label: 'Projected Outflow', align: 'right', isNumeric: true },
          { label: 'Ending Cash', align: 'right', isNumeric: true },
        ],
        rows: indices.map((idx) => {
          const p = pts[idx];
          return {
            cells: [
              String(p.date ?? `Day ${idx + 1}`).slice(0, 10),
              fmtMoney(p.projectedInflows ?? '0', currency),
              fmtMoney(p.projectedOutflows ?? '0', currency),
              fmtMoney(p.projectedBalance ?? '0', currency),
            ],
            tone: toNum(p.projectedBalance) < 0 ? 'danger' : 'normal',
          };
        }),
      });
    }
  } else if (reportType === ReportType.EXPENSE) {
    const sortedCats = Object.entries(expensesByCategory).sort((a, b) => toNum(b[1]) - toNum(a[1]));
    const totalNum = totalExpenses !== null ? toNum(totalExpenses) : sortedCats.reduce((s, [, v]) => s + toNum(v), 0);
    const avgTx = expenseCount > 0 && totalExpenses !== null ? totalNum / expenseCount : null;
    const topCategory = sortedCats[0];

    executiveSummary = [
      totalExpenses !== null
        ? `Verified operating expenses for ${periodLabel} totaled ${fmtMoney(totalExpenses, currency)} across ${expenseCount} transaction(s) and ${sortedCats.length} category(ies).`
        : `Period operating expenses span ${expenseCount} transaction(s), though consolidated totals are incomplete pending missing FX conversion.`,
      topCategory && totalNum > 0
        ? `Spend concentration is led by ${topCategory[0]} at ${fmtMoney(topCategory[1], currency)} (${((toNum(topCategory[1]) / totalNum) * 100).toFixed(1)}% of total outflows).`
        : `No categorized expense transactions were posted during this period.`,
      m.expenseGrowth.status === 'COMPUTED'
        ? `Compared with the preceding period, operating expenses changed by ${fmtPct(m.expenseGrowth.value)}.`
        : `Period-over-period expense growth cannot be benchmarked because the prior window contains no recorded expenses.`,
      risks.length > 0
        ? `${risks.length} risk or anomaly signal(s) require management review.`
        : `No statistical expense anomalies or FX conversion issues were flagged in this period.`,
    ];

    kpis = [
      {
        label: 'Total Period Expenses',
        value: fmtMoney(totalExpenses, currency),
        status: totalExpenses !== null ? 'VERIFIED' : 'MISSING_DATA',
        subtext: `${expenseCount} expense transaction(s)`,
      },
      {
        label: 'Period Expense Growth',
        value: fmtPct(m.expenseGrowth.value),
        status: m.expenseGrowth.status === 'COMPUTED' ? 'VERIFIED' : 'MISSING_DATA',
        subtext: m.expenseGrowth.status === 'COMPUTED' ? 'vs prior period' : 'No prior period baseline',
      },
      {
        label: 'Expense Categories',
        value: String(sortedCats.length),
        status: 'VERIFIED',
        subtext: topCategory ? `Top: ${topCategory[0]}` : 'No expenses recorded',
      },
      {
        label: 'Avg per Transaction',
        value: avgTx !== null ? fmtMoney(avgTx, currency) : 'Unavailable',
        status: avgTx !== null ? 'VERIFIED' : 'MISSING_DATA',
        subtext: periodLabel,
      },
    ];

    if (sortedCats.length > 0) {
      tables.push({
        title: 'Operating Expenses by Category',
        columns: [
          { label: 'Category', align: 'left' },
          { label: 'Amount', align: 'right', isNumeric: true },
          { label: 'Share of Total', align: 'right', isNumeric: true },
        ],
        rows: [
          ...sortedCats.slice(0, 8).map(([cat, amt]) => ({
            cells: [
              cat,
              fmtMoney(amt, currency),
              totalNum > 0 ? `${((toNum(amt) / totalNum) * 100).toFixed(1)}%` : '—',
            ],
          })),
          {
            cells: ['Total Expenses', fmtMoney(totalExpenses ?? totalNum, currency), '100.0%'],
            isTotal: true,
          },
        ],
      });
    }
  } else if (reportType === ReportType.BUDGET) {
    let totalAlloc = DecimalMath.ZERO;
    let totalSpent = DecimalMath.ZERO;
    for (const bv of budgetVariances) {
      totalAlloc = DecimalMath.add(totalAlloc, bv.totalAllocated);
      totalSpent = DecimalMath.add(totalSpent, bv.totalActualSpent);
    }
    const netVar = DecimalMath.sub(totalAlloc, totalSpent);
    const utilPct = DecimalMath.percentage(totalSpent, totalAlloc);
    const hasBudgets = budgetVariances.length > 0;

    executiveSummary = [
      hasBudgets
        ? `This review covers ${budgetVariances.length} active budget plan(s) with ${fmtMoney(DecimalMath.toFixed4(totalAlloc), currency)} allocated against ${fmtMoney(DecimalMath.toFixed4(totalSpent), currency)} spent.`
        : `No active operating budgets were found for ${periodLabel}.`,
      hasBudgets
        ? `Aggregate budget variance stands at ${fmtMoney(DecimalMath.toFixed4(netVar), currency)} (${fmtPct(utilPct ? DecimalMath.toFixed4(utilPct) : null)} overall utilization).`
        : `Establish category allocations in Budgets & Variance to track utilization and overrun alerts automatically.`,
      risks.length > 0
        ? `${risks.length} variance warning(s) or FX limitations were identified across active plans.`
        : `All reviewed budget allocations remain within configured limits.`,
    ];

    kpis = [
      {
        label: 'Active Budgets',
        value: String(recordCounts.budgets),
        status: 'VERIFIED',
        subtext: `${budgetVariances.length} reviewed in detail`,
      },
      {
        label: 'Total Allocated',
        value: hasBudgets ? fmtMoney(DecimalMath.toFixed4(totalAlloc), currency) : 'Unavailable',
        status: hasBudgets ? 'VERIFIED' : 'MISSING_DATA',
      },
      {
        label: 'Actual Spent',
        value: hasBudgets ? fmtMoney(DecimalMath.toFixed4(totalSpent), currency) : 'Unavailable',
        status: hasBudgets ? 'VERIFIED' : 'MISSING_DATA',
      },
      {
        label: 'Net Variance',
        value: hasBudgets ? fmtMoney(DecimalMath.toFixed4(netVar), currency) : 'Unavailable',
        status: hasBudgets ? 'VERIFIED' : 'MISSING_DATA',
        subtext: utilPct ? `Utilization ${fmtPct(DecimalMath.toFixed4(utilPct))}` : undefined,
      },
    ];

    if (budgetVariances.length > 0) {
      tables.push({
        title: 'Budget Plans Summary',
        columns: [
          { label: 'Budget Plan', align: 'left' },
          { label: 'Allocated', align: 'right', isNumeric: true },
          { label: 'Actual', align: 'right', isNumeric: true },
          { label: 'Variance', align: 'right', isNumeric: true },
          { label: 'Used', align: 'right', isNumeric: true },
        ],
        rows: budgetVariances.map((bv, idx) => ({
          cells: [
            bv.budgetName || `Budget Plan ${idx + 1}`,
            fmtMoney(bv.totalAllocated, currency),
            fmtMoney(bv.totalActualSpent, currency),
            fmtMoney(bv.totalVarianceAmount, currency),
            fmtPct(bv.totalUtilizationPct),
          ],
          tone: toNum(bv.totalVarianceAmount) < 0 ? 'danger' : 'normal',
        })),
      });

      const primaryLines = budgetVariances[0].lines ?? [];
      if (primaryLines.length > 0) {
        tables.push({
          title: 'Category Allocation vs Actual',
          columns: [
            { label: 'Category', align: 'left' },
            { label: 'Allocated', align: 'right', isNumeric: true },
            { label: 'Actual', align: 'right', isNumeric: true },
            { label: 'Status', align: 'center' },
          ],
          rows: primaryLines.slice(0, 8).map((line) => ({
            cells: [
              line.department ? `${line.category} (${line.department})` : line.category,
              fmtMoney(line.budgetedAmount ?? line.allocatedAmount ?? '0', currency),
              fmtMoney(line.actualSpent ?? line.actualAmount ?? '0', currency),
              line.status,
            ],
            tone:
              line.status === 'OVERRUN'
                ? 'danger'
                : line.status === 'WARNING'
                  ? 'warning'
                  : 'normal',
          })),
        });
      }
    }
  } else if (reportType === ReportType.RISK) {
    const openAlerts = alerts.filter((a) => a.status !== 'RESOLVED' && a.status !== 'DISMISSED');
    const critHighCount = openAlerts.filter(
      (a) => a.severity === 'CRITICAL' || a.severity === 'HIGH',
    ).length;
    const overdueAr = m.receivableAging.value?.totalOverdue ?? '0.0000';
    const overdueAp = m.payableAging.value?.totalOverdue ?? '0.0000';

    executiveSummary = [
      `Risk surveillance reflects ${alerts.length} recorded alert(s), of which ${openAlerts.length} remain open for review (${critHighCount} critical or high priority).`,
      `Overdue receivables total ${fmtMoney(overdueAr, currency)} alongside ${fmtMoney(overdueAp, currency)} in past-due supplier payables.`,
      `All anomaly detections represent statistical or rule-based review signals and are never classified as confirmed fraud without human investigation.`,
    ];

    kpis = [
      {
        label: 'Open Risk Alerts',
        value: String(openAlerts.length),
        status: 'VERIFIED',
        subtext: `${alerts.length} total recorded`,
      },
      {
        label: 'Critical & High',
        value: String(critHighCount),
        status: 'VERIFIED',
        subtext: critHighCount > 0 ? 'Immediate triage advised' : 'Zero high-severity open',
      },
      {
        label: 'Overdue Receivables',
        value: fmtMoney(overdueAr, currency),
        status: m.receivableAging.status === 'COMPUTED' ? 'VERIFIED' : 'MISSING_DATA',
      },
      {
        label: 'Overdue Payables',
        value: fmtMoney(overdueAp, currency),
        status: m.payableAging.status === 'COMPUTED' ? 'VERIFIED' : 'MISSING_DATA',
      },
    ];

    const sevBuckets = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => ({
      sev,
      total: alerts.filter((a) => a.severity === sev).length,
      open: openAlerts.filter((a) => a.severity === sev).length,
    }));
    if (alerts.length > 0) {
      tables.push({
        title: 'Alert Distribution by Severity',
        columns: [
          { label: 'Severity', align: 'left' },
          { label: 'Open Alerts', align: 'right', isNumeric: true },
          { label: 'Total Recorded', align: 'right', isNumeric: true },
        ],
        rows: sevBuckets.map((b) => ({
          cells: [b.sev, String(b.open), String(b.total)],
          tone:
            b.open > 0 && (b.sev === 'CRITICAL' || b.sev === 'HIGH')
              ? 'danger'
              : b.open > 0 && b.sev === 'MEDIUM'
                ? 'warning'
                : 'normal',
        })),
      });

      tables.push({
        title: 'Recent Anomaly Signals',
        columns: [
          { label: 'Severity', align: 'left' },
          { label: 'Signal Title', align: 'left' },
          { label: 'Status', align: 'center' },
        ],
        rows: [...openAlerts, ...alerts.filter((a) => a.status === 'RESOLVED' || a.status === 'DISMISSED')]
          .slice(0, 6)
          .map((a) => ({
            cells: [a.severity, a.title, a.status],
            tone:
              a.severity === 'CRITICAL' || a.severity === 'HIGH'
                ? 'danger'
                : a.severity === 'MEDIUM'
                  ? 'warning'
                  : 'normal',
          })),
      });
    }
  }

  const prioritizedActionPlan = buildActionPlan(input, risks);

  return {
    schemaVersion: '2.0',
    reportType,
    executiveSummary,
    kpis,
    tables,
    risksAndAnomalies: risks,
    prioritizedActionPlan,
    dataGrounding: {
      reportingPeriodStart: periodStart.toISOString(),
      reportingPeriodEnd: periodEnd.toISOString(),
      currency,
      recordCounts,
      dataSources,
      missingInputs,
      methodologyNote:
        'KPIs and tables use deterministic decimal arithmetic over verified organization records. Prioritized actions are AI-synthesized management recommendations grounded in those figures.',
    },
  };
}
