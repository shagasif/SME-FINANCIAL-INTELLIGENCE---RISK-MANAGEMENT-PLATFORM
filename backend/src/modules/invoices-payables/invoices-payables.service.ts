import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
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
import { CurrencyConversionService } from '../currency/currency.service.js';
import {
  CreateBillDto,
  CreateInvoiceDto,
  LineItemDto,
  RecordPaymentDto,
  UpdateBillDto,
  UpdateInvoiceDto,
  VoidDocumentDto,
} from './dto/invoices-payables.dto.js';

export interface AgingBucketSummary {
  bucket: 'CURRENT' | '1_TO_30_DAYS' | '31_TO_60_DAYS' | '61_TO_90_DAYS' | 'OVER_90_DAYS';
  count: number;
  amount: string;
  recordIds: string[];
}

export interface DocumentStatusBreakdown {
  draft: { count: number; totalAmount: string; recordIds: string[] };
  unpaid: { count: number; totalAmount: string; outstandingAmount: string; recordIds: string[] };
  partiallyPaid: {
    count: number;
    totalAmount: string;
    paidAmount: string;
    outstandingAmount: string;
    recordIds: string[];
  };
  paid: { count: number; totalAmount: string; paidAmount: string; recordIds: string[] };
  activeOutstandingTotal: string;
  isComplete: boolean;
  missingCurrencies: string[];
}

interface ComputedLineItem {
  lineOrder: number;
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

interface ComputedTotals {
  subtotalAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  lineItems: ComputedLineItem[];
}

@Injectable()
export class InvoicesPayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly currencyService?: CurrencyConversionService,
  ) {}

  private startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  }

  private endOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
    );
  }

  private isPastDue(dueDate: Date, referenceDate = new Date()): boolean {
    return this.endOfUtcDay(dueDate).getTime() < referenceDate.getTime();
  }

  private validateIssueAndDueDates(issueDate: Date, dueDate: Date): void {
    if (Number.isNaN(issueDate.getTime()) || Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('Invalid issueDate or dueDate');
    }
    if (this.startOfUtcDay(dueDate).getTime() < this.startOfUtcDay(issueDate).getTime()) {
      throw new BadRequestException('Due date cannot be earlier than issue date');
    }
  }

  private validateTaxRate(rawRate?: string): Prisma.Decimal {
    if (rawRate === undefined || rawRate.trim() === '') {
      return DecimalMath.ZERO;
    }
    const rate = DecimalMath.of(rawRate);
    if (rate.lt(DecimalMath.ZERO) || rate.gt(DecimalMath.HUNDRED)) {
      throw new BadRequestException('taxRate must be between 0 and 100');
    }
    return rate.toDecimalPlaces(4);
  }

  private computeDocumentTotals(params: {
    totalAmount?: string;
    taxRate?: string;
    lineItems?: LineItemDto[];
  }): ComputedTotals {
    const headerTaxRate = this.validateTaxRate(params.taxRate);

    if (params.lineItems && params.lineItems.length > 0) {
      const computedLines: ComputedLineItem[] = [];
      let subtotalSum = DecimalMath.ZERO;
      let taxSum = DecimalMath.ZERO;

      params.lineItems.forEach((item, index) => {
        const cleanDesc = SecurityUtil.sanitizeImportedText(item.description).sanitized.trim();
        if (!cleanDesc) {
          throw new BadRequestException(`Line item ${index + 1} description cannot be empty`);
        }
        const qty = DecimalMath.of(item.quantity);
        if (qty.lte(DecimalMath.ZERO)) {
          throw new BadRequestException(`Line item ${index + 1} quantity must be greater than zero`);
        }
        const unitPrice = DecimalMath.of(item.unitPrice);
        if (unitPrice.lt(DecimalMath.ZERO)) {
          throw new BadRequestException(`Line item ${index + 1} unitPrice cannot be negative`);
        }
        const lineTaxRate =
          item.taxRate !== undefined ? this.validateTaxRate(item.taxRate) : headerTaxRate;

        const lineSubtotal = qty.mul(unitPrice).toDecimalPlaces(4);
        const taxAmount = lineSubtotal
          .mul(lineTaxRate)
          .div(DecimalMath.HUNDRED)
          .toDecimalPlaces(4);
        const lineTotal = DecimalMath.add(lineSubtotal, taxAmount);

        subtotalSum = DecimalMath.add(subtotalSum, lineSubtotal);
        taxSum = DecimalMath.add(taxSum, taxAmount);

        computedLines.push({
          lineOrder: index,
          description: cleanDesc,
          quantity: qty.toDecimalPlaces(4),
          unitPrice: unitPrice.toDecimalPlaces(4),
          taxRate: lineTaxRate,
          taxAmount,
          lineSubtotal,
          lineTotal,
        });
      });

      const totalAmount = DecimalMath.add(subtotalSum, taxSum);
      if (totalAmount.lte(DecimalMath.ZERO)) {
        throw new BadRequestException('Total amount across line items must be strictly greater than zero');
      }

      const effectiveHeaderRate =
        params.taxRate !== undefined
          ? headerTaxRate
          : subtotalSum.gt(DecimalMath.ZERO)
            ? taxSum.div(subtotalSum).mul(DecimalMath.HUNDRED).toDecimalPlaces(4)
            : DecimalMath.ZERO;

      return {
        subtotalAmount: subtotalSum,
        taxRate: effectiveHeaderRate,
        taxAmount: taxSum,
        totalAmount,
        lineItems: computedLines,
      };
    }

    if (!params.totalAmount) {
      throw new BadRequestException('Either totalAmount or at least one line item must be provided');
    }

    const total = DecimalMath.of(params.totalAmount).toDecimalPlaces(4);
    if (total.lte(DecimalMath.ZERO)) {
      throw new BadRequestException('Document totalAmount must be strictly greater than zero');
    }

    if (headerTaxRate.gt(DecimalMath.ZERO)) {
      const divisor = DecimalMath.ONE.add(headerTaxRate.div(DecimalMath.HUNDRED));
      const subtotal = total.div(divisor).toDecimalPlaces(4);
      const taxAmount = DecimalMath.sub(total, subtotal);
      return {
        subtotalAmount: subtotal,
        taxRate: headerTaxRate,
        taxAmount,
        totalAmount: total,
        lineItems: [],
      };
    }

    return {
      subtotalAmount: total,
      taxRate: DecimalMath.ZERO,
      taxAmount: DecimalMath.ZERO,
      totalAmount: total,
      lineItems: [],
    };
  }

  private async resolveDocumentCurrency(
    organizationId: string,
    requestedCurrency?: string,
  ): Promise<string> {
    if (requestedCurrency && requestedCurrency.trim().length > 0) {
      return requestedCurrency.trim().toUpperCase();
    }
    if (this.currencyService) {
      return this.currencyService.getOrganizationBaseCurrency(organizationId);
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    return (org?.baseCurrency ?? 'USD').trim().toUpperCase();
  }

  private async resolveAccountSettlementAmount(params: {
    organizationId: string;
    accountCurrency: string;
    accountName: string;
    documentCurrency: string;
    paymentAmount: Prisma.Decimal;
    paymentDate: Date;
  }): Promise<{ ledgerAmount: Prisma.Decimal; ledgerCurrency: string; fxNote: string | null }> {
    const accountCurr = params.accountCurrency.trim().toUpperCase();
    const docCurr = params.documentCurrency.trim().toUpperCase();

    if (accountCurr === docCurr) {
      return { ledgerAmount: params.paymentAmount, ledgerCurrency: docCurr, fxNote: null };
    }

    if (!this.currencyService) {
      throw new BadRequestException(
        `Cannot post ${docCurr} settlement to ${accountCurr} account "${params.accountName}": currency conversion service is unavailable. Select a ${docCurr} account.`,
      );
    }

    const rates = await this.currencyService.loadRatesForOrganization(params.organizationId);
    const conv = this.currencyService.convertAmountSync({
      rates,
      organizationId: params.organizationId,
      amount: params.paymentAmount,
      fromCurrency: docCurr,
      toCurrency: accountCurr,
      asOfDate: params.paymentDate,
    });

    if (!conv.isConverted || conv.convertedAmount === null) {
      throw new BadRequestException(
        `Cannot post ${docCurr} settlement to ${accountCurr} account "${params.accountName}": missing exchange rate (${docCurr} -> ${accountCurr} as of ${params.paymentDate.toISOString().slice(0, 10)}). Add an exchange rate or settle to a ${docCurr} account.`,
      );
    }

    return {
      ledgerAmount: conv.convertedAmount,
      ledgerCurrency: accountCurr,
      fxNote: `Converted ${DecimalMath.toFixed4(params.paymentAmount)} ${docCurr} -> ${DecimalMath.toFixed4(conv.convertedAmount)} ${accountCurr} (${conv.rateInfo?.source ?? 'FX'})`,
    };
  }

  private async verifyDocumentImportSaveDuplicates(params: {
    organizationId: string;
    kind: 'INVOICE' | 'BILL';
    counterpartyName: string;
    issueDate: Date;
    totalAmount: Prisma.Decimal;
    sourceDocumentChecksum?: string;
  }): Promise<void> {
    const cleanChecksum = params.sourceDocumentChecksum?.trim();
    if (!cleanChecksum) {
      return;
    }

    const createdAction =
      params.kind === 'INVOICE' ? 'INVOICE_CREATED' : 'SUPPLIER_BILL_CREATED';

    if (this.prisma.auditEvent?.findMany) {
      const createdEvents = await this.prisma.auditEvent.findMany({
        where: {
          organizationId: params.organizationId,
          action: createdAction,
        },
        orderBy: { createdAt: 'desc' },
        take: 250,
      });

      const matchingResourceIds = createdEvents
        .filter((evt) => {
          const details = (evt.details ?? {}) as Record<string, unknown>;
          return details.sourceDocumentChecksum === cleanChecksum && Boolean(evt.resourceId);
        })
        .map((evt) => evt.resourceId as string);

      if (matchingResourceIds.length > 0) {
        if (params.kind === 'INVOICE') {
          const existingSaved = await this.prisma.invoice.findFirst({
            where: {
              organizationId: params.organizationId,
              id: { in: matchingResourceIds },
              isArchived: false,
              status: { not: InvoiceStatus.VOID },
            },
          });
          if (existingSaved) {
            throw new ConflictException(
              `Duplicate document: this file was already saved as customer invoice "${existingSaved.invoiceNumber}".`,
            );
          }
        } else {
          const existingSaved = await this.prisma.bill.findFirst({
            where: {
              organizationId: params.organizationId,
              id: { in: matchingResourceIds },
              isArchived: false,
              status: { not: BillStatus.VOID },
            },
          });
          if (existingSaved) {
            throw new ConflictException(
              `Duplicate document: this file was already saved as supplier bill "${existingSaved.billNumber}".`,
            );
          }
        }
      }
    }

    const dayStart = this.startOfUtcDay(params.issueDate);
    const dayEnd = this.endOfUtcDay(params.issueDate);
    const cleanParty = SecurityUtil.sanitizeImportedText(params.counterpartyName).sanitized;

    if (params.kind === 'INVOICE') {
      const similar = await this.prisma.invoice.findFirst({
        where: {
          organizationId: params.organizationId,
          isArchived: false,
          status: { not: InvoiceStatus.VOID },
          customerName: { equals: cleanParty, mode: 'insensitive' },
          totalAmount: params.totalAmount,
          issueDate: { gte: dayStart, lte: dayEnd },
        },
      });
      if (similar) {
        throw new ConflictException(
          `Duplicate customer invoice detected: active invoice "${similar.invoiceNumber}" already exists for ${similar.customerName} on ${similar.issueDate.toISOString().slice(0, 10)} totaling ${DecimalMath.toFixed4(similar.totalAmount)}.`,
        );
      }
    } else {
      const similar = await this.prisma.bill.findFirst({
        where: {
          organizationId: params.organizationId,
          isArchived: false,
          status: { not: BillStatus.VOID },
          supplierName: { equals: cleanParty, mode: 'insensitive' },
          totalAmount: params.totalAmount,
          issueDate: { gte: dayStart, lte: dayEnd },
        },
      });
      if (similar) {
        throw new ConflictException(
          `Duplicate supplier bill detected: active bill "${similar.billNumber}" already exists for ${similar.supplierName} on ${similar.issueDate.toISOString().slice(0, 10)} totaling ${DecimalMath.toFixed4(similar.totalAmount)}.`,
        );
      }
    }
  }

  async createInvoice(organizationId: string, dto: CreateInvoiceDto, actorUserId: string) {
    const issueDate = new Date(dto.issueDate);
    const dueDate = new Date(dto.dueDate);
    this.validateIssueAndDueDates(issueDate, dueDate);

    const totals = this.computeDocumentTotals({
      totalAmount: dto.totalAmount,
      taxRate: dto.taxRate,
      lineItems: dto.lineItems,
    });

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

    await this.verifyDocumentImportSaveDuplicates({
      organizationId,
      kind: 'INVOICE',
      counterpartyName: dto.customerName,
      issueDate,
      totalAmount: totals.totalAmount,
      sourceDocumentChecksum: dto.sourceDocumentChecksum,
    });

    const currency = await this.resolveDocumentCurrency(organizationId, dto.currency);
    const requestedStatus = dto.status ?? InvoiceStatus.ISSUED;
    const status =
      requestedStatus === InvoiceStatus.DRAFT
        ? InvoiceStatus.DRAFT
        : this.isPastDue(dueDate)
          ? InvoiceStatus.OVERDUE
          : InvoiceStatus.ISSUED;

    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId,
        invoiceNumber: dto.invoiceNumber.trim(),
        customerName: SecurityUtil.toTitleCasePartyName(dto.customerName),
        customerEmail: dto.customerEmail?.trim() ?? null,
        category: dto.category?.trim() || 'Sales Revenue',
        department: dto.department?.trim() || null,
        issueDate,
        dueDate,
        currency,
        subtotalAmount: totals.subtotalAmount,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        paidAmount: DecimalMath.ZERO,
        outstandingBalance: totals.totalAmount,
        status,
        notes: dto.notes ? SecurityUtil.sanitizeImportedText(dto.notes).sanitized : null,
        ...(totals.lineItems.length > 0
          ? {
              lineItems: {
                create: totals.lineItems,
              },
            }
          : {}),
      },
      include: {
        lineItems: { orderBy: { lineOrder: 'asc' } },
        payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
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
        currency,
        status,
        totalAmount: DecimalMath.toFixed4(invoice.totalAmount),
        lineItemCount: totals.lineItems.length,
        dueDate: invoice.dueDate.toISOString(),
        ...(dto.sourceDocumentChecksum?.trim()
          ? { sourceDocumentChecksum: dto.sourceDocumentChecksum.trim() }
          : {}),
      },
    });

    return this.serializeInvoice(invoice);
  }

  async listInvoices(organizationId: string, status?: InvoiceStatus, search?: string) {
    await this.refreshOverdueStatuses(organizationId);
    const trimmedSearch = search?.trim();
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        isArchived: false,
        ...(status ? { status } : {}),
        ...(trimmedSearch
          ? {
              OR: [
                { invoiceNumber: { contains: trimmedSearch, mode: 'insensitive' } },
                { customerName: { contains: trimmedSearch, mode: 'insensitive' } },
                { category: { contains: trimmedSearch, mode: 'insensitive' } },
                { department: { contains: trimmedSearch, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        lineItems: { orderBy: { lineOrder: 'asc' } },
        payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
      },
      orderBy: { dueDate: 'asc' },
    });
    return invoices.map((inv) => this.serializeInvoice(inv));
  }

  async getInvoiceById(organizationId: string, invoiceId: string) {
    await this.refreshOverdueStatuses(organizationId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, isArchived: false },
      include: {
        lineItems: { orderBy: { lineOrder: 'asc' } },
        payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Customer invoice not found in organization');
    }
    return this.serializeInvoice(invoice);
  }

  async updateInvoice(
    organizationId: string,
    invoiceId: string,
    dto: UpdateInvoiceDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, isArchived: false },
      include: { lineItems: true },
    });
    if (!existing) {
      throw new NotFoundException('Customer invoice not found in organization');
    }
    if (existing.status === InvoiceStatus.VOID || existing.status === InvoiceStatus.PAID) {
      throw new BadRequestException(`Cannot edit a ${existing.status} invoice`);
    }

    const hasPayments = existing.paidAmount.gt(DecimalMath.ZERO);
    if (
      hasPayments &&
      (dto.currency !== undefined ||
        dto.totalAmount !== undefined ||
        dto.taxRate !== undefined ||
        dto.lineItems !== undefined)
    ) {
      throw new BadRequestException(
        'Cannot change currency, total amount, tax rate, or line items after payments have been recorded',
      );
    }

    const nextIssueDate = dto.issueDate ? new Date(dto.issueDate) : existing.issueDate;
    const nextDueDate = dto.dueDate ? new Date(dto.dueDate) : existing.dueDate;
    this.validateIssueAndDueDates(nextIssueDate, nextDueDate);

    if (dto.invoiceNumber && dto.invoiceNumber.trim() !== existing.invoiceNumber) {
      const conflict = await this.prisma.invoice.findUnique({
        where: {
          organizationId_invoiceNumber: {
            organizationId,
            invoiceNumber: dto.invoiceNumber.trim(),
          },
        },
      });
      if (conflict) {
        throw new ConflictException(`Invoice number ${dto.invoiceNumber} already exists`);
      }
    }

    let totalsUpdate: ComputedTotals | null = null;
    if (!hasPayments && (dto.lineItems !== undefined || dto.totalAmount !== undefined || dto.taxRate !== undefined)) {
      if (dto.lineItems !== undefined) {
        totalsUpdate = this.computeDocumentTotals({
          totalAmount: dto.totalAmount,
          taxRate: dto.taxRate,
          lineItems: dto.lineItems,
        });
      } else if (existing.lineItems.length > 0 && dto.totalAmount === undefined && dto.taxRate !== undefined) {
        totalsUpdate = this.computeDocumentTotals({
          taxRate: dto.taxRate,
          lineItems: existing.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity.toFixed(4),
            unitPrice: li.unitPrice.toFixed(4),
          })),
        });
      } else {
        totalsUpdate = this.computeDocumentTotals({
          totalAmount: dto.totalAmount ?? existing.totalAmount.toFixed(4),
          taxRate: dto.taxRate ?? existing.taxRate.toFixed(4),
        });
      }
    }

    let nextStatus = existing.status;
    if (dto.status === InvoiceStatus.ISSUED) {
      if (existing.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT invoices can transition to ISSUED');
      }
      nextStatus = this.isPastDue(nextDueDate) ? InvoiceStatus.OVERDUE : InvoiceStatus.ISSUED;
    } else if (existing.status !== InvoiceStatus.DRAFT && dto.dueDate) {
      if (this.isPastDue(nextDueDate)) {
        nextStatus = InvoiceStatus.OVERDUE;
      } else if (existing.status === InvoiceStatus.OVERDUE) {
        nextStatus = hasPayments ? InvoiceStatus.PARTIALLY_PAID : InvoiceStatus.ISSUED;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (totalsUpdate && dto.lineItems !== undefined) {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: existing.id } });
        if (totalsUpdate.lineItems.length > 0) {
          await tx.invoiceLineItem.createMany({
            data: totalsUpdate.lineItems.map((li) => ({ ...li, invoiceId: existing.id })),
          });
        }
      }

      return tx.invoice.update({
        where: { id: existing.id },
        data: {
          ...(dto.invoiceNumber ? { invoiceNumber: dto.invoiceNumber.trim() } : {}),
          ...(dto.customerName
            ? { customerName: SecurityUtil.toTitleCasePartyName(dto.customerName) }
            : {}),
          ...(dto.customerEmail !== undefined
            ? { customerEmail: dto.customerEmail.trim() || null }
            : {}),
          ...(dto.category !== undefined ? { category: dto.category.trim() || 'Sales Revenue' } : {}),
          ...(dto.department !== undefined ? { department: dto.department.trim() || null } : {}),
          issueDate: nextIssueDate,
          dueDate: nextDueDate,
          ...(dto.currency ? { currency: dto.currency.trim().toUpperCase() } : {}),
          ...(totalsUpdate
            ? {
                subtotalAmount: totalsUpdate.subtotalAmount,
                taxRate: totalsUpdate.taxRate,
                taxAmount: totalsUpdate.taxAmount,
                totalAmount: totalsUpdate.totalAmount,
                outstandingBalance: totalsUpdate.totalAmount,
              }
            : {}),
          status: nextStatus,
          ...(dto.notes !== undefined
            ? {
                notes: dto.notes ? SecurityUtil.sanitizeImportedText(dto.notes).sanitized : null,
              }
            : {}),
        },
        include: {
          lineItems: { orderBy: { lineOrder: 'asc' } },
          payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
        },
      });
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action:
        existing.status === InvoiceStatus.DRAFT && nextStatus !== InvoiceStatus.DRAFT
          ? 'INVOICE_ISSUED'
          : 'INVOICE_UPDATED',
      resourceType: 'INVOICE',
      resourceId: existing.id,
      details: {
        previousStatus: existing.status,
        newStatus: nextStatus,
        dueDate: nextDueDate.toISOString(),
        totalAmount: DecimalMath.toFixed4(updated.totalAmount),
      },
    });

    return this.serializeInvoice(updated);
  }

  async voidInvoice(
    organizationId: string,
    invoiceId: string,
    dto: VoidDocumentDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, isArchived: false },
    });
    if (!existing) {
      throw new NotFoundException('Customer invoice not found in organization');
    }
    if (existing.status === InvoiceStatus.VOID) {
      throw new BadRequestException(`Invoice ${existing.invoiceNumber} is already void`);
    }
    if (existing.status === InvoiceStatus.PAID || existing.paidAmount.gt(DecimalMath.ZERO)) {
      throw new BadRequestException(
        'Cannot void an invoice with recorded payments. Only unpaid invoices can be voided.',
      );
    }

    const cleanReason = dto.reason
      ? SecurityUtil.sanitizeImportedText(dto.reason).sanitized.trim()
      : null;
    const voidedNotes = cleanReason
      ? existing.notes
        ? `${existing.notes} | [VOID: ${cleanReason}]`
        : `[VOID: ${cleanReason}]`
      : existing.notes;

    const updated = await this.prisma.invoice.update({
      where: { id: existing.id },
      data: {
        status: InvoiceStatus.VOID,
        outstandingBalance: DecimalMath.ZERO,
        notes: voidedNotes,
      },
      include: {
        lineItems: { orderBy: { lineOrder: 'asc' } },
        payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'INVOICE_VOIDED',
      resourceType: 'INVOICE',
      resourceId: existing.id,
      details: {
        invoiceNumber: existing.invoiceNumber,
        previousStatus: existing.status,
        voidedAmount: DecimalMath.toFixed4(existing.totalAmount),
        reason: cleanReason,
      },
    });

    return this.serializeInvoice(updated);
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

    if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestException(`Cannot record payment against a ${invoice.status} invoice`);
    }
    if (invoice.status === InvoiceStatus.PAID || DecimalMath.of(invoice.outstandingBalance).lte(DecimalMath.ZERO)) {
      throw new BadRequestException(`Invoice ${invoice.invoiceNumber} is already paid in full`);
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

    const paymentDate = new Date(dto.paymentDate);
    let resolvedAccount: {
      id: string;
      ledgerAmount: Prisma.Decimal;
      ledgerCurrency: string;
      fxNote: string | null;
      currentBalance: Prisma.Decimal;
    } | null = null;

    if (dto.accountId) {
      const account = await this.prisma.financialAccount.findFirst({
        where: { id: dto.accountId, organizationId, isArchived: false },
      });
      if (!account) {
        throw new NotFoundException('Target financial account not found for payment posting');
      }
      const conversion = await this.resolveAccountSettlementAmount({
        organizationId,
        accountCurrency: account.currency,
        accountName: account.name,
        documentCurrency: invoice.currency,
        paymentAmount,
        paymentDate,
      });
      resolvedAccount = {
        id: account.id,
        currentBalance: account.currentBalance,
        ...conversion,
      };
    }

    const newPaid = DecimalMath.add(invoice.paidAmount, paymentAmount);
    const newOutstanding = DecimalMath.sub(invoice.totalAmount, newPaid);
    const newStatus = newOutstanding.isZero()
      ? InvoiceStatus.PAID
      : this.isPastDue(invoice.dueDate)
        ? InvoiceStatus.OVERDUE
        : InvoiceStatus.PARTIALLY_PAID;

    const updated = await this.prisma.$transaction(async (tx) => {
      let linkedTxId: string | null = null;

      if (resolvedAccount) {
        const ledgerTx = await tx.financialTransaction.create({
          data: {
            organizationId,
            accountId: resolvedAccount.id,
            type: TransactionType.INCOME,
            amount: resolvedAccount.ledgerAmount,
            currency: resolvedAccount.ledgerCurrency,
            transactionDate: paymentDate,
            description: resolvedAccount.fxNote
              ? `Invoice Payment: ${invoice.invoiceNumber} (${invoice.customerName}) [${resolvedAccount.fxNote}]`
              : `Invoice Payment: ${invoice.invoiceNumber} (${invoice.customerName})`,
            category: invoice.category,
            department: invoice.department,
            counterparty: invoice.customerName,
            reference: dto.reference ?? invoice.invoiceNumber,
            createdByUserId: actorUserId,
          },
        });
        linkedTxId = ledgerTx.id;

        await tx.financialAccount.update({
          where: { id: resolvedAccount.id },
          data: {
            currentBalance: DecimalMath.add(
              resolvedAccount.currentBalance,
              resolvedAccount.ledgerAmount,
            ),
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
          paymentDate,
          method: dto.method ?? PaymentMethod.BANK_TRANSFER,
          reference: dto.reference ?? null,
          notes: dto.notes ?? resolvedAccount?.fxNote ?? null,
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
        include: {
          lineItems: { orderBy: { lineOrder: 'asc' } },
          payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
        },
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
        currency: invoice.currency,
        outstandingBalance: DecimalMath.toFixed4(newOutstanding),
        status: newStatus,
        ...(resolvedAccount?.fxNote ? { fxConversion: resolvedAccount.fxNote } : {}),
      },
    });

    return this.serializeInvoice(updated);
  }

  async createBill(organizationId: string, dto: CreateBillDto, actorUserId: string) {
    const issueDate = new Date(dto.issueDate);
    const dueDate = new Date(dto.dueDate);
    this.validateIssueAndDueDates(issueDate, dueDate);

    const totals = this.computeDocumentTotals({
      totalAmount: dto.totalAmount,
      taxRate: dto.taxRate,
      lineItems: dto.lineItems,
    });

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

    await this.verifyDocumentImportSaveDuplicates({
      organizationId,
      kind: 'BILL',
      counterpartyName: dto.supplierName,
      issueDate,
      totalAmount: totals.totalAmount,
      sourceDocumentChecksum: dto.sourceDocumentChecksum,
    });

    const currency = await this.resolveDocumentCurrency(organizationId, dto.currency);
    const requestedStatus = dto.status ?? BillStatus.OPEN;
    const status =
      requestedStatus === BillStatus.DRAFT
        ? BillStatus.DRAFT
        : this.isPastDue(dueDate)
          ? BillStatus.OVERDUE
          : BillStatus.OPEN;

    const bill = await this.prisma.bill.create({
      data: {
        organizationId,
        billNumber: dto.billNumber.trim(),
        supplierName: SecurityUtil.toTitleCasePartyName(dto.supplierName),
        supplierEmail: dto.supplierEmail?.trim() ?? null,
        category: dto.category?.trim() || 'Operating Expense',
        department: dto.department?.trim() || null,
        issueDate,
        dueDate,
        currency,
        subtotalAmount: totals.subtotalAmount,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        paidAmount: DecimalMath.ZERO,
        outstandingBalance: totals.totalAmount,
        status,
        notes: dto.notes ? SecurityUtil.sanitizeImportedText(dto.notes).sanitized : null,
        ...(totals.lineItems.length > 0
          ? {
              lineItems: {
                create: totals.lineItems,
              },
            }
          : {}),
      },
      include: {
        lineItems: { orderBy: { lineOrder: 'asc' } },
        payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
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
        currency,
        status,
        totalAmount: DecimalMath.toFixed4(bill.totalAmount),
        lineItemCount: totals.lineItems.length,
        dueDate: bill.dueDate.toISOString(),
        ...(dto.sourceDocumentChecksum?.trim()
          ? { sourceDocumentChecksum: dto.sourceDocumentChecksum.trim() }
          : {}),
      },
    });

    return this.serializeBill(bill);
  }

  async listBills(organizationId: string, status?: BillStatus, search?: string) {
    await this.refreshOverdueStatuses(organizationId);
    const trimmedSearch = search?.trim();
    const bills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        isArchived: false,
        ...(status ? { status } : {}),
        ...(trimmedSearch
          ? {
              OR: [
                { billNumber: { contains: trimmedSearch, mode: 'insensitive' } },
                { supplierName: { contains: trimmedSearch, mode: 'insensitive' } },
                { category: { contains: trimmedSearch, mode: 'insensitive' } },
                { department: { contains: trimmedSearch, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        lineItems: { orderBy: { lineOrder: 'asc' } },
        payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
      },
      orderBy: { dueDate: 'asc' },
    });
    return bills.map((b) => this.serializeBill(b));
  }

  async getBillById(organizationId: string, billId: string) {
    await this.refreshOverdueStatuses(organizationId);
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, organizationId, isArchived: false },
      include: {
        lineItems: { orderBy: { lineOrder: 'asc' } },
        payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
      },
    });
    if (!bill) {
      throw new NotFoundException('Supplier bill not found in organization');
    }
    return this.serializeBill(bill);
  }

  async updateBill(
    organizationId: string,
    billId: string,
    dto: UpdateBillDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.bill.findFirst({
      where: { id: billId, organizationId, isArchived: false },
      include: { lineItems: true },
    });
    if (!existing) {
      throw new NotFoundException('Supplier bill not found in organization');
    }
    if (existing.status === BillStatus.VOID || existing.status === BillStatus.PAID) {
      throw new BadRequestException(`Cannot edit a ${existing.status} bill`);
    }

    const hasPayments = existing.paidAmount.gt(DecimalMath.ZERO);
    if (
      hasPayments &&
      (dto.currency !== undefined ||
        dto.totalAmount !== undefined ||
        dto.taxRate !== undefined ||
        dto.lineItems !== undefined)
    ) {
      throw new BadRequestException(
        'Cannot change currency, total amount, tax rate, or line items after payments have been recorded',
      );
    }

    const nextIssueDate = dto.issueDate ? new Date(dto.issueDate) : existing.issueDate;
    const nextDueDate = dto.dueDate ? new Date(dto.dueDate) : existing.dueDate;
    this.validateIssueAndDueDates(nextIssueDate, nextDueDate);

    if (dto.billNumber && dto.billNumber.trim() !== existing.billNumber) {
      const conflict = await this.prisma.bill.findUnique({
        where: {
          organizationId_billNumber: {
            organizationId,
            billNumber: dto.billNumber.trim(),
          },
        },
      });
      if (conflict) {
        throw new ConflictException(`Bill number ${dto.billNumber} already exists`);
      }
    }

    let totalsUpdate: ComputedTotals | null = null;
    if (!hasPayments && (dto.lineItems !== undefined || dto.totalAmount !== undefined || dto.taxRate !== undefined)) {
      if (dto.lineItems !== undefined) {
        totalsUpdate = this.computeDocumentTotals({
          totalAmount: dto.totalAmount,
          taxRate: dto.taxRate,
          lineItems: dto.lineItems,
        });
      } else if (existing.lineItems.length > 0 && dto.totalAmount === undefined && dto.taxRate !== undefined) {
        totalsUpdate = this.computeDocumentTotals({
          taxRate: dto.taxRate,
          lineItems: existing.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity.toFixed(4),
            unitPrice: li.unitPrice.toFixed(4),
          })),
        });
      } else {
        totalsUpdate = this.computeDocumentTotals({
          totalAmount: dto.totalAmount ?? existing.totalAmount.toFixed(4),
          taxRate: dto.taxRate ?? existing.taxRate.toFixed(4),
        });
      }
    }

    let nextStatus = existing.status;
    if (dto.status === BillStatus.OPEN) {
      if (existing.status !== BillStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT bills can transition to OPEN');
      }
      nextStatus = this.isPastDue(nextDueDate) ? BillStatus.OVERDUE : BillStatus.OPEN;
    } else if (existing.status !== BillStatus.DRAFT && dto.dueDate) {
      if (this.isPastDue(nextDueDate)) {
        nextStatus = BillStatus.OVERDUE;
      } else if (existing.status === BillStatus.OVERDUE) {
        nextStatus = hasPayments ? BillStatus.PARTIALLY_PAID : BillStatus.OPEN;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (totalsUpdate && dto.lineItems !== undefined) {
        await tx.billLineItem.deleteMany({ where: { billId: existing.id } });
        if (totalsUpdate.lineItems.length > 0) {
          await tx.billLineItem.createMany({
            data: totalsUpdate.lineItems.map((li) => ({ ...li, billId: existing.id })),
          });
        }
      }

      return tx.bill.update({
        where: { id: existing.id },
        data: {
          ...(dto.billNumber ? { billNumber: dto.billNumber.trim() } : {}),
          ...(dto.supplierName
            ? { supplierName: SecurityUtil.toTitleCasePartyName(dto.supplierName) }
            : {}),
          ...(dto.supplierEmail !== undefined
            ? { supplierEmail: dto.supplierEmail.trim() || null }
            : {}),
          ...(dto.category !== undefined ? { category: dto.category.trim() || 'Operating Expense' } : {}),
          ...(dto.department !== undefined ? { department: dto.department.trim() || null } : {}),
          issueDate: nextIssueDate,
          dueDate: nextDueDate,
          ...(dto.currency ? { currency: dto.currency.trim().toUpperCase() } : {}),
          ...(totalsUpdate
            ? {
                subtotalAmount: totalsUpdate.subtotalAmount,
                taxRate: totalsUpdate.taxRate,
                taxAmount: totalsUpdate.taxAmount,
                totalAmount: totalsUpdate.totalAmount,
                outstandingBalance: totalsUpdate.totalAmount,
              }
            : {}),
          status: nextStatus,
          ...(dto.notes !== undefined
            ? {
                notes: dto.notes ? SecurityUtil.sanitizeImportedText(dto.notes).sanitized : null,
              }
            : {}),
        },
        include: {
          lineItems: { orderBy: { lineOrder: 'asc' } },
          payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
        },
      });
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action:
        existing.status === BillStatus.DRAFT && nextStatus !== BillStatus.DRAFT
          ? 'SUPPLIER_BILL_OPENED'
          : 'SUPPLIER_BILL_UPDATED',
      resourceType: 'BILL',
      resourceId: existing.id,
      details: {
        previousStatus: existing.status,
        newStatus: nextStatus,
        dueDate: nextDueDate.toISOString(),
        totalAmount: DecimalMath.toFixed4(updated.totalAmount),
      },
    });

    return this.serializeBill(updated);
  }

  async voidBill(
    organizationId: string,
    billId: string,
    dto: VoidDocumentDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.bill.findFirst({
      where: { id: billId, organizationId, isArchived: false },
    });
    if (!existing) {
      throw new NotFoundException('Supplier bill not found in organization');
    }
    if (existing.status === BillStatus.VOID) {
      throw new BadRequestException(`Bill ${existing.billNumber} is already void`);
    }
    if (existing.status === BillStatus.PAID || existing.paidAmount.gt(DecimalMath.ZERO)) {
      throw new BadRequestException(
        'Cannot void a bill with recorded payments. Only unpaid bills can be voided.',
      );
    }

    const cleanReason = dto.reason
      ? SecurityUtil.sanitizeImportedText(dto.reason).sanitized.trim()
      : null;
    const voidedNotes = cleanReason
      ? existing.notes
        ? `${existing.notes} | [VOID: ${cleanReason}]`
        : `[VOID: ${cleanReason}]`
      : existing.notes;

    const updated = await this.prisma.bill.update({
      where: { id: existing.id },
      data: {
        status: BillStatus.VOID,
        outstandingBalance: DecimalMath.ZERO,
        notes: voidedNotes,
      },
      include: {
        lineItems: { orderBy: { lineOrder: 'asc' } },
        payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'SUPPLIER_BILL_VOIDED',
      resourceType: 'BILL',
      resourceId: existing.id,
      details: {
        billNumber: existing.billNumber,
        previousStatus: existing.status,
        voidedAmount: DecimalMath.toFixed4(existing.totalAmount),
        reason: cleanReason,
      },
    });

    return this.serializeBill(updated);
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

    if (bill.status === BillStatus.VOID || bill.status === BillStatus.DRAFT) {
      throw new BadRequestException(`Cannot record payment against a ${bill.status} bill`);
    }
    if (bill.status === BillStatus.PAID || DecimalMath.of(bill.outstandingBalance).lte(DecimalMath.ZERO)) {
      throw new BadRequestException(`Bill ${bill.billNumber} is already paid in full`);
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

    const paymentDate = new Date(dto.paymentDate);
    let resolvedAccount: {
      id: string;
      ledgerAmount: Prisma.Decimal;
      ledgerCurrency: string;
      fxNote: string | null;
      currentBalance: Prisma.Decimal;
    } | null = null;

    if (dto.accountId) {
      const account = await this.prisma.financialAccount.findFirst({
        where: { id: dto.accountId, organizationId, isArchived: false },
      });
      if (!account) {
        throw new NotFoundException(
          'Target financial account not found for bill payment posting',
        );
      }
      const conversion = await this.resolveAccountSettlementAmount({
        organizationId,
        accountCurrency: account.currency,
        accountName: account.name,
        documentCurrency: bill.currency,
        paymentAmount,
        paymentDate,
      });
      resolvedAccount = {
        id: account.id,
        currentBalance: account.currentBalance,
        ...conversion,
      };
    }

    const newPaid = DecimalMath.add(bill.paidAmount, paymentAmount);
    const newOutstanding = DecimalMath.sub(bill.totalAmount, newPaid);
    const newStatus = newOutstanding.isZero()
      ? BillStatus.PAID
      : this.isPastDue(bill.dueDate)
        ? BillStatus.OVERDUE
        : BillStatus.PARTIALLY_PAID;

    const updated = await this.prisma.$transaction(async (tx) => {
      let linkedTxId: string | null = null;

      if (resolvedAccount) {
        const ledgerTx = await tx.financialTransaction.create({
          data: {
            organizationId,
            accountId: resolvedAccount.id,
            type: TransactionType.EXPENSE,
            amount: resolvedAccount.ledgerAmount,
            currency: resolvedAccount.ledgerCurrency,
            transactionDate: paymentDate,
            description: resolvedAccount.fxNote
              ? `Supplier Bill Payment: ${bill.billNumber} (${bill.supplierName}) [${resolvedAccount.fxNote}]`
              : `Supplier Bill Payment: ${bill.billNumber} (${bill.supplierName})`,
            category: bill.category,
            department: bill.department,
            counterparty: bill.supplierName,
            reference: dto.reference ?? bill.billNumber,
            createdByUserId: actorUserId,
          },
        });
        linkedTxId = ledgerTx.id;

        await tx.financialAccount.update({
          where: { id: resolvedAccount.id },
          data: {
            currentBalance: DecimalMath.sub(
              resolvedAccount.currentBalance,
              resolvedAccount.ledgerAmount,
            ),
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
          paymentDate,
          method: dto.method ?? PaymentMethod.BANK_TRANSFER,
          reference: dto.reference ?? null,
          notes: dto.notes ?? resolvedAccount?.fxNote ?? null,
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
        include: {
          lineItems: { orderBy: { lineOrder: 'asc' } },
          payments: { orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] },
        },
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
        currency: bill.currency,
        outstandingBalance: DecimalMath.toFixed4(newOutstanding),
        status: newStatus,
        ...(resolvedAccount?.fxNote ? { fxConversion: resolvedAccount.fxNote } : {}),
      },
    });

    return this.serializeBill(updated);
  }

  async refreshOverdueStatuses(organizationId: string, referenceDate = new Date()) {
    const overdueCutoff = this.startOfUtcDay(referenceDate);
    await Promise.all([
      this.prisma.invoice.updateMany({
        where: {
          organizationId,
          isArchived: false,
          outstandingBalance: { gt: 0 },
          dueDate: { lt: overdueCutoff },
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] },
        },
        data: { status: InvoiceStatus.OVERDUE },
      }),
      this.prisma.bill.updateMany({
        where: {
          organizationId,
          isArchived: false,
          outstandingBalance: { gt: 0 },
          dueDate: { lt: overdueCutoff },
          status: { in: [BillStatus.OPEN, BillStatus.PARTIALLY_PAID] },
        },
        data: { status: BillStatus.OVERDUE },
      }),
    ]);
  }

  async computeAgingReport(organizationId: string, asOfDate = new Date()) {
    await this.refreshOverdueStatuses(organizationId, asOfDate);

    const [allActiveInvoices, allActiveBills, org] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          isArchived: false,
          status: { not: InvoiceStatus.VOID },
        },
      }),
      this.prisma.bill.findMany({
        where: {
          organizationId,
          isArchived: false,
          status: { not: BillStatus.VOID },
        },
      }),
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
    ]);

    const targetCurrency = (org?.baseCurrency ?? 'USD').trim().toUpperCase();
    const preloadedRates = this.currencyService
      ? await this.currencyService.loadRatesForOrganization(organizationId)
      : [];

    const convertToBaseCurrency = (
      amount: Prisma.Decimal,
      rawCurrency: string,
      missingCurrencies: Set<string>,
    ): Prisma.Decimal | null => {
      const fromCurr = (rawCurrency || targetCurrency).trim().toUpperCase();
      if (fromCurr === targetCurrency) {
        return amount;
      }
      if (this.currencyService) {
        const conv = this.currencyService.convertAmountSync({
          rates: preloadedRates,
          organizationId,
          amount,
          fromCurrency: fromCurr,
          toCurrency: targetCurrency,
          asOfDate,
        });
        if (conv.isConverted && conv.convertedAmount !== null) {
          return conv.convertedAmount;
        }
      }
      missingCurrencies.add(fromCurr);
      return null;
    };

    type SummaryDocInput = {
      id: string;
      status?: string;
      dueDate: Date;
      currency: string;
      totalAmount?: Prisma.Decimal;
      paidAmount?: Prisma.Decimal;
      outstandingBalance: Prisma.Decimal;
    };

    const isOpenReceivableOrPayable = (r: SummaryDocInput) =>
      r.status !== 'DRAFT' && r.status !== 'VOID' && r.outstandingBalance.gt(DecimalMath.ZERO);

    const buildBuckets = (records: SummaryDocInput[]) => {
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
      const missingCurrencies = new Set<string>();
      let totalOutstanding = DecimalMath.ZERO;

      const asOfDayMs = this.startOfUtcDay(asOfDate).getTime();
      for (const r of records) {
        const diffDays = Math.floor(
          (asOfDayMs - this.startOfUtcDay(r.dueDate).getTime()) / (1000 * 60 * 60 * 24),
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

        const convertedAmount = convertToBaseCurrency(
          r.outstandingBalance,
          r.currency,
          missingCurrencies,
        );

        map[key].count += 1;
        map[key].recordIds.push(r.id);
        if (convertedAmount !== null) {
          map[key].amount = DecimalMath.add(map[key].amount, convertedAmount);
          totalOutstanding = DecimalMath.add(totalOutstanding, convertedAmount);
        }
      }

      const buckets: AgingBucketSummary[] = Object.entries(map).map(([bucket, val]) => ({
        bucket: bucket as AgingBucketSummary['bucket'],
        count: val.count,
        amount: DecimalMath.toFixed4(val.amount),
        recordIds: val.recordIds,
      }));

      const totalOverdue = DecimalMath.sub(totalOutstanding, map.CURRENT.amount);
      const missingList = Array.from(missingCurrencies).sort();

      return {
        totalOutstanding: DecimalMath.toFixed4(totalOutstanding),
        totalOverdue: DecimalMath.toFixed4(totalOverdue),
        isComplete: missingList.length === 0,
        missingCurrencies: missingList,
        buckets,
        sourceRecordIds: records.map((r) => r.id),
      };
    };

    const buildStatusSummary = (records: SummaryDocInput[]): DocumentStatusBreakdown => {
      const missingCurrencies = new Set<string>();
      const draft = { count: 0, total: DecimalMath.ZERO, recordIds: [] as string[] };
      const unpaid = {
        count: 0,
        total: DecimalMath.ZERO,
        outstanding: DecimalMath.ZERO,
        recordIds: [] as string[],
      };
      const partiallyPaid = {
        count: 0,
        total: DecimalMath.ZERO,
        paid: DecimalMath.ZERO,
        outstanding: DecimalMath.ZERO,
        recordIds: [] as string[],
      };
      const paid = {
        count: 0,
        total: DecimalMath.ZERO,
        paid: DecimalMath.ZERO,
        recordIds: [] as string[],
      };

      for (const r of records) {
        if (r.status === 'VOID') continue;
        const totalNative = r.totalAmount ?? r.outstandingBalance;
        const paidNative = r.paidAmount ?? DecimalMath.ZERO;
        const outNative = r.outstandingBalance;

        if (r.status === 'DRAFT') {
          draft.count += 1;
          draft.recordIds.push(r.id);
          const convTotal = convertToBaseCurrency(totalNative, r.currency, missingCurrencies);
          if (convTotal !== null) {
            draft.total = DecimalMath.add(draft.total, convTotal);
          }
          continue;
        }

        const convTotal = convertToBaseCurrency(totalNative, r.currency, missingCurrencies);
        const convPaid = convertToBaseCurrency(paidNative, r.currency, missingCurrencies);
        const convOut = convertToBaseCurrency(outNative, r.currency, missingCurrencies);

        if (r.status === 'PAID' || outNative.lte(DecimalMath.ZERO)) {
          paid.count += 1;
          paid.recordIds.push(r.id);
          if (convTotal !== null) paid.total = DecimalMath.add(paid.total, convTotal);
          if (convPaid !== null) paid.paid = DecimalMath.add(paid.paid, convPaid);
          continue;
        }

        if (r.status === 'PARTIALLY_PAID' || paidNative.gt(DecimalMath.ZERO)) {
          partiallyPaid.count += 1;
          partiallyPaid.recordIds.push(r.id);
          if (convTotal !== null) {
            partiallyPaid.total = DecimalMath.add(partiallyPaid.total, convTotal);
          }
          if (convPaid !== null) {
            partiallyPaid.paid = DecimalMath.add(partiallyPaid.paid, convPaid);
          }
          if (convOut !== null) {
            partiallyPaid.outstanding = DecimalMath.add(partiallyPaid.outstanding, convOut);
          }
          continue;
        }

        unpaid.count += 1;
        unpaid.recordIds.push(r.id);
        if (convTotal !== null) unpaid.total = DecimalMath.add(unpaid.total, convTotal);
        if (convOut !== null) unpaid.outstanding = DecimalMath.add(unpaid.outstanding, convOut);
      }

      const activeOutstandingTotal = DecimalMath.add(unpaid.outstanding, partiallyPaid.outstanding);
      const missingList = Array.from(missingCurrencies).sort();

      return {
        draft: {
          count: draft.count,
          totalAmount: DecimalMath.toFixed4(draft.total),
          recordIds: draft.recordIds,
        },
        unpaid: {
          count: unpaid.count,
          totalAmount: DecimalMath.toFixed4(unpaid.total),
          outstandingAmount: DecimalMath.toFixed4(unpaid.outstanding),
          recordIds: unpaid.recordIds,
        },
        partiallyPaid: {
          count: partiallyPaid.count,
          totalAmount: DecimalMath.toFixed4(partiallyPaid.total),
          paidAmount: DecimalMath.toFixed4(partiallyPaid.paid),
          outstandingAmount: DecimalMath.toFixed4(partiallyPaid.outstanding),
          recordIds: partiallyPaid.recordIds,
        },
        paid: {
          count: paid.count,
          totalAmount: DecimalMath.toFixed4(paid.total),
          paidAmount: DecimalMath.toFixed4(paid.paid),
          recordIds: paid.recordIds,
        },
        activeOutstandingTotal: DecimalMath.toFixed4(activeOutstandingTotal),
        isComplete: missingList.length === 0,
        missingCurrencies: missingList,
      };
    };

    const openInvoices = allActiveInvoices.filter(isOpenReceivableOrPayable);
    const openBills = allActiveBills.filter(isOpenReceivableOrPayable);

    return {
      asOfDate: asOfDate.toISOString(),
      currency: targetCurrency,
      receivablesAging: buildBuckets(openInvoices),
      payablesAging: buildBuckets(openBills),
      receivablesSummary: buildStatusSummary(allActiveInvoices),
      payablesSummary: buildStatusSummary(allActiveBills),
    };
  }

  private serializeLineItems(
    items?: Array<{
      id: string;
      lineOrder: number;
      description: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      lineSubtotal: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>,
  ) {
    return items?.map((li) => ({
      id: li.id,
      lineOrder: li.lineOrder,
      description: li.description,
      quantity: DecimalMath.toFixed4(li.quantity),
      unitPrice: DecimalMath.toFixed4(li.unitPrice),
      taxRate: DecimalMath.toFixed4(li.taxRate),
      taxAmount: DecimalMath.toFixed4(li.taxAmount),
      lineSubtotal: DecimalMath.toFixed4(li.lineSubtotal),
      lineTotal: DecimalMath.toFixed4(li.lineTotal),
    }));
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
    subtotalAmount?: Prisma.Decimal;
    taxRate?: Prisma.Decimal;
    taxAmount?: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    outstandingBalance: Prisma.Decimal;
    status: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    lineItems?: Array<{
      id: string;
      lineOrder: number;
      description: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      lineSubtotal: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>;
    payments?: Array<{
      id: string;
      amount: Prisma.Decimal;
      currency?: string;
      paymentDate: Date;
      method: string;
      reference: string | null;
      notes?: string | null;
    }>;
  }) {
    const isOverdue =
      invoice.status === InvoiceStatus.OVERDUE ||
      (invoice.status !== InvoiceStatus.PAID &&
        invoice.status !== InvoiceStatus.VOID &&
        invoice.status !== InvoiceStatus.DRAFT &&
        invoice.outstandingBalance.gt(DecimalMath.ZERO) &&
        this.isPastDue(invoice.dueDate));

    const subtotal =
      invoice.subtotalAmount && invoice.subtotalAmount.gt(DecimalMath.ZERO)
        ? invoice.subtotalAmount
        : DecimalMath.sub(invoice.totalAmount, invoice.taxAmount ?? DecimalMath.ZERO);

    return {
      ...invoice,
      isOverdue,
      subtotalAmount: DecimalMath.toFixed4(subtotal),
      taxRate: DecimalMath.toFixed4(invoice.taxRate ?? DecimalMath.ZERO),
      taxAmount: DecimalMath.toFixed4(invoice.taxAmount ?? DecimalMath.ZERO),
      totalAmount: DecimalMath.toFixed4(invoice.totalAmount),
      paidAmount: DecimalMath.toFixed4(invoice.paidAmount),
      outstandingBalance: DecimalMath.toFixed4(invoice.outstandingBalance),
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      lineItems: this.serializeLineItems(invoice.lineItems),
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
    subtotalAmount?: Prisma.Decimal;
    taxRate?: Prisma.Decimal;
    taxAmount?: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    outstandingBalance: Prisma.Decimal;
    status: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    lineItems?: Array<{
      id: string;
      lineOrder: number;
      description: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      lineSubtotal: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>;
    payments?: Array<{
      id: string;
      amount: Prisma.Decimal;
      currency?: string;
      paymentDate: Date;
      method: string;
      reference: string | null;
      notes?: string | null;
    }>;
  }) {
    const isOverdue =
      bill.status === BillStatus.OVERDUE ||
      (bill.status !== BillStatus.PAID &&
        bill.status !== BillStatus.VOID &&
        bill.status !== BillStatus.DRAFT &&
        bill.outstandingBalance.gt(DecimalMath.ZERO) &&
        this.isPastDue(bill.dueDate));

    const subtotal =
      bill.subtotalAmount && bill.subtotalAmount.gt(DecimalMath.ZERO)
        ? bill.subtotalAmount
        : DecimalMath.sub(bill.totalAmount, bill.taxAmount ?? DecimalMath.ZERO);

    return {
      ...bill,
      isOverdue,
      subtotalAmount: DecimalMath.toFixed4(subtotal),
      taxRate: DecimalMath.toFixed4(bill.taxRate ?? DecimalMath.ZERO),
      taxAmount: DecimalMath.toFixed4(bill.taxAmount ?? DecimalMath.ZERO),
      totalAmount: DecimalMath.toFixed4(bill.totalAmount),
      paidAmount: DecimalMath.toFixed4(bill.paidAmount),
      outstandingBalance: DecimalMath.toFixed4(bill.outstandingBalance),
      issueDate: bill.issueDate.toISOString(),
      dueDate: bill.dueDate.toISOString(),
      lineItems: this.serializeLineItems(bill.lineItems),
      payments: bill.payments?.map((p) => ({
        ...p,
        amount: DecimalMath.toFixed4(p.amount),
        paymentDate: p.paymentDate.toISOString(),
      })),
    };
  }
}
