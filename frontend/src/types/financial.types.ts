export const AccountType = {
  BANK: 'BANK',
  CASH: 'CASH',
  ACCOUNTS_RECEIVABLE: 'ACCOUNTS_RECEIVABLE',
  ACCOUNTS_PAYABLE: 'ACCOUNTS_PAYABLE',
  CREDIT_CARD: 'CREDIT_CARD',
  SHORT_TERM_DEBT: 'SHORT_TERM_DEBT',
  OTHER_CURRENT_ASSET: 'OTHER_CURRENT_ASSET',
  OTHER_CURRENT_LIABILITY: 'OTHER_CURRENT_LIABILITY',
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const TransactionType = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  TRANSFER: 'TRANSFER',
} as const;

export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOID: 'VOID',
} as const;

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const BillStatus = {
  RECEIVED: 'RECEIVED',
  SCHEDULED: 'SCHEDULED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  DISPUTED: 'DISPUTED',
} as const;

export type BillStatus = (typeof BillStatus)[keyof typeof BillStatus];

export const BudgetPeriodType = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUAL: 'ANNUAL',
} as const;

export type BudgetPeriodType = (typeof BudgetPeriodType)[keyof typeof BudgetPeriodType];

export interface FinancialAccount {
  id: string;
  organizationId: string;
  name: string;
  accountType: AccountType;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialTransaction {
  id: string;
  organizationId: string;
  accountId: string;
  account?: { id: string; name: string; currency: string };
  type: TransactionType;
  amount: string;
  date: string;
  category: string;
  department?: string | null;
  description: string;
  counterparty?: string | null;
  referenceNumber?: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  organizationId: string;
  invoiceNumber: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  outstandingBalance: string;
  currency: string;
  status: InvoiceStatus;
  isOverdue?: boolean;
  notes?: string | null;
  payments?: PaymentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface Bill {
  id: string;
  organizationId: string;
  billNumber: string;
  supplierName: string;
  issueDate: string;
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  outstandingBalance: string;
  currency: string;
  status: BillStatus;
  isOverdue?: boolean;
  notes?: string | null;
  payments?: PaymentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  organizationId: string;
  invoiceId?: string | null;
  billId?: string | null;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  reference?: string | null;
  createdAt: string;
}

export interface AgingBucketSummary {
  bucket: 'CURRENT' | '1_TO_30_DAYS' | '31_TO_60_DAYS' | '61_TO_90_DAYS' | 'OVER_90_DAYS';
  amount: string;
  count: number;
}

export interface AgingReportResponse {
  asOfDate: string;
  totalReceivables: string;
  totalPayables: string;
  receivablesAging: AgingBucketSummary[];
  payablesAging: AgingBucketSummary[];
}

export interface BudgetLine {
  id: string;
  category: string;
  department?: string | null;
  allocatedAmount: string;
}

export interface BudgetRevision {
  id: string;
  revisionNumber: number;
  reason: string;
  previousTotal: string;
  newTotal: string;
  revisedByUserId?: string | null;
  createdAt: string;
}

export interface Budget {
  id: string;
  organizationId: string;
  name: string;
  periodType: BudgetPeriodType;
  startDate: string;
  endDate: string;
  totalBudgetedAmount: string;
  status: string;
  lines: BudgetLine[];
  revisions?: BudgetRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface BudgetVarianceLine {
  category: string;
  department?: string | null;
  budgetedAmount: string;
  actualAmount: string;
  varianceAmount: string;
  variancePercentage: string;
  status: 'ON_TRACK' | 'WARNING' | 'OVERRUN';
}

export interface BudgetVarianceResponse {
  budgetId: string;
  budgetName: string;
  reportingPeriod: string;
  totalBudgeted: string;
  totalActual: string;
  totalVariance: string;
  varianceLines: BudgetVarianceLine[];
}

export interface ImportBatch {
  id: string;
  organizationId: string;
  accountId: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRowsCount: number;
  committedRows: number;
  status: 'PENDING_CONFIRMATION' | 'COMMITTED' | 'FAILED';
  previewRows?: Record<string, unknown>[];
  rowErrors?: Array<{ rowNumber: number; reason: string; rawRow: Record<string, unknown> }>;
  duplicates?: Array<{ rowNumber: number; duplicateKey: string; matchedExistingId: string }>;
  sanitizationNotes?: string[];
  createdAt: string;
}
