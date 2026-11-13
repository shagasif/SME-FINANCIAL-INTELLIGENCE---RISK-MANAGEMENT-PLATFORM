import {
  mapDatabaseBillToCanonical,
  mapDatabaseInvoiceToCanonical,
  mapPdfPayloadToCanonical,
  reconcileDocumentWithDatabaseRecord,
} from './document-db-reconciler.util.js';

describe('DocumentDatabaseReconciler (System-Wide Invoice & Bill DB Reconciliation)', () => {
  const orgId = 'org-iso-1';

  it('1. reconciles an existing Customer Invoice created in Invoices & Payables with all persisted fields and line items', () => {
    const dbInvoice = mapDatabaseInvoiceToCanonical(orgId, {
      id: 'inv-db-1',
      invoiceNumber: 'INV-2026-101',
      customerName: 'Al-Madina Traders',
      customerEmail: 'accounts@almadinatraders.pk',
      category: 'Sales Revenue',
      department: 'Enterprise Sales',
      currency: 'PKR',
      issueDate: new Date('2026-11-12T00:00:00.000Z'),
      dueDate: new Date('2026-11-19T00:00:00.000Z'),
      status: 'ISSUED',
      subtotalAmount: '55000.0000',
      taxRate: '0.0000',
      taxAmount: '0.0000',
      totalAmount: '52250.0000',
      notes: 'Discount: PKR 2,750 (5%) | Net 7',
      lineItems: [
        {
          description: 'Storefront & Admin Dashboard',
          quantity: '1.0000',
          unitPrice: '40000.0000',
          taxRate: '0.0000',
          taxAmount: '0.0000',
          lineSubtotal: '40000.0000',
          lineTotal: '40000.0000',
        },
        {
          description: 'SEO Optimization',
          quantity: '1.0000',
          unitPrice: '15000.0000',
          taxRate: '0.0000',
          taxAmount: '0.0000',
          lineSubtotal: '15000.0000',
          lineTotal: '15000.0000',
        },
      ],
    });

    const reconciled = reconcileDocumentWithDatabaseRecord({
      organizationId: orgId,
      documentType: 'INVOICE',
      dbRecord: dbInvoice,
      pdfRecord: null,
    });

    expect(reconciled.recordId).toBe('inv-db-1');
    expect(reconciled.documentType).toBe('INVOICE');
    expect(reconciled.status).toBe('ISSUED');
    expect(reconciled.hasDatabaseRecord).toBe(true);
    expect(reconciled.hasPdfExtraction).toBe(false);
    expect(reconciled.fields.documentNumber).toBe('INV-2026-101');
    expect(reconciled.fields.counterpartyEmail).toBe('accounts@almadinatraders.pk');
    expect(reconciled.fields.category).toBe('Sales Revenue');
    expect(reconciled.fields.department).toBe('Enterprise Sales');
    expect(reconciled.fields.discountAmount).toBe('2750.0000');
    expect(reconciled.fields.discountRate).toBe('5.0000');
    expect(reconciled.fields.totalAmount).toBe('52250.0000');
    expect(reconciled.fields.lineItems).toHaveLength(2);
    expect(reconciled.fieldSources.documentNumber).toBe('DATABASE');
    expect(reconciled.fieldSources.lineItems).toBe('DATABASE');
    expect(reconciled.conflicts).toEqual([]);
  });

  it('2. reconciles an existing Supplier Bill created in Invoices & Payables and preserves BILL direction', () => {
    const dbBill = mapDatabaseBillToCanonical(orgId, {
      id: 'bill-db-1',
      billNumber: 'BILL-2026-501',
      supplierName: 'Crescent Freight Services',
      supplierEmail: 'billing@crescentfreight.pk',
      category: 'Freight & Logistics',
      department: 'Operations',
      currency: 'PKR',
      issueDate: new Date('2026-11-10T00:00:00.000Z'),
      dueDate: new Date('2026-11-24T00:00:00.000Z'),
      status: 'OPEN',
      subtotalAmount: '14000.0000',
      taxRate: '10.0000',
      taxAmount: '1400.0000',
      totalAmount: '15400.0000',
      notes: 'Net 14 Bank Transfer',
      lineItems: [
        {
          description: 'Port Handling',
          quantity: '2.0000',
          unitPrice: '5000.0000',
          taxRate: '10.0000',
          taxAmount: '1000.0000',
          lineSubtotal: '10000.0000',
          lineTotal: '11000.0000',
        },
        {
          description: 'Customs Clearance',
          quantity: '1.0000',
          unitPrice: '4000.0000',
          taxRate: '10.0000',
          taxAmount: '400.0000',
          lineSubtotal: '4000.0000',
          lineTotal: '4400.0000',
        },
      ],
    });

    const reconciled = reconcileDocumentWithDatabaseRecord({
      organizationId: orgId,
      documentType: 'BILL',
      dbRecord: dbBill,
      pdfRecord: null,
    });

    expect(reconciled.recordId).toBe('bill-db-1');
    expect(reconciled.documentType).toBe('BILL');
    expect(reconciled.fields.counterpartyName).toBe('Crescent Freight Services');
    expect(reconciled.fields.counterpartyEmail).toBe('billing@crescentfreight.pk');
    expect(reconciled.fields.taxRate).toBe('10.0000');
    expect(reconciled.fields.taxAmount).toBe('1400.0000');
    expect(reconciled.fields.totalAmount).toBe('15400.0000');
    expect(reconciled.fields.lineItems).toHaveLength(2);
  });

  it('3. reconciles linked Customer Invoice PDF + DB: marks matching fields VERIFIED and fills PDF-absent fields from DATABASE', () => {
    const dbInvoice = mapDatabaseInvoiceToCanonical(orgId, {
      id: 'inv-db-2',
      invoiceNumber: 'INV-SB-2026-101',
      customerName: 'Al-Madina Traders',
      customerEmail: 'accounts@almadinatraders.pk',
      category: 'Sales Revenue',
      department: 'Retail',
      currency: 'PKR',
      issueDate: new Date('2026-11-12T00:00:00.000Z'),
      dueDate: new Date('2026-11-19T00:00:00.000Z'),
      status: 'DRAFT',
      subtotalAmount: '55000.0000',
      taxRate: '0.0000',
      taxAmount: '0.0000',
      totalAmount: '52250.0000',
      notes: 'Discount: PKR 2,750 (5%)',
      lineItems: [],
    });

    // Suppose OCR PDF missed department & customerEmail, while matching number/dates/totals
    const pdfInvoice = mapPdfPayloadToCanonical(orgId, 'INVOICE', {
      documentNumber: 'INV-SB-2026-101',
      counterpartyName: 'Al-Madina Traders',
      counterpartyEmail: null,
      category: 'Sales Revenue',
      department: null,
      currency: 'PKR',
      issueDate: '2026-11-12',
      dueDate: '2026-11-19',
      subtotalAmount: '55000.0000',
      discountAmount: '2750.0000',
      discountRate: '5.0000',
      taxRate: '0.0000',
      taxAmount: '0.0000',
      totalAmount: '52250.0000',
      notes: 'Discount: PKR 2,750 (5%)',
    });

    const reconciled = reconcileDocumentWithDatabaseRecord({
      organizationId: orgId,
      documentType: 'INVOICE',
      dbRecord: dbInvoice,
      pdfRecord: pdfInvoice,
    });

    expect(reconciled.fieldSources.documentNumber).toBe('VERIFIED');
    expect(reconciled.fieldSources.totalAmount).toBe('VERIFIED');
    expect(reconciled.fieldSources.counterpartyEmail).toBe('DATABASE');
    expect(reconciled.fieldSources.department).toBe('DATABASE');
    expect(reconciled.missingInPdfOnly).toContain('counterpartyEmail');
    expect(reconciled.missingInPdfOnly).toContain('department');
    expect(reconciled.fields.counterpartyEmail).toBe('accounts@almadinatraders.pk');
    expect(reconciled.fields.department).toBe('Retail');
    expect(reconciled.conflicts).toEqual([]);
  });

  it('4. reconciles linked Supplier Bill PDF + DB cleanly', () => {
    const dbBill = mapDatabaseBillToCanonical(orgId, {
      id: 'bill-db-4',
      billNumber: 'BILL-400',
      supplierName: 'Karachi Logistics',
      supplierEmail: null,
      category: 'Operating Expense',
      department: null,
      currency: 'PKR',
      issueDate: new Date('2026-10-01T00:00:00.000Z'),
      dueDate: new Date('2026-10-20T00:00:00.000Z'),
      status: 'OPEN',
      subtotalAmount: '35000.0000',
      taxRate: '0.0000',
      taxAmount: '0.0000',
      totalAmount: '35000.0000',
      notes: null,
      lineItems: [],
    });
    const pdfBill = mapPdfPayloadToCanonical(orgId, 'BILL', {
      documentNumber: 'BILL-400',
      counterpartyName: 'Karachi Logistics',
      currency: 'PKR',
      issueDate: '2026-10-01',
      dueDate: '2026-10-20',
      totalAmount: '35000.0000',
    });

    const reconciled = reconcileDocumentWithDatabaseRecord({
      organizationId: orgId,
      documentType: 'BILL',
      dbRecord: dbBill,
      pdfRecord: pdfBill,
    });

    expect(reconciled.fieldSources.documentNumber).toBe('VERIFIED');
    expect(reconciled.fieldSources.totalAmount).toBe('VERIFIED');
    expect(reconciled.fieldSources.subtotalAmount).toBe('DATABASE');
    // 5. Genuinely missing optional fields remain MISSING
    expect(reconciled.fieldSources.counterpartyEmail).toBe('MISSING');
    expect(reconciled.fieldSources.department).toBe('MISSING');
    expect(reconciled.fieldSources.notes).toBe('MISSING');
    expect(reconciled.missingInRecord).toEqual(
      expect.arrayContaining(['counterpartyEmail', 'department', 'notes']),
    );
  });

  it('6. flags PDF vs Database conflicts instead of silently overwriting either source', () => {
    const dbInvoice = mapDatabaseInvoiceToCanonical(orgId, {
      id: 'inv-conflict-1',
      invoiceNumber: 'INV-900',
      customerName: 'Alpha Corp',
      currency: 'USD',
      issueDate: new Date('2026-11-01T00:00:00.000Z'),
      dueDate: new Date('2026-11-30T00:00:00.000Z'),
      status: 'ISSUED',
      subtotalAmount: '1000.0000',
      taxRate: '10.0000',
      taxAmount: '100.0000',
      totalAmount: '1100.0000',
      lineItems: [],
    });

    const pdfInvoice = mapPdfPayloadToCanonical(orgId, 'INVOICE', {
      documentNumber: 'INV-900',
      counterpartyName: 'Alpha Corp',
      currency: 'USD',
      issueDate: '2026-11-01',
      dueDate: '2026-11-15', // differs from DB 2026-11-30
      totalAmount: '1000.0000', // differs from DB 1100.0000
    });

    const reconciled = reconcileDocumentWithDatabaseRecord({
      organizationId: orgId,
      documentType: 'INVOICE',
      dbRecord: dbInvoice,
      pdfRecord: pdfInvoice,
    });

    expect(reconciled.fieldSources.dueDate).toBe('CONFLICT');
    expect(reconciled.fieldSources.totalAmount).toBe('CONFLICT');
    expect(reconciled.conflicts).toEqual([
      { field: 'dueDate', pdfValue: '2026-11-15', databaseValue: '2026-11-30' },
      { field: 'totalAmount', pdfValue: '1000.0000', databaseValue: '1100.0000' },
    ]);
  });
});
