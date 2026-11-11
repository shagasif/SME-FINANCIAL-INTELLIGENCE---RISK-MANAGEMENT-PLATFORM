import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  DollarSign,
  RefreshCw,
  Scale,
  ShieldAlert,
  Wallet,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { apiGet, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatCard } from '../../components/ui/StatCard';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, resolveReportingCurrency } from '../../utils/formatters';

interface CashFlowProjectionItem {
  id?: string;
  projectionDate: string;
  expectedInflow: string;
  expectedOutflow: string;
  netCashFlow: string;
  cumulativeBalance: string;
  optimisticBalance?: string;
  conservativeBalance?: string;
}

interface CashFlowForecast {
  id: string;
  horizonDays: 7 | 30 | 60 | 90;
  scenarioType: 'BASE' | 'OPTIMISTIC' | 'CONSERVATIVE';
  version: number;
  currency: string;
  startDate: string;
  endDate: string;
  openingCashBalance: string;
  projectedInflows: string;
  projectedOutflows: string;
  projectedClosingCash: string;
  minimumProjectedCash: string;
  minimumCashDate: string;
  hasLiquidityWarning: boolean;
  uncertaintyBandPct: string;
  dataLimitations?: string[];
  items?: CashFlowProjectionItem[];
  createdAt: string;
}

export function CashFlowPage() {
  const { activeOrg, isAuditor, hasRole, isLoading: isAuthLoading } = useAuth();

  const [forecasts, setForecasts] = useState<CashFlowForecast[]>([]);
  const [selectedHorizon, setSelectedHorizon] = useState<7 | 30 | 60 | 90>(30);
  const [activeForecast, setActiveForecast] = useState<CashFlowForecast | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Generate Forecast Modal
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [modalHorizon, setModalHorizon] = useState<7 | 30 | 60 | 90>(30);
  const [modalScenario, setModalScenario] = useState<'BASE' | 'OPTIMISTIC' | 'CONSERVATIVE'>(
    'BASE',
  );
  const [safetyBuffer, setSafetyBuffer] = useState('5000');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const activeOrgId = activeOrg?.id;
  const canGenerate =
    !isAuditor &&
    hasRole([
      RoleType.PLATFORM_ADMIN,
      RoleType.BUSINESS_OWNER,
      RoleType.FINANCE_MANAGER,
      RoleType.FINANCIAL_ANALYST,
    ]);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // Fetch Forecasts List
  useEffect(() => {
    if (isAuthLoading || !activeOrgId) return;

    let isMounted = true;
    apiGet<CashFlowForecast[]>(
      `/v1/organizations/${activeOrgId}/forecasts?horizonDays=${selectedHorizon}`,
    )
      .then((res) => {
        if (!isMounted) return;
        setError(null);
        const list = Array.isArray(res) ? res : [];
        setForecasts(list);
        if (list.length > 0) {
          const latest = list[0];
          if (latest.items && latest.items.length > 0) {
            setActiveForecast(latest);
          } else {
            apiGet<CashFlowForecast>(`/v1/organizations/${activeOrgId}/forecasts/${latest.id}`)
              .then((det) => {
                if (isMounted) setActiveForecast(det);
              })
              .catch(() => {
                if (isMounted) setActiveForecast(latest);
              });
          }
        } else {
          setActiveForecast(null);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setForecasts([]);
        setActiveForecast(null);
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to fetch cash flow forecasts from live API.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, selectedHorizon, reloadKey, isAuthLoading]);

  // Handle Generate Forecast Submit
  const handleGenerateForecast = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);

    try {
      const generated = await apiPost<CashFlowForecast>(
        `/v1/organizations/${activeOrgId}/forecasts`,
        {
          horizonDays: modalHorizon,
          scenarioType: modalScenario,
          liquiditySafetyBuffer: Number.parseFloat(safetyBuffer || '0').toFixed(4),
        },
      );

      setIsGenerateModalOpen(false);
      setSelectedHorizon(modalHorizon);
      setActiveForecast(generated);
      handleRefresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError('Failed to generate cash-flow forecast projection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const currency = resolveReportingCurrency(activeOrg?.baseCurrency, activeForecast?.currency);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Cash-Flow Forecasting Engine
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Deterministic 7, 30, 60, and 90-day cash projections with liquidity safety buffers and
            scenario modeling ({forecasts.length} total versions tracked).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoading}
            title="Refresh forecast projections"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          {canGenerate && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setModalError(null);
                setIsGenerateModalOpen(true);
              }}
            >
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              Generate Forecast
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
              Cash flow forecasts, version histories, and liquidity buffers are visible for
              compliance verification. Forecast generation is blocked.
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

      {/* Horizon Selector Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-2">
          {([7, 30, 60, 90] as const).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setSelectedHorizon(h)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                selectedHorizon === h
                  ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                  : 'bg-[var(--surface-elevated)]/60 text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]'
              }`}
            >
              {h}-Day Horizon
            </button>
          ))}
        </div>

        {activeForecast && (
          <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 font-mono">
            <span>Version #{activeForecast.version}</span>
            <span>•</span>
            <span className="uppercase font-semibold text-[var(--accent-teal)]">
              {activeForecast.scenarioType} Scenario
            </span>
          </div>
        )}
      </div>

      {/* Liquidity Alert Banner if warning */}
      {activeForecast?.hasLiquidityWarning && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <div>
            <span className="font-bold block mb-0.5">Critical Liquidity Warning</span>
            <span>
              Projected cash balance breaches safety buffer threshold on{' '}
              <strong className="font-mono">{formatDate(activeForecast.minimumCashDate)}</strong>{' '}
              with a projected low of{' '}
              <strong className="font-mono">
                {formatCurrency(activeForecast.minimumProjectedCash, currency)}
              </strong>
              . Immediate accounts receivable collection or expenditure deferral is recommended.
            </span>
          </div>
        </div>
      )}

      {/* Empty State when no persisted forecast exists for selected horizon */}
      {!isLoading && !activeForecast ? (
        <div
          role="status"
          className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-card)] p-8 text-center space-y-3"
        >
          <Wallet className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-75" />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              No Cash-Flow Forecast Generated ({selectedHorizon}-Day Horizon)
            </h2>
            <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
              No persisted {selectedHorizon}-day forecast versions exist for this organization yet.
              {canGenerate
                ? ` Generate a deterministic ${currency} projection from live accounts, invoices, bills, and recurring ledger entries.`
                : ' Authorized Finance Managers or Owners can generate deterministic projections.'}
            </p>
          </div>
          {canGenerate && (
            <div className="pt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setModalHorizon(selectedHorizon);
                  setModalError(null);
                  setIsGenerateModalOpen(true);
                }}
              >
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                Generate {selectedHorizon}-Day Forecast
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* KPI Cards Grid (4 Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Opening Cash"
              value={
                activeForecast ? formatCurrency(activeForecast.openingCashBalance, currency) : '—'
              }
              subtitle="Baseline liquid accounts"
              icon={<Wallet className="w-5 h-5" />}
            />

            <StatCard
              title={`Projected Inflows (${selectedHorizon}d)`}
              value={
                activeForecast ? formatCurrency(activeForecast.projectedInflows, currency) : '—'
              }
              subtitle="Customer AR & recurring receipts"
              icon={<DollarSign className="w-5 h-5 text-emerald-500" />}
              change={
                activeForecast
                  ? {
                      value: `+${formatCurrency(activeForecast.projectedInflows, currency)}`,
                      isPositive: true,
                    }
                  : undefined
              }
            />

            <StatCard
              title={`Projected Outflows (${selectedHorizon}d)`}
              value={
                activeForecast ? formatCurrency(activeForecast.projectedOutflows, currency) : '—'
              }
              subtitle="Supplier AP & operating expenses"
              icon={<DollarSign className="w-5 h-5 text-red-500" />}
              change={
                activeForecast
                  ? {
                      value: `-${formatCurrency(activeForecast.projectedOutflows, currency)}`,
                      isPositive: false,
                    }
                  : undefined
              }
            />

            <StatCard
              title="Projected Closing Cash"
              value={
                activeForecast ? formatCurrency(activeForecast.projectedClosingCash, currency) : '—'
              }
              subtitle={`At end of ${selectedHorizon}-day window`}
              icon={<Scale className="w-5 h-5" />}
              statusBadge={
                activeForecast
                  ? {
                      label: activeForecast.hasLiquidityWarning ? 'Breach Risk' : 'Buffer Intact',
                      variant: activeForecast.hasLiquidityWarning ? 'error' : 'ok',
                    }
                  : undefined
              }
            />
          </div>

          {/* Timeline Table */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  Daily Liquidity Projection Timeline
                </h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Grounded in scheduled invoice due dates, supplier bill payment obligations, and
                  recurring transactions
                </p>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs text-left">
                <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)] sticky top-0">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold text-right">Expected Inflow</th>
                    <th className="py-3 px-4 font-semibold text-right">Expected Outflow</th>
                    <th className="py-3 px-4 font-semibold text-right">Net Flow</th>
                    <th className="py-3 px-4 font-semibold text-right">Cumulative Balance</th>
                    <th className="py-3 px-4 font-semibold text-right">Optimistic (+Band)</th>
                    <th className="py-3 px-4 font-semibold text-right">Conservative (-Band)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {isLoading && !activeForecast ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={7} className="py-3 px-4">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))
                  ) : activeForecast?.items && activeForecast.items.length > 0 ? (
                    activeForecast.items.map((item, idx) => {
                      const net = Number.parseFloat(item.netCashFlow);
                      return (
                        <tr
                          key={idx}
                          className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                        >
                          <td className="py-3 px-4 font-mono font-medium text-[var(--text-primary)] whitespace-nowrap">
                            {formatDate(item.projectionDate)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {Number.parseFloat(item.expectedInflow) > 0
                              ? `+${formatCurrency(item.expectedInflow, currency)}`
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
                            {Number.parseFloat(item.expectedOutflow) > 0
                              ? `-${formatCurrency(item.expectedOutflow, currency)}`
                              : '—'}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono font-bold whitespace-nowrap ${
                              net > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : net < 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {net > 0 ? '+' : ''}
                            {formatCurrency(item.netCashFlow, currency)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                            {formatCurrency(item.cumulativeBalance, currency)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-700 dark:text-emerald-300 opacity-90 whitespace-nowrap">
                            {item.optimisticBalance
                              ? formatCurrency(item.optimisticBalance, currency)
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-amber-700 dark:text-amber-300 opacity-90 whitespace-nowrap">
                            {item.conservativeBalance
                              ? formatCurrency(item.conservativeBalance, currency)
                              : '—'}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-xs text-[var(--text-muted)]">
                        No daily projection rows available for this forecast version.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Data Limitations Notice */}
      {activeForecast?.dataLimitations && activeForecast.dataLimitations.length > 0 && (
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)] text-xs space-y-1.5">
          <span className="font-bold text-[var(--text-muted)] uppercase tracking-wider block text-[10px]">
            Model Assumptions & Data Limitations
          </span>
          <ul className="list-disc list-inside space-y-1 text-[var(--text-secondary)]">
            {activeForecast.dataLimitations.map((lim, i) => (
              <li key={i}>{lim}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Generate Forecast Modal */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        title="Generate New Multi-Horizon Forecast"
        size="md"
      >
        <form onSubmit={handleGenerateForecast} className="space-y-4">
          {modalError && (
            <div
              role="alert"
              className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{modalError}</span>
            </div>
          )}

          <Select
            id="genHorizon"
            label="Projection Horizon Window *"
            value={String(modalHorizon)}
            onChange={(e) => setModalHorizon(Number(e.target.value) as 7 | 30 | 60 | 90)}
            options={[
              { value: '7', label: '7 Days (Operational cash-in/out)' },
              { value: '30', label: '30 Days (Monthly cash burn)' },
              { value: '60', label: '60 Days (Bi-monthly planning)' },
              { value: '90', label: '90 Days (Quarterly runway)' },
            ]}
          />

          <Select
            id="genScenario"
            label="Planning Scenario Type *"
            value={modalScenario}
            onChange={(e) =>
              setModalScenario(e.target.value as 'BASE' | 'OPTIMISTIC' | 'CONSERVATIVE')
            }
            options={[
              { value: 'BASE', label: 'Base Case (Standard due dates)' },
              { value: 'OPTIMISTIC', label: 'Optimistic (+10% inflows, -5% expenses)' },
              { value: 'CONSERVATIVE', label: 'Conservative (-15% inflows, +10% expenses)' },
            ]}
          />

          <Input
            id="genBuffer"
            label={`Liquidity Safety Buffer (${currency}) *`}
            type="number"
            step="500"
            required
            value={safetyBuffer}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSafetyBuffer(e.target.value)}
            helperText="Minimum cash buffer below which a liquidity warning alert is raised"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <Button variant="ghost" type="button" onClick={() => setIsGenerateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Run Simulation & Commit Version
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
