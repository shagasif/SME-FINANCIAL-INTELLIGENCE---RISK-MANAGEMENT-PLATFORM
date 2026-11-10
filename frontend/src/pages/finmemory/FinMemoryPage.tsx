import { useEffect, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Database,
  Eye,
  GitCompare,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Drawer } from '../../components/ui/Drawer';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, formatPercentage } from '../../utils/formatters';
import type {
  FinancialMetricSnapshot,
  SnapshotComparisonResponse,
} from '../../types/finmemory.types';

export function FinMemoryPage() {
  const { activeOrg, isAuditor, canMutateLedger } = useAuth();
  const activeOrgId = activeOrg?.id;

  const [snapshots, setSnapshots] = useState<FinancialMetricSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Snapshot Inspection Drawer
  const [inspectSnapshot, setInspectSnapshot] = useState<FinancialMetricSnapshot | null>(null);

  // Comparison State
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [baseId, setBaseId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [comparisonResult, setComparisonResult] = useState<SnapshotComparisonResponse | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Create Snapshot Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [periodKey, setPeriodKey] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-M${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Fetch Snapshots List
  useEffect(() => {
    if (!activeOrgId) return;

    let isMounted = true;
    apiGet<FinancialMetricSnapshot[]>(
      `/v1/organizations/${activeOrgId}/finmemory/snapshots?limit=30`,
    )
      .then((res) => {
        if (!isMounted) return;
        const raw = res as unknown as {
          items?: FinancialMetricSnapshot[];
          snapshots?: FinancialMetricSnapshot[];
          data?: FinancialMetricSnapshot[];
        };
        const list = Array.isArray(res)
          ? res
          : raw?.items || raw?.snapshots || (Array.isArray(raw?.data) ? raw.data : []);
        setSnapshots(list);
        setError(null);
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to load FinMemory snapshots.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, reloadKey]);

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId) return;
    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiPost(`/v1/organizations/${activeOrgId}/finmemory/snapshots`, {
        periodKey: periodKey.trim(),
        periodStart,
        periodEnd,
      });
      setIsCreateModalOpen(false);
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError('Failed to capture financial intelligence snapshot.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunComparison = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || !baseId || !targetId) {
      setCompareError('Please select both a base and a target snapshot.');
      return;
    }
    if (baseId === targetId) {
      setCompareError('Base and target snapshots must be different.');
      return;
    }

    setIsComparing(true);
    setCompareError(null);

    try {
      const res = await apiGet<SnapshotComparisonResponse>(
        `/v1/organizations/${activeOrgId}/finmemory/compare?baseSnapshotId=${baseId}&targetSnapshotId=${targetId}`,
      );
      setComparisonResult(res);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCompareError(err.message);
      } else {
        setCompareError('Failed to compute snapshot differential.');
      }
    } finally {
      setIsComparing(false);
    }
  };

  const currency = activeOrg?.baseCurrency || 'USD';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-[var(--brand-primary)]" />
            FinMemory Intelligence
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Temporal episodic financial memory, immutable snapshot lineage, and deterministic delta
            comparisons.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoading}
            title="Refresh snapshots"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCompareError(null);
              setIsCompareModalOpen(true);
            }}
            disabled={snapshots.length < 2}
          >
            <GitCompare className="w-3.5 h-3.5 mr-1.5" />
            Compare Shifts
          </Button>

          {!isAuditor && canMutateLedger && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setModalError(null);
                setIsCreateModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Capture Snapshot
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
              Temporal memory lineage and differential audits are visible in read-only inspection.
              Creating new snapshot commits is restricted.
            </span>
          </div>
        </div>
      )}

      {/* FinMemory Architecture Notice */}
      <div className="flex items-start gap-3 rounded-xl border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/5 p-4 text-xs text-[var(--text-secondary)]">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-primary)]" />
        <div className="space-y-1">
          <p className="font-semibold text-[var(--text-primary)]">
            Episodic Financial Memory Architecture
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            FinMemory persists frozen points of financial truth across past months and quarters.
            Each snapshot seals 10 deterministic financial metrics, underlying double-entry
            citations, and semantic vector embeddings enabling AI agents to ground multi-quarter
            reasoning without hallucination.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Snapshots Table / Grid */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Snapshot Archive ({snapshots.length} Committed Snapshots)
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Permanent immutable checkpoints indexed by fiscal period and timestamp
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="py-16 text-center text-xs text-[var(--text-muted)]">
            <BrainCircuit className="mx-auto h-8 w-8 text-[var(--text-muted)] opacity-50 mb-2" />
            No FinMemory snapshots captured yet. Capture your first period snapshot to initialize
            memory lineage.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Period Key</th>
                  <th className="py-3 px-4 font-semibold">Date Scope</th>
                  <th className="py-3 px-4 font-semibold text-right">Cash Balance</th>
                  <th className="py-3 px-4 font-semibold text-right">Operating Cash Flow</th>
                  <th className="py-3 px-4 font-semibold text-center">Runway</th>
                  <th className="py-3 px-4 font-semibold text-center">Completeness</th>
                  <th className="py-3 px-4 font-semibold text-right">Captured At</th>
                  <th className="py-3 px-4 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                {snapshots.map((snap) => (
                  <tr
                    key={snap.id}
                    className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-[var(--brand-primary)]">
                      {snap.periodKey}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {formatDate(snap.periodStart)} &rarr; {formatDate(snap.periodEnd)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--text-primary)]">
                      {snap.metrics.endingCashBalance
                        ? formatCurrency(
                            parseFloat(snap.metrics.endingCashBalance),
                            snap.currency || currency,
                          )
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {snap.metrics.operatingCashFlow
                        ? formatCurrency(
                            parseFloat(snap.metrics.operatingCashFlow),
                            snap.currency || currency,
                          )
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      {snap.metrics.cashRunwayDays !== undefined
                        ? `${snap.metrics.cashRunwayDays}d`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {snap.completenessScore}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-[11px] text-[var(--text-muted)]">
                      {formatDate(snap.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInspectSnapshot(snap)}
                        className="h-7 px-2 text-[11px] flex items-center gap-1 mx-auto"
                      >
                        <Eye className="h-3 w-3" />
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Snapshot Inspection Drawer */}
      <Drawer
        isOpen={Boolean(inspectSnapshot)}
        onClose={() => setInspectSnapshot(null)}
        title={`FinMemory Inspection: ${inspectSnapshot?.periodKey || ''}`}
        width="lg"
      >
        {inspectSnapshot && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--brand-primary)]">
                  Period Scope
                </span>
                <div className="font-semibold text-sm text-[var(--text-primary)] mt-0.5">
                  {formatDate(inspectSnapshot.periodStart)} to{' '}
                  {formatDate(inspectSnapshot.periodEnd)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
                  Audit Completeness
                </span>
                <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                  {inspectSnapshot.completenessScore}% Grounded
                </div>
              </div>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="space-y-2">
              <h3 className="font-bold text-[var(--text-primary)]">Sealed Financial Metrics</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[var(--border-subtle)] p-2.5">
                  <span className="text-[10px] text-[var(--text-muted)] block">
                    Ending Cash Balance
                  </span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {inspectSnapshot.metrics.endingCashBalance
                      ? formatCurrency(
                          parseFloat(inspectSnapshot.metrics.endingCashBalance),
                          inspectSnapshot.currency,
                        )
                      : '—'}
                  </span>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] p-2.5">
                  <span className="text-[10px] text-[var(--text-muted)] block">
                    Operating Cash Flow
                  </span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {inspectSnapshot.metrics.operatingCashFlow
                      ? formatCurrency(
                          parseFloat(inspectSnapshot.metrics.operatingCashFlow),
                          inspectSnapshot.currency,
                        )
                      : '—'}
                  </span>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] p-2.5">
                  <span className="text-[10px] text-[var(--text-muted)] block">Current Ratio</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {inspectSnapshot.metrics.currentRatio
                      ? `${inspectSnapshot.metrics.currentRatio}x`
                      : '—'}
                  </span>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] p-2.5">
                  <span className="text-[10px] text-[var(--text-muted)] block">Quick Ratio</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {inspectSnapshot.metrics.quickRatio
                      ? `${inspectSnapshot.metrics.quickRatio}x`
                      : '—'}
                  </span>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] p-2.5">
                  <span className="text-[10px] text-[var(--text-muted)] block">Gross Margin</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {inspectSnapshot.metrics.grossMarginPercent
                      ? formatPercentage(parseFloat(inspectSnapshot.metrics.grossMarginPercent))
                      : '—'}
                  </span>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] p-2.5">
                  <span className="text-[10px] text-[var(--text-muted)] block">Expense Growth</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {inspectSnapshot.metrics.expenseGrowthPercent
                      ? formatPercentage(parseFloat(inspectSnapshot.metrics.expenseGrowthPercent))
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Citations & Limitations */}
            <div className="space-y-1">
              <span className="font-semibold text-[var(--text-secondary)]">
                Source Citations & Limitations
              </span>
              <p className="text-[11px] text-[var(--text-muted)]">
                Indexed with cryptographic integrity for multi-agent reasoning.
              </p>
              {inspectSnapshot.dataLimitations && inspectSnapshot.dataLimitations.length > 0 && (
                <ul className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 list-disc pl-4 text-[11px] text-amber-800 dark:text-amber-300">
                  {inspectSnapshot.dataLimitations.map((lim, i) => (
                    <li key={i}>{lim}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Comparison Modal */}
      {isCompareModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => {
            setIsCompareModalOpen(false);
            setComparisonResult(null);
          }}
          title="Compare Snapshot Shifts"
        >
          <div className="space-y-4 text-xs">
            <p className="text-xs text-[var(--text-muted)]">
              Evaluate period-over-period financial metric shifts, directional improvements, and
              automated audit observations.
            </p>

            <form onSubmit={handleRunComparison} className="space-y-4">
              {compareError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-600 dark:text-rose-400">
                  {compareError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                    Base Snapshot (Earlier)
                  </label>
                  <select
                    value={baseId}
                    onChange={(e) => setBaseId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 font-mono text-xs"
                    required
                  >
                    <option value="">Select Base Snapshot...</option>
                    {snapshots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.periodKey} ({formatDate(s.periodStart)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                    Target Snapshot (Later)
                  </label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 font-mono text-xs"
                    required
                  >
                    <option value="">Select Target Snapshot...</option>
                    {snapshots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.periodKey} ({formatDate(s.periodStart)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={isComparing}
                  disabled={!baseId || !targetId || baseId === targetId}
                >
                  Compute Differential
                </Button>
              </div>
            </form>

            {/* Differential Results */}
            {comparisonResult && (
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-4">
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  Differential Analysis: {comparisonResult.baseSnapshot.periodKey} &rarr;{' '}
                  {comparisonResult.targetSnapshot.periodKey}
                </h3>

                <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[var(--surface-elevated)]/60 text-[10px] uppercase font-semibold text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                      <tr>
                        <th className="py-2.5 px-3">Metric</th>
                        <th className="py-2.5 px-3 text-right">Base</th>
                        <th className="py-2.5 px-3 text-right">Target</th>
                        <th className="py-2.5 px-3 text-right">Shift (%)</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                      {comparisonResult.shifts.map((shift, idx) => (
                        <tr key={idx} className="hover:bg-[var(--surface-elevated)]/30">
                          <td className="py-2 px-3 font-semibold text-[var(--text-primary)]">
                            {shift.metricName}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[var(--text-muted)]">
                            {shift.baseValue ?? '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[var(--text-primary)]">
                            {shift.targetValue ?? '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {shift.percentageChange ? `${shift.percentageChange}%` : '—'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                shift.direction === 'IMPROVED'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : shift.direction === 'DETERIORATED'
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : 'bg-slate-500/10 text-slate-500'
                              }`}
                            >
                              {shift.direction}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {comparisonResult.keyObservations?.length > 0 && (
                  <div className="rounded-xl border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/5 p-3 space-y-1">
                    <span className="font-semibold text-[var(--text-primary)] block">
                      Automated Grounded Observations:
                    </span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-[var(--text-secondary)]">
                      {comparisonResult.keyObservations.map((obs, i) => (
                        <li key={i}>{obs}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Create Snapshot Modal */}
      {isCreateModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsCreateModalOpen(false)}
          title="Capture FinMemory Snapshot"
        >
          <form onSubmit={handleCreateSnapshot} className="space-y-4 text-xs">
            <p className="text-xs text-[var(--text-muted)]">
              Compute and freeze authoritative financial metrics, citation identifiers, and
              completeness verification for the specified period.
            </p>

            {modalError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-600 dark:text-rose-400">
                {modalError}
              </div>
            )}

            <Input
              id="periodKey"
              label="Fiscal Period Identifier (e.g. 2026-M03 or 2026-Q1) *"
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                id="periodStart"
                label="Period Start Date *"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
              <Input
                id="periodEnd"
                label="Period End Date *"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button variant="ghost" type="button" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isLoading={isSubmitting}>
                Commit Snapshot
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
