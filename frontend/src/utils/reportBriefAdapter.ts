import { formatCurrency, formatEmbeddedAmountsInText } from './formatters';
import {
  ReportType,
  type ExecutiveBrief,
  type ExecutiveKpiCard,
  type ExecutiveTable,
  type ReportRecord,
} from '../types/reports.types';

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function asBrief(val: unknown): ExecutiveBrief | null {
  if (!isRecord(val)) return null;
  if (val.schemaVersion !== '2.0' || !Array.isArray(val.executiveSummary)) return null;
  return val as unknown as ExecutiveBrief;
}

function metricLabel(key: string): string {
  const labels: Record<string, string> = {
    cashBalance: 'Cash Balance',
    operatingCashFlow: 'Operating Cash Flow',
    cashRunwayMonths: 'Cash Runway (Months)',
    currentRatio: 'Current Ratio',
    quickRatio: 'Quick Ratio',
    grossMarginPct: 'Gross Margin (%)',
    workingCapital: 'Working Capital',
    openReceivablesTotal: 'Open Receivables',
    overdueReceivablesTotal: 'Overdue Receivables',
    openPayablesTotal: 'Open Payables',
    overduePayablesTotal: 'Overdue Payables',
    openingCashBalance: 'Opening Cash Balance',
    projectedClosingCash30d: '30-Day Projected Cash',
    minimumProjectedCash30d: 'Min Projected Cash',
    totalExpenses: 'Total Expenses',
    expenseGrowthPct: 'Expense Growth (%)',
    expenseCount: 'Expense Transactions',
    activeBudgetsCount: 'Active Budgets',
    budgetVariancePct: 'Budget Variance (%)',
    totalAlertsCount: 'Total Risk Alerts',
    overdueReceivables: 'Overdue Receivables',
    overduePayables: 'Overdue Payables',
  };
  return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

function normalizeBriefDisplayNumbers(brief: ExecutiveBrief): ExecutiveBrief {
  return {
    ...brief,
    executiveSummary: brief.executiveSummary.map((s) => formatEmbeddedAmountsInText(s)),
    kpis: brief.kpis.map((k) => ({
      ...k,
      value: formatEmbeddedAmountsInText(k.value),
      secondaryValue: k.secondaryValue
        ? formatEmbeddedAmountsInText(k.secondaryValue)
        : k.secondaryValue,
      subtext: k.subtext ? formatEmbeddedAmountsInText(k.subtext) : k.subtext,
    })),
    tables: brief.tables.map((t) => ({
      ...t,
      note: t.note ? formatEmbeddedAmountsInText(t.note) : t.note,
      rows: t.rows.map((r) => ({
        ...r,
        cells: r.cells.map((c) => formatEmbeddedAmountsInText(c)),
      })),
    })),
    risksAndAnomalies: brief.risksAndAnomalies.map((r) => ({
      ...r,
      title: formatEmbeddedAmountsInText(r.title),
      detail: formatEmbeddedAmountsInText(r.detail),
    })),
    prioritizedActionPlan: brief.prioritizedActionPlan.map((a) => ({
      ...a,
      title: formatEmbeddedAmountsInText(a.title),
      rationale: formatEmbeddedAmountsInText(a.rationale),
    })),
  };
}

/**
 * Resolves a structured ExecutiveBrief from a report snapshot.
 * Uses the persisted v2.0 brief when present, or deterministically maps
 * historical/legacy report snapshots without inventing unavailable figures.
 */
export function resolveExecutiveBrief(
  report: ReportRecord,
  fallbackCurrency = 'USD',
): ExecutiveBrief {
  const embedded = asBrief(report.narrativeBody?.executiveBrief);
  if (embedded) {
    return normalizeBriefDisplayNumbers(embedded);
  }

  const rType = report.reportType || report.type || ReportType.BUSINESS_HEALTH;
  const currency = report.currency || fallbackCurrency;
  const metrics = report.summaryMetrics ?? {};

  const summarySentences: string[] = [];
  if (report.summary) {
    summarySentences.push(report.summary);
  }
  if (report.narrativeBody) {
    for (const [key, val] of Object.entries(report.narrativeBody)) {
      if (key === 'executiveBrief' || key === 'headline') continue;
      if (typeof val === 'string' && val.trim()) {
        summarySentences.push(val.trim());
      }
    }
  }
  if (report.sections && report.sections.length > 0) {
    for (const sec of report.sections.slice(0, 2)) {
      if (sec.content?.trim()) summarySentences.push(sec.content.trim());
    }
  }
  if (summarySentences.length === 0) {
    summarySentences.push('Historical report snapshot grounded in recorded ledger data.');
  }

  const kpis: ExecutiveKpiCard[] = [];
  const moneyKeys = new Set([
    'cashBalance',
    'operatingCashFlow',
    'workingCapital',
    'openReceivablesTotal',
    'overdueReceivablesTotal',
    'openPayablesTotal',
    'overduePayablesTotal',
    'openingCashBalance',
    'projectedClosingCash30d',
    'minimumProjectedCash30d',
    'totalExpenses',
    'overdueReceivables',
    'overduePayables',
  ]);

  const scalarEntries = Object.entries(metrics).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  );
  for (const [k, v] of scalarEntries.slice(0, 4)) {
    const formatted =
      moneyKeys.has(k) && (typeof v === 'string' || typeof v === 'number')
        ? formatCurrency(v, currency)
        : k.endsWith('Pct') && v !== null
          ? `${Number(v).toFixed(1)}%`
          : v === null || v === undefined
            ? 'Unavailable'
            : String(v);
    kpis.push({
      label: metricLabel(k),
      value: formatted,
      status: v === null || v === undefined ? 'MISSING_DATA' : 'VERIFIED',
    });
  }

  const tables: ExecutiveTable[] = [];
  if (scalarEntries.length > 0) {
    tables.push({
      title: 'Snapshot Metrics Summary',
      columns: [
        { label: 'Metric', align: 'left' },
        { label: 'Recorded Value', align: 'right', isNumeric: true },
      ],
      rows: scalarEntries.map(([k, v]) => ({
        cells: [
          metricLabel(k),
          moneyKeys.has(k) && (typeof v === 'string' || typeof v === 'number')
            ? formatCurrency(v, currency)
            : v === null || v === undefined
              ? 'Unavailable'
              : String(v),
        ],
      })),
    });
  }

  const srcIds = report.sourceRecordIds ?? {};
  const counts = {
    accounts: (srcIds.accountIds ?? []).length,
    transactions: (srcIds.transactionIds ?? srcIds.operatingCashFlow ?? []).length,
    invoices: (srcIds.invoiceIds ?? srcIds.invoices ?? []).length,
    bills: (srcIds.billIds ?? []).length,
    budgets: (srcIds.budgetIds ?? []).length,
    riskAlerts: (srcIds.riskAlertIds ?? []).length,
    forecasts: (srcIds.forecastIds ?? []).length,
  };

  return normalizeBriefDisplayNumbers({
    schemaVersion: '2.0',
    reportType: rType,
    executiveSummary: summarySentences.slice(0, 4),
    kpis,
    tables,
    risksAndAnomalies: [],
    prioritizedActionPlan: [],
    dataGrounding: {
      reportingPeriodStart: report.periodStart || report.createdAt,
      reportingPeriodEnd: report.periodEnd || report.createdAt,
      currency,
      recordCounts: counts,
      dataSources: Object.entries(srcIds)
        .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
        .map(([k, ids]) => `${k} (${ids.length})`),
      missingInputs: report.dataLimitations ?? [],
      methodologyNote: 'Historical snapshot rendered strictly from saved report record values.',
    },
  });
}
