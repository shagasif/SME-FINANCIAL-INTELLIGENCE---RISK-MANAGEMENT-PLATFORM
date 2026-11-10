export const RiskAlertSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type RiskAlertSeverity = (typeof RiskAlertSeverity)[keyof typeof RiskAlertSeverity];

export const RiskAlertStatus = {
  NEW: 'NEW',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  INVESTIGATING: 'INVESTIGATING',
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
  action: 'ACKNOWLEDGE' | 'DISMISS' | 'INVESTIGATE' | 'ESCALATE';
  notes: string;
  createdAt: string;
}

export interface RiskAlert {
  id: string;
  organizationId: string;
  ruleCode: RiskAlertType;
  title: string;
  description: string;
  severity: RiskAlertSeverity;
  status: RiskAlertStatus;
  evidence: Record<string, unknown>;
  supportingRecordIds: string[];
  nonFraudDisclaimer: string;
  reviewDecisions?: ReviewDecision[];
  detectedAt: string;
  createdAt: string;
}

export interface AnomalyScanResponse {
  organizationId: string;
  alertsGeneratedCount: number;
  totalActiveAlerts: number;
  alerts: RiskAlert[];
}
