export const RiskAlertSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type RiskAlertSeverity = (typeof RiskAlertSeverity)[keyof typeof RiskAlertSeverity];

export const RiskAlertStatus = {
  NEW: 'NEW',
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  INVESTIGATING: 'INVESTIGATING',
  ESCALATED: 'ESCALATED',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
} as const;

export type RiskAlertStatus = (typeof RiskAlertStatus)[keyof typeof RiskAlertStatus];

export const RiskAlertType = {
  UNUSUAL_AMOUNT: 'UNUSUAL_AMOUNT',
  UNUSUAL_FREQUENCY: 'UNUSUAL_FREQUENCY',
  TIMING_CHANGE: 'TIMING_CHANGE',
  CATEGORY_SHIFT: 'CATEGORY_SHIFT',
  DUPLICATE_CANDIDATE: 'DUPLICATE_CANDIDATE',
  CASH_SHORTFALL: 'CASH_SHORTFALL',
  OVERDUE_RECEIVABLE: 'OVERDUE_RECEIVABLE',
  BUDGET_OVERRUN: 'BUDGET_OVERRUN',
} as const;

export type RiskAlertType = (typeof RiskAlertType)[keyof typeof RiskAlertType];

export interface ReviewDecision {
  id: string;
  organizationId: string;
  reviewerUserId: string;
  reviewerUser?: { id: string; fullName: string; email: string };
  action: 'ACKNOWLEDGE' | 'DISMISS' | 'INVESTIGATE' | 'ESCALATE' | 'APPROVE';
  notes?: string;
  reviewerNotes?: string;
  resolutionEvidence?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface RiskAlert {
  id: string;
  organizationId: string;
  type?: string;
  ruleCode: RiskAlertType;
  title: string;
  description?: string;
  explanation?: string;
  severity: RiskAlertSeverity;
  status: RiskAlertStatus;
  evidence?: Record<string, unknown>;
  supportingRecordIds?: string[] | Record<string, unknown>;
  actionableRecommendation?: string;
  detectionMethod?: string;
  metricValue?: string | null;
  thresholdValue?: string | null;
  nonFraudDisclaimer?: string;
  reviewDecisions?: ReviewDecision[];
  detectedAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AnomalyScanResponse {
  organizationId: string;
  alertsGeneratedCount: number;
  totalActiveAlerts: number;
  alerts: RiskAlert[];
}
