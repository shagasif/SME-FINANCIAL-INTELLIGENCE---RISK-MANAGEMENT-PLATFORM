import { formatReportCurrency, formatReportText } from './formatters';
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
    totalAlertsCount: 'Risk Alerts',
    overdueReceivables: 'Overdue Receivables',
    overduePayables: 'Overdue Payables',
    accountIds: 'Financial accounts',
    transactionIds: 'Ledger transactions',
    invoiceIds: 'Invoices',
    invoices: 'Invoices',
    billIds: 'Supplier bills',
    budgetIds: 'Budgets',
    riskAlertIds: 'Risk alerts',
    forecastIds: 'Cash-flow forecasts',
    metrics: 'Financial metrics',
  };
  const humanized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_+/g, ' ')
    .replace(/\bids?\b/gi, 'references')
    .replace(/\bavg\b/gi, 'average')
    .replace(/\btx\b/gi, 'transaction');
  return labels[key] || humanized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeBriefDisplayNumbers(brief: ExecutiveBrief): ExecutiveBrief {
  const currency = brief.dataGrounding.currency;
  const tables = brief.tables.map((table) => ({
    ...table,
    title: formatReportText(table.title, currency),
    note: table.note ? formatReportText(table.note, currency) : table.note,
    columns: table.columns.map((column) => ({
      ...column,
      label: formatReportText(column.label, currency),
    })),
    rows: table.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => formatReportText(cell, currency)),
    })),
  }));
  const kpis = brief.kpis.map((kpi) => ({
    ...kpi,
    label: formatReportText(kpi.label, currency),
    value: formatReportText(kpi.value, currency),
    secondaryLabel: kpi.secondaryLabel
      ? formatReportText(kpi.secondaryLabel, currency)
      : kpi.secondaryLabel,
    secondaryValue: kpi.secondaryValue
      ? formatReportText(kpi.secondaryValue, currency)
      : kpi.secondaryValue,
    subtext: kpi.subtext ? formatReportText(kpi.subtext, currency) : kpi.subtext,
  }));
  const tableTitles = brief.tables.map((table) => table.title.toLowerCase());
  const tableCells = new Set(
    brief.tables.flatMap((table) =>
      table.rows.flatMap((row) =>
        row.cells.map((cell) => textKey(formatReportText(cell, currency))),
      ),
    ),
  );
  const kpiLabels = kpis.map((kpi) => kpi.label.toLowerCase());
  const risks = brief.risksAndAnomalies
    .map((risk) => ({
      ...risk,
      title: formatReportText(risk.title, currency),
      detail: formatReportText(risk.detail, currency),
      sourceTag: formatReportText(risk.sourceTag, currency),
    }))
    .filter((risk) => !riskRepeatsTableOrKpi(risk, tableTitles, tableCells, kpiLabels));
  const executiveSummary = removeRepeatedSummaryFacts(
    brief.executiveSummary.map((sentence) => formatReportText(sentence, currency)),
    [
      ...kpis.map((kpi) =>
        [kpi.label, kpi.value, kpi.secondaryLabel, kpi.secondaryValue, kpi.subtext]
          .filter(Boolean)
          .join(' '),
      ),
      ...tables.flatMap((table) =>
        table.rows.map((row) =>
          [table.title, ...table.columns.map((column) => column.label), ...row.cells].join(' '),
        ),
      ),
      ...risks.map((risk) => `${risk.title} ${risk.detail}`),
    ],
  );

  return {
    ...brief,
    executiveSummary,
    kpis,
    tables,
    risksAndAnomalies: uniqueRisks(risks),
    prioritizedActionPlan: brief.prioritizedActionPlan.slice(0, 3).map((action, index) => ({
      ...action,
      priority: index + 1,
      title: formatReportText(action.title, currency),
      rationale: formatReportText(action.rationale, currency),
      targetArea: formatReportText(action.targetArea, currency),
    })),
    dataGrounding: {
      ...brief.dataGrounding,
      dataSources: uniqueText(
        brief.dataGrounding.dataSources.map((source) =>
          formatReportText(source.replace(/\s*\(\d+\)\s*$/, ''), currency),
        ),
      ),
      missingInputs: uniqueText(
        brief.dataGrounding.missingInputs.map((input) => formatReportText(input, currency)),
      ),
      methodologyNote: normalizeMethodologyNote(brief.dataGrounding.methodologyNote, currency),
    },
  };
}

export function normalizeExecutiveBrief(brief: ExecutiveBrief): ExecutiveBrief {
  return normalizeBriefDisplayNumbers(brief);
}

function removeRepeatedSummaryFacts(summaries: string[], visibleFacts: string[]): string[] {
  const normalizedFacts = visibleFacts.map(factTokens).filter((tokens) => tokens.length >= 3);

  return uniqueText(
    summaries.flatMap((summary) => {
      const statements = summary
        .split(/(?:[.!?]\s+|;\s+|\s+(?:and|but|while|whereas|although|however)\s+)/i)
        .map((statement) => statement.trim().replace(/^[,;:.!?]+|[,;:.!?]+$/g, ''))
        .filter(Boolean);
      const remaining = statements.filter(
        (statement) =>
          !normalizedFacts.some((fact) => repeatsDisplayedFact(factTokens(statement), fact)),
      );
      if (remaining.length === statements.length) return [summary];
      if (remaining.length === 0) return [];
      const ending = /[.!?]$/.exec(summary)?.[0] ?? '';
      return [`${remaining.join('; ')}${ending}`];
    }),
  );
}

function factTokens(value: string): string[] {
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'are',
    'at',
    'by',
    'for',
    'from',
    'in',
    'is',
    'of',
    'on',
    'the',
    'to',
    'was',
    'were',
    'with',
  ]);
  return (
    value
      .toLocaleLowerCase()
      .match(/[a-z]+|\d[\d,]*(?:\.\d+)?/g)
      ?.map((token) => {
        if (/^\d/.test(token)) {
          return token.replace(/,/g, '').replace(/\.0+$/, '');
        }
        return token;
      })
      .filter((token) => token.length > 1 && !stopWords.has(token)) ?? []
  );
}

function repeatsDisplayedFact(statementTokens: string[], factTokens: string[]): boolean {
  if (statementTokens.length < 3 || factTokens.length < 3) return false;
  const statement = new Set(statementTokens);
  const fact = new Set(factTokens);
  let overlap = 0;
  for (const token of statement) {
    if (fact.has(token)) overlap += 1;
  }
  const smallerSize = Math.min(statement.size, fact.size);
  const largerSize = Math.max(statement.size, fact.size);
  return overlap / smallerSize >= 0.9 && overlap / largerSize >= 0.65;
}

const sourceReferenceLabels: Record<string, string> = {
  accountid: 'Financial account',
  accountids: 'Financial accounts',
  account_id: 'Financial account',
  account_ids: 'Financial accounts',
  accounts: 'Financial accounts',
  billid: 'Supplier bill',
  billids: 'Supplier bills',
  bill_id: 'Supplier bill',
  bill_ids: 'Supplier bills',
  budgetid: 'Budget plan',
  budgetids: 'Budget plans',
  budget_id: 'Budget plan',
  budget_ids: 'Budget plans',
  forecastid: 'Cash-flow forecast',
  forecastids: 'Cash-flow forecasts',
  forecast_id: 'Cash-flow forecast',
  forecast_ids: 'Cash-flow forecasts',
  invoiceid: 'Customer invoice',
  invoiceids: 'Customer invoices',
  invoice_id: 'Customer invoice',
  invoice_ids: 'Customer invoices',
  invoices: 'Customer invoices',
  metrics: 'Financial metrics',
  metric_ids: 'Financial metrics',
  metricids: 'Financial metrics',
  operating_cash_flow: 'Operating cash flow transactions',
  operating_cash_flow_ids: 'Operating cash flow transactions',
  operatingcashflow: 'Operating cash flow transactions',
  risk_alertid: 'Risk alert',
  risk_alertids: 'Risk alerts',
  riskalertid: 'Risk alert',
  riskalertids: 'Risk alerts',
  risk_alert_id: 'Risk alert',
  risk_alert_ids: 'Risk alerts',
  transactionid: 'Ledger transaction',
  transactionids: 'Ledger transactions',
  transaction_id: 'Ledger transaction',
  transaction_ids: 'Ledger transactions',
};

export function getSourceReferenceLabel(key: string): string {
  return sourceReferenceLabels[normalizeSourceReferenceKey(key)] ?? 'Other source records';
}

export function formatSourceReferenceValues(key: string, values: string[]): string[] {
  if (normalizeSourceReferenceKey(key) !== 'metrics') return values;
  return values.map((value) => metricLabel(value));
}

function normalizeSourceReferenceKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function normalizeMethodologyNote(note: string, currency: string): string {
  if (!note.trim()) return '';
  if (
    /\bAI\b|artificial intelligence|deterministic decimal arithmetic|statistical model/i.test(note)
  ) {
    return 'Figures are based on verified organization records. Source references are retained for audit review.';
  }
  return formatReportText(note, currency);
}

function textKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function uniqueText(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = textKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueRisks(
  risks: ExecutiveBrief['risksAndAnomalies'],
): ExecutiveBrief['risksAndAnomalies'] {
  const seen = new Set<string>();
  return risks.filter((risk) => {
    const key = [risk.severity, risk.title, risk.detail, risk.sourceTag].map(textKey).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function riskRepeatsTableOrKpi(
  risk: ExecutiveBrief['risksAndAnomalies'][number],
  tableTitles: string[],
  tableCells: Set<string>,
  kpiLabels: string[],
): boolean {
  if (tableCells.has(textKey(risk.title))) return true;
  const hasTable = (phrase: string) => tableTitles.some((title) => title.includes(phrase));
  const hasKpi = (phrase: string) => kpiLabels.some((label) => label.includes(phrase));

  switch (risk.sourceTag.toLowerCase()) {
    case 'risk alert':
      return hasTable('recent anomaly signals') || hasTable('recent alerts');
    case 'ar aging':
    case 'receivables aging':
      return (hasTable('receivables') && hasTable('aging')) || hasKpi('overdue receivables');
    case 'ap aging':
    case 'payables aging':
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
  const kpiEntries = scalarEntries.slice(0, 4);
  const kpiKeys = new Set(kpiEntries.map(([key]) => key));
  for (const [k, v] of kpiEntries) {
    const formatted =
      moneyKeys.has(k) && (typeof v === 'string' || typeof v === 'number')
        ? formatReportCurrency(v, currency)
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
  const detailEntries = scalarEntries.filter(([key]) => !kpiKeys.has(key));
  if (detailEntries.length > 0) {
    tables.push({
      title: 'Snapshot Metrics Summary',
      columns: [
        { label: 'Metric', align: 'left' },
        { label: 'Recorded Value', align: 'right', isNumeric: true },
      ],
      rows: detailEntries.map(([k, v]) => ({
        cells: [
          metricLabel(k),
          moneyKeys.has(k) && (typeof v === 'string' || typeof v === 'number')
            ? formatReportCurrency(v, currency)
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
    executiveSummary: uniqueText(
      summarySentences.map((sentence) => formatReportText(sentence, currency)),
    ).slice(0, 4),
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
        .map(([key]) => formatReportText(metricLabel(key), currency)),
      missingInputs: uniqueText(
        (report.dataLimitations ?? []).map((input) => formatReportText(input, currency)),
      ),
      methodologyNote: '',
    },
  });
}

export function getRiskSeverityCounts(
  risks: ExecutiveBrief['risksAndAnomalies'],
): Array<{ severity: ExecutiveBrief['risksAndAnomalies'][number]['severity']; count: number }> {
  const severityOrder: ExecutiveBrief['risksAndAnomalies'][number]['severity'][] = [
    'CRITICAL',
    'HIGH',
    'MEDIUM',
    'LOW',
  ];
  const counts = new Map(severityOrder.map((severity) => [severity, 0]));

  for (const risk of risks) {
    counts.set(risk.severity, (counts.get(risk.severity) ?? 0) + 1);
  }

  return severityOrder.map((severity) => ({ severity, count: counts.get(severity) ?? 0 }));
}

export function getReportRecordCounts(
  brief: ExecutiveBrief,
): Array<{ label: string; count: number }> {
  const counts = brief.dataGrounding.recordCounts;
  const tableTitles = brief.tables.map((table) => table.title.toLowerCase());
  const hasTable = (phrase: string) => tableTitles.some((title) => title.includes(phrase));
  const entries: Array<{ label: string; count: number; representedElsewhere: boolean }> = [
    { label: 'Accounts', count: counts.accounts, representedElsewhere: false },
    { label: 'Transactions', count: counts.transactions, representedElsewhere: false },
    {
      label: 'Invoices',
      count: counts.invoices,
      representedElsewhere: hasTable('receivables') && hasTable('aging'),
    },
    {
      label: 'Bills',
      count: counts.bills,
      representedElsewhere: hasTable('payables') && hasTable('aging'),
    },
    {
      label: 'Budgets',
      count: counts.budgets,
      representedElsewhere: hasTable('budget plans summary'),
    },
    {
      label: 'Alerts',
      count: counts.riskAlerts,
      representedElsewhere: hasTable('alert distribution by severity'),
    },
    {
      label: 'Forecasts',
      count: counts.forecasts,
      representedElsewhere: false,
    },
  ];

  return entries
    .filter((entry) => entry.count > 0 && !entry.representedElsewhere)
    .map(({ label, count }) => ({ label, count }));
}

export function getReportDataSources(brief: ExecutiveBrief): string[] {
  const counts = brief.dataGrounding.recordCounts;
  const sourceTypes: Array<{ pattern: RegExp; count: number }> = [
    { pattern: /account/i, count: counts.accounts },
    { pattern: /transaction/i, count: counts.transactions },
    { pattern: /invoice/i, count: counts.invoices },
    { pattern: /bill/i, count: counts.bills },
    { pattern: /budget/i, count: counts.budgets },
    { pattern: /risk alerts?|risk surveillance/i, count: counts.riskAlerts },
    { pattern: /cash[- ]flow forecasts?|forecast ids?/i, count: counts.forecasts },
  ];

  return uniqueText(brief.dataGrounding.dataSources).filter(
    (source) =>
      !sourceTypes.some((sourceType) => sourceType.count > 0 && sourceType.pattern.test(source)),
  );
}
