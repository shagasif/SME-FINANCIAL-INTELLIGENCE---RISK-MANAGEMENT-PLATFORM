export interface AgingScheduleMetricValue {
  totalOutstanding?: string | null;
  totalOverdue?: string | null;
  isComplete?: boolean;
  missingCurrencies?: string[];
  buckets?: Array<{
    bucket: string;
    count: number;
    amount: string | null;
    recordIds: string[];
  }>;
  current?: string | null;
  days1to30?: string | null;
  days31to60?: string | null;
  days61to90?: string | null;
  days90Plus?: string | null;
  sourceRecordIds?: string[];
}

export type MetricReportingPeriod =
  | string
  | {
      startDate: string;
      endDate: string;
    };

export type MetricSourceRecordIds = string[] | Record<string, string[]>;

export interface MetricAuditTraceRecord {
  id: string;
  type: 'ACCOUNT' | 'INVOICE' | 'BILL' | 'TRANSACTION';
  label: string;
  classification: string;
  currency: string;
  nativeAmount: string;
  convertedAmount: string;
  role: 'CALCULATION_INPUT' | 'SUPPORTING_EVIDENCE';
}

export interface MetricAuditTrace {
  metricKey: string;
  calculationReason: string;
  status:
    | 'COMPUTED'
    | 'NOT_CALCULABLE'
    | 'UNSUPPORTED_MISSING_DATA'
    | 'ERROR'
    | 'CALCULATED'
    | 'UNSUPPORTED'
    | 'INSUFFICIENT_DATA';
  reportingPeriod: {
    startDate: string;
    endDate: string;
  };
  currency: string;
  inputs: Record<string, string>;
  assetRecords?: MetricAuditTraceRecord[];
  liabilityRecords?: MetricAuditTraceRecord[];
  supportingRecords?: MetricAuditTraceRecord[];
}

export interface DeterministicMetricResult {
  metricKey?: string;
  metricName?: string;
  name?: string;
  status:
    | 'COMPUTED'
    | 'NOT_CALCULABLE'
    | 'UNSUPPORTED_MISSING_DATA'
    | 'ERROR'
    | 'CALCULATED'
    | 'UNSUPPORTED'
    | 'INSUFFICIENT_DATA';
  value: string | number | AgingScheduleMetricValue | null;
  unit: string;
  formula: string;
  formulaVersion: string;
  reportingPeriod?: MetricReportingPeriod;
  currency?: string;
  sourceRecordIds?: MetricSourceRecordIds;
  dataLimitations: string[];
  components?: Record<string, string>;
  auditTrace?: MetricAuditTrace;
}

export interface AnalyticsChartMonthlyPoint {
  month: string;
  label: string;
  income: string;
  expenses: string;
  netCashFlow: string;
  cogs: string;
  grossMarginPct: string | null;
}

export interface AnalyticsExpenseBreakdownItem {
  category: string;
  amount: string;
  percentage: string;
  count: number;
}

export interface AnalyticsBudgetComparisonChart {
  budgetId: string;
  budgetName: string;
  currency: string;
  isComplete: boolean;
  lines: Array<{
    category: string;
    department: string;
    allocatedAmount: string;
    actualSpent: string;
    status: string;
  }>;
}

export interface AllMetricsResponse {
  organizationId: string;
  currency?: string;
  formulaVersion?: string;
  generatedAt?: string;
  reportingPeriod: {
    startDate: string;
    endDate: string;
  };
  conversionContext?: {
    baseCurrency: string;
    isComplete: boolean;
    missingCurrencies: string[];
    appliedRates: Array<{
      fromCurrency: string;
      toCurrency: string;
      rate: string;
      effectiveDate: string;
      source: string;
      isInverse: boolean;
    }>;
  };
  charts?: {
    monthlySeries: AnalyticsChartMonthlyPoint[];
    expenseBreakdown: AnalyticsExpenseBreakdownItem[];
    profitabilityTrend: {
      isAvailable: boolean;
      reason: string | null;
    };
    budgetComparison: AnalyticsBudgetComparisonChart | null;
  };
  metrics: {
    operatingCashFlow: DeterministicMetricResult;
    cashRunway: DeterministicMetricResult;
    currentRatio: DeterministicMetricResult;
    quickRatio: DeterministicMetricResult;
    grossMargin: DeterministicMetricResult;
    expenseGrowth: DeterministicMetricResult;
    workingCapital: DeterministicMetricResult;
    budgetVariance: DeterministicMetricResult;
    receivableAging: DeterministicMetricResult;
    payableAging: DeterministicMetricResult;
  };
}

export const ForecastScenarioType = {
  BASE: 'BASE',
  OPTIMISTIC: 'OPTIMISTIC',
  CONSERVATIVE: 'CONSERVATIVE',
} as const;

export type ForecastScenarioType = (typeof ForecastScenarioType)[keyof typeof ForecastScenarioType];

export interface ForecastItem {
  id: string;
  date: string;
  dayNumber: number;
  projectedInflow: string;
  projectedOutflow: string;
  projectedNet: string;
  projectedEndingCash: string;
  categoryBreakdown?: Record<string, string>;
}

export interface CashFlowForecast {
  id: string;
  organizationId: string;
  versionNumber: number;
  horizonDays: 7 | 30 | 60 | 90;
  scenarioType: ForecastScenarioType;
  openingCashBalance: string;
  projectedNetChange: string;
  projectedEndingBalance: string;
  lowestProjectedBalance: string;
  hasLiquidityWarning: boolean;
  liquidityWarningDetails?: string | null;
  assumptions: string[];
  items?: ForecastItem[];
  createdAt: string;
}

export interface ForecastActualComparisonResponse {
  forecastId: string;
  horizonDays: number;
  scenarioType: ForecastScenarioType;
  periodStart: string;
  periodEnd: string;
  forecastedNet: string;
  actualNet: string;
  absoluteVariance: string;
  accuracyPercentage: string;
  comparisonItems: Array<{
    date: string;
    forecastedEnding: string;
    actualEnding: string;
    variance: string;
  }>;
}
