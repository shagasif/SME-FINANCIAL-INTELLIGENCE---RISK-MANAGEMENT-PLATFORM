import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BillStatus,
  InvoiceStatus,
  PaymentMethod,
  Prisma,
} from '../../generated/prisma/client.js';
import { CurrencyConversionService, ExchangeRateRow } from '../currency/currency.service.js';
import { CreateInvoiceDto, RecordPaymentDto } from './dto/invoices-payables.dto.js';
import { InvoicesPayablesService } from './invoices-payables.service.js';

describe('InvoicesPayablesService & DTO (Phase 1 & Phase 2)', () => {
  const sampleRates: ExchangeRateRow[] = [
    {
      id: 'rate-nov',
      organizationId: null,
      fromCurrency: 'USD',
      toCurrency: 'PKR',
      rate: new Prisma.Decimal('276.62140000'),
      effectiveDate: new Date('2026-11-11T00:00:00.000Z'),
      source: 'SBP_M2M',
      isActive: true,
    },
  ];

  const makeService = (overrides?: {
    baseCurrency?: string;
    rates?: ExchangeRateRow[];
    invoiceRecord?: Record<string, unknown> | null;
    billRecord?: Record<string, unknown> | null;
    accountRecord?: Record<string, unknown> | null;
    openInvoices?: Array<Record<string, unknown>>;
    openBills?: Array<Record<string, unknown>>;
    auditEvents?: Array<Record<string, unknown>>;
  }) => {
    const baseCurrency = overrides?.baseCurrency ?? 'USD';
    const createdInvoices: unknown[] = [];
    const createdBills: unknown[] = [];
    const createdTxs: unknown[] = [];
    const updatedAccounts: unknown[] = [];
    const createdPayments: unknown[] = [];
    const overdueQueries: unknown[] = [];
    const auditLogs: unknown[] = [];
    const listQueries: unknown[] = [];
    const lineItemOps: unknown[] = [];

    const prisma = {
      organization: {
        findUnique: async () => ({ id: 'org-star', baseCurrency }),
      },
      exchangeRate: {
        findMany: async () => overrides?.rates ?? sampleRates,
      },
      invoice: {
        findUnique: async () => null,
        findFirst: async () =>
          overrides?.invoiceRecord === undefined ? null : overrides.invoiceRecord,
        findMany: async (args: unknown) => {
          listQueries.push({ type: 'invoice', args });
          return overrides?.openInvoices ?? [];
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const rec = {
            id: 'inv-created-1',
            ...data,
            lineItems: (data.lineItems as { create?: unknown[] } | undefined)?.create?.map(
              (li, idx) => ({ id: `li-${idx}`, ...(li as Record<string, unknown>) }),
            ),
            payments: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          createdInvoices.push(rec);
          return rec;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          ...(overrides?.invoiceRecord ?? {}),
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          payments: [],
        }),
        updateMany: async (args: unknown) => {
          overdueQueries.push({ type: 'invoice', args });
          return { count: 0 };
        },
      },
      invoiceLineItem: {
        deleteMany: async (args: unknown) => {
          lineItemOps.push({ op: 'invDelete', args });
          return { count: 1 };
        },
        createMany: async (args: unknown) => {
          lineItemOps.push({ op: 'invCreate', args });
          return { count: 1 };
        },
      },
      bill: {
        findUnique: async () => null,
        findFirst: async () =>
          overrides?.billRecord === undefined ? null : overrides.billRecord,
        findMany: async (args: unknown) => {
          listQueries.push({ type: 'bill', args });
          return overrides?.openBills ?? [];
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const rec = {
            id: 'bill-created-1',
            ...data,
            lineItems: (data.lineItems as { create?: unknown[] } | undefined)?.create?.map(
              (li, idx) => ({ id: `bli-${idx}`, ...(li as Record<string, unknown>) }),
            ),
            payments: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          createdBills.push(rec);
          return rec;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          ...(overrides?.billRecord ?? {}),
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          payments: [],
        }),
        updateMany: async (args: unknown) => {
          overdueQueries.push({ type: 'bill', args });
          return { count: 0 };
        },
      },
      billLineItem: {
        deleteMany: async (args: unknown) => {
          lineItemOps.push({ op: 'billDelete', args });
          return { count: 1 };
        },
        createMany: async (args: unknown) => {
          lineItemOps.push({ op: 'billCreate', args });
          return { count: 1 };
        },
      },
      financialAccount: {
        findFirst: async () =>
          overrides?.accountRecord === undefined ? null : overrides.accountRecord,
        update: async (args: { data: Record<string, unknown> }) => {
          updatedAccounts.push(args.data);
          return args.data;
        },
      },
      financialTransaction: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const rec = { id: 'tx-settlement-1', ...data };
          createdTxs.push(rec);
          return rec;
        },
      },
      paymentRecord: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdPayments.push(data);
          return data;
        },
      },
      auditEvent: {
        findMany: async (args?: { where?: { action?: string } }) =>
          (overrides?.auditEvents ?? []).filter(
            (evt) => !args?.where?.action || evt.action === args.where.action,
          ),
      },
      $transaction: async <T>(cb: (tx: unknown) => Promise<T>) => cb(prisma),
    };

    const audit = {
      record: async (entry: unknown) => {
        auditLogs.push(entry);
      },
    };
    const currencyService = new CurrencyConversionService(prisma as never, audit as never);
    const service = new InvoicesPayablesService(prisma as never, audit as never, currencyService);

    return {
      service,
      createdInvoices,
      createdBills,
      createdTxs,
      updatedAccounts,
      createdPayments,
      overdueQueries,
      auditLogs,
      listQueries,
      lineItemOps,
    };
  };

  it('validates RecordPaymentDto with method + PaymentMethod enum and leaves omitted CreateInvoiceDto currency undefined', async () => {
    const invoiceDto = plainToInstance(CreateInvoiceDto, {
      invoiceNumber: 'INV-001',
      customerName: 'Acme Corp',
      issueDate: '2026-11-11T00:00:00.000Z',
      dueDate: '2026-11-30T00:00:00.000Z',
      totalAmount: '1000.0000',
    });
    expect(invoiceDto.currency).toBeUndefined();
    expect(await validate(invoiceDto)).toHaveLength(0);

    const validPayment = plainToInstance(RecordPaymentDto, {
      amount: '500.0000',
      paymentDate: '2026-11-11T00:00:00.000Z',
      method: PaymentMethod.CARD,
    });
    expect(await validate(validPayment)).toHaveLength(0);

    const legacyPayment = plainToInstance(RecordPaymentDto, {
      amount: '500.0000',
      paymentDate: '2026-11-11T00:00:00.000Z',
      paymentMethod: 'CREDIT_CARD',
    });
    const errors = await validate(legacyPayment, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('defaults omitted currency to Organization.baseCurrency and avoids false same-day overdue status', async () => {
    const { service, createdInvoices, createdBills } = makeService({ baseCurrency: 'PKR' });

    const now = new Date();
    const todayMidnightUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    ).toISOString();

    const inv = await service.createInvoice(
      'org-pkr',
      {
        invoiceNumber: 'INV-TODAY',
        customerName: 'Lahore Traders',
        issueDate: todayMidnightUtc,
        dueDate: todayMidnightUtc,
        totalAmount: '25000.0000',
      },
      'user-1',
    );
    expect(inv.currency).toBe('PKR');
    expect(inv.status).toBe(InvoiceStatus.ISSUED);
    expect((createdInvoices[0] as { isOverdue?: boolean }).isOverdue).toBeUndefined();

    const bill = await service.createBill(
      'org-pkr',
      {
        billNumber: 'BILL-TODAY',
        supplierName: 'Karachi Suppliers',
        issueDate: todayMidnightUtc,
        dueDate: todayMidnightUtc,
        totalAmount: '12000.0000',
      },
      'user-1',
    );
    expect(bill.currency).toBe('PKR');
    expect(bill.status).toBe(BillStatus.OPEN);
    expect(createdBills).toHaveLength(1);
  });

  it('rejects dueDate earlier than issueDate on create and edit', async () => {
    const { service } = makeService({ baseCurrency: 'USD' });

    await expect(
      service.createInvoice(
        'org-star',
        {
          invoiceNumber: 'INV-BAD-DATE',
          customerName: 'Acme Corp',
          issueDate: '2026-11-15T00:00:00.000Z',
          dueDate: '2026-11-10T00:00:00.000Z',
          totalAmount: '500.0000',
        },
        'user-1',
      ),
    ).rejects.toThrow(/Due date cannot be earlier than issue date/i);

    await expect(
      service.createBill(
        'org-star',
        {
          billNumber: 'BILL-BAD-DATE',
          supplierName: 'Supplier LLC',
          issueDate: '2026-11-15T00:00:00.000Z',
          dueDate: '2026-11-01T00:00:00.000Z',
          totalAmount: '300.0000',
        },
        'user-1',
      ),
    ).rejects.toThrow(/Due date cannot be earlier than issue date/i);
  });

  it('computes invoice and bill line items, subtotal, taxAmount, and totalAmount deterministically', async () => {
    const { service } = makeService({ baseCurrency: 'PKR' });

    const created = await service.createInvoice(
      'org-pkr',
      {
        invoiceNumber: 'INV-ITEMS-1',
        customerName: 'faisalabad textiles',
        category: 'Consulting Revenue',
        department: 'Advisory',
        issueDate: '2026-11-01T00:00:00.000Z',
        dueDate: '2026-11-30T00:00:00.000Z',
        status: InvoiceStatus.DRAFT,
        lineItems: [
          { description: 'Monthly CFO Advisory', quantity: '2', unitPrice: '50000', taxRate: '17' },
          { description: 'Audit Prep Pack', quantity: '1', unitPrice: '20000', taxRate: '0' },
        ],
      },
      'user-1',
    );

    expect(created.customerName).toBe('Faisalabad Textiles');
    expect(created.status).toBe(InvoiceStatus.DRAFT);
    expect(created.category).toBe('Consulting Revenue');
    expect(created.department).toBe('Advisory');
    expect(created.subtotalAmount).toBe('120000.0000');
    expect(created.taxAmount).toBe('17000.0000');
    expect(created.totalAmount).toBe('137000.0000');
    expect(created.lineItems).toHaveLength(2);
    expect(created.lineItems?.[0].lineTotal).toBe('117000.0000');
  });

  it('supports DRAFT -> ISSUED/OPEN transition, safe PATCH edits, and locks monetary fields once payments exist', async () => {
    const draftInvoice = {
      id: 'inv-draft-1',
      organizationId: 'org-star',
      invoiceNumber: 'INV-D1',
      customerName: 'Client One',
      customerEmail: null,
      category: 'Sales Revenue',
      department: null,
      issueDate: new Date('2026-11-01T00:00:00.000Z'),
      dueDate: new Date('2026-11-30T00:00:00.000Z'),
      currency: 'USD',
      subtotalAmount: new Prisma.Decimal('1000.0000'),
      taxRate: new Prisma.Decimal('0.0000'),
      taxAmount: new Prisma.Decimal('0.0000'),
      totalAmount: new Prisma.Decimal('1000.0000'),
      paidAmount: new Prisma.Decimal('0.0000'),
      outstandingBalance: new Prisma.Decimal('1000.0000'),
      status: InvoiceStatus.DRAFT,
      notes: null,
      lineItems: [],
    };

    const { service, lineItemOps, auditLogs } = makeService({ invoiceRecord: draftInvoice });
    const issued = await service.updateInvoice(
      'org-star',
      'inv-draft-1',
      {
        status: InvoiceStatus.ISSUED,
        department: 'Enterprise',
        lineItems: [{ description: 'Updated Service', quantity: '3', unitPrice: '400', taxRate: '10' }],
      },
      'user-1',
    );
    expect(issued.status).toBe(InvoiceStatus.ISSUED);
    expect(issued.totalAmount).toBe('1320.0000');
    expect(lineItemOps).toHaveLength(2);
    expect((auditLogs[0] as { action: string }).action).toBe('INVOICE_ISSUED');

    // Partially paid invoice blocks monetary edits
    const partialCtx = makeService({
      invoiceRecord: {
        ...draftInvoice,
        status: InvoiceStatus.PARTIALLY_PAID,
        paidAmount: new Prisma.Decimal('400.0000'),
        outstandingBalance: new Prisma.Decimal('600.0000'),
      },
    });
    await expect(
      partialCtx.service.updateInvoice(
        'org-star',
        'inv-draft-1',
        { totalAmount: '1500.0000' },
        'user-1',
      ),
    ).rejects.toThrow(/after payments have been recorded/i);
  });

  it('safely voids unpaid invoices/bills with audit logging and blocks voiding documents with payments', async () => {
    const unpaidBill = {
      id: 'bill-open-1',
      organizationId: 'org-star',
      billNumber: 'BILL-101',
      supplierName: 'Cloud Vendor',
      supplierEmail: null,
      category: 'Software & Cloud',
      department: 'Engineering',
      issueDate: new Date('2026-11-01T00:00:00.000Z'),
      dueDate: new Date('2026-11-30T00:00:00.000Z'),
      currency: 'USD',
      subtotalAmount: new Prisma.Decimal('800.0000'),
      taxRate: new Prisma.Decimal('0.0000'),
      taxAmount: new Prisma.Decimal('0.0000'),
      totalAmount: new Prisma.Decimal('800.0000'),
      paidAmount: new Prisma.Decimal('0.0000'),
      outstandingBalance: new Prisma.Decimal('800.0000'),
      status: BillStatus.OPEN,
      notes: null,
    };

    const { service, auditLogs } = makeService({ billRecord: unpaidBill });
    const voided = await service.voidBill(
      'org-star',
      'bill-open-1',
      { reason: 'Duplicate supplier entry' },
      'user-1',
    );
    expect(voided.status).toBe(BillStatus.VOID);
    expect(voided.outstandingBalance).toBe('0.0000');
    expect((auditLogs[0] as { action: string }).action).toBe('SUPPLIER_BILL_VOIDED');

    const paidBillCtx = makeService({
      billRecord: {
        ...unpaidBill,
        status: BillStatus.PARTIALLY_PAID,
        paidAmount: new Prisma.Decimal('200.0000'),
      },
    });
    await expect(
      paidBillCtx.service.voidBill('org-star', 'bill-open-1', { reason: 'Cancel' }, 'user-1'),
    ).rejects.toThrow(/Cannot void a bill with recorded payments/i);
  });

  it('enforces tenant isolation on single-record detail lookups and forwards search filters on list', async () => {
    const { service, listQueries } = makeService({ invoiceRecord: null });

    await expect(service.getInvoiceById('org-other', 'inv-1')).rejects.toThrow(NotFoundException);

    await service.listInvoices('org-star', InvoiceStatus.OVERDUE, 'Lahore');
    const queryArgs = (listQueries[0] as { args: { where: Record<string, unknown> } }).args;
    expect(queryArgs.where.organizationId).toBe('org-star');
    expect(queryArgs.where.status).toBe(InvoiceStatus.OVERDUE);
    expect(Array.isArray(queryArgs.where.OR)).toBe(true);
  });

  it('blocks payments against DRAFT, VOID, and already PAID invoices and bills', async () => {
    for (const status of [InvoiceStatus.DRAFT, InvoiceStatus.VOID, InvoiceStatus.PAID]) {
      const { service } = makeService({
        invoiceRecord: {
          id: 'inv-1',
          organizationId: 'org-1',
          invoiceNumber: 'INV-1',
          customerName: 'Client A',
          category: 'Sales Revenue',
          department: null,
          issueDate: new Date('2026-11-01T00:00:00.000Z'),
          dueDate: new Date('2026-11-30T00:00:00.000Z'),
          currency: 'USD',
          totalAmount: new Prisma.Decimal('1000.0000'),
          paidAmount: status === InvoiceStatus.PAID ? new Prisma.Decimal('1000.0000') : new Prisma.Decimal('0'),
          outstandingBalance: status === InvoiceStatus.PAID ? new Prisma.Decimal('0') : new Prisma.Decimal('1000.0000'),
          status,
        },
      });
      await expect(
        service.recordInvoicePayment(
          'org-1',
          'inv-1',
          { amount: '100.0000', paymentDate: '2026-11-11T00:00:00.000Z', method: PaymentMethod.CASH },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    }

    for (const status of [BillStatus.DRAFT, BillStatus.VOID, BillStatus.PAID]) {
      const { service } = makeService({
        billRecord: {
          id: 'bill-1',
          organizationId: 'org-1',
          billNumber: 'BILL-1',
          supplierName: 'Vendor A',
          category: 'Operating Expense',
          department: null,
          issueDate: new Date('2026-11-01T00:00:00.000Z'),
          dueDate: new Date('2026-11-30T00:00:00.000Z'),
          currency: 'USD',
          totalAmount: new Prisma.Decimal('1000.0000'),
          paidAmount: new Prisma.Decimal('0'),
          outstandingBalance: status === BillStatus.PAID ? new Prisma.Decimal('0') : new Prisma.Decimal('1000.0000'),
          status,
        },
      });
      await expect(
        service.recordBillPayment(
          'org-1',
          'bill-1',
          { amount: '100.0000', paymentDate: '2026-11-11T00:00:00.000Z', method: PaymentMethod.BANK_TRANSFER },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('rejects cross-currency settlement when FX rate is missing and converts accurately when FX rate exists', async () => {
    const baseInvoice = {
      id: 'inv-usd-1',
      organizationId: 'org-star',
      invoiceNumber: 'INV-USD-1',
      customerName: 'Export Client',
      category: 'Sales Revenue',
      department: null,
      issueDate: new Date('2026-11-01T00:00:00.000Z'),
      dueDate: new Date('2026-11-30T00:00:00.000Z'),
      currency: 'USD',
      totalAmount: new Prisma.Decimal('500.0000'),
      paidAmount: new Prisma.Decimal('0.0000'),
      outstandingBalance: new Prisma.Decimal('500.0000'),
      status: InvoiceStatus.ISSUED,
    };

    const pkrAccount = {
      id: 'acc-pkr',
      organizationId: 'org-star',
      name: 'Business Savings Reserve',
      currency: 'PKR',
      currentBalance: new Prisma.Decimal('2615100.0000'),
    };

    const missingCtx = makeService({
      invoiceRecord: { ...baseInvoice, currency: 'EUR' },
      accountRecord: pkrAccount,
    });
    await expect(
      missingCtx.service.recordInvoicePayment(
        'org-star',
        'inv-usd-1',
        {
          amount: '100.0000',
          paymentDate: '2026-11-11T00:00:00.000Z',
          accountId: 'acc-pkr',
          method: PaymentMethod.BANK_TRANSFER,
        },
        'user-1',
      ),
    ).rejects.toThrow(/missing exchange rate.*EUR -> PKR/i);
    expect(missingCtx.createdTxs).toHaveLength(0);
    expect(missingCtx.updatedAccounts).toHaveLength(0);

    const validCtx = makeService({
      invoiceRecord: baseInvoice,
      accountRecord: pkrAccount,
    });
    const res = await validCtx.service.recordInvoicePayment(
      'org-star',
      'inv-usd-1',
      {
        amount: '100.0000',
        paymentDate: '2026-11-11T00:00:00.000Z',
        accountId: 'acc-pkr',
        method: PaymentMethod.BANK_TRANSFER,
      },
      'user-1',
    );
    expect(res.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(res.outstandingBalance).toBe('400.0000');
    expect((validCtx.createdTxs[0] as { currency: string }).currency).toBe('PKR');
    expect((validCtx.createdTxs[0] as { amount: Prisma.Decimal }).amount.toFixed(4)).toBe('27662.1400');
    expect((validCtx.updatedAccounts[0] as { currentBalance: Prisma.Decimal }).currentBalance.toFixed(4)).toBe(
      '2642762.1400',
    );
    expect((validCtx.createdPayments[0] as { currency: string }).currency).toBe('USD');
  });

  it('uses UTC calendar day boundaries in refreshOverdueStatuses and flags incomplete multi-currency aging', async () => {
    const { service, overdueQueries } = makeService({
      baseCurrency: 'USD',
      openInvoices: [
        {
          id: 'inv-pkr',
          dueDate: new Date('2026-11-11T00:00:00.000Z'),
          currency: 'PKR',
          outstandingBalance: new Prisma.Decimal('27662.1400'),
        },
        {
          id: 'inv-eur',
          dueDate: new Date('2026-10-20T00:00:00.000Z'),
          currency: 'EUR',
          outstandingBalance: new Prisma.Decimal('250.0000'),
        },
      ],
      openBills: [],
    });

    const refDate = new Date('2026-11-11T18:30:00.000Z');
    const aging = await service.computeAgingReport('org-star', refDate);

    expect(overdueQueries.length).toBeGreaterThanOrEqual(2);
    const invUpdateArgs = (overdueQueries[0] as { args: { where: { dueDate: { lt: Date } } } }).args;
    expect(invUpdateArgs.where.dueDate.lt.toISOString()).toBe('2026-11-11T00:00:00.000Z');

    expect(aging.currency).toBe('USD');
    expect(aging.receivablesAging.isComplete).toBe(false);
    expect(aging.receivablesAging.missingCurrencies).toEqual(['EUR']);
    expect(aging.receivablesAging.buckets.find((b) => b.bucket === 'CURRENT')?.amount).toBe('100.0000');
    expect(aging.receivablesAging.buckets.find((b) => b.bucket === '1_TO_30_DAYS')?.count).toBe(1);
  });

  it('allows first save after extraction-only audit events but blocks duplicate document save by checksum or matching record on create', async () => {
    const checksum = 'a'.repeat(64);

    // 1. Extraction-only audit event must NOT block a legitimate first save
    const extractOnlyCtx = makeService({
      auditEvents: [
        {
          id: 'evt-extract',
          action: 'DOCUMENT_IMPORT_EXTRACTED',
          resourceId: 'wf-1',
          details: { fileChecksum: checksum },
        },
      ],
    });

    const firstSaved = await extractOnlyCtx.service.createInvoice(
      'org-star',
      {
        invoiceNumber: 'INV-DOC-001',
        customerName: 'Al-Madina Traders',
        issueDate: '2026-11-01T00:00:00.000Z',
        dueDate: '2026-11-30T00:00:00.000Z',
        currency: 'PKR',
        totalAmount: '25000.0000',
        sourceDocumentChecksum: checksum,
      },
      'user-1',
    );
    expect(firstSaved.invoiceNumber).toBe('INV-DOC-001');
    expect((extractOnlyCtx.auditLogs[0] as { details: Record<string, unknown> }).details.sourceDocumentChecksum).toBe(
      checksum,
    );

    // 2. Re-saving the same document checksum after an active invoice was created must throw ConflictException
    const savedDuplicateCtx = makeService({
      invoiceRecord: {
        id: 'inv-saved-1',
        invoiceNumber: 'INV-DOC-001',
        customerName: 'Al-Madina Traders',
        issueDate: new Date('2026-11-01T00:00:00.000Z'),
        totalAmount: new Prisma.Decimal('25000.0000'),
        status: InvoiceStatus.DRAFT,
        isArchived: false,
      },
      auditEvents: [
        {
          id: 'evt-saved-1',
          action: 'INVOICE_CREATED',
          resourceId: 'inv-saved-1',
          details: { sourceDocumentChecksum: checksum },
        },
      ],
    });

    await expect(
      savedDuplicateCtx.service.createInvoice(
        'org-star',
        {
          invoiceNumber: 'INV-DOC-001-ALT',
          customerName: 'Al-Madina Traders',
          issueDate: '2026-11-01T00:00:00.000Z',
          dueDate: '2026-11-30T00:00:00.000Z',
          currency: 'PKR',
          totalAmount: '25000.0000',
          sourceDocumentChecksum: checksum,
        },
        'user-1',
      ),
    ).rejects.toThrow(ConflictException);

    // 3. Re-saving a bill matching an active saved bill by checksum must also throw ConflictException
    const billDuplicateCtx = makeService({
      billRecord: {
        id: 'bill-saved-1',
        billNumber: 'BILL-DOC-99',
        supplierName: 'Zenith Cloud Corp',
        issueDate: new Date('2026-11-02T00:00:00.000Z'),
        totalAmount: new Prisma.Decimal('1150.0000'),
        status: BillStatus.OPEN,
        isArchived: false,
      },
      auditEvents: [
        {
          id: 'evt-bill-saved',
          action: 'SUPPLIER_BILL_CREATED',
          resourceId: 'bill-saved-1',
          details: { sourceDocumentChecksum: checksum },
        },
      ],
    });

    await expect(
      billDuplicateCtx.service.createBill(
        'org-star',
        {
          billNumber: 'BILL-DOC-99-ALT',
          supplierName: 'Zenith Cloud Corp',
          issueDate: '2026-11-02T00:00:00.000Z',
          dueDate: '2026-12-02T00:00:00.000Z',
          currency: 'USD',
          totalAmount: '1150.0000',
          sourceDocumentChecksum: checksum,
        },
        'user-1',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('reconciles DRAFT, UNPAID, PARTIALLY_PAID, and PAID summaries in Organization.baseCurrency while excluding DRAFT and PAID from active AR/AP aging', async () => {
    const refDate = new Date('2026-11-11T00:00:00.000Z');
    const { service } = makeService({
      baseCurrency: 'PKR',
      openInvoices: [
        {
          id: 'inv-draft',
          status: InvoiceStatus.DRAFT,
          dueDate: new Date('2026-11-18T00:00:00.000Z'),
          currency: 'PKR',
          totalAmount: new Prisma.Decimal('55000.0000'),
          paidAmount: new Prisma.Decimal('0.0000'),
          outstandingBalance: new Prisma.Decimal('55000.0000'),
        },
        {
          id: 'inv-issued',
          status: InvoiceStatus.ISSUED,
          dueDate: new Date('2026-11-20T00:00:00.000Z'),
          currency: 'PKR',
          totalAmount: new Prisma.Decimal('10000.0000'),
          paidAmount: new Prisma.Decimal('0.0000'),
          outstandingBalance: new Prisma.Decimal('10000.0000'),
        },
        {
          id: 'inv-partial',
          status: InvoiceStatus.PARTIALLY_PAID,
          dueDate: new Date('2026-11-05T00:00:00.000Z'),
          currency: 'PKR',
          totalAmount: new Prisma.Decimal('20000.0000'),
          paidAmount: new Prisma.Decimal('5000.0000'),
          outstandingBalance: new Prisma.Decimal('15000.0000'),
        },
        {
          id: 'inv-paid',
          status: InvoiceStatus.PAID,
          dueDate: new Date('2026-11-11T00:00:00.000Z'),
          currency: 'PKR',
          totalAmount: new Prisma.Decimal('399.9600'),
          paidAmount: new Prisma.Decimal('399.9600'),
          outstandingBalance: new Prisma.Decimal('0.0000'),
        },
      ],
      openBills: [
        {
          id: 'bill-draft',
          status: BillStatus.DRAFT,
          dueDate: new Date('2026-11-25T00:00:00.000Z'),
          currency: 'PKR',
          totalAmount: new Prisma.Decimal('12000.0000'),
          paidAmount: new Prisma.Decimal('0.0000'),
          outstandingBalance: new Prisma.Decimal('12000.0000'),
        },
        {
          id: 'bill-open',
          status: BillStatus.OPEN,
          dueDate: new Date('2026-11-25T00:00:00.000Z'),
          currency: 'PKR',
          totalAmount: new Prisma.Decimal('8000.0000'),
          paidAmount: new Prisma.Decimal('0.0000'),
          outstandingBalance: new Prisma.Decimal('8000.0000'),
        },
      ],
    });

    const aging = await service.computeAgingReport('org-star', refDate);

    // Aging excludes DRAFT and PAID: only inv-issued (10,000) + inv-partial (15,000) = 25,000 PKR
    expect(aging.currency).toBe('PKR');
    expect(aging.receivablesAging.totalOutstanding).toBe('25000.0000');
    expect(aging.receivablesAging.totalOverdue).toBe('15000.0000');
    expect(aging.receivablesAging.sourceRecordIds).toEqual(['inv-issued', 'inv-partial']);

    // Draft summary tracks inv-draft (55,000) separately from active AR
    expect(aging.receivablesSummary.draft).toEqual({
      count: 1,
      totalAmount: '55000.0000',
      recordIds: ['inv-draft'],
    });
    expect(aging.receivablesSummary.unpaid).toEqual({
      count: 1,
      totalAmount: '10000.0000',
      outstandingAmount: '10000.0000',
      recordIds: ['inv-issued'],
    });
    expect(aging.receivablesSummary.partiallyPaid).toEqual({
      count: 1,
      totalAmount: '20000.0000',
      paidAmount: '5000.0000',
      outstandingAmount: '15000.0000',
      recordIds: ['inv-partial'],
    });
    expect(aging.receivablesSummary.paid).toEqual({
      count: 1,
      totalAmount: '399.9600',
      paidAmount: '399.9600',
      recordIds: ['inv-paid'],
    });
    expect(aging.receivablesSummary.activeOutstandingTotal).toBe('25000.0000');

    // Bills: draft excluded from AP aging (only 8,000 active)
    expect(aging.payablesAging.totalOutstanding).toBe('8000.0000');
    expect(aging.payablesSummary.draft.count).toBe(1);
    expect(aging.payablesSummary.draft.totalAmount).toBe('12000.0000');
    expect(aging.payablesSummary.activeOutstandingTotal).toBe('8000.0000');
  });

  it('requires accountId on customer and supplier payments and rejects duplicate payment records', async () => {
    const baseInvoice = {
      id: 'inv-1',
      organizationId: 'org-1',
      invoiceNumber: 'INV-100',
      customerName: 'Customer A',
      category: 'Sales Revenue',
      department: null,
      issueDate: new Date('2026-11-01T00:00:00.000Z'),
      dueDate: new Date('2026-11-30T00:00:00.000Z'),
      currency: 'PKR',
      totalAmount: new Prisma.Decimal('10000.0000'),
      paidAmount: new Prisma.Decimal('0.0000'),
      outstandingBalance: new Prisma.Decimal('10000.0000'),
      status: InvoiceStatus.ISSUED,
    };
    const baseBill = {
      id: 'bill-1',
      organizationId: 'org-1',
      billNumber: 'BILL-100',
      supplierName: 'Supplier A',
      category: 'Operating Expense',
      department: null,
      issueDate: new Date('2026-11-01T00:00:00.000Z'),
      dueDate: new Date('2026-11-30T00:00:00.000Z'),
      currency: 'PKR',
      totalAmount: new Prisma.Decimal('8000.0000'),
      paidAmount: new Prisma.Decimal('0.0000'),
      outstandingBalance: new Prisma.Decimal('8000.0000'),
      status: BillStatus.OPEN,
    };

    const { service } = makeService({ invoiceRecord: baseInvoice, billRecord: baseBill });

    await expect(
      service.recordInvoicePayment(
        'org-1',
        'inv-1',
        { amount: '2000.0000', paymentDate: '2026-11-12T00:00:00.000Z', method: PaymentMethod.BANK_TRANSFER },
        'user-1',
      ),
    ).rejects.toThrow(/accountId.*required/i);

    await expect(
      service.recordBillPayment(
        'org-1',
        'bill-1',
        { amount: '2000.0000', paymentDate: '2026-11-12T00:00:00.000Z', method: PaymentMethod.BANK_TRANSFER },
        'user-1',
      ),
    ).rejects.toThrow(/accountId.*required/i);

    // Duplicate payment guard
    const dupPrisma = {
      invoice: { findFirst: async () => baseInvoice },
      bill: { findFirst: async () => baseBill },
      paymentRecord: { findFirst: async () => ({ id: 'existing-pay-1' }) },
      financialAccount: { findFirst: async () => ({ id: 'acc-1', currency: 'PKR', name: 'Bank', currentBalance: new Prisma.Decimal('50000') }) },
    };
    const dupService = new InvoicesPayablesService(dupPrisma as never, { record: async () => undefined } as never);
    await expect(
      dupService.recordInvoicePayment(
        'org-1',
        'inv-1',
        {
          amount: '2000.0000',
          paymentDate: '2026-11-12T00:00:00.000Z',
          accountId: 'acc-1',
          method: PaymentMethod.BANK_TRANSFER,
          reference: 'REF-1',
        },
        'user-1',
      ),
    ).rejects.toThrow(/Duplicate payment detected/i);
  });
});
