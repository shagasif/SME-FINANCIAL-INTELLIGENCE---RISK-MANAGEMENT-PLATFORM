import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  FileSpreadsheet,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, ApiClientError, authStorage } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import {
  formatCurrency,
  formatDate,
  formatSignedCurrency,
  resolveReportingCurrency,
} from '../../utils/formatters';
import type { FinancialAccount, FinancialTransaction } from '../../types/financial.types';
import { CsvImportModal } from './CsvImportModal';
import { NewTransactionModal } from './NewTransactionModal';
import { ManageAccountsModal } from './ManageAccountsModal';

export type TransactionSortField =
  | 'transactionDate'
  | 'description'
  | 'type'
  | 'amount'
  | 'category'
  | 'counterparty';

export type SortOrder = 'asc' | 'desc';

interface CurrencySummaryBreakdown {
  currency: string;
  totalTransactions: number;
  incomeCount: number;
  expenseCount: number;
  transferCount: number;
  totalIncome: string;
  totalExpenses: string;
  netCashMovement: string;
}

interface TransactionSummary {
  totalTransactions: number;
  incomeCount: number;
  expenseCount: number;
  transferCount: number;
  currency: string | null;
  isComplete?: boolean;
  missingCurrencies?: string[];
  appliedRates?: Array<{
    fromCurrency: string;
    toCurrency: string;
    rate: string;
    effectiveDate: string;
    source: string;
  }>;
  hasMixedCurrencies: boolean;
  totalIncome: string | null;
  totalExpenses: string | null;
  netCashMovement: string | null;
  byCurrency: CurrencySummaryBreakdown[];
}

interface TransactionListResponse {
  items: FinancialTransaction[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary?: TransactionSummary;
}

export function TransactionsPage() {
  const { activeOrg, isLoading: isAuthLoading, isAuditor, canMutateLedger } = useAuth();

  const hasToken = Boolean(authStorage.getToken());
  const effectiveOrg = activeOrg || null;
  const activeOrgId = effectiveOrg?.id ?? null;

  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState<TransactionSummary | null>(null);

  // Filters & sorting
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [sortBy, setSortBy] = useState<TransactionSortField>('transactionDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [reloadKey, setReloadKey] = useState(0);

  // Modals
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isNewTxModalOpen, setIsNewTxModalOpen] = useState(false);
  const [isAccountsModalOpen, setIsAccountsModalOpen] = useState(false);

  // Loading & error
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(activeOrgId));
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = useCallback(() => {
    setError(null);
    setIsLoading(true);
    setReloadKey((prev) => prev + 1);
  }, []);

  const handleSort = useCallback(
    (field: TransactionSortField) => {
      if (sortBy === field) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(field);
        setSortOrder(field === 'transactionDate' || field === 'amount' ? 'desc' : 'asc');
      }
      setPagination((p) => ({ ...p, page: 1 }));
    },
    [sortBy],
  );

  // Fetch Accounts
  useEffect(() => {
    if (hasToken && (isAuthLoading || !activeOrgId)) return;
    if (!activeOrgId) return;

    const controller = new AbortController();
    let isMounted = true;

    apiGet<FinancialAccount[]>(`/v1/organizations/${activeOrgId}/accounts`, controller.signal)
      .then((accs) => {
        if (!isMounted || controller.signal.aborted) return;
        setAccounts(Array.isArray(accs) ? accs : []);
      })
      .catch(() => {
        if (!isMounted || controller.signal.aborted) return;
        setAccounts([]);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [activeOrgId, hasToken, isAuthLoading]);

  // Fetch Transactions (with AbortController to eliminate concurrent search/filter race conditions)
  useEffect(() => {
    if (hasToken && (isAuthLoading || !activeOrgId)) return;
    if (!activeOrgId) return;

    const controller = new AbortController();
    let isMounted = true;

    const params = new URLSearchParams();
    params.set('page', String(pagination.page));
    params.set('limit', String(pagination.limit));
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    if (search.trim()) params.set('search', search.trim());
    if (selectedAccountId) params.set('accountId', selectedAccountId);
    if (selectedType) params.set('type', selectedType);

    apiGet<TransactionListResponse>(
      `/v1/organizations/${activeOrgId}/transactions?${params.toString()}`,
      controller.signal,
    )
      .then((res) => {
        if (!isMounted || controller.signal.aborted) return;
        setError(null);
        setTransactions(res.items || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
        setSummary(res.summary ?? null);
      })
      .catch((err: unknown) => {
        if (!isMounted || controller.signal.aborted) return;
        setTransactions([]);
        setSummary(null);
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to fetch financial transactions from live API. Please try again.');
        }
      })
      .finally(() => {
        if (isMounted && !controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [
    activeOrgId,
    pagination.page,
    pagination.limit,
    search,
    selectedAccountId,
    selectedType,
    sortBy,
    sortOrder,
    reloadKey,
    hasToken,
    isAuthLoading,
  ]);

  const currency = resolveReportingCurrency(effectiveOrg?.baseCurrency);
  const isPageLoading = (hasToken && (isAuthLoading || !activeOrg)) || isLoading;

  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const accountMap = Object.fromEntries(safeAccounts.map((a) => [a.id, a]));
  const selectedAccount = safeAccounts.find((a) => a.id === selectedAccountId);
  const summaryCurrency = resolveReportingCurrency(effectiveOrg?.baseCurrency, summary?.currency);

  const activeCardCurrency = selectedAccount
    ? resolveReportingCurrency(selectedAccount.currency)
    : summaryCurrency;

  const accountBreakdown = selectedAccount
    ? summary?.byCurrency?.find(
        (b) => b.currency.toUpperCase() === activeCardCurrency.toUpperCase(),
      )
    : null;

  const isSummaryIncomplete = selectedAccount ? false : summary?.isComplete === false;
  const nativeBreakdowns = selectedAccount
    ? []
    : (summary?.byCurrency ?? []).filter((b) => b.currency !== summaryCurrency);

  const displayTotalTransactions = selectedAccount
    ? (accountBreakdown?.totalTransactions ??
      (summary?.totalTransactions === 0 ? 0 : summary?.totalTransactions ?? pagination.total))
    : (summary ? summary.totalTransactions : pagination.total);

  const displayIncomeCount = selectedAccount
    ? (accountBreakdown?.incomeCount ?? (summary?.totalTransactions === 0 ? 0 : summary?.incomeCount ?? 0))
    : (summary?.incomeCount ?? 0);

  const displayExpenseCount = selectedAccount
    ? (accountBreakdown?.expenseCount ?? (summary?.totalTransactions === 0 ? 0 : summary?.expenseCount ?? 0))
    : (summary?.expenseCount ?? 0);

  const displayIncome = selectedAccount
    ? (accountBreakdown?.totalIncome ??
      (summary?.totalTransactions === 0
        ? '0.0000'
        : selectedAccount.currency.toUpperCase() === summaryCurrency.toUpperCase()
          ? summary?.totalIncome
          : '0.0000'))
    : summary?.totalIncome;

  const displayExpenses = selectedAccount
    ? (accountBreakdown?.totalExpenses ??
      (summary?.totalTransactions === 0
        ? '0.0000'
        : selectedAccount.currency.toUpperCase() === summaryCurrency.toUpperCase()
          ? summary?.totalExpenses
          : '0.0000'))
    : summary?.totalExpenses;

  const displayNetCash = selectedAccount
    ? (accountBreakdown?.netCashMovement ??
      (summary?.totalTransactions === 0
        ? '0.0000'
        : selectedAccount.currency.toUpperCase() === summaryCurrency.toUpperCase()
          ? summary?.netCashMovement
          : '0.0000'))
    : summary?.netCashMovement;

  const accountFilterOptions = [
    { value: '', label: 'All Accounts' },
    ...safeAccounts.map((a) => ({
      value: a.id,
      label: `${a.name} (${a.currency})`,
    })),
  ];

  const typeFilterOptions = [
    { value: '', label: 'All Types' },
    { value: 'EXPENSE', label: 'Expenses Only' },
    { value: 'INCOME', label: 'Income Only' },
    { value: 'TRANSFER', label: 'Transfers Only' },
  ];

  const renderSortIcon = (field: TransactionSortField) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-[var(--accent-teal)]" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[var(--accent-teal)]" />
    );
  };

  const renderSortableHeader = (
    field: TransactionSortField,
    label: string,
    alignRight = false,
  ) => {
    const isActive = sortBy === field;
    return (
      <th
        className={`py-3 px-4 font-semibold ${alignRight ? 'text-right' : ''}`}
        aria-sort={isActive ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => handleSort(field)}
          className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text-primary)] transition-colors cursor-pointer ${
            alignRight ? 'justify-end ml-auto' : ''
          } ${isActive ? 'text-[var(--text-primary)]' : ''}`}
        >
          <span>{label}</span>
          {renderSortIcon(field)}
        </button>
      </th>
    );
  };

  const netCashNumeric =
    displayNetCash !== null && displayNetCash !== undefined
      ? Number.parseFloat(displayNetCash)
      : null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Financial Ledger & Transactions
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Authoritative transaction record and automated financial statement ingestion pipeline
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

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAccountsModalOpen(true)}
            title="Manage Financial Accounts"
          >
            <Building2 className="w-3.5 h-3.5 mr-1.5 text-[var(--accent-teal)]" />
            Accounts ({safeAccounts.length})
          </Button>

          {canMutateLedger && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCsvModalOpen(true)}
                title="Import Financial File"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-[var(--accent-teal)]" />
                Import File
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

      {/* Unassigned Active Organization Notice */}
      {hasToken && !isAuthLoading && !activeOrg && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <span className="font-semibold block mb-0.5">No Active Organization Membership</span>
            <span className="leading-relaxed opacity-90">
              Your account currently does not belong to an active organization. Please contact your
              platform administrator or organization owner.
            </span>
          </div>
        </div>
      )}

      {/* Unauthenticated Sign-In Notice */}
      {!hasToken && !isAuthLoading && !activeOrg && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <span className="font-semibold block mb-0.5">Authentication Required</span>
            <span className="leading-relaxed opacity-90">
              Please sign in to inspect your organization&apos;s live financial ledger and account
              balances.
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

      {/* Ledger Summary Cards (4 KPI Cards — Minimal Modern Cashly-Inspired Architecture) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Transactions */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:p-5 shadow-xs hover:border-[var(--border-strong)] transition-all flex flex-col justify-between min-h-[135px]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] truncate">
              Total Transactions
            </span>
            <ListChecks className="w-4 h-4 text-[var(--accent-teal)] shrink-0" />
          </div>

          <div className="flex items-baseline justify-between gap-2 my-1">
            <div>
              {isPageLoading && !summary ? (
                <Skeleton className="h-8 w-24 my-1" />
              ) : (
                <div className="text-2xl sm:text-[26px] font-bold font-mono tracking-tight text-[var(--text-primary)]">
                  {displayTotalTransactions.toLocaleString()}
                </div>
              )}
            </div>

            {/* Micro-visual: 5-bar activity visual */}
            <div className="flex items-end gap-1 h-7 shrink-0 opacity-80" aria-hidden="true">
              <div className="w-1.5 h-2.5 rounded-sm bg-[var(--accent-teal)]/30" />
              <div className="w-1.5 h-4.5 rounded-sm bg-[var(--accent-teal)]/50" />
              <div className="w-1.5 h-3.5 rounded-sm bg-[var(--accent-teal)]/40" />
              <div className="w-1.5 h-6 rounded-sm bg-[var(--accent-teal)]" />
              <div className="w-1.5 h-5 rounded-sm bg-[var(--accent-teal)]/70" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
            <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
              {summary || selectedAccount
                ? `${displayIncomeCount} In • ${displayExpenseCount} Out`
                : `${pagination.total} Records`}
            </span>
            <span className="truncate">Active ledger records</span>
          </div>
        </div>

        {/* Card 2: Total Income */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:p-5 shadow-xs hover:border-[var(--border-strong)] transition-all flex flex-col justify-between min-h-[135px]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] truncate">
              Total Income ({activeCardCurrency})
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>

          <div className="flex items-baseline justify-between gap-2 my-1">
            <div>
              {isPageLoading && !summary ? (
                <Skeleton className="h-8 w-32 my-1" />
              ) : isSummaryIncomplete ? (
                <div className="space-y-0.5">
                  <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    Incomplete ({summary?.missingCurrencies?.join(', ')})
                  </div>
                  {nativeBreakdowns.map((b) => (
                    <div key={b.currency} className="text-xs font-mono text-[var(--text-secondary)]">
                      Native: {formatCurrency(b.totalIncome, b.currency)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-2xl sm:text-[26px] font-bold font-mono tracking-tight text-[var(--status-ok-text)]">
                  {displayIncome !== null && displayIncome !== undefined
                    ? formatCurrency(displayIncome, activeCardCurrency)
                    : '—'}
                </div>
              )}
            </div>

            {/* Micro-visual: Emerald 5-bar ascending visual */}
            <div className="flex items-end gap-1 h-7 shrink-0 opacity-80" aria-hidden="true">
              <div className="w-1.5 h-2 rounded-sm bg-emerald-500/25" />
              <div className="w-1.5 h-3 rounded-sm bg-emerald-500/40" />
              <div className="w-1.5 h-4.5 rounded-sm bg-emerald-500/60" />
              <div className="w-1.5 h-5.5 rounded-sm bg-emerald-500/80" />
              <div className="w-1.5 h-7 rounded-sm bg-emerald-500" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-2.5 h-2.5" />
              +{displayIncomeCount} Inflows
            </span>
            {!isSummaryIncomplete && nativeBreakdowns.length > 0 ? (
              <span className="truncate font-mono text-[10px] opacity-85">
                Native: {nativeBreakdowns.map((b) => formatCurrency(b.totalIncome, b.currency)).join(' • ')}
              </span>
            ) : (
              <span className="truncate">Validated credits</span>
            )}
          </div>
        </div>

        {/* Card 3: Total Expenses */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:p-5 shadow-xs hover:border-[var(--border-strong)] transition-all flex flex-col justify-between min-h-[135px]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] truncate">
              Total Expenses ({activeCardCurrency})
            </span>
            <TrendingDown className="w-4 h-4 text-rose-500 shrink-0" />
          </div>

          <div className="flex items-baseline justify-between gap-2 my-1">
            <div>
              {isPageLoading && !summary ? (
                <Skeleton className="h-8 w-32 my-1" />
              ) : isSummaryIncomplete ? (
                <div className="space-y-0.5">
                  <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    Incomplete ({summary?.missingCurrencies?.join(', ')})
                  </div>
                  {nativeBreakdowns.map((b) => (
                    <div key={b.currency} className="text-xs font-mono text-[var(--text-secondary)]">
                      Native: {formatCurrency(b.totalExpenses, b.currency)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-2xl sm:text-[26px] font-bold font-mono tracking-tight text-[var(--text-primary)]">
                  {displayExpenses !== null && displayExpenses !== undefined
                    ? formatCurrency(displayExpenses, activeCardCurrency)
                    : '—'}
                </div>
              )}
            </div>

            {/* Micro-visual: Rose 5-bar vertical histogram visual */}
            <div className="flex items-end gap-1 h-7 shrink-0 opacity-80" aria-hidden="true">
              <div className="w-1.5 h-5 rounded-sm bg-rose-500/50" />
              <div className="w-1.5 h-6.5 rounded-sm bg-rose-500/75" />
              <div className="w-1.5 h-3.5 rounded-sm bg-rose-500/35" />
              <div className="w-1.5 h-7 rounded-sm bg-rose-500" />
              <div className="w-1.5 h-4.5 rounded-sm bg-rose-500/45" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
              <TrendingDown className="w-2.5 h-2.5" />
              -{displayExpenseCount} Outflows
            </span>
            {!isSummaryIncomplete && nativeBreakdowns.length > 0 ? (
              <span className="truncate font-mono text-[10px] opacity-85">
                Native: {nativeBreakdowns.map((b) => formatCurrency(b.totalExpenses, b.currency)).join(' • ')}
              </span>
            ) : (
              <span className="truncate">Operational debits</span>
            )}
          </div>
        </div>

        {/* Card 4: Net Cash Movement */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:p-5 shadow-xs hover:border-[var(--border-strong)] transition-all flex flex-col justify-between min-h-[135px]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] truncate">
              Net Cash Movement ({activeCardCurrency})
            </span>
            <Wallet className="w-4 h-4 text-[var(--accent-teal)] shrink-0" />
          </div>

          <div className="flex items-baseline justify-between gap-2 my-1">
            <div>
              {isPageLoading && !summary ? (
                <Skeleton className="h-8 w-32 my-1" />
              ) : isSummaryIncomplete ? (
                <div className="space-y-0.5">
                  <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    Missing FX rate: {summary?.missingCurrencies?.join(', ')} → {summaryCurrency}
                  </div>
                  {nativeBreakdowns.map((b) => (
                    <div key={b.currency} className="text-xs font-mono text-[var(--text-secondary)]">
                      Native: {formatSignedCurrency(b.netCashMovement, b.currency)}
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className={`text-2xl sm:text-[26px] font-bold font-mono tracking-tight ${
                    netCashNumeric !== null && netCashNumeric < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-[var(--status-ok-text)]'
                  }`}
                >
                  {displayNetCash !== null && displayNetCash !== undefined
                    ? formatSignedCurrency(displayNetCash, activeCardCurrency)
                    : '—'}
                </div>
              )}
            </div>

            {/* Micro-visual: Cashly-style curved sparkline wave SVG */}
            <div className="w-16 h-7 shrink-0 opacity-80" aria-hidden="true">
              <svg viewBox="0 0 64 28" className="w-full h-full overflow-visible">
                <path
                  d="M 2 20 C 14 10, 26 24, 38 12 C 48 2, 54 8, 62 4"
                  fill="none"
                  stroke={netCashNumeric !== null && netCashNumeric < 0 ? '#e11d48' : '#0f766e'}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <circle
                  cx="62"
                  cy="4"
                  r="2.5"
                  fill={netCashNumeric !== null && netCashNumeric < 0 ? '#e11d48' : '#0f766e'}
                />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
            <span
              className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                netCashNumeric !== null && netCashNumeric < 0
                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
              }`}
            >
              {netCashNumeric !== null && netCashNumeric < 0 ? 'Deficit' : 'Surplus'}
            </span>
            {!isSummaryIncomplete && nativeBreakdowns.length > 0 ? (
              <span className="truncate font-mono text-[10px] opacity-85">
                Native:{' '}
                {nativeBreakdowns
                  .map((b) => formatSignedCurrency(b.netCashMovement, b.currency))
                  .join(' • ')}
              </span>
            ) : (
              <span className="truncate">
                {isSummaryIncomplete
                  ? 'Consolidated total unavailable without FX rate'
                  : 'Income minus expenses'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            id="txSearch"
            type="text"
            placeholder="Search by description, counterparty, or category..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="pl-9 pr-8 w-full"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
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
                {renderSortableHeader('transactionDate', 'Date')}
                {renderSortableHeader('description', 'Description')}
                <th className="py-3 px-4 font-semibold">Account</th>
                {renderSortableHeader('category', 'Category')}
                {renderSortableHeader('counterparty', 'Counterparty')}
                {renderSortableHeader('type', 'Type')}
                {renderSortableHeader('amount', 'Amount', true)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {isPageLoading && transactions.length === 0 ? (
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
                        {tx.account?.name || accountMap[tx.accountId]?.name || 'General'}
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
                          {formatCurrency(
                            tx.amount,
                            tx.currency || accountMap[tx.accountId]?.currency || currency,
                          )}
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

      {/* Financial Accounts Management Modal */}
      <ManageAccountsModal
        isOpen={isAccountsModalOpen}
        onClose={() => setIsAccountsModalOpen(false)}
        accounts={safeAccounts}
        orgId={activeOrgId || ''}
        defaultCurrency={currency}
        onSelectAccount={(account) => {
          setSelectedAccountId(account.id);
          setPagination((p) => ({ ...p, page: 1 }));
        }}
        onSuccess={() => {
          handleRefresh();
          if (activeOrgId) {
            apiGet<FinancialAccount[]>(`/v1/organizations/${activeOrgId}/accounts`)
              .then((accs) => {
                setAccounts(Array.isArray(accs) ? accs : []);
              })
              .catch(() => {});
          }
        }}
      />

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        accounts={safeAccounts}
        orgId={activeOrgId || ''}
        onSuccess={handleRefresh}
      />

      {/* New Transaction Modal */}
      <NewTransactionModal
        isOpen={isNewTxModalOpen}
        onClose={() => setIsNewTxModalOpen(false)}
        accounts={safeAccounts}
        orgId={activeOrgId || ''}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
