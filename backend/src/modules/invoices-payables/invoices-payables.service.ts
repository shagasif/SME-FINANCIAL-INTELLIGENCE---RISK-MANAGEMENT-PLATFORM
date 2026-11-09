import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillStatus,
  InvoiceStatus,
  PaymentMethod,
  Prisma,
  TransactionType,
} from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { SecurityUtil } from '../../common/utils/security.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateBillDto, CreateInvoiceDto, RecordPaymentDto } from './dto/invoices-payables.dto.js';

export interface AgingBucketSummary {
  bucket: 'CURRENT' | '1_TO_30_DAYS' | '31_TO_60_DAYS' | '61_TO_90_DAYS' | 'OVER_90_DAYS';
  count: number;
  amount: string;
  recordIds: string[];
}

@Injectable()
export class InvoicesPayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createInvoice(organizationId: string, dto: CreateInvoiceDto, actorUserId: string) {
    const total = DecimalMath.of(dto.totalAmount);
    if (total.lte(DecimalMath.ZERO)) {
      throw new BadRequestException('Invoice totalAmount must be strictly greater than zero');
    }

    const existing = await this.prisma.invoice.findUnique({
      where: {
        organizationId_invoiceNumber: {
          organizationId,
          invoiceNumber: dto.invoiceNumber.trim(),
        },
      },
    });
    if (existing) {
      throw new ConflictException(`Invoice number ${dto.invoiceNumber} already exists`);
    }

    const dueDate = new Date(dto.dueDate);
    const status = dueDate.getTime() < Date.now() ? InvoiceStatus.OVERDUE : InvoiceStatus.ISSUED;

    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId,
        invoiceNumber: dto.invoiceNumber.trim(),
        customerName: SecurityUtil.sanitizeImportedText(dto.customerName).sanitized,
        customerEmail: dto.customerEmail?.trim() ?? null,
        category: dto.category?.trim() ?? 'Sales Revenue',
        department: dto.department?.trim() ?? null,
        issueDate: new Date(dto.issueDate),
        dueDate,
        currency: (dto.currency ?? 'USD').toUpperCase(),
        totalAmount: total,
        paidAmount: DecimalMath.ZERO,
        outstandingBalance: total,
        status,
        notes: dto.notes ? SecurityUtil.sanitizeImportedText(dto.notes).sanitized : null,
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'INVOICE_CREATED',
      resourceType: 'INVOICE',
      resourceId: invoice.id,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: DecimalMath.toFixed4(invoice.totalAmount),
        dueDate: invoice.dueDate.toISOString(),
      },
    });

    return this.serializeInvoice(invoice);
  }

  async listInvoices(organizationId: string, status?: InvoiceStatus) {
    await this.refreshOverdueStatuses(organizationId);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        isArchived: false,
        ...(status ? { status } : {}),
      },
      include: { payments: true },
      orderBy: { dueDate: 'asc' },
    });
    return invoices.map((inv) => this.serializeInvoice(inv));
  }

  async recordInvoicePayment(
    organizationId: string,
    invoiceId: string,
    dto: RecordPaymentDto,
    actorUserId: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, isArchived: false },
    });
    if (!invoice) {
      throw new NotFoundException('Customer invoice not found in organization');
    }

    const paymentAmount = DecimalMath.of(dto.amount);
    if (paymentAmount.lte(DecimalMath.ZERO)) {
      throw new BadRequestException('Payment amount must be strictly greater than zero');
    }
    if (paymentAmount.gt(invoice.outstandingBalance)) {
      throw new BadRequestException(
        `Payment amount (${DecimalMath.toFixed4(paymentAmount)}) exceeds invoice outstanding balance (${DecimalMath.toFixed4(invoice.outstandingBalance)})`,
      );
    }

    const newPaid = DecimalMath.add(invoice.paidAmount, paymentAmount);
    const newOutstanding = DecimalMath.sub(invoice.totalAmount, newPaid);
    const newStatus = newOutstanding.isZero() ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

    const updated = await this.prisma.$transaction(async (tx) => {
      let linkedTxId: string | null = null;

      if (dto.accountId) {
        const account = await tx.financialAccount.findFirst({
          where: { id: dto.accountId, organizationId, isArchived: false },
        });
        if (!account) {
          throw new NotFoundException('Target financial account not found for payment posting');
        }
        const ledgerTx = await tx.financialTransaction.create({
          data: {
            organizationId,
            accountId: account.id,
            type: TransactionType.INCOME,
            amount: paymentAmount,
            currency: invoice.currency,
            transactionDate: new Date(dto.paymentDate),
            description: `Invoice Payment: ${invoice.invoiceNumber} (${invoice.customerName})`,
            category: invoice.category,
            department: invoice.department,
            counterparty: invoice.customerName,
            reference: dto.reference ?? invoice.invoiceNumber,
            createdByUserId: actorUserId,
          },
        });
        linkedTxId = ledgerTx.id;

        await tx.financialAccount.update({
          where: { id: account.id },
          data: {
            currentBalance: DecimalMath.add(account.currentBalance, paymentAmount),
          },
        });
      }

      await tx.paymentRecord.create({
        data: {
          organizationId,
          invoiceId: invoice.id,
          transactionId: linkedTxId,
          amount: paymentAmount,
          currency: invoice.currency,
          paymentDate: new Date(dto.paymentDate),
          method: dto.method ?? PaymentMethod.BANK_TRANSFER,
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          recordedById: actorUserId,
        },
      });

      return tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaid,
          outstandingBalance: newOutstanding,
          status: newStatus,
        },
        include: { payments: true },
      });
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'INVOICE_PAYMENT_RECORDED',
      resourceType: 'INVOICE',
      resourceId: invoice.id,
      details: {
        paymentAmount: DecimalMath.toFixed4(paymentAmount),
        outstandingBalance: DecimalMath.toFixed4(newOutstanding),
        status: newStatus,
      },
    });

    return this.serializeInvoice(updated);
  }

  async createBill(organizationId: string, dto: CreateBillDto, actorUserId: string) {
    const total = DecimalMath.of(dto.totalAmount);
    if (total.lte(DecimalMath.ZERO)) {
      throw new BadRequestException('Bill totalAmount must be strictly greater than zero');
    }

    const existing = await this.prisma.bill.findUnique({
      where: {
        organizationId_billNumber: {
          organizationId,
          billNumber: dto.billNumber.trim(),
        },
      },
    });
    if (existing) {
      throw new ConflictException(`Bill number ${dto.billNumber} already exists`);
    }

    const dueDate = new Date(dto.dueDate);
    const status = dueDate.getTime() < Date.now() ? BillStatus.OVERDUE : BillStatus.OPEN;

    const bill = await this.prisma.bill.create({
      data: {
        organizationId,
        billNumber: dto.billNumber.trim(),
        supplierName: SecurityUtil.sanitizeImportedText(dto.supplierName).sanitized,
        supplierEmail: dto.supplierEmail?.trim() ?? null,
        category: dto.category?.trim() ?? 'Operating Expense',
        department: dto.department?.trim() ?? null,
        issueDate: new Date(dto.issueDate),
        dueDate,
        currency: (dto.currency ?? 'USD').toUpperCase(),
        totalAmount: total,
        paidAmount: DecimalMath.ZERO,
        outstandingBalance: total,
        status,
        notes: dto.notes ? SecurityUtil.sanitizeImportedText(dto.notes).sanitized : null,
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'SUPPLIER_BILL_CREATED',
      resourceType: 'BILL',
      resourceId: bill.id,
      details: {
        billNumber: bill.billNumber,
        totalAmount: DecimalMath.toFixed4(bill.totalAmount),
        dueDate: bill.dueDate.toISOString(),
      },
    });

    return this.serializeBill(bill);
  }

  async listBills(organizationId: string, status?: BillStatus) {
    await this.refreshOverdueStatuses(organizationId);
    const bills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        isArchived: false,
        ...(status ? { status } : {}),
      },
      include: { payments: true },
      orderBy: { dueDate: 'asc' },
    });
    return bills.map((b) => this.serializeBill(b));
  }

  async recordBillPayment(
    organizationId: string,
    billId: string,
    dto: RecordPaymentDto,
    actorUserId: string,
  ) {
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, organizationId, isArchived: false },
    });
    if (!bill) {
      throw new NotFoundException('Supplier bill not found in organization');
    }

    const paymentAmount = DecimalMath.of(dto.amount);
    if (paymentAmount.lte(DecimalMath.ZERO)) {
      throw new BadRequestException('Payment amount must be strictly greater than zero');
    }
    if (paymentAmount.gt(bill.outstandingBalance)) {
      throw new BadRequestException(
        `Payment amount (${DecimalMath.toFixed4(paymentAmount)}) exceeds bill outstanding balance (${DecimalMath.toFixed4(bill.outstandingBalance)})`,
      );
    }

    const newPaid = DecimalMath.add(bill.paidAmount, paymentAmount);
    const newOutstanding = DecimalMath.sub(bill.totalAmount, newPaid);
    const newStatus = newOutstanding.isZero() ? BillStatus.PAID : BillStatus.PARTIALLY_PAID;

    const updated = await this.prisma.$transaction(async (tx) => {
      let linkedTxId: string | null = null;

      if (dto.accountId) {
        const account = await tx.financialAccount.findFirst({
          where: { id: dto.accountId, organizationId, isArchived: false },
        });
        if (!account) {
          throw new NotFoundException(
            'Target financial account not found for bill payment posting',
          );
        }
        const ledgerTx = await tx.financialTransaction.create({
          data: {
            organizationId,
            accountId: account.id,
            type: TransactionType.EXPENSE,
            amount: paymentAmount,
            currency: bill.currency,
            transactionDate: new Date(dto.paymentDate),
            description: `Supplier Bill Payment: ${bill.billNumber} (${bill.supplierName})`,
            category: bill.category,
            department: bill.department,
            counterparty: bill.supplierName,
            reference: dto.reference ?? bill.billNumber,
            createdByUserId: actorUserId,
          },
        });
        linkedTxId = ledgerTx.id;

        await tx.financialAccount.update({
          where: { id: account.id },
          data: {
            currentBalance: DecimalMath.sub(account.currentBalance, paymentAmount),
          },
        });
      }

      await tx.paymentRecord.create({
        data: {
          organizationId,
          billId: bill.id,
          transactionId: linkedTxId,
          amount: paymentAmount,
          currency: bill.currency,
          paymentDate: new Date(dto.paymentDate),
          method: dto.method ?? PaymentMethod.BANK_TRANSFER,
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          recordedById: actorUserId,
        },
      });

      return tx.bill.update({
        where: { id: bill.id },
        data: {
          paidAmount: newPaid,
          outstandingBalance: newOutstanding,
          status: newStatus,
        },
        include: { payments: true },
      });
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'SUPPLIER_BILL_PAYMENT_RECORDED',
      resourceType: 'BILL',
      resourceId: bill.id,
      details: {
        paymentAmount: DecimalMath.toFixed4(paymentAmount),
        outstandingBalance: DecimalMath.toFixed4(newOutstanding),
        status: newStatus,
      },
    });

    return this.serializeBill(updated);
  }

  async refreshOverdueStatuses(organizationId: string, referenceDate = new Date()) {
    await Promise.all([
      this.prisma.invoice.updateMany({
        where: {
          organizationId,
          isArchived: false,
          outstandingBalance: { gt: 0 },
          dueDate: { lt: referenceDate },
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] },
        },
        data: { status: InvoiceStatus.OVERDUE },
      }),
      this.prisma.bill.updateMany({
        where: {
          organizationId,
          isArchived: false,
          outstandingBalance: { gt: 0 },
          dueDate: { lt: referenceDate },
          status: { in: [BillStatus.OPEN, BillStatus.PARTIALLY_PAID] },
        },
        data: { status: BillStatus.OVERDUE },
      }),
    ]);
  }

  async computeAgingReport(organizationId: string, asOfDate = new Date()) {
    await this.refreshOverdueStatuses(organizationId, asOfDate);

    const [openInvoices, openBills, org] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          isArchived: false,
          outstandingBalance: { gt: 0 },
          status: { not: InvoiceStatus.VOID },
        },
      }),
      this.prisma.bill.findMany({
        where: {
          organizationId,
          isArchived: false,
          outstandingBalance: { gt: 0 },
          status: { not: BillStatus.VOID },
        },
      }),
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
    ]);

    const buildBuckets = (
      records: Array<{ id: string; dueDate: Date; outstandingBalance: Prisma.Decimal }>,
    ) => {
      const map: Record<
        AgingBucketSummary['bucket'],
        { count: number; amount: Prisma.Decimal; recordIds: string[] }
      > = {
        CURRENT: { count: 0, amount: DecimalMath.ZERO, recordIds: [] },
        '1_TO_30_DAYS': { count: 0, amount: DecimalMath.ZERO, recordIds: [] },
        '31_TO_60_DAYS': { count: 0, amount: DecimalMath.ZERO, recordIds: [] },
        '61_TO_90_DAYS': { count: 0, amount: DecimalMath.ZERO, recordIds: [] },
        OVER_90_DAYS: { count: 0, amount: DecimalMath.ZERO, recordIds: [] },
      };

      for (const r of records) {
        const diffDays = Math.floor(
          (asOfDate.getTime() - r.dueDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        const key: AgingBucketSummary['bucket'] =
          diffDays <= 0
            ? 'CURRENT'
            : diffDays <= 30
              ? '1_TO_30_DAYS'
              : diffDays <= 60
                ? '31_TO_60_DAYS'
                : diffDays <= 90
                  ? '61_TO_90_DAYS'
                  : 'OVER_90_DAYS';

        map[key].count += 1;
        map[key].amount = DecimalMath.add(map[key].amount, r.outstandingBalance);
        map[key].recordIds.push(r.id);
      }

      const buckets: AgingBucketSummary[] = Object.entries(map).map(([bucket, val]) => ({
        bucket: bucket as AgingBucketSummary['bucket'],
        count: val.count,
        amount: DecimalMath.toFixed4(val.amount),
        recordIds: val.recordIds,
      }));

      const totalOutstanding = DecimalMath.sum(records.map((r) => r.outstandingBalance));
      const totalOverdue = DecimalMath.sub(totalOutstanding, map.CURRENT.amount);

      return {
        totalOutstanding: DecimalMath.toFixed4(totalOutstanding),
        totalOverdue: DecimalMath.toFixed4(totalOverdue),
        buckets,
        sourceRecordIds: records.map((r) => r.id),
      };
    };

    return {
      asOfDate: asOfDate.toISOString(),
      currency: org?.baseCurrency ?? 'USD',
      receivablesAging: buildBuckets(openInvoices),
      payablesAging: buildBuckets(openBills),
    };
  }

  private serializeInvoice(invoice: {
    id: string;
    organizationId: string;
    invoiceNumber: string;
    customerName: string;
    customerEmail: string | null;
    category: string;
    department: string | null;
    issueDate: Date;
    dueDate: Date;
    currency: string;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    outstandingBalance: Prisma.Decimal;
    status: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    payments?: Array<{
      id: string;
      amount: Prisma.Decimal;
      paymentDate: Date;
      method: string;
      reference: string | null;
    }>;
  }) {
    return {
      ...invoice,
      totalAmount: DecimalMath.toFixed4(invoice.totalAmount),
      paidAmount: DecimalMath.toFixed4(invoice.paidAmount),
      outstandingBalance: DecimalMath.toFixed4(invoice.outstandingBalance),
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      payments: invoice.payments?.map((p) => ({
        ...p,
        amount: DecimalMath.toFixed4(p.amount),
        paymentDate: p.paymentDate.toISOString(),
      })),
    };
  }

  private serializeBill(bill: {
    id: string;
    organizationId: string;
    billNumber: string;
    supplierName: string;
    supplierEmail: string | null;
    category: string;
    department: string | null;
    issueDate: Date;
    dueDate: Date;
    currency: string;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    outstandingBalance: Prisma.Decimal;
    status: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    payments?: Array<{
      id: string;
      amount: Prisma.Decimal;
      paymentDate: Date;
      method: string;
      reference: string | null;
    }>;
  }) {
    return {
      ...bill,
      totalAmount: DecimalMath.toFixed4(bill.totalAmount),
      paidAmount: DecimalMath.toFixed4(bill.paidAmount),
      outstandingBalance: DecimalMath.toFixed4(bill.outstandingBalance),
      issueDate: bill.issueDate.toISOString(),
      dueDate: bill.dueDate.toISOString(),
      payments: bill.payments?.map((p) => ({
        ...p,
        amount: DecimalMath.toFixed4(p.amount),
        paymentDate: p.paymentDate.toISOString(),
      })),
    };
  }
}
