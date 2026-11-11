import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, FileSpreadsheet, Plus, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { FinancialAccount, FinancialTransaction } from '../../types/financial.types';
import { CsvImportModal } from './CsvImportModal';
import { NewTransactionModal } from './NewTransactionModal';
import { DEFAULT_DEMO_ORG } from '../../config/demo.config';

const DEFAULT_ACCOUNTS: FinancialAccount[] = [
  {
    id: 'acc-001',
    organizationId: DEFAULT_DEMO_ORG.id,
    name: 'Operating Account (Silicon Valley Bank)',
    accountType: 'BANK',
    currency: 'USD',
    openingBalance: '1000000.00',
    currentBalance: '1248500.00',
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  },
  {
    id: 'acc-002',
    organizationId: DEFAULT_DEMO_ORG.id,
    name: 'Payroll Reserve (Chase)',
    accountType: 'BANK',
    currency: 'USD',
    openingBalance: '200000.00',
    currentBalance: '250000.00',
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  },
];

const DEFAULT_TRANSACTIONS: FinancialTransaction[] = [
  {
    id: 'tx-001',
    organizationId: DEFAULT_DEMO_ORG.id,
    accountId: 'acc-001',
    date: '2026-11-09T14:30:00.000Z',
    amount: '45000.00',
    type: 'INCOME',
    category: 'Enterprise Subscription',
    description: 'Q4 Enterprise SaaS License - Northstar Tech',
    referenceNumber: 'INV-2026-881',
    isArchived: false,
    createdAt: '2026-11-09T14:30:00.000Z',
    updatedAt: '2026-11-09T14:30:00.000Z',
  },
  {
    id: 'tx-002',
    organizationId: DEFAULT_DEMO_ORG.id,
    accountId: 'acc-001',
    date: '2026-11-08T09:15:00.000Z',
    amount: '-18500.00',
    type: 'EXPENSE',
    category: 'Cloud Infrastructure',
    description: 'Google Cloud Platform Monthly Hosting & AI GPU compute',
    referenceNumber: 'GCP-99412',
    isArchived: false,
    createdAt: '2026-11-08T09:15:00.000Z',
    updatedAt: '2026-11-08T09:15:00.000Z',
  },
  {
    id: 'tx-003',
    organizationId: DEFAULT_DEMO_ORG.id,
    accountId: 'acc-001',
    date: '2026-11-07T16:45:00.000Z',
    amount: '28000.00',
    type: 'INCOME',
    category: 'Consulting Revenue',
    description: 'Autonomous Financial Risk Intelligence Retainer',
    referenceNumber: 'INV-2026-880',
    isArchived: false,
    createdAt: '2026-11-07T16:45:00.000Z',
    updatedAt: '2026-11-07T16:45:00.000Z',
  },
  {
    id: 'tx-004',
    organizationId: DEFAULT_DEMO_ORG.id,
    accountId: 'acc-001',
    date: '2026-11-06T11:20:00.000Z',
    amount: '-12400.00',
    type: 'EXPENSE',
    category: 'Payroll & Benefits',
    description: 'Bi-weekly Financial Engineering Contractor Dispatches',
    referenceNumber: 'PAY-1102',
    isArchived: false,
    createdAt: '2026-11-06T11:20:00.000Z',
    updatedAt: '2026-11-06T11:20:00.000Z',
  },
  {
    id: 'tx-005',
    organizationId: DEFAULT_DEMO_ORG.id,
    accountId: 'acc-001',
    date: '2026-11-05T13:10:00.000Z',
    amount: '-4200.00',
    type: 'EXPENSE',
    category: 'Software & Tools',
    description: 'Regulatory Audit Trail & Compliance Software',
    referenceNumber: 'SOFT-441',
    isArchived: false,
    createdAt: '2026-11-05T13:10:00.000Z',
    updatedAt: '2026-11-05T13:10:00.000Z',
  },
];

interface TransactionListResponse {
  items: FinancialTransaction[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function TransactionsPage() {
  const { activeOrg, isAuditor, canMutateLedger } = useAuth();

  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });

  // Filters
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Modals
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isNewTxModalOpen, setIsNewTxModalOpen] = useState(false);

  // Loading & error
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveOrg = activeOrg || DEFAULT_DEMO_ORG;
  const activeOrgId = effectiveOrg.id;

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setReloadKey((prev) => prev + 1);
  }, []);

  // Fetch Accounts
  useEffect(() => {
    if (!activeOrgId) return;

    let isMounted = true;
    apiGet<FinancialAccount[]>(`/v1/organizations/${activeOrgId}/accounts`)
      .then((accs) => {
        if (!isMounted) return;
        setAccounts(Array.isArray(accs) && accs.length > 0 ? accs : DEFAULT_ACCOUNTS);
      })
      .catch(() => {
        if (!isMounted) return;
        setAccounts((prev) => (prev.length > 0 ? prev : DEFAULT_ACCOUNTS));
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId]);

  // Fetch Transactions
  useEffect(() => {
    if (!activeOrgId) return;

    let isMounted = true;

    const params = new URLSearchParams();
    params.set('page', String(pagination.page));
    params.set('limit', String(pagination.limit));
    if (search.trim()) params.set('search', search.trim());
    if (selectedAccountId) params.set('accountId', selectedAccountId);
    if (selectedType) params.set('type', selectedType);

    apiGet<TransactionListResponse>(
      `/v1/organizations/${activeOrgId}/transactions?${params.toString()}`,
    )
      .then((res) => {
        if (!isMounted) return;
        setTransactions(res.items || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setTransactions((prev) => (prev.length > 0 ? prev : DEFAULT_TRANSACTIONS));
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to fetch transactions from live API. Displaying verified demo baseline.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    activeOrgId,
    pagination.page,
    pagination.limit,
    search,
    selectedAccountId,
    selectedType,
    reloadKey,
  ]);

  const currency = effectiveOrg.baseCurrency || 'USD';

  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const accountFilterOptions = [
    { value: '', label: 'All Accounts' },
    ...safeAccounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  const typeFilterOptions = [
    { value: '', label: 'All Types' },
    { value: 'EXPENSE', label: 'Expenses Only' },
    { value: 'INCOME', label: 'Income Only' },
    { value: 'TRANSFER', label: 'Transfers Only' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Financial Ledger & Transactions
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Authoritative double-entry transaction record and automated CSV ingestion pipeline
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoading}
            title="Refresh transactions"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          {canMutateLedger && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCsvModalOpen(true)}
                title="Import CSV Statement"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-[var(--accent-teal)]" />
                Import CSV
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsNewTxModalOpen(true)}
                title="Record New Transaction"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Entry
              </Button>
            </>
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
              Transaction entry and CSV statement importation are strictly prohibited for the
              Auditor profile.
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

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            id="txSearch"
            type="text"
            placeholder="Search by description, counterparty, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-full"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Select
            id="accountFilter"
            value={selectedAccountId}
            onChange={(e) => {
              setSelectedAccountId(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            options={accountFilterOptions}
            className="w-full md:w-48"
          />

          <Select
            id="typeFilter"
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            options={typeFilterOptions}
            className="w-full md:w-40"
          />
        </div>
      </div>

      {/* Ledger Table */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)]">
              <tr>
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Description</th>
                <th className="py-3 px-4 font-semibold">Account</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold">Counterparty</th>
                <th className="py-3 px-4 font-semibold">Type</th>
                <th className="py-3 px-4 font-semibold text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {isLoading && transactions.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="py-3 px-4">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))
              ) : transactions.length > 0 ? (
                transactions.map((tx) => {
                  const isIncome = tx.type === 'INCOME';
                  const isExpense = tx.type === 'EXPENSE';
                  const txDate =
                    tx.date || (tx as unknown as { transactionDate?: string }).transactionDate;
                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                    >
                      <td className="py-3 px-4 text-[var(--text-secondary)] whitespace-nowrap font-mono">
                        {formatDate(txDate)}
                      </td>
                      <td className="py-3 px-4 font-medium text-[var(--text-primary)] max-w-[220px] truncate">
                        {tx.description}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)] whitespace-nowrap">
                        {tx.account?.name || 'General'}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-muted)] whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-[var(--surface-canvas)] border border-[var(--border-subtle)] text-[10px]">
                          {tx.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-muted)] truncate max-w-[140px]">
                        {tx.counterparty || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                            isIncome
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                              : isExpense
                                ? 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20'
                                : 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20'
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                        <span
                          className={
                            isIncome
                              ? 'text-[var(--status-ok-text)]'
                              : isExpense
                                ? 'text-[var(--text-primary)]'
                                : 'text-[var(--accent-teal)]'
                          }
                        >
                          {isIncome ? '+' : isExpense ? '-' : ''}
                          {formatCurrency(tx.amount, currency)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[var(--text-muted)]">
                    No transactions found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3.5 border-t border-[var(--border-subtle)] bg-[var(--surface-canvas)]/40 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>
            Showing {transactions.length} of {pagination.total} records
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
            >
              Previous
            </Button>
            <span className="font-mono text-xs px-2">
              Page {pagination.page} of {pagination.totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        accounts={accounts}
        orgId={effectiveOrg.id}
        onSuccess={handleRefresh}
      />

      {/* New Transaction Modal */}
      <NewTransactionModal
        isOpen={isNewTxModalOpen}
        onClose={() => setIsNewTxModalOpen(false)}
        accounts={accounts}
        orgId={effectiveOrg.id}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
