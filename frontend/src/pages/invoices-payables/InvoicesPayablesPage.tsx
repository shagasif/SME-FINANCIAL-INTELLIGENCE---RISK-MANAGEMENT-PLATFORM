import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Eye,
  FilePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, apiPatch, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import {
  formatCurrency,
  formatDate,
  resolveReportingCurrency,
  toTitleCasePartyName,
} from '../../utils/formatters';
import { DocumentImportModal } from './DocumentImportModal';
import {
  BillStatus,
  InvoiceStatus,
  PaymentMethod,
  type AgingBucketSummary,
  type AgingReportResponse,
  type AgingSection,
  type Bill,
  type DocumentImportTargetType,
  type DocumentLineItem,
  type FinancialAccount,
  type Invoice,
} from '../../types/financial.types';
import { RoleType } from '../../types/auth.types';

const PAYMENT_METHODS = [
  { value: PaymentMethod.BANK_TRANSFER, label: 'Bank Transfer / Wire' },
  { value: PaymentMethod.CARD, label: 'Card' },
  { value: PaymentMethod.CHEQUE, label: 'Cheque' },
  { value: PaymentMethod.CASH, label: 'Cash' },
  { value: PaymentMethod.DIRECT_DEBIT, label: 'Direct Debit' },
  { value: PaymentMethod.OTHER, label: 'Other Electronic' },
];

const SUPPORTED_CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'PKR', label: 'PKR — Pakistani Rupee' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'AED', label: 'AED — UAE Dirham' },
];

interface EditableLineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

function getAgingBucketAmount(
  section: AgingSection | undefined,
  bucket: AgingBucketSummary['bucket'],
): string {
  if (!section || !Array.isArray(section.buckets)) return '0.0000';
  return section.buckets.find((b) => b.bucket === bucket)?.amount ?? '0.0000';
}

function computeLineItemsPreview(
  lineItems: EditableLineItem[],
  headerTaxRateStr: string,
): { subtotal: number; tax: number; total: number } {
  const defaultTax = Number.parseFloat(headerTaxRateStr || '0') || 0;
  let subtotal = 0;
  let tax = 0;
  for (const li of lineItems) {
    const qty = Number.parseFloat(li.quantity || '0') || 0;
    const price = Number.parseFloat(li.unitPrice || '0') || 0;
    const rate = li.taxRate.trim() !== '' ? Number.parseFloat(li.taxRate) || 0 : defaultTax;
    const lineSub = qty * price;
    const lineTax = (lineSub * rate) / 100;
    subtotal += lineSub;
    tax += lineTax;
  }
  return { subtotal, tax, total: subtotal + tax };
}

function toDtoLineItems(lineItems: EditableLineItem[]): DocumentLineItem[] {
  return lineItems.map((li) => ({
    description: li.description.trim(),
    quantity: (Number.parseFloat(li.quantity || '0') || 0).toFixed(4),
    unitPrice: (Number.parseFloat(li.unitPrice || '0') || 0).toFixed(4),
    ...(li.taxRate.trim() !== ''
      ? { taxRate: (Number.parseFloat(li.taxRate) || 0).toFixed(4) }
      : {}),
  }));
}

export function InvoicesPayablesPage() {
  const { activeOrg, isLoading: isAuthLoading, isAuditor, canMutateLedger, hasRole } = useAuth();

  const [activeTab, setActiveTab] = useState<'invoices' | 'bills'>('invoices');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [agingData, setAgingData] = useState<AgingReportResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [importDocTarget, setImportDocTarget] = useState<DocumentImportTargetType | null>(null);

  const orgCurrency = resolveReportingCurrency(activeOrg?.baseCurrency);

  // Create / Edit Invoice Modal
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editingInvoiceHasPayments, setEditingInvoiceHasPayments] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [invoiceCategory, setInvoiceCategory] = useState('Sales Revenue');
  const [invoiceDepartment, setInvoiceDepartment] = useState('');
  const [invoiceCurrency, setInvoiceCurrency] = useState('');
  const [invoiceStatusInput, setInvoiceStatusInput] = useState<'ISSUED' | 'DRAFT'>('ISSUED');
  const [invoiceIssueDate, setInvoiceIssueDate] = useState(
    () => new Date().toISOString().split('T')[0],
  );
  const [invoiceDueDate, setInvoiceDueDate] = useState(
    () => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
  );
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceTaxRate, setInvoiceTaxRate] = useState('0');
  const [invoiceLineItems, setInvoiceLineItems] = useState<EditableLineItem[]>([]);
  const [invoiceNotes, setInvoiceNotes] = useState('');

  // Create / Edit Bill Modal
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [editingBillHasPayments, setEditingBillHasPayments] = useState(false);
  const [billNumber, setBillNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [billCategory, setBillCategory] = useState('Operating Expense');
  const [billDepartment, setBillDepartment] = useState('');
  const [billCurrency, setBillCurrency] = useState('');
  const [billStatusInput, setBillStatusInput] = useState<'OPEN' | 'DRAFT'>('OPEN');
  const [billIssueDate, setBillIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [billDueDate, setBillDueDate] = useState(
    () => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
  );
  const [billAmount, setBillAmount] = useState('');
  const [billTaxRate, setBillTaxRate] = useState('0');
  const [billLineItems, setBillLineItems] = useState<EditableLineItem[]>([]);
  const [billNotes, setBillNotes] = useState('');

  // Record Payment Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<{
    id: string;
    type: 'invoice' | 'bill';
    number: string;
    outstanding: string;
    currency: string;
  } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.BANK_TRANSFER);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentReference, setPaymentReference] = useState('');

  // Detail & Payment History Modal
  const [detailTarget, setDetailTarget] = useState<
    { type: 'invoice'; data: Invoice } | { type: 'bill'; data: Bill } | null
  >(null);

  // Void Modal
  const [voidTarget, setVoidTarget] = useState<{
    id: string;
    type: 'invoice' | 'bill';
    number: string;
  } | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [isBulkIssuing, setIsBulkIssuing] = useState(false);

  // Header "+ Create New" dropdown
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isCreateMenuOpen) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (createMenuRef.current && !createMenuRef.current.contains(target)) {
        setIsCreateMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCreateMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCreateMenuOpen]);

  const activeOrgId = activeOrg?.id;

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (isAuthLoading || !activeOrgId) return;

    let isMounted = true;
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    const qs = params.toString();

    const invoiceUrl = `/v1/organizations/${activeOrgId}/invoices${
      activeTab === 'invoices' && qs ? `?${qs}` : ''
    }`;
    const billUrl = `/v1/organizations/${activeOrgId}/bills${
      activeTab === 'bills' && qs ? `?${qs}` : ''
    }`;

    Promise.all([
      apiGet<Invoice[]>(invoiceUrl),
      apiGet<Bill[]>(billUrl),
      apiGet<AgingReportResponse>(`/v1/organizations/${activeOrgId}/aging`),
      apiGet<FinancialAccount[]>(`/v1/organizations/${activeOrgId}/accounts`).catch(() => []),
    ])
      .then(([invs, bls, aging, accs]) => {
        if (!isMounted) return;
        setError(null);
        setInvoices(Array.isArray(invs) ? invs : []);
        setBills(Array.isArray(bls) ? bls : []);
        setAgingData(aging || null);
        setAccounts(Array.isArray(accs) ? accs.filter((a) => !a.isArchived) : []);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setInvoices([]);
        setBills([]);
        setAgingData(null);
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to fetch invoices, bills, and aging data from live API.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, reloadKey, isAuthLoading, activeTab, statusFilter, searchQuery]);

  const effectiveLoading = isAuthLoading || (Boolean(activeOrgId) && isLoading);
  const agingCurrency = resolveReportingCurrency(agingData?.currency, orgCurrency);
  const canCreateBills = canMutateLedger || hasRole([RoleType.OPERATIONS_MANAGER]);

  const resetInvoiceForm = () => {
    setEditingInvoiceId(null);
    setEditingInvoiceHasPayments(false);
    setInvoiceNumber('');
    setCustomerName('');
    setCustomerEmail('');
    setInvoiceCategory('Sales Revenue');
    setInvoiceDepartment('');
    setInvoiceCurrency('');
    setInvoiceStatusInput('ISSUED');
    const today = new Date();
    const plus30 = new Date(today.getTime() + 30 * 24 * 3600 * 1000);
    setInvoiceIssueDate(today.toISOString().split('T')[0]);
    setInvoiceDueDate(plus30.toISOString().split('T')[0]);
    setInvoiceAmount('');
    setInvoiceTaxRate('0');
    setInvoiceLineItems([]);
    setInvoiceNotes('');
    setModalError(null);
  };

  const resetBillForm = () => {
    setEditingBillId(null);
    setEditingBillHasPayments(false);
    setBillNumber('');
    setSupplierName('');
    setSupplierEmail('');
    setBillCategory('Operating Expense');
    setBillDepartment('');
    setBillCurrency('');
    setBillStatusInput('OPEN');
    const today = new Date();
    const plus30 = new Date(today.getTime() + 30 * 24 * 3600 * 1000);
    setBillIssueDate(today.toISOString().split('T')[0]);
    setBillDueDate(plus30.toISOString().split('T')[0]);
    setBillAmount('');
    setBillTaxRate('0');
    setBillLineItems([]);
    setBillNotes('');
    setModalError(null);
  };

  const openEditInvoiceModal = (inv: Invoice) => {
    setEditingInvoiceId(inv.id);
    setEditingInvoiceHasPayments(Number.parseFloat(inv.paidAmount || '0') > 0);
    setInvoiceNumber(inv.invoiceNumber);
    setCustomerName(inv.customerName);
    setCustomerEmail(inv.customerEmail || '');
    setInvoiceCategory(inv.category || 'Sales Revenue');
    setInvoiceDepartment(inv.department || '');
    setInvoiceCurrency(inv.currency || orgCurrency);
    setInvoiceStatusInput(inv.status === InvoiceStatus.DRAFT ? 'DRAFT' : 'ISSUED');
    setInvoiceIssueDate(inv.issueDate.slice(0, 10));
    setInvoiceDueDate(inv.dueDate.slice(0, 10));
    setInvoiceAmount(inv.totalAmount);
    setInvoiceTaxRate(inv.taxRate || '0');
    setInvoiceLineItems(
      (inv.lineItems || []).map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        taxRate: li.taxRate || '',
      })),
    );
    setInvoiceNotes(inv.notes || '');
    setModalError(null);
    setIsInvoiceModalOpen(true);
  };

  const openEditBillModal = (bill: Bill) => {
    setEditingBillId(bill.id);
    setEditingBillHasPayments(Number.parseFloat(bill.paidAmount || '0') > 0);
    setBillNumber(bill.billNumber);
    setSupplierName(bill.supplierName);
    setSupplierEmail(bill.supplierEmail || '');
    setBillCategory(bill.category || 'Operating Expense');
    setBillDepartment(bill.department || '');
    setBillCurrency(bill.currency || orgCurrency);
    setBillStatusInput(bill.status === BillStatus.DRAFT ? 'DRAFT' : 'OPEN');
    setBillIssueDate(bill.issueDate.slice(0, 10));
    setBillDueDate(bill.dueDate.slice(0, 10));
    setBillAmount(bill.totalAmount);
    setBillTaxRate(bill.taxRate || '0');
    setBillLineItems(
      (bill.lineItems || []).map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        taxRate: li.taxRate || '',
      })),
    );
    setBillNotes(bill.notes || '');
    setModalError(null);
    setIsBillModalOpen(true);
  };

  // Handle Create / Edit Invoice Submit
  const handleSaveInvoice = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeOrgId) return;
    if (!invoiceNumber.trim() || !customerName.trim()) {
      setModalError('Please fill in invoice number and customer name.');
      return;
    }
    if (invoiceDueDate < invoiceIssueDate) {
      setModalError('Due date cannot be earlier than issue date.');
      return;
    }
    const usingLines = invoiceLineItems.length > 0;
    if (!usingLines && !editingInvoiceHasPayments && !invoiceAmount) {
      setModalError('Please enter a total amount or add at least one line item.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);
    const chosenCurrency = invoiceCurrency || orgCurrency;

    try {
      const normalizedCustomerName = toTitleCasePartyName(customerName);
      const commonMetadata = {
        invoiceNumber: invoiceNumber.trim(),
        customerName: normalizedCustomerName,
        ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : { customerEmail: '' }),
        category: invoiceCategory.trim() || 'Sales Revenue',
        department: invoiceDepartment.trim(),
        issueDate: new Date(invoiceIssueDate).toISOString(),
        dueDate: new Date(invoiceDueDate).toISOString(),
        notes: invoiceNotes.trim(),
      };

      if (editingInvoiceId) {
        const patchPayload: Record<string, unknown> = {
          ...commonMetadata,
        };
        if (!customerEmail.trim()) delete patchPayload.customerEmail;
        if (!editingInvoiceHasPayments) {
          patchPayload.currency = chosenCurrency;
          patchPayload.taxRate = (Number.parseFloat(invoiceTaxRate || '0') || 0).toFixed(4);
          if (usingLines) {
            patchPayload.lineItems = toDtoLineItems(invoiceLineItems);
          } else {
            patchPayload.lineItems = [];
            patchPayload.totalAmount = Number.parseFloat(invoiceAmount).toFixed(4);
          }
        }
        await apiPatch(`/v1/organizations/${activeOrgId}/invoices/${editingInvoiceId}`, patchPayload);
      } else {
        const createPayload: Record<string, unknown> = {
          invoiceNumber: invoiceNumber.trim(),
          customerName: normalizedCustomerName,
          ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
          category: invoiceCategory.trim() || 'Sales Revenue',
          ...(invoiceDepartment.trim() ? { department: invoiceDepartment.trim() } : {}),
          issueDate: new Date(invoiceIssueDate).toISOString(),
          dueDate: new Date(invoiceDueDate).toISOString(),
          currency: chosenCurrency,
          status: invoiceStatusInput,
          taxRate: (Number.parseFloat(invoiceTaxRate || '0') || 0).toFixed(4),
          ...(usingLines
            ? { lineItems: toDtoLineItems(invoiceLineItems) }
            : { totalAmount: Number.parseFloat(invoiceAmount).toFixed(4) }),
          ...(invoiceNotes.trim() ? { notes: invoiceNotes.trim() } : {}),
        };
        await apiPost(`/v1/organizations/${activeOrgId}/invoices`, createPayload);
      }

      setIsInvoiceModalOpen(false);
      resetInvoiceForm();
      handleRefresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError(
          editingInvoiceId
            ? 'Failed to update customer invoice.'
            : 'Failed to create customer invoice.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Create / Edit Bill Submit
  const handleSaveBill = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeOrgId) return;
    if (!billNumber.trim() || !supplierName.trim()) {
      setModalError('Please fill in bill number and supplier name.');
      return;
    }
    if (billDueDate < billIssueDate) {
      setModalError('Due date cannot be earlier than issue date.');
      return;
    }
    const usingLines = billLineItems.length > 0;
    if (!usingLines && !editingBillHasPayments && !billAmount) {
      setModalError('Please enter a total amount or add at least one line item.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);
    const chosenCurrency = billCurrency || orgCurrency;

    try {
      const normalizedSupplierName = toTitleCasePartyName(supplierName);
      if (editingBillId) {
        const patchPayload: Record<string, unknown> = {
          billNumber: billNumber.trim(),
          supplierName: normalizedSupplierName,
          ...(supplierEmail.trim() ? { supplierEmail: supplierEmail.trim() } : {}),
          category: billCategory.trim() || 'Operating Expense',
          department: billDepartment.trim(),
          issueDate: new Date(billIssueDate).toISOString(),
          dueDate: new Date(billDueDate).toISOString(),
          notes: billNotes.trim(),
        };
        if (!editingBillHasPayments) {
          patchPayload.currency = chosenCurrency;
          patchPayload.taxRate = (Number.parseFloat(billTaxRate || '0') || 0).toFixed(4);
          if (usingLines) {
            patchPayload.lineItems = toDtoLineItems(billLineItems);
          } else {
            patchPayload.lineItems = [];
            patchPayload.totalAmount = Number.parseFloat(billAmount).toFixed(4);
          }
        }
        await apiPatch(`/v1/organizations/${activeOrgId}/bills/${editingBillId}`, patchPayload);
      } else {
        const createPayload: Record<string, unknown> = {
          billNumber: billNumber.trim(),
          supplierName: normalizedSupplierName,
          ...(supplierEmail.trim() ? { supplierEmail: supplierEmail.trim() } : {}),
          category: billCategory.trim() || 'Operating Expense',
          ...(billDepartment.trim() ? { department: billDepartment.trim() } : {}),
          issueDate: new Date(billIssueDate).toISOString(),
          dueDate: new Date(billDueDate).toISOString(),
          currency: chosenCurrency,
          status: billStatusInput,
          taxRate: (Number.parseFloat(billTaxRate || '0') || 0).toFixed(4),
          ...(usingLines
            ? { lineItems: toDtoLineItems(billLineItems) }
            : { totalAmount: Number.parseFloat(billAmount).toFixed(4) }),
          ...(billNotes.trim() ? { notes: billNotes.trim() } : {}),
        };
        await apiPost(`/v1/organizations/${activeOrgId}/bills`, createPayload);
      }

      setIsBillModalOpen(false);
      resetBillForm();
      handleRefresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError(
          editingBillId ? 'Failed to update supplier bill.' : 'Failed to create supplier bill.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Transition DRAFT -> ISSUED / OPEN
  const handleActivateDraft = async (type: 'invoice' | 'bill', id: string) => {
    if (!activeOrgId) return;
    setError(null);
    try {
      if (type === 'invoice') {
        const updated = await apiPatch<Invoice>(`/v1/organizations/${activeOrgId}/invoices/${id}`, {
          status: InvoiceStatus.ISSUED,
        });
        setSelectedInvoiceIds((prev) => prev.filter((itemId) => itemId !== id));
        if (detailTarget?.type === 'invoice' && detailTarget.data.id === id) {
          setDetailTarget({
            type: 'invoice',
            data: updated?.id ? updated : { ...detailTarget.data, status: InvoiceStatus.ISSUED },
          });
        }
      } else {
        const updated = await apiPatch<Bill>(`/v1/organizations/${activeOrgId}/bills/${id}`, {
          status: BillStatus.OPEN,
        });
        setSelectedBillIds((prev) => prev.filter((itemId) => itemId !== id));
        if (detailTarget?.type === 'bill' && detailTarget.data.id === id) {
          setDetailTarget({
            type: 'bill',
            data: updated?.id ? updated : { ...detailTarget.data, status: BillStatus.OPEN },
          });
        }
      }
      handleRefresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to transition draft document status.');
      }
    }
  };

  const handleActivateSelectedDrafts = async () => {
    if (!activeOrgId) return;
    const isInvTab = activeTab === 'invoices';
    const draftIds = isInvTab
      ? invoices
          .filter((inv) => selectedInvoiceIds.includes(inv.id) && inv.status === InvoiceStatus.DRAFT)
          .map((inv) => inv.id)
      : bills
          .filter((bill) => selectedBillIds.includes(bill.id) && bill.status === BillStatus.DRAFT)
          .map((bill) => bill.id);
    if (draftIds.length === 0) return;

    setIsBulkIssuing(true);
    setError(null);
    try {
      await Promise.all(
        draftIds.map((id) =>
          isInvTab
            ? apiPatch(`/v1/organizations/${activeOrgId}/invoices/${id}`, {
                status: InvoiceStatus.ISSUED,
              })
            : apiPatch(`/v1/organizations/${activeOrgId}/bills/${id}`, {
                status: BillStatus.OPEN,
              }),
        ),
      );
      if (isInvTab) {
        setSelectedInvoiceIds([]);
      } else {
        setSelectedBillIds([]);
      }
      handleRefresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to update selected draft documents.');
      }
    } finally {
      setIsBulkIssuing(false);
    }
  };

  // Void Invoice / Bill
  const handleVoidSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || !voidTarget) return;
    setIsSubmitting(true);
    setModalError(null);
    const path =
      voidTarget.type === 'invoice'
        ? `/v1/organizations/${activeOrgId}/invoices/${voidTarget.id}/void`
        : `/v1/organizations/${activeOrgId}/bills/${voidTarget.id}/void`;
    try {
      await apiPost(path, {
        ...(voidReason.trim() ? { reason: voidReason.trim() } : {}),
      });
      setVoidTarget(null);
      setVoidReason('');
      handleRefresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError('Failed to void document.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Detail & Payment History Modal
  const openDetailModal = async (type: 'invoice' | 'bill', fallbackItem: Invoice | Bill) => {
    if (type === 'invoice') {
      setDetailTarget({ type: 'invoice', data: fallbackItem as Invoice });
    } else {
      setDetailTarget({ type: 'bill', data: fallbackItem as Bill });
    }
    if (!activeOrgId) return;
    try {
      const path =
        type === 'invoice'
          ? `/v1/organizations/${activeOrgId}/invoices/${fallbackItem.id}`
          : `/v1/organizations/${activeOrgId}/bills/${fallbackItem.id}`;
      const detailed = await apiGet<Invoice | Bill>(path);
      if (detailed && detailed.id) {
        if (type === 'invoice') {
          setDetailTarget({ type: 'invoice', data: detailed as Invoice });
        } else {
          setDetailTarget({ type: 'bill', data: detailed as Bill });
        }
      }
    } catch {
      // Keep row snapshot if detail call fails transiently
    }
  };

  // Handle Record Payment Submit
  const handleRecordPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || !selectedTarget || !paymentAmount) {
      setModalError('Please specify payment amount.');
      return;
    }

    const numAmount = Number.parseFloat(paymentAmount);
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      setModalError('Payment amount must be greater than zero.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    const path =
      selectedTarget.type === 'invoice'
        ? `/v1/organizations/${activeOrgId}/invoices/${selectedTarget.id}/payments`
        : `/v1/organizations/${activeOrgId}/bills/${selectedTarget.id}/payments`;

    try {
      await apiPost(path, {
        amount: numAmount.toFixed(4),
        paymentDate: new Date(paymentDate).toISOString(),
        method: paymentMethod,
        ...(paymentAccountId ? { accountId: paymentAccountId } : {}),
        ...(paymentReference ? { reference: paymentReference.trim() } : {}),
      });

      setIsPaymentModalOpen(false);
      setSelectedTarget(null);
      setPaymentAmount('');
      setPaymentAccountId(accounts[0]?.id ?? '');
      setPaymentReference('');
      handleRefresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError('Failed to record payment.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPaymentModal = (
    id: string,
    type: 'invoice' | 'bill',
    number: string,
    outstanding: string,
    docCurrency: string,
  ) => {
    setSelectedTarget({ id, type, number, outstanding, currency: docCurrency });
    setPaymentAmount(outstanding);
    setPaymentAccountId(accounts[0]?.id ?? '');
    setModalError(null);
    setIsPaymentModalOpen(true);
  };

  const currentAging =
    activeTab === 'invoices' ? agingData?.receivablesAging : agingData?.payablesAging;
  const currentSummary =
    activeTab === 'invoices' ? agingData?.receivablesSummary : agingData?.payablesSummary;

  const statusFilterOptions =
    activeTab === 'invoices'
      ? [
          { value: '', label: 'All Statuses' },
          { value: InvoiceStatus.DRAFT, label: 'DRAFT' },
          { value: InvoiceStatus.ISSUED, label: 'ISSUED' },
          { value: InvoiceStatus.PARTIALLY_PAID, label: 'PARTIALLY_PAID' },
          { value: InvoiceStatus.OVERDUE, label: 'OVERDUE' },
          { value: InvoiceStatus.PAID, label: 'PAID' },
          { value: InvoiceStatus.VOID, label: 'VOID' },
        ]
      : [
          { value: '', label: 'All Statuses' },
          { value: BillStatus.DRAFT, label: 'DRAFT' },
          { value: BillStatus.OPEN, label: 'OPEN' },
          { value: BillStatus.PARTIALLY_PAID, label: 'PARTIALLY_PAID' },
          { value: BillStatus.OVERDUE, label: 'OVERDUE' },
          { value: BillStatus.PAID, label: 'PAID' },
          { value: BillStatus.VOID, label: 'VOID' },
        ];

  const invoicePreview = computeLineItemsPreview(invoiceLineItems, invoiceTaxRate);
  const billPreview = computeLineItemsPreview(billLineItems, billTaxRate);

  const renderRowActions = (params: {
    type: 'invoice' | 'bill';
    record: Invoice | Bill;
    docNumber: string;
    docCurr: string;
    isEditable: boolean;
    isNonPayable: boolean;
    isVoidable: boolean;
  }) => {
    const { type, record, docNumber, docCurr, isEditable, isNonPayable, isVoidable } = params;

    const showEdit = canMutateLedger && isEditable;
    const showVoid = canMutateLedger && isVoidable;

    return (
      <div className="inline-flex items-center justify-end gap-1.5">
        {!isNonPayable && canMutateLedger ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              openPaymentModal(record.id, type, docNumber, record.outstandingBalance, docCurr)
            }
            title={type === 'invoice' ? 'Record customer payment' : 'Settle supplier bill'}
            className="rounded-full px-3 py-1"
          >
            {type === 'invoice' ? 'Record Payment' : 'Settle Bill'}
          </Button>
        ) : null}

        <button
          type="button"
          onClick={() => openDetailModal(type, record)}
          aria-label="View"
          title="View"
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer shrink-0"
        >
          <Eye className="w-4 h-4" />
        </button>

        {showEdit ? (
          <button
            type="button"
            onClick={() =>
              type === 'invoice'
                ? openEditInvoiceModal(record as Invoice)
                : openEditBillModal(record as Bill)
            }
            aria-label="Edit"
            title="Edit"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer shrink-0"
          >
            <Pencil className="w-4 h-4" />
          </button>
        ) : (
          <span className="inline-block w-7 h-7 shrink-0" aria-hidden="true" />
        )}

        {showVoid ? (
          <button
            type="button"
            onClick={() => {
              setModalError(null);
              setVoidReason('');
              setVoidTarget({
                id: record.id,
                type,
                number: docNumber,
              });
            }}
            aria-label="Void"
            title="Void"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-red-500 hover:bg-red-500/10 hover:text-red-600 transition-colors cursor-pointer shrink-0"
          >
            <Ban className="w-4 h-4" />
          </button>
        ) : (
          <span className="inline-block w-7 h-7 shrink-0" aria-hidden="true" />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Invoices & Payables Management
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Manage customer invoices, supplier bills, and overdue balances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={effectiveLoading}
            aria-label="Refresh"
            title="Refresh records"
            className="h-8 w-8 px-0 bg-white dark:bg-[var(--surface-card)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${effectiveLoading ? 'animate-spin' : ''}`} />
          </Button>

          {(activeTab === 'invoices' ? canMutateLedger : canCreateBills) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setImportDocTarget(activeTab === 'invoices' ? 'INVOICE' : 'BILL')
              }
              title={
                activeTab === 'invoices'
                  ? 'Import customer invoice from PDF, JPG, JPEG, or PNG'
                  : 'Import supplier bill from PDF, JPG, JPEG, or PNG'
              }
              className="h-8 px-3 bg-white dark:bg-[var(--surface-card)]"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </Button>
          )}

          {(canMutateLedger || canCreateBills) && (
            <div ref={createMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsCreateMenuOpen((prev) => !prev)}
                aria-expanded={isCreateMenuOpen}
                aria-haspopup="menu"
                className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-emerald-800 hover:bg-emerald-700 text-white shadow-xs transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent-teal)]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 opacity-90 transition-transform ${
                    isCreateMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isCreateMenuOpen && (
                <div
                  role="menu"
                  aria-label="Create new document"
                  className="absolute right-0 mt-1.5 w-44 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-lg py-1 z-30"
                >
                  {canMutateLedger && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsCreateMenuOpen(false);
                        resetInvoiceForm();
                        setIsInvoiceModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors whitespace-nowrap cursor-pointer text-left"
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                      <span>New Invoice</span>
                    </button>
                  )}
                  {canCreateBills && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsCreateMenuOpen(false);
                        resetBillForm();
                        setIsBillModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors whitespace-nowrap cursor-pointer text-left"
                    >
                      <FilePlus className="w-3.5 h-3.5 text-[var(--accent-teal)] shrink-0" />
                      <span>New Bill</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Auditor Notice */}
      {isAuditor && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs"
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <span className="font-semibold block mb-0.5">Auditor Mode Active</span>
            <span className="leading-relaxed opacity-90">
              Invoices, bills, and payment settlements are visible for inspection only. Creation,
              editing, voiding, and settlement actions are blocked.
            </span>
          </div>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            Try Again
          </Button>
        </div>
      )}

      {/* Aging Summary Card */}
      {currentAging && (
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--text-primary)]">
                {activeTab === 'invoices' ? 'Receivables Aging Summary' : 'Payables Aging Summary'}
              </span>
              {currentAging.isComplete === false && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  <AlertTriangle className="w-3 h-3" />
                  Incomplete FX ({currentAging.missingCurrencies.join(', ')})
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5">
              <span className="tabular-nums font-bold text-sm text-[var(--accent-teal)]">
                {currentAging.isComplete === false
                  ? `Partial Total: ${formatCurrency(currentAging.totalOutstanding, agingCurrency)}`
                  : `Total Outstanding: ${formatCurrency(currentAging.totalOutstanding, agingCurrency)}`}
              </span>
              {(currentSummary?.draft?.count ?? 0) > 0 && currentSummary && (
                <span className="tabular-nums text-[11px] font-normal text-[var(--text-muted)]">
                  (Excludes{' '}
                  {formatCurrency(
                    currentSummary.draft.totalAmount,
                    agingCurrency,
                    Math.abs((Number.parseFloat(currentSummary.draft.totalAmount) || 0) % 1) >
                      0.0001
                      ? 2
                      : 0,
                  )}{' '}
                  in drafts)
                </span>
              )}
            </div>
          </div>

          {currentAging.isComplete === false && currentAging.missingCurrencies.length > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
              Missing exchange rate(s) to {agingCurrency}:{' '}
              <strong>{currentAging.missingCurrencies.join(', ')}</strong>. Unconverted balances are
              excluded from the consolidated totals above.
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">Current</span>
              <span className="tabular-nums font-bold text-sm mt-0.5 block truncate">
                {formatCurrency(getAgingBucketAmount(currentAging, 'CURRENT'), agingCurrency, 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                1-30 Days
              </span>
              <span className="tabular-nums font-bold text-sm mt-0.5 block truncate">
                {formatCurrency(
                  getAgingBucketAmount(currentAging, '1_TO_30_DAYS'),
                  agingCurrency,
                  0,
                )}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                31-60 Days
              </span>
              <span className="tabular-nums font-bold text-sm mt-0.5 block truncate">
                {formatCurrency(
                  getAgingBucketAmount(currentAging, '31_TO_60_DAYS'),
                  agingCurrency,
                  0,
                )}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--surface-canvas)] border border-amber-500/20 text-amber-700 dark:text-amber-400">
              <span className="text-[10px] uppercase block opacity-80">61-90 Days</span>
              <span className="tabular-nums font-bold text-sm mt-0.5 block truncate">
                {formatCurrency(
                  getAgingBucketAmount(currentAging, '61_TO_90_DAYS'),
                  agingCurrency,
                  0,
                )}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--surface-canvas)] border border-red-500/20 text-red-600 dark:text-red-400">
              <span className="text-[10px] uppercase block opacity-80">90+ Days</span>
              <span className="tabular-nums font-bold text-sm mt-0.5 block truncate">
                {formatCurrency(
                  getAgingBucketAmount(currentAging, 'OVER_90_DAYS'),
                  agingCurrency,
                  0,
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs + Search / Status Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('invoices');
              setStatusFilter('');
            }}
            className={`px-4 py-2 text-xs font-semibold border-b-2 cursor-pointer transition-all ${
              activeTab === 'invoices'
                ? 'border-[var(--accent-teal)] text-[var(--accent-primary)] font-bold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Customer Invoices ({invoices.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('bills');
              setStatusFilter('');
            }}
            className={`px-4 py-2 text-xs font-semibold border-b-2 cursor-pointer transition-all ${
              activeTab === 'bills'
                ? 'border-[var(--accent-teal)] text-[var(--accent-primary)] font-bold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Supplier Bills ({bills.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Search invoices and bills"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search #, party, category..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-teal)] w-48 sm:w-56"
            />
          </div>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-teal)]"
          >
            {statusFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Top Selection Action Bar */}
      {canMutateLedger &&
        ((activeTab === 'invoices' && selectedInvoiceIds.length > 0) ||
          (activeTab === 'bills' && selectedBillIds.length > 0)) && (() => {
          const isInvTab = activeTab === 'invoices';
          const selectedCount = isInvTab ? selectedInvoiceIds.length : selectedBillIds.length;
          const draftSelectedCount = isInvTab
            ? invoices.filter(
                (inv) =>
                  selectedInvoiceIds.includes(inv.id) && inv.status === InvoiceStatus.DRAFT,
              ).length
            : bills.filter(
                (bill) => selectedBillIds.includes(bill.id) && bill.status === BillStatus.DRAFT,
              ).length;

          return (
            <div
              role="region"
              aria-label="Selection actions"
              className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/70 text-xs"
            >
              <span className="font-semibold text-[var(--text-primary)]">
                {selectedCount} {selectedCount === 1 ? 'record' : 'records'} selected
              </span>
              <div className="flex items-center gap-2">
                {draftSelectedCount > 0 && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleActivateSelectedDrafts}
                    isLoading={isBulkIssuing}
                    className="bg-emerald-800 hover:bg-emerald-700 text-white"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isInvTab ? 'Issue Invoice' : 'Open Bill'}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    isInvTab ? setSelectedInvoiceIds([]) : setSelectedBillIds([])
                  }
                >
                  Clear
                </Button>
              </div>
            </div>
          );
        })()}

      {/* Invoices Table View */}
      {activeTab === 'invoices' && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="py-3 pl-4 pr-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all customer invoices"
                      checked={
                        invoices.length > 0 &&
                        invoices.every((inv) => selectedInvoiceIds.includes(inv.id))
                      }
                      onChange={(e) =>
                        setSelectedInvoiceIds(
                          e.target.checked ? invoices.map((inv) => inv.id) : [],
                        )
                      }
                      className="h-3.5 w-3.5 rounded border-[var(--border-strong)] accent-emerald-700 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4 font-semibold">Invoice #</th>
                  <th className="py-3 px-4 font-semibold">Customer</th>
                  <th className="py-3 px-4 font-semibold">Issue Date</th>
                  <th className="py-3 px-4 font-semibold">Due Date</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Total</th>
                  <th className="py-3 px-4 font-semibold text-right">Outstanding</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {effectiveLoading && invoices.length === 0 ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9} className="py-3 px-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                ) : invoices.length > 0 ? (
                  invoices.map((inv) => {
                    const isPaid = inv.status === 'PAID';
                    const isVoid = inv.status === 'VOID';
                    const isDraft = inv.status === 'DRAFT';
                    const isNonPayable = isPaid || isVoid || isDraft;
                    const isEditable = !isPaid && !isVoid;
                    const hasPayments = Number.parseFloat(inv.paidAmount || '0') > 0;
                    const isVoidable = !isPaid && !isVoid && !hasPayments;
                    const isOverdue = inv.status === 'OVERDUE' || inv.isOverdue;
                    const docCurr = inv.currency || orgCurrency;

                    return (
                      <tr
                        key={inv.id}
                        className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                      >
                        <td className="py-3 pl-4 pr-2 w-8">
                          <input
                            type="checkbox"
                            aria-label={`Select ${inv.invoiceNumber}`}
                            checked={selectedInvoiceIds.includes(inv.id)}
                            onChange={(e) =>
                              setSelectedInvoiceIds((prev) =>
                                e.target.checked
                                  ? [...prev, inv.id]
                                  : prev.filter((id) => id !== inv.id),
                              )
                            }
                            className="h-3.5 w-3.5 rounded border-[var(--border-strong)] accent-emerald-700 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openDetailModal('invoice', inv)}
                            className="hover:underline text-left cursor-pointer"
                          >
                            {inv.invoiceNumber}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-medium text-[var(--text-primary)] max-w-[200px] truncate">
                          <div>{inv.customerName}</div>
                          {inv.category && (
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {inv.category}
                              {inv.department ? ` • ${inv.department}` : ''}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[var(--text-secondary)] whitespace-nowrap font-mono">
                          {formatDate(inv.issueDate)}
                        </td>
                        <td className="py-3 px-4 text-[var(--text-secondary)] whitespace-nowrap font-mono">
                          {formatDate(inv.dueDate)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                              isPaid
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                                : isOverdue
                                  ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                                  : isNonPayable
                                    ? 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20'
                                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                          {formatCurrency(inv.totalAmount, docCurr)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap text-amber-700 dark:text-amber-400">
                          {formatCurrency(inv.outstandingBalance, docCurr)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {renderRowActions({
                            type: 'invoice',
                            record: inv,
                            docNumber: inv.invoiceNumber,
                            docCurr,
                            isEditable,
                            isNonPayable,
                            isVoidable,
                          })}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-xs text-[var(--text-muted)]">
                      No customer invoices recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bills Table View */}
      {activeTab === 'bills' && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="py-3 pl-4 pr-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all supplier bills"
                      checked={
                        bills.length > 0 && bills.every((b) => selectedBillIds.includes(b.id))
                      }
                      onChange={(e) =>
                        setSelectedBillIds(e.target.checked ? bills.map((b) => b.id) : [])
                      }
                      className="h-3.5 w-3.5 rounded border-[var(--border-strong)] accent-emerald-700 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4 font-semibold">Bill #</th>
                  <th className="py-3 px-4 font-semibold">Supplier</th>
                  <th className="py-3 px-4 font-semibold">Issue Date</th>
                  <th className="py-3 px-4 font-semibold">Due Date</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Total</th>
                  <th className="py-3 px-4 font-semibold text-right">Outstanding</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {effectiveLoading && bills.length === 0 ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9} className="py-3 px-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                ) : bills.length > 0 ? (
                  bills.map((bill) => {
                    const isPaid = bill.status === 'PAID';
                    const isVoid = bill.status === 'VOID';
                    const isDraft = bill.status === 'DRAFT';
                    const isNonPayable = isPaid || isVoid || isDraft;
                    const isEditable = !isPaid && !isVoid;
                    const hasPayments = Number.parseFloat(bill.paidAmount || '0') > 0;
                    const isVoidable = !isPaid && !isVoid && !hasPayments;
                    const isOverdue = bill.status === 'OVERDUE' || bill.isOverdue;
                    const docCurr = bill.currency || orgCurrency;

                    return (
                      <tr
                        key={bill.id}
                        className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                      >
                        <td className="py-3 pl-4 pr-2 w-8">
                          <input
                            type="checkbox"
                            aria-label={`Select ${bill.billNumber}`}
                            checked={selectedBillIds.includes(bill.id)}
                            onChange={(e) =>
                              setSelectedBillIds((prev) =>
                                e.target.checked
                                  ? [...prev, bill.id]
                                  : prev.filter((id) => id !== bill.id),
                              )
                            }
                            className="h-3.5 w-3.5 rounded border-[var(--border-strong)] accent-emerald-700 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openDetailModal('bill', bill)}
                            className="hover:underline text-left cursor-pointer"
                          >
                            {bill.billNumber}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-medium text-[var(--text-primary)] max-w-[200px] truncate">
                          <div>{bill.supplierName}</div>
                          {bill.category && (
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {bill.category}
                              {bill.department ? ` • ${bill.department}` : ''}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[var(--text-secondary)] whitespace-nowrap font-mono">
                          {formatDate(bill.issueDate)}
                        </td>
                        <td className="py-3 px-4 text-[var(--text-secondary)] whitespace-nowrap font-mono">
                          {formatDate(bill.dueDate)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                              isPaid
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                                : isOverdue
                                  ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                                  : isNonPayable
                                    ? 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20'
                                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {bill.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                          {formatCurrency(bill.totalAmount, docCurr)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap text-red-600 dark:text-red-400">
                          {formatCurrency(bill.outstandingBalance, docCurr)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {renderRowActions({
                            type: 'bill',
                            record: bill,
                            docNumber: bill.billNumber,
                            docCurr,
                            isEditable,
                            isNonPayable,
                            isVoidable,
                          })}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-xs text-[var(--text-muted)]">
                      No supplier bills recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Invoice Modal */}
      <Modal
        isOpen={isInvoiceModalOpen}
        onClose={() => {
          setIsInvoiceModalOpen(false);
          resetInvoiceForm();
        }}
        title={editingInvoiceId ? 'Edit Customer Invoice (AR)' : 'Create Customer Invoice (AR)'}
        size="lg"
      >
        <form onSubmit={handleSaveInvoice} className="space-y-4">
          {modalError && (
            <div
              role="alert"
              className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{modalError}</span>
            </div>
          )}

          {editingInvoiceHasPayments && (
            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs">
              Monetary amounts, tax rate, line items, and currency are locked because payments have
              already been recorded on this invoice.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="invNum"
              label="Invoice Number *"
              required
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-2026-101"
            />
            <Input
              id="invCustomer"
              label="Customer Legal Name *"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Acme Enterprises"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="invCategory"
              label="Revenue Category *"
              value={invoiceCategory}
              onChange={(e) => setInvoiceCategory(e.target.value)}
              placeholder="e.g. Sales Revenue"
            />
            <Input
              id="invDepartment"
              label="Department (Optional)"
              value={invoiceDepartment}
              onChange={(e) => setInvoiceDepartment(e.target.value)}
              placeholder="e.g. Commercial Operations"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              id="invCurrency"
              label="Invoice Currency *"
              disabled={editingInvoiceHasPayments}
              value={invoiceCurrency || orgCurrency}
              onChange={(e) => setInvoiceCurrency(e.target.value)}
              options={SUPPORTED_CURRENCIES}
            />
            <Input
              id="invIssueDate"
              label="Issue Date *"
              type="date"
              required
              value={invoiceIssueDate}
              onChange={(e) => setInvoiceIssueDate(e.target.value)}
            />
            <Input
              id="invDueDate"
              label="Due Date *"
              type="date"
              required
              value={invoiceDueDate}
              onChange={(e) => setInvoiceDueDate(e.target.value)}
            />
          </div>

          {!editingInvoiceId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                id="invStatus"
                label="Initial Status"
                value={invoiceStatusInput}
                onChange={(e) => setInvoiceStatusInput(e.target.value as 'ISSUED' | 'DRAFT')}
                options={[
                  { value: 'ISSUED', label: 'ISSUED (Active Receivable)' },
                  { value: 'DRAFT', label: 'DRAFT (Editable before issuing)' },
                ]}
              />
              <Input
                id="invCustomerEmail"
                label="Customer Billing Email (Optional)"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="billing@customer.com"
              />
            </div>
          )}

          {editingInvoiceId && (
            <Input
              id="invCustomerEmail"
              label="Customer Billing Email (Optional)"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="billing@customer.com"
            />
          )}

          {/* Line Items Builder */}
          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Line Items & Tax Breakdown ({invoiceLineItems.length})
              </span>
              {!editingInvoiceHasPayments && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setInvoiceLineItems((prev) => [
                      ...prev,
                      { description: '', quantity: '1', unitPrice: '0', taxRate: invoiceTaxRate },
                    ])
                  }
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Line Item
                </Button>
              )}
            </div>

            {invoiceLineItems.length > 0 ? (
              <div className="space-y-2">
                {invoiceLineItems.map((li, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Input
                        id={`invLiDesc-${idx}`}
                        label={idx === 0 ? 'Description *' : undefined}
                        required
                        disabled={editingInvoiceHasPayments}
                        value={li.description}
                        onChange={(e) =>
                          setInvoiceLineItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, description: e.target.value } : row,
                            ),
                          )
                        }
                        placeholder="Item / service"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        id={`invLiQty-${idx}`}
                        label={idx === 0 ? 'Qty *' : undefined}
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        disabled={editingInvoiceHasPayments}
                        value={li.quantity}
                        onChange={(e) =>
                          setInvoiceLineItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, quantity: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        id={`invLiPrice-${idx}`}
                        label={idx === 0 ? 'Unit Price *' : undefined}
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        disabled={editingInvoiceHasPayments}
                        value={li.unitPrice}
                        onChange={(e) =>
                          setInvoiceLineItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, unitPrice: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        id={`invLiTax-${idx}`}
                        label={idx === 0 ? 'Tax %' : undefined}
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        disabled={editingInvoiceHasPayments}
                        value={li.taxRate}
                        onChange={(e) =>
                          setInvoiceLineItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, taxRate: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="col-span-1 flex justify-end pb-1">
                      {!editingInvoiceHasPayments && (
                        <button
                          type="button"
                          onClick={() =>
                            setInvoiceLineItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1.5 text-red-500 hover:bg-red-500/10 rounded cursor-pointer"
                          title="Remove line item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap justify-end gap-4 text-xs font-mono">
                  <span>
                    Subtotal:{' '}
                    <strong>
                      {formatCurrency(invoicePreview.subtotal, invoiceCurrency || orgCurrency)}
                    </strong>
                  </span>
                  <span>
                    Tax:{' '}
                    <strong>
                      {formatCurrency(invoicePreview.tax, invoiceCurrency || orgCurrency)}
                    </strong>
                  </span>
                  <span className="text-[var(--accent-teal)]">
                    Total:{' '}
                    <strong>
                      {formatCurrency(invoicePreview.total, invoiceCurrency || orgCurrency)}
                    </strong>
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="invAmount"
                  label="Total Amount *"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  disabled={editingInvoiceHasPayments}
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  placeholder="0.00"
                />
                <Input
                  id="invTaxRate"
                  label="Tax Rate % (Optional)"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  disabled={editingInvoiceHasPayments}
                  value={invoiceTaxRate}
                  onChange={(e) => setInvoiceTaxRate(e.target.value)}
                />
              </div>
            )}
          </div>

          <Input
            id="invNotes"
            label="Notes / Terms (Optional)"
            type="text"
            value={invoiceNotes}
            onChange={(e) => setInvoiceNotes(e.target.value)}
            placeholder="Payment due in 30 days"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setIsInvoiceModalOpen(false);
                resetInvoiceForm();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              {editingInvoiceId ? 'Save Invoice Changes' : 'Create Customer Invoice'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create / Edit Bill Modal */}
      <Modal
        isOpen={isBillModalOpen}
        onClose={() => {
          setIsBillModalOpen(false);
          resetBillForm();
        }}
        title={editingBillId ? 'Edit Supplier Bill (AP)' : 'Create Supplier Bill (AP)'}
        size="lg"
      >
        <form onSubmit={handleSaveBill} className="space-y-4">
          {modalError && (
            <div
              role="alert"
              className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{modalError}</span>
            </div>
          )}

          {editingBillHasPayments && (
            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs">
              Monetary amounts, tax rate, line items, and currency are locked because payments have
              already been recorded on this bill.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="billNum"
              label="Bill / Reference Number *"
              required
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
              placeholder="e.g. BILL-2026-880"
            />
            <Input
              id="billSupplier"
              label="Supplier / Vendor Name *"
              required
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="e.g. Global Hosting Services"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="billCategory"
              label="Expense Category *"
              value={billCategory}
              onChange={(e) => setBillCategory(e.target.value)}
              placeholder="e.g. Operating Expense"
            />
            <Input
              id="billDepartment"
              label="Department (Optional)"
              value={billDepartment}
              onChange={(e) => setBillDepartment(e.target.value)}
              placeholder="e.g. Manufacturing"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              id="billCurrency"
              label="Bill Currency *"
              disabled={editingBillHasPayments}
              value={billCurrency || orgCurrency}
              onChange={(e) => setBillCurrency(e.target.value)}
              options={SUPPORTED_CURRENCIES}
            />
            <Input
              id="billIssueDate"
              label="Issue Date *"
              type="date"
              required
              value={billIssueDate}
              onChange={(e) => setBillIssueDate(e.target.value)}
            />
            <Input
              id="billDueDate"
              label="Due Date *"
              type="date"
              required
              value={billDueDate}
              onChange={(e) => setBillDueDate(e.target.value)}
            />
          </div>

          {!editingBillId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                id="billStatus"
                label="Initial Status"
                value={billStatusInput}
                onChange={(e) => setBillStatusInput(e.target.value as 'OPEN' | 'DRAFT')}
                options={[
                  { value: 'OPEN', label: 'OPEN (Active Payable)' },
                  { value: 'DRAFT', label: 'DRAFT (Editable before posting)' },
                ]}
              />
              <Input
                id="billSupplierEmail"
                label="Supplier Email (Optional)"
                type="email"
                value={supplierEmail}
                onChange={(e) => setSupplierEmail(e.target.value)}
                placeholder="ap@supplier.com"
              />
            </div>
          )}

          {editingBillId && (
            <Input
              id="billSupplierEmail"
              label="Supplier Email (Optional)"
              type="email"
              value={supplierEmail}
              onChange={(e) => setSupplierEmail(e.target.value)}
              placeholder="ap@supplier.com"
            />
          )}

          {/* Bill Line Items Builder */}
          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Line Items & Tax Breakdown ({billLineItems.length})
              </span>
              {!editingBillHasPayments && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setBillLineItems((prev) => [
                      ...prev,
                      { description: '', quantity: '1', unitPrice: '0', taxRate: billTaxRate },
                    ])
                  }
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Line Item
                </Button>
              )}
            </div>

            {billLineItems.length > 0 ? (
              <div className="space-y-2">
                {billLineItems.map((li, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Input
                        id={`billLiDesc-${idx}`}
                        label={idx === 0 ? 'Description *' : undefined}
                        required
                        disabled={editingBillHasPayments}
                        value={li.description}
                        onChange={(e) =>
                          setBillLineItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, description: e.target.value } : row,
                            ),
                          )
                        }
                        placeholder="Expense item"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        id={`billLiQty-${idx}`}
                        label={idx === 0 ? 'Qty *' : undefined}
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        disabled={editingBillHasPayments}
                        value={li.quantity}
                        onChange={(e) =>
                          setBillLineItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, quantity: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        id={`billLiPrice-${idx}`}
                        label={idx === 0 ? 'Unit Price *' : undefined}
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        disabled={editingBillHasPayments}
                        value={li.unitPrice}
                        onChange={(e) =>
                          setBillLineItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, unitPrice: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        id={`billLiTax-${idx}`}
                        label={idx === 0 ? 'Tax %' : undefined}
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        disabled={editingBillHasPayments}
                        value={li.taxRate}
                        onChange={(e) =>
                          setBillLineItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, taxRate: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="col-span-1 flex justify-end pb-1">
                      {!editingBillHasPayments && (
                        <button
                          type="button"
                          onClick={() =>
                            setBillLineItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1.5 text-red-500 hover:bg-red-500/10 rounded cursor-pointer"
                          title="Remove line item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap justify-end gap-4 text-xs font-mono">
                  <span>
                    Subtotal:{' '}
                    <strong>{formatCurrency(billPreview.subtotal, billCurrency || orgCurrency)}</strong>
                  </span>
                  <span>
                    Tax:{' '}
                    <strong>{formatCurrency(billPreview.tax, billCurrency || orgCurrency)}</strong>
                  </span>
                  <span className="text-[var(--accent-teal)]">
                    Total:{' '}
                    <strong>{formatCurrency(billPreview.total, billCurrency || orgCurrency)}</strong>
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="billAmount"
                  label="Total Amount *"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  disabled={editingBillHasPayments}
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  placeholder="0.00"
                />
                <Input
                  id="billTaxRate"
                  label="Tax Rate % (Optional)"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  disabled={editingBillHasPayments}
                  value={billTaxRate}
                  onChange={(e) => setBillTaxRate(e.target.value)}
                />
              </div>
            )}
          </div>

          <Input
            id="billNotes"
            label="Notes (Optional)"
            type="text"
            value={billNotes}
            onChange={(e) => setBillNotes(e.target.value)}
            placeholder="Net 30 terms"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setIsBillModalOpen(false);
                resetBillForm();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              {editingBillId ? 'Save Bill Changes' : 'Create Supplier Bill'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={
          selectedTarget?.type === 'invoice'
            ? `Record Payment for ${selectedTarget?.number}`
            : `Settle Bill ${selectedTarget?.number}`
        }
        size="md"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          {modalError && (
            <div
              role="alert"
              className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{modalError}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)] flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">Outstanding Balance</span>
            <span className="font-mono font-bold text-sm text-[var(--accent-teal)]">
              {formatCurrency(
                selectedTarget?.outstanding,
                selectedTarget?.currency || orgCurrency,
              )}
            </span>
          </div>

          <Input
            id="payAmount"
            label={`Payment Amount (${selectedTarget?.currency || orgCurrency}) *`}
            type="number"
            step="0.01"
            min="0.01"
            required
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            placeholder="0.00"
          />

          <Input
            id="payDate"
            label="Payment Date *"
            type="date"
            required
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />

          <Select
            id="payMethod"
            label="Payment Method *"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            options={PAYMENT_METHODS}
          />

          {accounts.length > 0 && (
            <Select
              id="payAccount"
              label="Post Cash Movement to Account *"
              required
              value={paymentAccountId}
              onChange={(e) => setPaymentAccountId(e.target.value)}
              options={accounts.map((acc) => ({
                value: acc.id,
                label: `${acc.name} (${acc.currency})`,
              }))}
            />
          )}

          <Input
            id="payRef"
            label="Payment Reference / Transaction ID"
            type="text"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            placeholder="e.g. WIRE-8902, CHECK-401"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <Button variant="ghost" type="button" onClick={() => setIsPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Confirm Settlement
            </Button>
          </div>
        </form>
      </Modal>

      {/* Document Detail & Payment History Modal */}
      {detailTarget && (
        <Modal
          isOpen={true}
          onClose={() => setDetailTarget(null)}
          title={
            detailTarget.type === 'invoice'
              ? `Invoice Details — ${detailTarget.data.invoiceNumber}`
              : `Bill Details — ${detailTarget.data.billNumber}`
          }
          headerAction={
            canMutateLedger && detailTarget.data.status === 'DRAFT' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleActivateDraft(detailTarget.type, detailTarget.data.id)}
                className="bg-emerald-800 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {detailTarget.type === 'invoice' ? 'Issue Invoice' : 'Open Bill'}
              </Button>
            ) : undefined
          }
          size="lg"
        >
          {(() => {
            const doc = detailTarget.data;
            const docCurr = doc.currency || orgCurrency;
            const counterparty =
              detailTarget.type === 'invoice'
                ? (doc as Invoice).customerName
                : (doc as Bill).supplierName;
            return (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block uppercase">
                      {detailTarget.type === 'invoice' ? 'Customer' : 'Supplier'}
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">{counterparty}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block uppercase">
                      Status
                    </span>
                    <span className="font-mono font-bold text-[var(--accent-teal)]">
                      {doc.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block uppercase">
                      Category / Dept
                    </span>
                    <span className="text-[var(--text-primary)]">
                      {doc.category || '—'}
                      {doc.department ? ` • ${doc.department}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block uppercase">
                      Issue / Due
                    </span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {formatDate(doc.issueDate)} → {formatDate(doc.dueDate)}
                    </span>
                  </div>
                </div>

                {/* Line Items Breakdown */}
                {doc.lineItems && doc.lineItems.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="font-semibold text-[var(--text-primary)]">Line Items</h4>
                    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-[var(--surface-elevated)]/60 text-[10px] uppercase text-[var(--text-muted)]">
                          <tr>
                            <th className="py-2 px-3">Description</th>
                            <th className="py-2 px-3 text-right">Qty</th>
                            <th className="py-2 px-3 text-right">Unit Price</th>
                            <th className="py-2 px-3 text-right">Tax</th>
                            <th className="py-2 px-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {doc.lineItems.map((li, i) => (
                            <tr key={li.id || i}>
                              <td className="py-2 px-3">{li.description}</td>
                              <td className="py-2 px-3 text-right font-mono">{li.quantity}</td>
                              <td className="py-2 px-3 text-right font-mono">
                                {formatCurrency(li.unitPrice, docCurr)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono">
                                {formatCurrency(li.taxAmount || '0', docCurr)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-semibold">
                                {formatCurrency(li.lineTotal || '0', docCurr)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Financial Totals */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 rounded-xl border border-[var(--border-subtle)] font-mono">
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block font-sans">
                      Subtotal
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(doc.subtotalAmount || doc.totalAmount, docCurr)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block font-sans">
                      Tax (
                      {(() => {
                        const headerRate = Number.parseFloat(doc.taxRate || '0') || 0;
                        const items = Array.isArray(doc.lineItems) ? doc.lineItems : [];
                        const itemRates = items
                          .map((li) => Number.parseFloat(li.taxRate || ''))
                          .filter((r) => !Number.isNaN(r));
                        const distinctRates = Array.from(
                          new Set(itemRates.map((r) => Number(r.toFixed(4)))),
                        );
                        const sub = Number.parseFloat(doc.subtotalAmount || doc.totalAmount || '0') || 0;
                        const taxAmt = Number.parseFloat(doc.taxAmount || '0') || 0;
                        if (distinctRates.length > 1) {
                          const eff = sub > 0 ? (taxAmt / sub) * 100 : 0;
                          return `Mixed (~${Number(eff.toFixed(2))}%)`;
                        }
                        if (distinctRates.length === 1 && (distinctRates[0] > 0 || headerRate === 0)) {
                          return `${Number(distinctRates[0].toFixed(2))}%`;
                        }
                        if (headerRate === 0 && taxAmt > 0 && sub > 0) {
                          return `~${Number(((taxAmt / sub) * 100).toFixed(2))}%`;
                        }
                        return `${Number(headerRate.toFixed(2))}%`;
                      })()}
                      )
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(doc.taxAmount || '0', docCurr)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block font-sans">
                      Total
                    </span>
                    <span className="font-bold">{formatCurrency(doc.totalAmount, docCurr)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block font-sans">
                      Paid
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(doc.paidAmount, docCurr)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] block font-sans">
                      Outstanding
                    </span>
                    <span className="font-bold text-amber-700 dark:text-amber-400">
                      {formatCurrency(doc.outstandingBalance, docCurr)}
                    </span>
                  </div>
                </div>

                {doc.notes && (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/40 p-3 text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
                      Notes / Terms
                    </span>
                    <p className="text-[var(--text-secondary)] whitespace-pre-wrap">{doc.notes}</p>
                  </div>
                )}

                {/* Payment History */}
                <div className="space-y-1.5">
                  <h4 className="font-semibold text-[var(--text-primary)]">
                    Payment History ({doc.payments?.length || 0})
                  </h4>
                  {doc.payments && doc.payments.length > 0 ? (
                    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-[var(--surface-elevated)]/60 text-[10px] uppercase text-[var(--text-muted)]">
                          <tr>
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Method</th>
                            <th className="py-2 px-3">Reference</th>
                            <th className="py-2 px-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {doc.payments.map((p) => (
                            <tr key={p.id}>
                              <td className="py-2 px-3 font-mono">{formatDate(p.paymentDate)}</td>
                              <td className="py-2 px-3 font-mono">{p.method}</td>
                              <td className="py-2 px-3">{p.reference || '—'}</td>
                              <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(p.amount, p.currency || docCurr)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[var(--text-muted)] italic">
                      No payments recorded against this document yet.
                    </p>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
                  <Button variant="outline" size="sm" onClick={() => setDetailTarget(null)}>
                    Close
                  </Button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Void Document Confirmation Modal */}
      {voidTarget && (
        <Modal
          isOpen={true}
          onClose={() => setVoidTarget(null)}
          title={`Void ${voidTarget.type === 'invoice' ? 'Invoice' : 'Bill'} ${voidTarget.number}`}
          size="md"
        >
          <form onSubmit={handleVoidSubmit} className="space-y-4">
            {modalError && (
              <div
                role="alert"
                className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{modalError}</span>
              </div>
            )}

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Voiding <strong>{voidTarget.number}</strong> marks it as <code>VOID</code>, zeroes
              its outstanding balance, blocks all future payments, and writes an immutable audit
              record.
            </p>

            <Input
              id="voidReason"
              label="Void Reason (Optional)"
              type="text"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Duplicate entry or cancelled order"
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
              <Button variant="ghost" type="button" onClick={() => setVoidTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isLoading={isSubmitting}>
                Confirm Void
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Document Import Modal (PDF, JPG, JPEG, PNG) */}
      {importDocTarget && activeOrg?.id && (
        <DocumentImportModal
          isOpen={true}
          onClose={() => setImportDocTarget(null)}
          documentType={importDocTarget}
          orgId={activeOrg.id}
          orgCurrency={orgCurrency}
          onSuccess={handleRefresh}
        />
      )}
    </div>
  );
}
