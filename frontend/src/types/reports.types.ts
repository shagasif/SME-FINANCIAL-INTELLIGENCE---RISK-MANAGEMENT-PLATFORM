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

export interface ReportRecord {
  id: string;
  organizationId: string;
  title: string;
  reportType: ReportType;
  generatedByUserId: string;
  summary: string;
  sections: Array<{ heading: string; content: string; keyMetrics?: Record<string, unknown> }>;
  sourceRecordIds: Record<string, string[]>;
  dataLimitations: string[];
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
