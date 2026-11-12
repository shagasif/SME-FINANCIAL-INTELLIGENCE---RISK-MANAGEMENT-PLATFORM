export const ReportType = {
  BUSINESS_HEALTH: 'BUSINESS_HEALTH',
  CASH_FLOW: 'CASH_FLOW',
  EXPENSE: 'EXPENSE',
  BUDGET: 'BUDGET',
  RISK: 'RISK',
} as const;

export type ReportType = (typeof ReportType)[keyof typeof ReportType];

export const TaskStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

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

export interface ReportRecord {
  id: string;
  organizationId: string;
  title: string;
  type?: ReportType;
  reportType?: ReportType;
  currency?: string;
  periodStart?: string;
  periodEnd?: string;
  generatedById?: string;
  generatedByUserId?: string;
  summary?: string;
  summaryMetrics?: Record<string, unknown>;
  narrativeBody?: Record<string, unknown> & {
    executiveBrief?: ExecutiveBrief;
  };
  sections?: Array<{ heading: string; content: string; keyMetrics?: Record<string, unknown> }>;
  sourceRecordIds: Record<string, string[]>;
  dataLimitations?: string[];
  createdAt: string;
}

export interface Notification {
  id: string;
  organizationId: string;
  userId?: string | null;
  title: string;
  message: string;
  type: string;
  priority: string;
  isRead: boolean;
  link?: string | null;
  createdAt: string;
}

export interface FollowUpTask {
  id: string;
  organizationId: string;
  createdById: string;
  assignedUserId?: string | null;
  assignedUser?: { id: string; fullName: string; email: string };
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  organizationId?: string | null;
  actorUserId?: string | null;
  actorUser?: { id: string; fullName: string; email: string };
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  status: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
  integrityHash: string;
  createdAt: string;
}
