export interface DeterministicMetricResult {
  metricName: string;
  status: 'CALCULATED' | 'UNSUPPORTED' | 'INSUFFICIENT_DATA';
  value: string | null;
  unit: string;
  formula: string;
  formulaVersion: string;
  reportingPeriod: string;
  currency: string;
  sourceRecordIds: string[];
  dataLimitations: string[];
}

export interface AllMetricsResponse {
  organizationId: string;
  reportingPeriod: {
    startDate: string;
    endDate: string;
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
