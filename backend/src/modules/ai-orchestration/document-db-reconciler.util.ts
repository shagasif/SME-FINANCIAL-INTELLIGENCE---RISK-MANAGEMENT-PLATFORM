import { DecimalMath } from '../../common/utils/decimal-math.js';

export type FieldProvenance = 'DATABASE' | 'PDF' | 'VERIFIED' | 'CONFLICT' | 'MISSING';

export interface CanonicalLineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  taxAmount?: string;
  lineSubtotal: string;
  lineTotal: string;
}

export interface CanonicalFinancialRecord {
  recordId: string | null;
  organizationId: string;
  documentType: 'INVOICE' | 'BILL';
  documentNumber: string | null;
  counterpartyName: string | null;
  counterpartyEmail: string | null;
  category: string | null;
  department: string | null;
  currency: string | null;
  issueDate: string | null;
  dueDate: string | null;
  status: string | null;
  subtotalAmount: string | null;
  discountRate: string | null;
  discountAmount: string | null;
  taxRate: string | null;
  taxAmount: string | null;
  totalAmount: string | null;
  notes: string | null;
  lineItems: CanonicalLineItem[];
}

export interface ReconciledConflict {
  field: string;
  pdfValue: string | null;
  databaseValue: string | null;
}

export interface ReconciledDocumentResult {
  recordId: string | null;
  organizationId: string;
  documentType: 'INVOICE' | 'BILL';
  status: string | null;
  fields: Omit<CanonicalFinancialRecord, 'recordId' | 'organizationId' | 'documentType' | 'status'>;
  fieldSources: Record<string, FieldProvenance>;
  conflicts: ReconciledConflict[];
  missingInPdfOnly: string[];
  missingInRecord: string[];
  hasDatabaseRecord: boolean;
  hasPdfExtraction: boolean;
}

function normalizeDateIso(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : s;
}

function normalizeStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

function normalizeDec(val: unknown): string | null {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  try {
    return DecimalMath.toFixed4(DecimalMath.of(String(val)));
  } catch {
    return null;
  }
}

function extractDiscountFromNotes(notes: string | null): {
  discountAmount: string | null;
  discountRate: string | null;
} {
  if (!notes) return { discountAmount: null, discountRate: null };
  const m = notes.match(
    /Discount:\s*(?:[A-Z]{3}\s*)?([0-9][0-9,]*(?:\.[0-9]{1,4})?)(?:\s*\((\d+(?:\.\d{1,2})?)%\))?/i,
  );
  if (!m) return { discountAmount: null, discountRate: null };
  const amt = normalizeDec(m[1].replace(/,/g, ''));
  const rate = m[2] ? normalizeDec(m[2]) : null;
  return { discountAmount: amt, discountRate: rate };
}

export function mapDatabaseInvoiceToCanonical(
  organizationId: string,
  inv: Record<string, unknown>,
): CanonicalFinancialRecord {
  const notes = normalizeStr(inv.notes);
  const { discountAmount, discountRate } = extractDiscountFromNotes(notes);
  const rawItems = Array.isArray(inv.lineItems)
    ? (inv.lineItems as Array<Record<string, unknown>>)
    : [];

  return {
    recordId: String(inv.id),
    organizationId,
    documentType: 'INVOICE',
    documentNumber: normalizeStr(inv.invoiceNumber),
    counterpartyName: normalizeStr(inv.customerName),
    counterpartyEmail: normalizeStr(inv.customerEmail),
    category: normalizeStr(inv.category),
    department: normalizeStr(inv.department),
    currency: normalizeStr(inv.currency),
    issueDate: normalizeDateIso(inv.issueDate),
    dueDate: normalizeDateIso(inv.dueDate),
    status: normalizeStr(inv.status),
    subtotalAmount: normalizeDec(inv.subtotalAmount),
    discountRate,
    discountAmount,
    taxRate: normalizeDec(inv.taxRate),
    taxAmount: normalizeDec(inv.taxAmount),
    totalAmount: normalizeDec(inv.totalAmount),
    notes,
    lineItems: rawItems.map((li) => ({
      description: String(li.description ?? ''),
      quantity: normalizeDec(li.quantity) ?? '0.0000',
      unitPrice: normalizeDec(li.unitPrice) ?? '0.0000',
      taxRate: normalizeDec(li.taxRate) ?? '0.0000',
      taxAmount: normalizeDec(li.taxAmount) ?? '0.0000',
      lineSubtotal: normalizeDec(li.lineSubtotal) ?? '0.0000',
      lineTotal: normalizeDec(li.lineTotal) ?? '0.0000',
    })),
  };
}

export function mapDatabaseBillToCanonical(
  organizationId: string,
  bill: Record<string, unknown>,
): CanonicalFinancialRecord {
  const notes = normalizeStr(bill.notes);
  const { discountAmount, discountRate } = extractDiscountFromNotes(notes);
  const rawItems = Array.isArray(bill.lineItems)
    ? (bill.lineItems as Array<Record<string, unknown>>)
    : [];

  return {
    recordId: String(bill.id),
    organizationId,
    documentType: 'BILL',
    documentNumber: normalizeStr(bill.billNumber),
    counterpartyName: normalizeStr(bill.supplierName),
    counterpartyEmail: normalizeStr(bill.supplierEmail),
    category: normalizeStr(bill.category),
    department: normalizeStr(bill.department),
    currency: normalizeStr(bill.currency),
    issueDate: normalizeDateIso(bill.issueDate),
    dueDate: normalizeDateIso(bill.dueDate),
    status: normalizeStr(bill.status),
    subtotalAmount: normalizeDec(bill.subtotalAmount),
    discountRate,
    discountAmount,
    taxRate: normalizeDec(bill.taxRate),
    taxAmount: normalizeDec(bill.taxAmount),
    totalAmount: normalizeDec(bill.totalAmount),
    notes,
    lineItems: rawItems.map((li) => ({
      description: String(li.description ?? ''),
      quantity: normalizeDec(li.quantity) ?? '0.0000',
      unitPrice: normalizeDec(li.unitPrice) ?? '0.0000',
      taxRate: normalizeDec(li.taxRate) ?? '0.0000',
      taxAmount: normalizeDec(li.taxAmount) ?? '0.0000',
      lineSubtotal: normalizeDec(li.lineSubtotal) ?? '0.0000',
      lineTotal: normalizeDec(li.lineTotal) ?? '0.0000',
    })),
  };
}

export function mapPdfPayloadToCanonical(
  organizationId: string,
  documentType: 'INVOICE' | 'BILL',
  extractedDoc: Record<string, unknown>,
  rawLineItems: Array<Record<string, unknown>> = [],
): CanonicalFinancialRecord {
  return {
    recordId: null,
    organizationId,
    documentType,
    documentNumber: normalizeStr(extractedDoc.documentNumber),
    counterpartyName: normalizeStr(extractedDoc.counterpartyName),
    counterpartyEmail: normalizeStr(extractedDoc.counterpartyEmail),
    category: normalizeStr(extractedDoc.category),
    department: normalizeStr(extractedDoc.department),
    currency: normalizeStr(extractedDoc.currency),
    issueDate: normalizeDateIso(extractedDoc.issueDate),
    dueDate: normalizeDateIso(extractedDoc.dueDate),
    status: null,
    subtotalAmount: normalizeDec(extractedDoc.subtotalAmount),
    discountRate: normalizeDec(extractedDoc.discountRate),
    discountAmount: normalizeDec(extractedDoc.discountAmount),
    taxRate: normalizeDec(extractedDoc.taxRate),
    taxAmount: normalizeDec(extractedDoc.taxAmount),
    totalAmount: normalizeDec(extractedDoc.totalAmount),
    notes: normalizeStr(extractedDoc.notes),
    lineItems: rawLineItems.map((li) => ({
      description: String(li.description ?? ''),
      quantity: normalizeDec(li.quantity) ?? '0.0000',
      unitPrice: normalizeDec(li.unitPrice) ?? '0.0000',
      taxRate: normalizeDec(li.taxRate) ?? '0.0000',
      taxAmount: normalizeDec(li.lineTaxAmount ?? li.taxAmount) ?? '0.0000',
      lineSubtotal: normalizeDec(li.lineSubtotal) ?? '0.0000',
      lineTotal: normalizeDec(li.lineTotal) ?? '0.0000',
    })),
  };
}

const NUMERIC_FIELDS = new Set([
  'subtotalAmount',
  'discountRate',
  'discountAmount',
  'taxRate',
  'taxAmount',
  'totalAmount',
]);

function valuesMatch(field: string, a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  if (NUMERIC_FIELDS.has(field)) {
    return DecimalMath.sub(a, b).abs().lte(DecimalMath.of('0.05'));
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function reconcileDocumentWithDatabaseRecord(params: {
  organizationId: string;
  documentType: 'INVOICE' | 'BILL';
  dbRecord: CanonicalFinancialRecord | null;
  pdfRecord: CanonicalFinancialRecord | null;
}): ReconciledDocumentResult {
  const { dbRecord, pdfRecord, organizationId, documentType } = params;

  const scalarKeys: Array<
    keyof Omit<
      CanonicalFinancialRecord,
      'recordId' | 'organizationId' | 'documentType' | 'status' | 'lineItems'
    >
  > = [
    'documentNumber',
    'counterpartyName',
    'counterpartyEmail',
    'category',
    'department',
    'currency',
    'issueDate',
    'dueDate',
    'subtotalAmount',
    'discountRate',
    'discountAmount',
    'taxRate',
    'taxAmount',
    'totalAmount',
    'notes',
  ];

  const fields: Record<string, unknown> = {};
  const fieldSources: Record<string, FieldProvenance> = {};
  const conflicts: ReconciledConflict[] = [];
  const missingInPdfOnly: string[] = [];
  const missingInRecord: string[] = [];

  for (const key of scalarKeys) {
    const dbVal = dbRecord ? dbRecord[key] : null;
    const pdfVal = pdfRecord ? pdfRecord[key] : null;

    if (dbVal !== null && pdfVal !== null) {
      if (valuesMatch(key, dbVal, pdfVal)) {
        fields[key] = dbVal;
        fieldSources[key] = 'VERIFIED';
      } else {
        // Keep authoritative persisted DB value and explicitly flag the conflict
        fields[key] = dbVal;
        fieldSources[key] = 'CONFLICT';
        conflicts.push({ field: key, pdfValue: pdfVal, databaseValue: dbVal });
      }
    } else if (dbVal !== null) {
      fields[key] = dbVal;
      fieldSources[key] = 'DATABASE';
      if (pdfRecord) {
        missingInPdfOnly.push(key);
      }
    } else if (pdfVal !== null) {
      fields[key] = pdfVal;
      fieldSources[key] = 'PDF';
    } else {
      fields[key] = null;
      fieldSources[key] = 'MISSING';
      missingInRecord.push(key);
    }
  }

  // Reconcile line items
  const dbLines = dbRecord?.lineItems ?? [];
  const pdfLines = pdfRecord?.lineItems ?? [];
  let lineItems: CanonicalLineItem[] = [];
  if (dbLines.length > 0 && pdfLines.length > 0) {
    lineItems = dbLines;
    if (dbLines.length === pdfLines.length) {
      fieldSources.lineItems = 'VERIFIED';
    } else {
      fieldSources.lineItems = 'CONFLICT';
      conflicts.push({
        field: 'lineItems',
        pdfValue: `${pdfLines.length} line item(s)`,
        databaseValue: `${dbLines.length} line item(s)`,
      });
    }
  } else if (dbLines.length > 0) {
    lineItems = dbLines;
    fieldSources.lineItems = 'DATABASE';
    if (pdfRecord) {
      missingInPdfOnly.push('lineItems');
    }
  } else if (pdfLines.length > 0) {
    lineItems = pdfLines;
    fieldSources.lineItems = 'PDF';
  } else {
    lineItems = [];
    fieldSources.lineItems = 'MISSING';
    missingInRecord.push('lineItems');
  }

  return {
    recordId: dbRecord?.recordId ?? null,
    organizationId,
    documentType,
    status: dbRecord?.status ?? null,
    fields: {
      ...(fields as Omit<
        CanonicalFinancialRecord,
        'recordId' | 'organizationId' | 'documentType' | 'status' | 'lineItems'
      >),
      lineItems,
    },
    fieldSources,
    conflicts,
    missingInPdfOnly,
    missingInRecord,
    hasDatabaseRecord: Boolean(dbRecord),
    hasPdfExtraction: Boolean(pdfRecord),
  };
}
