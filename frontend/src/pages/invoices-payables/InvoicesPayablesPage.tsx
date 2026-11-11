import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, FilePlus, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { BillStatus, InvoiceStatus, type Bill, type Invoice } from '../../types/financial.types';
import { RoleType } from '../../types/auth.types';
import { DEFAULT_DEMO_ORG } from '../../config/demo.config';

interface AgingBucket {
  current: string;
  days1to30: string;
  days31to60: string;
  days61to90: string;
  days90Plus: string;
  totalOutstanding: string;
}

interface AgingReportResponse {
  organizationId: string;
  asOfDate: string;
  receivablesAging: AgingBucket;
  payablesAging: AgingBucket;
}

const DEFAULT_INVOICES: Invoice[] = [
  {
    id: 'inv-001',
    organizationId: DEFAULT_DEMO_ORG.id,
    invoiceNumber: 'INV-2026-881',
    customerName: 'Northstar Technologies LLC',
    issueDate: '2026-10-15T00:00:00.000Z',
    dueDate: '2026-11-15T00:00:00.000Z',
    totalAmount: '45000.00',
    paidAmount: '0.00',
    outstandingBalance: '45000.00',
    currency: 'USD',
    status: InvoiceStatus.SENT,
    notes: 'Enterprise platform subscription Q4',
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
  },
  {
    id: 'inv-002',
    organizationId: DEFAULT_DEMO_ORG.id,
    invoiceNumber: 'INV-2026-880',
    customerName: 'Summit Horizon Capital',
    issueDate: '2026-10-01T00:00:00.000Z',
    dueDate: '2026-10-31T00:00:00.000Z',
    totalAmount: '28000.00',
    paidAmount: '28000.00',
    outstandingBalance: '0.00',
    currency: 'USD',
    status: InvoiceStatus.PAID,
    notes: 'Monthly strategic risk intelligence retainer',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
  },
  {
    id: 'inv-003',
    organizationId: DEFAULT_DEMO_ORG.id,
    invoiceNumber: 'INV-2026-842',
    customerName: 'Cascade Retail Partners',
    issueDate: '2026-09-10T00:00:00.000Z',
    dueDate: '2026-10-10T00:00:00.000Z',
    totalAmount: '35000.00',
    paidAmount: '0.00',
    outstandingBalance: '35000.00',
    currency: 'USD',
    status: InvoiceStatus.OVERDUE,
    notes: '34 days past due. Working capital reminder sent.',
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
  },
];

const DEFAULT_BILLS: Bill[] = [
  {
    id: 'bill-001',
    organizationId: DEFAULT_DEMO_ORG.id,
    billNumber: 'BILL-GCP-9941',
    supplierName: 'Google Cloud EMEA Ltd',
    issueDate: '2026-11-01T00:00:00.000Z',
    dueDate: '2026-11-30T00:00:00.000Z',
    totalAmount: '18500.00',
    paidAmount: '0.00',
    outstandingBalance: '18500.00',
    currency: 'USD',
    status: BillStatus.RECEIVED,
    notes: 'AI model compute and production cluster hosting',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'bill-002',
    organizationId: DEFAULT_DEMO_ORG.id,
    billNumber: 'BILL-AWS-3312',
    supplierName: 'Amazon Web Services Inc',
    issueDate: '2026-10-15T00:00:00.000Z',
    dueDate: '2026-11-15T00:00:00.000Z',
    totalAmount: '6200.00',
    paidAmount: '0.00',
    outstandingBalance: '6200.00',
    currency: 'USD',
    status: BillStatus.RECEIVED,
    notes: 'Database replication and cold archive storage',
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
  },
];

const DEFAULT_AGING: AgingReportResponse = {
  organizationId: DEFAULT_DEMO_ORG.id,
  asOfDate: '2026-11-10T00:00:00.000Z',
  receivablesAging: {
    current: '142000.00',
    days1to30: '35000.00',
    days31to60: '12500.00',
    days61to90: '4200.00',
    days90Plus: '1800.00',
    totalOutstanding: '195500.00',
  },
  payablesAging: {
    current: '88000.00',
    days1to30: '22000.00',
    days31to60: '6500.00',
    days61to90: '0.00',
    days90Plus: '0.00',
    totalOutstanding: '116500.00',
  },
};

const PAYMENT_METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer / Wire' },
  { value: 'CREDIT_CARD', label: 'Corporate Credit Card' },
  { value: 'CHECK', label: 'Check' },
  { value: 'CASH', label: 'Cash' },
  { value: 'OTHER', label: 'Other Electronic' },
];

export function InvoicesPayablesPage() {
  const { activeOrg, isAuditor, canMutateLedger, hasRole } = useAuth();

  const [activeTab, setActiveTab] = useState<'invoices' | 'bills'>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [agingData, setAgingData] = useState<AgingReportResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // New Invoice Modal
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [invoiceIssueDate, setInvoiceIssueDate] = useState(
    () => new Date().toISOString().split('T')[0],
  );
  const [invoiceDueDate, setInvoiceDueDate] = useState(
    () => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
  );
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');

  // New Bill Modal
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [billNumber, setBillNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [billIssueDate, setBillIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [billDueDate, setBillDueDate] = useState(
    () => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
  );
  const [billAmount, setBillAmount] = useState('');
  const [billNotes, setBillNotes] = useState('');

  // Record Payment Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<{
    id: string;
    type: 'invoice' | 'bill';
    number: string;
    outstanding: string;
  } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const effectiveOrg = activeOrg || DEFAULT_DEMO_ORG;
  const activeOrgId = effectiveOrg.id;

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!activeOrgId) return;

    let isMounted = true;

    Promise.all([
      apiGet<Invoice[]>(`/v1/organizations/${activeOrgId}/invoices`),
      apiGet<Bill[]>(`/v1/organizations/${activeOrgId}/bills`),
      apiGet<AgingReportResponse>(`/v1/organizations/${activeOrgId}/aging`),
    ])
      .then(([invs, bls, aging]) => {
        if (!isMounted) return;
        setInvoices(invs || []);
        setBills(bls || []);
        setAgingData(aging);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setInvoices((prev) => (prev.length > 0 ? prev : DEFAULT_INVOICES));
        setBills((prev) => (prev.length > 0 ? prev : DEFAULT_BILLS));
        setAgingData((prev) => prev || DEFAULT_AGING);
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError(
            'Failed to fetch invoices, bills, and aging data from live API. Displaying verified demo baseline.',
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, reloadKey]);

  const currency = effectiveOrg.baseCurrency || 'USD';
  const canCreateBills = canMutateLedger || hasRole([RoleType.OPERATIONS_MANAGER]);

  // Handle New Invoice Submit
  const handleCreateInvoice = async (e: FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber || !customerName || !invoiceAmount) {
      setModalError('Please fill in invoice number, customer name, and amount.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiPost(`/v1/organizations/${activeOrgId}/invoices`, {
        invoiceNumber: invoiceNumber.trim(),
        customerName: customerName.trim(),
        ...(customerEmail ? { customerEmail: customerEmail.trim() } : {}),
        issueDate: new Date(invoiceIssueDate).toISOString(),
        dueDate: new Date(invoiceDueDate).toISOString(),
        totalAmount: Number.parseFloat(invoiceAmount).toFixed(4),
        currency,
        ...(invoiceNotes ? { notes: invoiceNotes.trim() } : {}),
      });

      setIsInvoiceModalOpen(false);
      setInvoiceNumber('');
      setCustomerName('');
      setInvoiceAmount('');
      handleRefresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError('Failed to create customer invoice.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle New Bill Submit
  const handleCreateBill = async (e: FormEvent) => {
    e.preventDefault();
    if (!billNumber || !supplierName || !billAmount) {
      setModalError('Please fill in bill number, supplier name, and amount.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiPost(`/v1/organizations/${activeOrgId}/bills`, {
        billNumber: billNumber.trim(),
        supplierName: supplierName.trim(),
        ...(supplierEmail ? { supplierEmail: supplierEmail.trim() } : {}),
        issueDate: new Date(billIssueDate).toISOString(),
        dueDate: new Date(billDueDate).toISOString(),
        totalAmount: Number.parseFloat(billAmount).toFixed(4),
        currency,
        ...(billNotes ? { notes: billNotes.trim() } : {}),
      });

      setIsBillModalOpen(false);
      setBillNumber('');
      setSupplierName('');
      setBillAmount('');
      handleRefresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError('Failed to create supplier bill.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Record Payment Submit
  const handleRecordPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTarget || !paymentAmount) {
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
        paymentMethod,
        ...(paymentReference ? { reference: paymentReference.trim() } : {}),
      });

      setIsPaymentModalOpen(false);
      setSelectedTarget(null);
      setPaymentAmount('');
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
  ) => {
    setSelectedTarget({ id, type, number, outstanding });
    setPaymentAmount(outstanding);
    setModalError(null);
    setIsPaymentModalOpen(true);
  };

  const currentAging =
    activeTab === 'invoices' ? agingData?.receivablesAging : agingData?.payablesAging;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Invoices & Payables Management
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Deterministic Accounts Receivable (AR) & Accounts Payable (AP) tracking with overdue
            aging
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoading}
            title="Refresh records"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          {canCreateBills && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setModalError(null);
                setIsBillModalOpen(true);
              }}
            >
              <FilePlus className="w-3.5 h-3.5 mr-1.5" />
              New Bill (AP)
            </Button>
          )}

          {canMutateLedger && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setModalError(null);
                setIsInvoiceModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Invoice (AR)
            </Button>
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
              Invoices, bills, and payment settlements are visible for inspection only. Creation and
              settlement actions are blocked.
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

      {/* Aging Schedule Bar */}
      {currentAging && (
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[var(--text-primary)]">
              {activeTab === 'invoices' ? 'Accounts Receivable' : 'Accounts Payable'} Aging Schedule
            </span>
            <span className="font-mono font-bold text-sm text-[var(--accent-teal)]">
              Total Outstanding: {formatCurrency(currentAging.totalOutstanding, currency)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">Current</span>
              <span className="font-mono font-bold text-sm mt-0.5 block truncate">
                {formatCurrency(currentAging.current, currency, 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                1-30 Days
              </span>
              <span className="font-mono font-bold text-sm mt-0.5 block truncate">
                {formatCurrency(currentAging.days1to30, currency, 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                31-60 Days
              </span>
              <span className="font-mono font-bold text-sm mt-0.5 block truncate">
                {formatCurrency(currentAging.days31to60, currency, 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--surface-canvas)] border border-amber-500/20 text-amber-700 dark:text-amber-400">
              <span className="text-[10px] uppercase block opacity-80">61-90 Days</span>
              <span className="font-mono font-bold text-sm mt-0.5 block truncate">
                {formatCurrency(currentAging.days61to90, currency, 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--surface-canvas)] border border-red-500/20 text-red-600 dark:text-red-400">
              <span className="text-[10px] uppercase block opacity-80">90+ Days</span>
              <span className="font-mono font-bold text-sm mt-0.5 block truncate">
                {formatCurrency(currentAging.days90Plus, currency, 0)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Row */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
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
          onClick={() => setActiveTab('bills')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 cursor-pointer transition-all ${
            activeTab === 'bills'
              ? 'border-[var(--accent-teal)] text-[var(--accent-primary)] font-bold'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          Supplier Bills ({bills.length})
        </button>
      </div>

      {/* Invoices Table View */}
      {activeTab === 'invoices' && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)]">
                <tr>
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
                {isLoading && invoices.length === 0 ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="py-3 px-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                ) : invoices.length > 0 ? (
                  invoices.map((inv) => {
                    const isPaid = inv.status === 'PAID';
                    const isOverdue = inv.status === 'OVERDUE' || inv.isOverdue;
                    return (
                      <tr
                        key={inv.id}
                        className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-3 px-4 font-medium text-[var(--text-primary)] max-w-[200px] truncate">
                          {inv.customerName}
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
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                          {formatCurrency(inv.totalAmount, inv.currency || currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap text-amber-700 dark:text-amber-400">
                          {formatCurrency(inv.outstandingBalance, inv.currency || currency)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {!isPaid && canMutateLedger && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                openPaymentModal(
                                  inv.id,
                                  'invoice',
                                  inv.invoiceNumber,
                                  inv.outstandingBalance,
                                )
                              }
                            >
                              Record Payment
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-[var(--text-muted)]">
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
                {isLoading && bills.length === 0 ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="py-3 px-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                ) : bills.length > 0 ? (
                  bills.map((bill) => {
                    const isPaid = bill.status === 'PAID';
                    const isOverdue = bill.status === 'OVERDUE' || bill.isOverdue;
                    return (
                      <tr
                        key={bill.id}
                        className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                          {bill.billNumber}
                        </td>
                        <td className="py-3 px-4 font-medium text-[var(--text-primary)] max-w-[200px] truncate">
                          {bill.supplierName}
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
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {bill.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                          {formatCurrency(bill.totalAmount, bill.currency || currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap text-red-600 dark:text-red-400">
                          {formatCurrency(bill.outstandingBalance, bill.currency || currency)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {!isPaid && canMutateLedger && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                openPaymentModal(
                                  bill.id,
                                  'bill',
                                  bill.billNumber,
                                  bill.outstandingBalance,
                                )
                              }
                            >
                              Settle Bill
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-[var(--text-muted)]">
                      No supplier bills recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Invoice Modal */}
      <Modal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        title="Create Customer Invoice (AR)"
        size="lg"
      >
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          {modalError && (
            <div
              role="alert"
              className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{modalError}</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              id="invAmount"
              label="Total Amount *"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={invoiceAmount}
              onChange={(e) => setInvoiceAmount(e.target.value)}
              placeholder="0.00"
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

          <Input
            id="invCustomerEmail"
            label="Customer Billing Email (Optional)"
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="billing@customer.com"
          />

          <Input
            id="invNotes"
            label="Notes / Terms (Optional)"
            type="text"
            value={invoiceNotes}
            onChange={(e) => setInvoiceNotes(e.target.value)}
            placeholder="Payment due in 30 days"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <Button variant="ghost" type="button" onClick={() => setIsInvoiceModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Create Customer Invoice
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Bill Modal */}
      <Modal
        isOpen={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        title="Create Supplier Bill (AP)"
        size="lg"
      >
        <form onSubmit={handleCreateBill} className="space-y-4">
          {modalError && (
            <div
              role="alert"
              className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{modalError}</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              id="billAmount"
              label="Total Amount *"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={billAmount}
              onChange={(e) => setBillAmount(e.target.value)}
              placeholder="0.00"
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

          <Input
            id="billSupplierEmail"
            label="Supplier Email (Optional)"
            type="email"
            value={supplierEmail}
            onChange={(e) => setSupplierEmail(e.target.value)}
            placeholder="ap@supplier.com"
          />

          <Input
            id="billNotes"
            label="Notes (Optional)"
            type="text"
            value={billNotes}
            onChange={(e) => setBillNotes(e.target.value)}
            placeholder="Net 30 terms"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <Button variant="ghost" type="button" onClick={() => setIsBillModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Create Supplier Bill
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
              {formatCurrency(selectedTarget?.outstanding, currency)}
            </span>
          </div>

          <Input
            id="payAmount"
            label="Payment Amount *"
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
            onChange={(e) => setPaymentMethod(e.target.value)}
            options={PAYMENT_METHODS}
          />

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
    </div>
  );
}
