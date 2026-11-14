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
  try {
    const normalized = typeof val === 'string' ? val.replace(/,/g, '') : val;
    const fixed = DecimalMath.toFixed2(normalized);
    const [integer, fraction] = fixed.split('.');
    const negative = integer.startsWith('-');
    const whole = (negative ? integer.slice(1) : integer).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${currency.trim().toUpperCase()} ${negative ? '-' : ''}${whole}.${fraction}`;
  } catch {
    return String(val);
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
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = item.trim();
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toBusinessLanguage(text: string, currency: string): string {
  return text
    .replace(
      /(?:statistical or rule-based anomaly signal for human review; not a determination of confirmed fraud\.?|this alert represents a statistical anomaly pattern and does not represent a conclusion of fraud or misconduct\.?)/gi,
      '',
    )
    .replace(
      /\bcategory[_ ]?baseline[_ ]?mean\s+std[_ ]?dev\b/gi,
      'spending pattern for this category',
    )
    .replace(
      /\bcategory[_ ]?baseline[_ ]?mean\s*[:=]\s*(-?\d[\d,]*(?:\.\d+)?)\b/gi,
      (_match, amount: string) =>
        `average spending for this category: ${fmtMoney(amount, currency)}`,
    )
    .replace(/\bcategory[_ ]?baseline[_ ]?mean\b/gi, 'average spending for this category')
    .replace(/\bcreatedAt\b/gi, 'creation date')
    .replace(/\bupdatedAt\b/gi, 'last updated')
    .replace(/\borganizationId\b/gi, 'organization reference')
    .replace(/\b([A-Za-z][A-Za-z0-9]*?)Ids\b/g, '$1 references')
    .replace(/\b([A-Za-z][A-Za-z0-9]*?)Id\b/g, '$1 reference')
    .replace(
      /\b(?:std[_ ]?dev|standard deviation)\s*[:=]\s*-?\d+(?:\.\d+)?/gi,
      'spending variation',
    )
    .replace(
      /\b(?:a\s+)?transaction\s+(?:has|shows)\s+z[-_ ]?score\s*[:=]\s*-?\d+(?:\.\d+)?/gi,
      'unusual transaction activity was identified',
    )
    .replace(/\bz[-_ ]?score\s*[:=]\s*-?\d+(?:\.\d+)?/gi, 'unusual activity indicator')
    .replace(
      /([a-z0-9])([A-Z])/g,
      (_match, lower: string, upper: string) => `${lower} ${upper.toLowerCase()}`,
    )
    .replace(/_+/g, ' ')
    .replace(/\b([a-z]+)\s+ids?\b/gi, '$1 reference')
    .replace(/\b(?:std[_ ]?dev|standard deviation)\b/gi, 'spending variation')
    .replace(/\bz[-_ ]?score\b/gi, 'unusual activity indicator')
    .replace(
      /\boutlier\s+(expense|transaction|payment|amount)\s+detected\b/gi,
      'The $1 was unusually high',
    )
    .replace(/\boutlier\b/gi, 'unexpectedly high')
    .replace(/\bmean\b/gi, 'average')
    .replace(/\bmedian\b/gi, 'typical')
    .replace(/\bstatistical\b/gi, 'unusual')
    .replace(
      /\bAI[- ](?:generated|synthesized|assisted|advisory|powered|driven|based|analysis)\b/gi,
      '',
    )
    .replace(/\bartificial intelligence\b/gi, '')
    .replace(/\bAI\b/gi, '')
    .replace(
      /\ban\s+unusual activity indicator note requires review\b/gi,
      'unusual transaction activity requires review',
    )
    .replace(/\bAR\b/g, 'receivables')
    .replace(/\bAP\b/g, 'payables')
    .replace(/\bFX\b/g, 'foreign-exchange')
    .replace(
      /\b([A-Z]{3}\s+)(-?(?:\d[\d,]*\.\d+|\d{1,3}(?:,\d{3})+))(?!\d|[%x])/g,
      (_match, code: string, amount: string) => fmtMoney(amount, code.trim()),
    )
    .replace(
      /\b([A-Z]{3}\s+)?(-?\d[\d,]*\.\d{2,4})(?!\d|\.\d|[%x])/g,
      (match, code: string | undefined, amount: string) =>
        code ? match : fmtMoney(amount, currency),
    )
    .replace(/\s*=\s*/g, ': ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([.;])\s*\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function riskRepeatsTableOrKpi(
  risk: ExecutiveRiskItem,
  tables: ExecutiveTable[],
  kpis: ExecutiveKpiCard[],
): boolean {
  const tableTitles = tables.map((table) => table.title.toLowerCase());
  const kpiLabels = kpis.map((kpi) => kpi.label.toLowerCase());
  const hasTable = (phrase: string) => tableTitles.some((title) => title.includes(phrase));
  const hasKpi = (phrase: string) => kpiLabels.some((label) => label.includes(phrase));
  const matchingCell = tables.some((table) =>
    table.rows.some((row) =>
      row.cells.some((cell) => cell.trim().toLowerCase() === risk.title.trim().toLowerCase()),
    ),
  );
  if (matchingCell) return true;

  switch (risk.sourceTag.toLowerCase()) {
    case 'risk alert':
      return hasTable('recent anomaly signals') || hasTable('recent alerts');
    case 'ar aging':
      return (hasTable('receivables') && hasTable('aging')) || hasKpi('overdue receivables');
    case 'ap aging':
      return (hasTable('payables') && hasTable('aging')) || hasKpi('overdue payables');
    case 'cash flow':
      return (
        hasTable('financial performance') || hasTable('cash flow') || hasKpi('operating cash flow')
      );
    case 'liquidity':
      return hasTable('financial performance') || hasKpi('working capital');
    case 'forecast':
      return (
        hasTable('forecast') ||
        hasTable('cash flow') ||
        hasKpi('projected cash') ||
        hasKpi('min projected cash')
      );
    case 'budget variance':
      return hasTable('budget') || hasKpi('net variance');
    default:
      return false;
  }
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
      detail: alert.explanation
        .replace(/\s*Statistical or rule-based anomaly signal.*$/i, '')
        .trim(),
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

function buildActionPlan(
  input: BuildBriefInput,
  risks: ExecutiveRiskItem[],
): ExecutiveActionItem[] {
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
      title: `Add verified exchange rates in ${currency} settings`,
      rationale: `Confirm the applicable rates so foreign-currency balances are included in consolidated reporting.`,
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
      title: 'Accelerate collection of overdue customer receivables',
      rationale: `Prioritize customer outreach on past-due invoices to convert open receivables into liquid bank cash.`,
      targetArea: 'Receivables',
      impact: 'HIGH',
    });
  }

  const arDraftCount = Number(m.receivableAging.components?.draftCount ?? 0);
  if (arDraftCount > 0) {
    pushAction({
      title: 'Review and issue pending draft invoices',
      rationale: `Pending drafts remain excluded from receivables until they are formally issued.`,
      targetArea: 'Billing Workflow',
      impact: 'MEDIUM',
    });
  }

  const openAlerts = risks.filter((r) => r.sourceTag === 'Risk Alert');
  if (openAlerts.length > 0) {
    pushAction({
      title: 'Triage open risk alerts',
      rationale: `Assign finance review to verify supporting records and resolve the flagged activity.`,
      targetArea: 'Risk Controls',
      impact:
        openAlerts[0].severity === 'CRITICAL' || openAlerts[0].severity === 'HIGH'
          ? 'HIGH'
          : 'MEDIUM',
    });
  }

  if (expensesByCategory && Object.keys(expensesByCategory).length > 0) {
    const sorted = Object.entries(expensesByCategory).sort((a, b) => toNum(b[1]) - toNum(a[1]));
    const [topCat] = sorted[0];
    pushAction({
      title: `Review the ${topCat} spend category`,
      rationale: `Review recurring vendor terms and purchasing patterns for savings.`,
      targetArea: 'Cost Control',
      impact: 'MEDIUM',
    });
  }

  const overrunBudget = budgetVariances.find((b) => toNum(b.totalVarianceAmount) < 0);
  if (overrunBudget) {
    pushAction({
      title: 'Review the over-budget plan',
      rationale: `Reallocate unused line items or approve a formal budget revision.`,
      targetArea: 'Budget Governance',
      impact: 'HIGH',
    });
  }

  if (m.operatingCashFlow.status === 'COMPUTED' && toNum(m.operatingCashFlow.value) < 0) {
    pushAction({
      title: 'Close Operating Cash Deficit Through Margin & Spend Review',
      rationale: `Review operating margin and spending to address the period's negative cash contribution.`,
      targetArea: 'Operating Margin',
      impact: 'HIGH',
    });
  }

  const overdueAp = toNum(m.payableAging.value?.totalOverdue);
  if (overdueAp > 0) {
    pushAction({
      title: 'Schedule settlement of overdue supplier payables',
      rationale: `Align supplier bill settlements with incoming AR collections to protect vendor credit terms.`,
      targetArea: 'Payables',
      impact: 'MEDIUM',
    });
  }

  const impactRank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return actions
    .sort((a, b) => impactRank[a.impact] - impactRank[b.impact])
    .slice(0, 3)
    .map((action, index) => ({
      ...action,
      priority: index + 1,
      title: toBusinessLanguage(action.title, currency),
      rationale: toBusinessLanguage(action.rationale, currency),
      targetArea: toBusinessLanguage(action.targetArea, currency),
    }));
}

export function buildExecutiveBrief(input: BuildBriefInput): ExecutiveBrief {
  const {
    reportType,
    periodStart,
    periodEnd,
    metricsBundle,
    liquidCashBalance,
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
    recordCounts.accounts > 0 ? 'Financial accounts' : '',
    recordCounts.transactions > 0 ? 'Ledger transactions' : '',
    recordCounts.invoices > 0 ? 'Customer invoices' : '',
    recordCounts.bills > 0 ? 'Supplier bills' : '',
    recordCounts.budgets > 0 ? 'Operating budgets' : '',
    recordCounts.riskAlerts > 0 ? 'Risk alerts' : '',
    recordCounts.forecasts > 0 ? 'Cash-flow forecasts' : '',
  ]);

  let executiveSummary: string[] = [];
  let kpis: ExecutiveKpiCard[] = [];
  const tables: ExecutiveTable[] = [];

  if (reportType === ReportType.BUSINESS_HEALTH) {
    const runwayText =
      m.cashRunway.status === 'COMPUTED'
        ? toNum(m.cashRunway.value) >= 999
          ? 'Self-sustaining'
          : `${Number(m.cashRunway.value).toFixed(1)} months of runway`
        : 'runway pending baseline transactions';

    executiveSummary = risks.some(
      (risk) => risk.severity === 'CRITICAL' || risk.severity === 'HIGH',
    )
      ? ['High-priority financial findings are listed below for review.']
      : ['No high-priority financial findings were identified for this reporting period.'];

    kpis = [
      {
        label: 'Cash Balance',
        value: fmtMoney(liquidCashBalance, currency),
        status: liquidCashBalance !== null ? 'VERIFIED' : 'MISSING_DATA',
      },
      {
        label: 'Cash Runway',
        value: m.cashRunway.status === 'COMPUTED' ? runwayText : 'Unavailable',
        status: m.cashRunway.status === 'COMPUTED' ? 'VERIFIED' : 'MISSING_DATA',
      },
      {
        label: 'Current Ratio',
        value: fmtRatio(m.currentRatio.value),
        status: m.currentRatio.status === 'COMPUTED' ? 'VERIFIED' : 'MISSING_DATA',
      },
    ];
    if (m.operatingCashFlow.status !== 'COMPUTED') {
      kpis.push({
        label: 'Operating Cash Flow',
        value: 'Unavailable',
        status: 'MISSING_DATA',
      });
    }

    const perfRows: ExecutiveTableRow[] = [];
    if (m.operatingCashFlow.status === 'COMPUTED') {
      const inflows = m.operatingCashFlow.components?.cashInflows ?? '0';
      const outflows = m.operatingCashFlow.components?.cashOutflows ?? '0';
      const ocf = toNum(m.operatingCashFlow.value);
      perfRows.push(
        {
          cells: ['Revenue (Cash Inflows)', fmtMoney(inflows, currency), 'Verified period inflows'],
        },
        {
          cells: [
            'Operating Expenses (Outflows)',
            fmtMoney(outflows, currency),
            'Verified period outflows',
          ],
        },
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

    executiveSummary = [];

    kpis = [
      {
        label: 'Opening Cash Balance',
        value: fmtMoney(opening, currency),
        status: opening !== null ? 'VERIFIED' : 'MISSING_DATA',
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
        subtext: forecast?.hasLiquidityWarning
          ? 'Shortfall alert active'
          : 'Above safety threshold',
      },
      {
        label: 'Operating Cash Flow',
        value: fmtMoney(m.operatingCashFlow.value, currency),
        status: m.operatingCashFlow.status === 'COMPUTED' ? 'VERIFIED' : 'MISSING_DATA',
        subtext: periodLabel,
      },
    ];

    const driverRows: ExecutiveTableRow[] = [];
    if (m.operatingCashFlow.status === 'COMPUTED') {
      driverRows.push(
        {
          cells: [
            'Period Inflows',
            fmtMoney(m.operatingCashFlow.components?.cashInflows ?? '0', currency),
            'Recorded revenue',
          ],
        },
        {
          cells: [
            'Period Outflows',
            fmtMoney(m.operatingCashFlow.components?.cashOutflows ?? '0', currency),
            'Recorded expenses',
          ],
        },
      );
    }
    if (driverRows.length > 0) {
      tables.push({
        title: 'Cash Flow & Horizon Drivers',
        columns: [
          { label: 'Driver', align: 'left' },
          { label: 'Amount', align: 'right', isNumeric: true },
          { label: 'Status', align: 'left' },
        ],
        rows: driverRows,
      });
    }

    const pts = forecast?.forecastPoints ?? [];
    if (pts.length > 0) {
      const indices = Array.from(
        new Set([0, Math.floor(pts.length / 3), Math.floor((pts.length * 2) / 3), pts.length - 1]),
      ).filter((i) => i >= 0 && i < pts.length - 1);
      if (indices.length > 0) {
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
    }
  } else if (reportType === ReportType.EXPENSE) {
    const sortedCats = Object.entries(expensesByCategory).sort((a, b) => toNum(b[1]) - toNum(a[1]));
    const totalNum =
      totalExpenses !== null
        ? toNum(totalExpenses)
        : sortedCats.reduce((s, [, v]) => s + toNum(v), 0);
    const avgTx = expenseCount > 0 && totalExpenses !== null ? totalNum / expenseCount : null;
    executiveSummary = [];

    kpis = [
      {
        label: 'Total Period Expenses',
        value: fmtMoney(totalExpenses, currency),
        status: totalExpenses !== null ? 'VERIFIED' : 'MISSING_DATA',
      },
      {
        label: 'Period Expense Growth',
        value: fmtPct(m.expenseGrowth.value),
        status: m.expenseGrowth.status === 'COMPUTED' ? 'VERIFIED' : 'MISSING_DATA',
        subtext:
          m.expenseGrowth.status === 'COMPUTED' ? 'vs prior period' : 'No prior period baseline',
      },
      {
        label: 'Avg per Transaction',
        value: avgTx !== null ? fmtMoney(avgTx, currency) : 'Unavailable',
        status: avgTx !== null ? 'VERIFIED' : 'MISSING_DATA',
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
        rows: sortedCats.slice(0, 8).map(([cat, amt]) => ({
          cells: [
            cat,
            fmtMoney(amt, currency),
            totalNum > 0 ? `${((toNum(amt) / totalNum) * 100).toFixed(1)}%` : '—',
          ],
        })),
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

    executiveSummary = [];

    kpis = [];

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
        rows: [
          ...(budgetVariances.length > 1
            ? [
                {
                  cells: [
                    'Combined budget plans',
                    fmtMoney(DecimalMath.toFixed4(totalAlloc), currency),
                    fmtMoney(DecimalMath.toFixed4(totalSpent), currency),
                    fmtMoney(DecimalMath.toFixed4(netVar), currency),
                    fmtPct(utilPct ? DecimalMath.toFixed4(utilPct) : null),
                  ],
                  tone: toNum(netVar) < 0 ? ('danger' as const) : ('normal' as const),
                  isTotal: true,
                },
              ]
            : []),
          ...budgetVariances.map((bv, idx) => ({
            cells: [
              bv.budgetName || `Budget Plan ${idx + 1}`,
              fmtMoney(bv.totalAllocated, currency),
              fmtMoney(bv.totalActualSpent, currency),
              fmtMoney(bv.totalVarianceAmount, currency),
              fmtPct(bv.totalUtilizationPct),
            ],
            tone: toNum(bv.totalVarianceAmount) < 0 ? ('danger' as const) : ('normal' as const),
          })),
        ],
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
    const overdueAr = m.receivableAging.value?.totalOverdue ?? '0.0000';
    const overdueAp = m.payableAging.value?.totalOverdue ?? '0.0000';

    executiveSummary = [];

    kpis = [
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
    }
  }

  const prioritizedActionPlan = buildActionPlan(input, risks);
  const reportTables = tables.map((table) => ({
    ...table,
    title: toBusinessLanguage(table.title, currency),
    note: table.note ? toBusinessLanguage(table.note, currency) : table.note,
    columns: table.columns.map((column) => ({
      ...column,
      label: toBusinessLanguage(column.label, currency),
    })),
    rows: table.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => toBusinessLanguage(cell, currency)),
    })),
  }));
  const reportKpis = kpis.map((kpi) => ({
    ...kpi,
    label: toBusinessLanguage(kpi.label, currency),
    value: toBusinessLanguage(kpi.value, currency),
    secondaryLabel: kpi.secondaryLabel
      ? toBusinessLanguage(kpi.secondaryLabel, currency)
      : undefined,
    secondaryValue: kpi.secondaryValue
      ? toBusinessLanguage(kpi.secondaryValue, currency)
      : undefined,
    subtext: kpi.subtext ? toBusinessLanguage(kpi.subtext, currency) : undefined,
  }));
  const reportRisks = risks
    .filter((risk) => !riskRepeatsTableOrKpi(risk, tables, kpis))
    .map((risk) => ({
      ...risk,
      title: toBusinessLanguage(risk.title, currency),
      detail: toBusinessLanguage(risk.detail, currency),
      sourceTag: toBusinessLanguage(risk.sourceTag, currency),
    }));
  const reportSummary = dedupeStrings(
    executiveSummary.map((sentence) => toBusinessLanguage(sentence, currency)),
  ).slice(0, 4);
  const reportMissingInputs = dedupeStrings(
    missingInputs.map((input) => toBusinessLanguage(input, currency)),
  );
  const hasGrounding =
    dataSources.length > 0 ||
    reportMissingInputs.length > 0 ||
    Object.values(recordCounts).some((count) => count > 0);

  return {
    schemaVersion: '2.0',
    reportType,
    executiveSummary: reportSummary,
    kpis: reportKpis,
    tables: reportTables,
    risksAndAnomalies: reportRisks,
    prioritizedActionPlan,
    dataGrounding: {
      reportingPeriodStart: periodStart.toISOString(),
      reportingPeriodEnd: periodEnd.toISOString(),
      currency,
      recordCounts,
      dataSources,
      missingInputs: reportMissingInputs,
      methodologyNote: hasGrounding
        ? 'Figures are based on verified organization records. Source references are retained for audit review.'
        : '',
    },
  };
}
