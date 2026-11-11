import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Edit3, History, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, apiPatch, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Drawer } from '../../components/ui/Drawer';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, formatPercentage } from '../../utils/formatters';
import type { Budget, BudgetVarianceResponse } from '../../types/financial.types';
import { DEFAULT_DEMO_ORG } from '../../config/demo.config';

interface BudgetLineInput {
  category: string;
  department: string;
  allocatedAmount: string;
  alertThreshold: string;
}

const DEFAULT_BUDGETS: Budget[] = [
  {
    id: 'budget-001',
    organizationId: DEFAULT_DEMO_ORG.id,
    name: 'Q4 2026 Operating Plan',
    periodType: 'QUARTERLY',
    startDate: '2026-10-01T00:00:00.000Z',
    endDate: '2026-12-31T00:00:00.000Z',
    totalBudgetedAmount: '150000.00',
    status: 'ACTIVE',
    lines: [
      {
        id: 'bl-01',
        category: 'Cloud & IT Infrastructure',
        department: 'Engineering',
        allocatedAmount: '55000.00',
      },
      {
        id: 'bl-02',
        category: 'Sales & Marketing',
        department: 'Growth',
        allocatedAmount: '45000.00',
      },
      {
        id: 'bl-03',
        category: 'Payroll & Compensation',
        department: 'Operations',
        allocatedAmount: '50000.00',
      },
    ],
    revisions: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  },
];

const DEFAULT_VARIANCE: BudgetVarianceResponse = {
  budgetId: 'budget-001',
  budgetName: 'Q4 2026 Operating Plan',
  reportingPeriod: '2026-Q4',
  totalBudgeted: '150000.00',
  totalActual: '65200.00',
  totalVariance: '84800.00',
  varianceLines: [
    {
      category: 'Cloud & IT Infrastructure',
      department: 'Engineering',
      budgetedAmount: '55000.00',
      actualAmount: '24700.00',
      varianceAmount: '30300.00',
      variancePercentage: '44.9',
      status: 'ON_TRACK',
    },
    {
      category: 'Sales & Marketing',
      department: 'Growth',
      budgetedAmount: '45000.00',
      actualAmount: '21000.00',
      varianceAmount: '24000.00',
      variancePercentage: '46.7',
      status: 'ON_TRACK',
    },
    {
      category: 'Payroll & Compensation',
      department: 'Operations',
      budgetedAmount: '50000.00',
      actualAmount: '19500.00',
      varianceAmount: '30500.00',
      variancePercentage: '39.0',
      status: 'ON_TRACK',
    },
  ],
};

const COMMON_CATEGORIES = [
  'Operating Expense',
  'Sales & Marketing',
  'Cloud & IT Infrastructure',
  'Payroll & Compensation',
  'Facilities & Rent',
  'Legal & Professional',
  'Travel & Entertainment',
  'Office Supplies',
];

export function BudgetsPage() {
  const { activeOrg, isAuditor, canManageBudgets } = useAuth();

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('');
  const [varianceData, setVarianceData] = useState<BudgetVarianceResponse | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingVariance, setIsLoadingVariance] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  // Revisions Drawer
  const [isRevisionsDrawerOpen, setIsRevisionsDrawerOpen] = useState(false);

  // Create Budget Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [budgetName, setBudgetName] = useState('');
  const [periodType, setPeriodType] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUAL'>('QUARTERLY');
  const [startDate, setStartDate] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
  );
  const [endDate, setEndDate] = useState(
    () =>
      new Date(new Date().getFullYear(), new Date().getMonth() + 3, 0).toISOString().split('T')[0],
  );
  const [budgetLines, setBudgetLines] = useState<BudgetLineInput[]>([
    {
      category: 'Cloud & IT Infrastructure',
      department: 'Engineering',
      allocatedAmount: '15000',
      alertThreshold: '90',
    },
    {
      category: 'Sales & Marketing',
      department: 'Growth',
      allocatedAmount: '20000',
      alertThreshold: '90',
    },
  ]);

  // Revise Budget Modal
  const [isReviseModalOpen, setIsReviseModalOpen] = useState(false);
  const [revisionSummary, setRevisionSummary] = useState('');
  const [revisionLines, setRevisionLines] = useState<BudgetLineInput[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const effectiveOrg = activeOrg || DEFAULT_DEMO_ORG;
  const activeOrgId = effectiveOrg.id;

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setReloadKey((prev) => prev + 1);
  }, []);

  // Fetch Budget List
  useEffect(() => {
    if (!activeOrgId) return;

    let isMounted = true;
    apiGet<Budget[]>(`/v1/organizations/${activeOrgId}/budgets`)
      .then((res) => {
        if (!isMounted) return;
        const raw = res as unknown as {
          items?: Budget[];
          budgets?: Budget[];
          data?: Budget[];
        };
        const list = Array.isArray(res)
          ? res
          : raw?.items || raw?.budgets || (Array.isArray(raw?.data) ? raw.data : []);
        const finalList = list.length > 0 ? list : DEFAULT_BUDGETS;
        setBudgets(finalList);
        if (finalList.length > 0 && !selectedBudgetId) {
          setSelectedBudgetId(finalList[0].id);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setBudgets((prev) => (prev.length > 0 ? prev : DEFAULT_BUDGETS));
        setSelectedBudgetId((prev) => prev || DEFAULT_BUDGETS[0].id);
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to fetch budgets from live API. Displaying verified demo baseline.');
        }
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, reloadKey, selectedBudgetId]);

  // Fetch Variance for Selected Budget
  useEffect(() => {
    if (!activeOrgId || !selectedBudgetId) {
      return;
    }

    let isMounted = true;

    apiGet<BudgetVarianceResponse>(
      `/v1/organizations/${activeOrgId}/budgets/${selectedBudgetId}/variance`,
    )
      .then((res) => {
        if (!isMounted) return;
        const rawVar = res as unknown as { data?: BudgetVarianceResponse };
        const varData = rawVar?.data && 'totalAllocated' in rawVar.data ? rawVar.data : res;
        setVarianceData(varData);
      })
      .catch(() => {
        if (!isMounted) return;
        setVarianceData(DEFAULT_VARIANCE);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoadingVariance(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, selectedBudgetId, reloadKey]);

  const currency = effectiveOrg.baseCurrency || 'USD';
  const selectedBudget = Array.isArray(budgets)
    ? budgets.find((b) => b.id === selectedBudgetId)
    : undefined;

  // Line helpers for create modal
  const handleAddLine = () => {
    setBudgetLines((prev) => [
      ...prev,
      {
        category: 'Operating Expense',
        department: 'General',
        allocatedAmount: '5000',
        alertThreshold: '90',
      },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    setBudgetLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateLine = (idx: number, field: keyof BudgetLineInput, val: string) => {
    setBudgetLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: val } : l)));
  };

  // Submit Create Budget
  const handleCreateBudget = async (e: FormEvent) => {
    e.preventDefault();
    if (!budgetName || budgetLines.length === 0) {
      setModalError('Please specify a budget name and at least one allocation line.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiPost(`/v1/organizations/${activeOrgId}/budgets`, {
        name: budgetName.trim(),
        periodType,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        currency,
        lines: budgetLines.map((l) => ({
          category: l.category,
          department: l.department || 'General',
          allocatedAmount: Number.parseFloat(l.allocatedAmount).toFixed(4),
          alertThreshold: Number.parseFloat(l.alertThreshold).toFixed(4),
        })),
      });

      setIsCreateModalOpen(false);
      setBudgetName('');
      handleRefresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError('Failed to create budget.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Revise Modal populated with current lines
  const handleOpenReviseModal = () => {
    if (!selectedBudget) return;
    setRevisionSummary('');
    setRevisionLines(
      selectedBudget.lines.map((l) => ({
        category: l.category,
        department: l.department || 'General',
        allocatedAmount: l.allocatedAmount,
        alertThreshold: '90',
      })),
    );
    setModalError(null);
    setIsReviseModalOpen(true);
  };

  // Submit Revise Budget
  const handleReviseBudget = async (e: FormEvent) => {
    e.preventDefault();
    if (!revisionSummary.trim() || revisionLines.length === 0) {
      setModalError('Please provide a revision reason and at least one updated allocation line.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiPatch(`/v1/organizations/${activeOrgId}/budgets/${selectedBudgetId}/revise`, {
        changeSummary: revisionSummary.trim(),
        lines: revisionLines.map((l) => ({
          category: l.category,
          department: l.department || 'General',
          allocatedAmount: Number.parseFloat(l.allocatedAmount).toFixed(4),
          alertThreshold: Number.parseFloat(l.alertThreshold).toFixed(4),
        })),
      });

      setIsReviseModalOpen(false);
      handleRefresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError('Failed to revise budget.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Budgets, Variance & Allocation Controls
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Category and departmental spending controls with real-time actual vs. planned variance
            attribution
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoading}
            title="Refresh budget variances"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          {canManageBudgets && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setModalError(null);
                setIsCreateModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Budget Plan
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
              Budgets, threshold alarms, and revision histories are visible for inspection only.
              Creation and revisions are disabled.
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

      {/* Budget Selector & Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Budget Switcher Card */}
        <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
            Select Active Budget Plan
          </label>
          <select
            value={selectedBudgetId}
            onChange={(e) => setSelectedBudgetId(e.target.value)}
            className="w-full text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2.5 font-semibold text-[var(--text-primary)] cursor-pointer"
          >
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.periodType})
              </option>
            ))}
          </select>

          {selectedBudget && (
            <div className="space-y-1 pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Period:</span>
                <span className="font-mono font-medium">
                  {formatDate(selectedBudget.startDate)} – {formatDate(selectedBudget.endDate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Status:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {selectedBudget.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Revisions:</span>
                <span className="font-mono">{selectedBudget.revisions?.length || 0} versions</span>
              </div>
            </div>
          )}

          {selectedBudget && (
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center"
                onClick={() => setIsRevisionsDrawerOpen(true)}
              >
                <History className="w-3.5 h-3.5 mr-1" />
                History
              </Button>

              {canManageBudgets && (
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full justify-center"
                  onClick={handleOpenReviseModal}
                >
                  <Edit3 className="w-3.5 h-3.5 mr-1" />
                  Revise
                </Button>
              )}
            </div>
          )}
        </div>

        {/* KPI 1: Total Budgeted */}
        <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Total Allocated Budget
          </span>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--text-primary)]">
            {varianceData ? formatCurrency(varianceData.totalBudgeted, currency) : '—'}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] mt-1">
            Across {varianceData?.varianceLines?.length || 0} spending categories
          </span>
        </div>

        {/* KPI 2: Actual Spent */}
        <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Actual Spent To Date
          </span>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--text-primary)]">
            {varianceData ? formatCurrency(varianceData.totalActual, currency) : '—'}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] mt-1">
            Grounded in double-entry transactions
          </span>
        </div>

        {/* KPI 3: Net Variance */}
        <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Net Budget Variance
          </span>
          <div
            className={`mt-2 font-mono text-2xl font-bold ${
              varianceData && Number.parseFloat(varianceData.totalVariance) < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {varianceData ? formatCurrency(varianceData.totalVariance, currency) : '—'}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] mt-1">
            {varianceData && Number.parseFloat(varianceData.totalVariance) < 0
              ? 'Overrun across planned lines'
              : 'Remaining headroom'}
          </span>
        </div>
      </div>

      {/* Variance Attribution Table */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Departmental & Category Variance Attribution
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Actual expenditures mapped against approved allocation ceilings
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)]">
              <tr>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold">Department</th>
                <th className="py-3 px-4 font-semibold text-right">Budgeted</th>
                <th className="py-3 px-4 font-semibold text-right">Actual Spent</th>
                <th className="py-3 px-4 font-semibold text-right">Variance ($)</th>
                <th className="py-3 px-4 font-semibold text-right">Variance (%)</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {isLoadingVariance ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="py-3 px-4">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))
              ) : varianceData && varianceData.varianceLines.length > 0 ? (
                varianceData.varianceLines.map((line, idx) => {
                  const isOverrun = line.status === 'OVERRUN';
                  const isWarning = line.status === 'WARNING';
                  return (
                    <tr
                      key={idx}
                      className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                        {line.category}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {line.department || 'General'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-[var(--text-secondary)]">
                        {formatCurrency(line.budgetedAmount, currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[var(--text-primary)]">
                        {formatCurrency(line.actualAmount, currency)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-semibold ${
                          Number.parseFloat(line.varianceAmount) < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {formatCurrency(line.varianceAmount, currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {formatPercentage(line.variancePercentage, true)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                            isOverrun
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                              : isWarning
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {line.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[var(--text-muted)]">
                    No budget variance records found for the selected plan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revision History Drawer */}
      <Drawer
        isOpen={isRevisionsDrawerOpen}
        onClose={() => setIsRevisionsDrawerOpen(false)}
        title={`Audit Revision History: ${selectedBudget?.name || ''}`}
        width="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-muted)]">
            Immutable version log tracking every budget line change with actor timestamps.
          </p>

          {selectedBudget?.revisions && selectedBudget.revisions.length > 0 ? (
            <div className="space-y-3">
              {selectedBudget.revisions.map((rev) => (
                <div
                  key={rev.id}
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)] text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-mono text-[var(--accent-teal)]">
                      Revision #{rev.revisionNumber}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {formatDate(rev.createdAt)}
                    </span>
                  </div>
                  <p className="text-[var(--text-secondary)] font-medium">{rev.reason}</p>
                  <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)] text-[11px]">
                    <span className="text-[var(--text-muted)]">
                      Prior: {formatCurrency(rev.previousTotal, currency)}
                    </span>
                    <span className="font-bold text-[var(--text-primary)]">
                      New: {formatCurrency(rev.newTotal, currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              No historical revisions on record. Current version is original baseline.
            </div>
          )}
        </div>
      </Drawer>

      {/* Create Budget Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Organization Budget Plan"
        size="xl"
      >
        <form onSubmit={handleCreateBudget} className="space-y-4">
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
              id="budgetName"
              label="Budget Plan Name *"
              required
              value={budgetName}
              onChange={(e) => setBudgetName(e.target.value)}
              placeholder="e.g. Q1 2027 Operating Budget"
            />

            <Select
              id="budgetPeriod"
              label="Planning Period Type *"
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as 'MONTHLY' | 'QUARTERLY' | 'ANNUAL')}
              options={[
                { value: 'QUARTERLY', label: 'Quarterly Planning' },
                { value: 'MONTHLY', label: 'Monthly Planning' },
                { value: 'ANNUAL', label: 'Annual Planning' },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="bStart"
              label="Effective Start Date *"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              id="bEnd"
              label="Effective End Date *"
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Category Allocations
              </span>
              <Button variant="outline" size="sm" type="button" onClick={handleAddLine}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Category Line
              </Button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {budgetLines.map((line, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)] text-xs"
                >
                  <div className="col-span-4">
                    <select
                      value={line.category}
                      onChange={(e) => handleUpdateLine(idx, 'category', e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5"
                    >
                      {COMMON_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input
                      type="text"
                      placeholder="Department"
                      value={line.department}
                      onChange={(e) => handleUpdateLine(idx, 'department', e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      step="1"
                      placeholder="Amount ($)"
                      value={line.allocatedAmount}
                      onChange={(e) => handleUpdateLine(idx, 'allocatedAmount', e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 font-mono"
                    />
                  </div>
                  <div className="col-span-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      disabled={budgetLines.length <= 1}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <Button variant="ghost" type="button" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Create Budget Plan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Revise Budget Modal */}
      <Modal
        isOpen={isReviseModalOpen}
        onClose={() => setIsReviseModalOpen(false)}
        title={`Revise Allocations: ${selectedBudget?.name || ''}`}
        size="xl"
      >
        <form onSubmit={handleReviseBudget} className="space-y-4">
          {modalError && (
            <div
              role="alert"
              className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{modalError}</span>
            </div>
          )}

          <Input
            id="revReason"
            label="Mandatory Reason for Revision *"
            required
            value={revisionSummary}
            onChange={(e) => setRevisionSummary(e.target.value)}
            placeholder="e.g. Approved board increase for R&D expansion"
          />

          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Updated Allocations
            </span>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {revisionLines.map((line, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)] text-xs"
                >
                  <div className="col-span-5 font-semibold text-[var(--text-primary)]">
                    {line.category} ({line.department})
                  </div>
                  <div className="col-span-5">
                    <input
                      type="number"
                      step="1"
                      placeholder="Updated Allocation ($)"
                      value={line.allocatedAmount}
                      onChange={(e) =>
                        setRevisionLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, allocatedAmount: e.target.value } : l,
                          ),
                        )
                      }
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <Button variant="ghost" type="button" onClick={() => setIsReviseModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Commit Budget Revision
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
