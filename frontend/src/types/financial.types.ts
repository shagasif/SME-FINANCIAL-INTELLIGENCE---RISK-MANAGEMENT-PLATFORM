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
  ISSUED: 'ISSUED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOID: 'VOID',
} as const;

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const BillStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOID: 'VOID',
} as const;

export type BillStatus = (typeof BillStatus)[keyof typeof BillStatus];

export const PaymentMethod = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  CASH: 'CASH',
  CARD: 'CARD',
  CHEQUE: 'CHEQUE',
  DIRECT_DEBIT: 'DIRECT_DEBIT',
  OTHER: 'OTHER',
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const BudgetPeriodType = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUAL: 'ANNUAL',
} as const;

export type BudgetPeriodType = (typeof BudgetPeriodType)[keyof typeof BudgetPeriodType];

export interface FinancialAccount {
  id: string;
  organizationId: string;
  code?: string;
  name: string;
  accountType?: AccountType;
  type?: AccountType;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  institution?: string | null;
  isLiquid?: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialTransaction {
  id: string;
  organizationId: string;
  accountId: string;
  account?: { id: string; code?: string; name: string; currency?: string; type?: string };
  type: TransactionType;
  amount: string;
  currency?: string;
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

export interface DocumentLineItem {
  id?: string;
  lineOrder?: number;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate?: string;
  taxAmount?: string;
  lineSubtotal?: string;
  lineTotal?: string;
}

export interface Invoice {
  id: string;
  organizationId: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string | null;
  category?: string;
  department?: string | null;
  issueDate: string;
  dueDate: string;
  subtotalAmount?: string;
  taxRate?: string;
  taxAmount?: string;
  totalAmount: string;
  paidAmount: string;
  outstandingBalance: string;
  currency: string;
  status: InvoiceStatus;
  isOverdue?: boolean;
  notes?: string | null;
  lineItems?: DocumentLineItem[];
  payments?: PaymentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface Bill {
  id: string;
  organizationId: string;
  billNumber: string;
  supplierName: string;
  supplierEmail?: string | null;
  category?: string;
  department?: string | null;
  issueDate: string;
  dueDate: string;
  subtotalAmount?: string;
  taxRate?: string;
  taxAmount?: string;
  totalAmount: string;
  paidAmount: string;
  outstandingBalance: string;
  currency: string;
  status: BillStatus;
  isOverdue?: boolean;
  notes?: string | null;
  lineItems?: DocumentLineItem[];
  payments?: PaymentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  organizationId: string;
  invoiceId?: string | null;
  billId?: string | null;
  transactionId?: string | null;
  amount: string;
  currency?: string;
  paymentDate: string;
  method: PaymentMethod | string;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface AgingBucketSummary {
  bucket: 'CURRENT' | '1_TO_30_DAYS' | '31_TO_60_DAYS' | '61_TO_90_DAYS' | 'OVER_90_DAYS';
  count: number;
  amount: string;
  recordIds?: string[];
}

export interface AgingSection {
  totalOutstanding: string;
  totalOverdue: string;
  isComplete: boolean;
  missingCurrencies: string[];
  buckets: AgingBucketSummary[];
  sourceRecordIds?: string[];
}

export interface AgingReportResponse {
  asOfDate: string;
  currency: string;
  receivablesAging: AgingSection;
  payablesAging: AgingSection;
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
  validRowsCount?: number;
  validRows?: number;
  errorRowsCount?: number;
  invalidRows?: number;
  duplicateRowsCount: number;
  committedRowsCount?: number;
  committedRows?: number;
  status: 'PENDING_PREVIEW' | 'PENDING_CONFIRMATION' | 'COMMITTED' | 'FAILED' | 'VALIDATED';
  previewRows?: Record<string, unknown>[];
  rowErrors?: Array<{ rowNumber: number; reason?: string; errors?: string[]; rawRow?: Record<string, unknown> }>;
  duplicates?: Array<{ rowNumber: number; duplicateKey?: string; duplicateHash?: string; matchedExistingId?: string }>;
  sanitizationNotes?: unknown[];
  createdAt: string;
}
