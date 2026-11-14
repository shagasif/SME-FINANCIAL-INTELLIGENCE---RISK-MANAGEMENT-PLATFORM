export interface FinancialMetricSnapshot {
  id: string;
  organizationId: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  completenessScore: string;
  currency: string;
  formulaVersion?: string;
  closingCashBalance?: string;
  operatingCashFlow?: string;
  workingCapital?: string;
  currentRatio?: string | null;
  quickRatio?: string | null;
  grossMarginPct?: string | null;
  expenseGrowthPct?: string | null;
  cashRunwayMonths?: string | null;
  budgetVariancePct?: string | null;
  totalRevenue?: string;
  totalExpenses?: string;
  metrics?: {
    operatingCashFlow?: string;
    cashRunwayDays?: number;
    currentRatio?: string;
    quickRatio?: string;
    grossMarginPercent?: string;
    expenseGrowthPercent?: string;
    workingCapital?: string;
    budgetVariancePercent?: string;
    totalRevenue?: string;
    totalExpenses?: string;
    endingCashBalance?: string;
  };
  metricsPayload?: Record<string, unknown>;
  sourceRecordIds?: Record<string, string[]>;
  dataLimitations?: string[];
  createdAt: string;
}

export interface MetricShift {
  metricName: string;
  baseValue: string | null;
  targetValue: string | null;
  absoluteChange: string | null;
  percentageChange: string | null;
  direction: 'IMPROVED' | 'DETERIORATED' | 'STABLE' | 'UNKNOWN';
}

export interface SnapshotComparisonResponse {
  organizationId: string;
  baseSnapshot: FinancialMetricSnapshot;
  targetSnapshot: FinancialMetricSnapshot;
  shifts: MetricShift[];
  keyObservations: string[];
}
