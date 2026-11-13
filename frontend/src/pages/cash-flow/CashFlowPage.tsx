import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  History,
  RefreshCw,
  Scale,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { apiGet, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, resolveReportingCurrency } from '../../utils/formatters';

interface CashFlowProjectionItem {
  id?: string;
  projectionDate: string;
  expectedInflow: string;
  expectedOutflow: string;
  recurringInflow?: string;
  recurringOutflow?: string;
  netCashFlow: string;
  cumulativeBalance: string;
  optimisticBalance?: string;
  conservativeBalance?: string;
}

interface ActualComparison {
  forecastId: string;
  currency: string;
  isComplete?: boolean;
  missingCurrencies?: string[];
  projected: {
    inflows: string;
    outflows: string;
    closingCash: string;
  };
  actual: {
    inflows: string;
    outflows: string;
    closingCash: string;
    transactionCount: number;
  };
  variance: {
    inflowVariance: string;
    outflowVariance: string;
    closingCashVariance: string;
    closingCashVariancePct: string;
  };
  comparedAt: string;
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
  projectedNetCashFlow?: string;
  projectedReceivablesInflow?: string;
  projectedRecurringInflow?: string;
  projectedPayablesOutflow?: string;
  projectedRecurringOutflow?: string;
  projectedClosingCash: string;
  minimumProjectedCash: string;
  minimumCashDate: string | null;
  hasLiquidityWarning: boolean;
  uncertaintyBandPct: string;
  isStale?: boolean;
  latestFinancialChangeAt?: string | null;
  assumptions?: {
    liquiditySafetyBuffer?: string;
    isComplete?: boolean;
    missingCurrencies?: string[];
  };
  dataLimitations?: string[];
  actualComparison?: ActualComparison | null;
  items?: CashFlowProjectionItem[];
  generatedAt?: string;
  createdAt?: string;
}

function formatScenarioTitleCase(scenario: string): string {
  if (!scenario) return '';
  return scenario.charAt(0).toUpperCase() + scenario.slice(1).toLowerCase();
}

type PeriodView = 'daily' | 'weekly' | 'monthly';

interface AggregatedTimelineRow {
  key: string;
  label: string;
  sublabel?: string;
  inflow: number;
  receivableInflow: number;
  recurringInflow: number;
  outflow: number;
  payableOutflow: number;
  recurringOutflow: number;
  netCashFlow: number;
  cumulativeBalance: number;
  optimisticBalance?: number;
  conservativeBalance?: number;
}

function aggregateTimelineItems(
  items: CashFlowProjectionItem[],
  periodView: PeriodView,
): AggregatedTimelineRow[] {
  if (items.length === 0) return [];

  if (periodView === 'daily') {
    return items.map((item, idx) => {
      const ar = Number.parseFloat(item.expectedInflow || '0') || 0;
      const recIn = Number.parseFloat(item.recurringInflow || '0') || 0;
      const ap = Number.parseFloat(item.expectedOutflow || '0') || 0;
      const recOut = Number.parseFloat(item.recurringOutflow || '0') || 0;
      return {
        key: item.id || `${item.projectionDate}-${idx}`,
        label: formatDate(item.projectionDate),
        inflow: ar + recIn,
        receivableInflow: ar,
        recurringInflow: recIn,
        outflow: ap + recOut,
        payableOutflow: ap,
        recurringOutflow: recOut,
        netCashFlow: Number.parseFloat(item.netCashFlow || '0') || 0,
        cumulativeBalance: Number.parseFloat(item.cumulativeBalance || '0') || 0,
        optimisticBalance: item.optimisticBalance
          ? Number.parseFloat(item.optimisticBalance)
          : undefined,
        conservativeBalance: item.conservativeBalance
          ? Number.parseFloat(item.conservativeBalance)
          : undefined,
      };
    });
  }

  if (periodView === 'weekly') {
    const rows: AggregatedTimelineRow[] = [];
    for (let i = 0; i < items.length; i += 7) {
      const chunk = items.slice(i, i + 7);
      const first = chunk[0];
      const last = chunk[chunk.length - 1];
      let ar = 0;
      let recIn = 0;
      let ap = 0;
      let recOut = 0;
      let net = 0;
      for (const item of chunk) {
        ar += Number.parseFloat(item.expectedInflow || '0') || 0;
        recIn += Number.parseFloat(item.recurringInflow || '0') || 0;
        ap += Number.parseFloat(item.expectedOutflow || '0') || 0;
        recOut += Number.parseFloat(item.recurringOutflow || '0') || 0;
        net += Number.parseFloat(item.netCashFlow || '0') || 0;
      }
      rows.push({
        key: `week-${i / 7 + 1}`,
        label: `Week ${Math.floor(i / 7) + 1}`,
        sublabel: `${formatDate(first.projectionDate)} – ${formatDate(last.projectionDate)}`,
        inflow: ar + recIn,
        receivableInflow: ar,
        recurringInflow: recIn,
        outflow: ap + recOut,
        payableOutflow: ap,
        recurringOutflow: recOut,
        netCashFlow: net,
        cumulativeBalance: Number.parseFloat(last.cumulativeBalance || '0') || 0,
        optimisticBalance: last.optimisticBalance
          ? Number.parseFloat(last.optimisticBalance)
          : undefined,
        conservativeBalance: last.conservativeBalance
          ? Number.parseFloat(last.conservativeBalance)
          : undefined,
      });
    }
    return rows;
  }

  // Monthly grouping by YYYY-MM (UTC)
  const monthBuckets = new Map<string, CashFlowProjectionItem[]>();
  for (const item of items) {
    const monthKey = item.projectionDate.slice(0, 7);
    const arr = monthBuckets.get(monthKey) ?? [];
    arr.push(item);
    monthBuckets.set(monthKey, arr);
  }

  return Array.from(monthBuckets.entries()).map(([monthKey, chunk]) => {
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    let ar = 0;
    let recIn = 0;
    let ap = 0;
    let recOut = 0;
    let net = 0;
    for (const item of chunk) {
      ar += Number.parseFloat(item.expectedInflow || '0') || 0;
      recIn += Number.parseFloat(item.recurringInflow || '0') || 0;
      ap += Number.parseFloat(item.expectedOutflow || '0') || 0;
      recOut += Number.parseFloat(item.recurringOutflow || '0') || 0;
      net += Number.parseFloat(item.netCashFlow || '0') || 0;
    }
    const [year, month] = monthKey.split('-');
    const monthLabel = new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString(
      'en-US',
      { month: 'short', year: 'numeric', timeZone: 'UTC' },
    );
    return {
      key: `month-${monthKey}`,
      label: monthLabel,
      sublabel: `${formatDate(first.projectionDate)} – ${formatDate(last.projectionDate)} (${chunk.length}d)`,
      inflow: ar + recIn,
      receivableInflow: ar,
      recurringInflow: recIn,
      outflow: ap + recOut,
      payableOutflow: ap,
      recurringOutflow: recOut,
      netCashFlow: net,
      cumulativeBalance: Number.parseFloat(last.cumulativeBalance || '0') || 0,
      optimisticBalance: last.optimisticBalance
        ? Number.parseFloat(last.optimisticBalance)
        : undefined,
      conservativeBalance: last.conservativeBalance
        ? Number.parseFloat(last.conservativeBalance)
        : undefined,
    };
  });
}

export function CashFlowPage() {
  const { activeOrg, isAuditor, hasRole, isLoading: isAuthLoading } = useAuth();

  const [forecasts, setForecasts] = useState<CashFlowForecast[]>([]);
  const [selectedHorizon, setSelectedHorizon] = useState<7 | 30 | 60 | 90>(30);
  const [activeForecast, setActiveForecast] = useState<CashFlowForecast | null>(null);
  const [periodView, setPeriodView] = useState<PeriodView>('daily');
  const [isComparingActuals, setIsComparingActuals] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);

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

  const scenarioOrder = ['BASE', 'OPTIMISTIC', 'CONSERVATIVE'] as const;
  type ScenarioType = (typeof scenarioOrder)[number];

  // Map the latest forecast version per scenario type for the current horizon
  const latestByScenario = useMemo(() => {
    const map = new Map<ScenarioType, CashFlowForecast>();
    for (const fc of forecasts) {
      if (!map.has(fc.scenarioType)) {
        map.set(fc.scenarioType, fc);
      }
    }
    return map;
  }, [forecasts]);

  // Check if user is currently viewing an older historical snapshot
  const latestActiveForCurrentScenario = activeForecast
    ? latestByScenario.get(activeForecast.scenarioType)
    : null;
  const isViewingHistoricalSnapshot = Boolean(
    activeForecast &&
      latestActiveForCurrentScenario &&
      activeForecast.id !== latestActiveForCurrentScenario.id,
  );

  // Custom Scenario Dropdown Menu State & Ref
  const [isScenarioMenuOpen, setIsScenarioMenuOpen] = useState(false);
  const scenarioMenuRef = useRef<HTMLDivElement>(null);

  // Close custom scenario dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (scenarioMenuRef.current && !scenarioMenuRef.current.contains(event.target as Node)) {
        setIsScenarioMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsScenarioMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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
          const defaultFc = list.find((f) => f.scenarioType === 'BASE') || list[0];
          if (defaultFc.items && defaultFc.items.length > 0) {
            setActiveForecast(defaultFc);
          } else {
            apiGet<CashFlowForecast>(`/v1/organizations/${activeOrgId}/forecasts/${defaultFc.id}`)
              .then((det) => {
                if (isMounted) setActiveForecast(det);
              })
              .catch(() => {
                if (isMounted) setActiveForecast(defaultFc);
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
    const parsedBuffer = Number.parseFloat(safetyBuffer || '0');
    if (Number.isNaN(parsedBuffer) || parsedBuffer < 0) {
      setModalError('Liquidity safety buffer must be a valid non-negative number.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const generated = await apiPost<CashFlowForecast>(
        `/v1/organizations/${activeOrgId}/forecasts`,
        {
          horizonDays: modalHorizon,
          scenarioType: modalScenario,
          liquiditySafetyBuffer: parsedBuffer.toFixed(4),
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

  const handleSelectVersion = async (forecastId: string) => {
    if (!activeOrgId) return;
    const found = forecasts.find((f) => f.id === forecastId);
    if (found?.items && found.items.length > 0) {
      setActiveForecast(found);
      return;
    }
    try {
      const detail = await apiGet<CashFlowForecast>(
        `/v1/organizations/${activeOrgId}/forecasts/${forecastId}`,
      );
      setActiveForecast(detail);
    } catch {
      if (found) setActiveForecast(found);
    }
  };

  const handleRecalculateCurrent = async () => {
    if (!activeOrgId || !activeForecast) return;
    setIsRecalculating(true);
    setError(null);
    try {
      const regenerated = await apiPost<CashFlowForecast>(
        `/v1/organizations/${activeOrgId}/forecasts`,
        {
          horizonDays: activeForecast.horizonDays,
          scenarioType: activeForecast.scenarioType,
          liquiditySafetyBuffer:
            activeForecast.assumptions?.liquiditySafetyBuffer ?? '5000.0000',
        },
      );
      setActiveForecast(regenerated);
      handleRefresh();
    } catch (err: unknown) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to recalculate forecast from latest records.',
      );
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleCompareActuals = async () => {
    if (!activeOrgId || !activeForecast) return;
    setIsComparingActuals(true);
    setError(null);
    try {
      const comparison = await apiPost<ActualComparison>(
        `/v1/organizations/${activeOrgId}/forecasts/${activeForecast.id}/compare-actuals`,
        {},
      );
      setActiveForecast((prev) => (prev ? { ...prev, actualComparison: comparison } : prev));
    } catch (err: unknown) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to compare forecast against actual ledger transactions.',
      );
    } finally {
      setIsComparingActuals(false);
    }
  };

  const currency = resolveReportingCurrency(activeOrg?.baseCurrency, activeForecast?.currency);
  const timelineRows = activeForecast?.items
    ? aggregateTimelineItems(activeForecast.items, periodView)
    : [];

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

      {/* Horizon Selector Tabs & Version Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-2">
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
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-[var(--text-muted)]">
            {/* Custom Scenario Dropdown */}
            <div ref={scenarioMenuRef} className="relative inline-flex items-center text-xs">
              <button
                type="button"
                id="scenario-selector-trigger"
                aria-haspopup="listbox"
                aria-expanded={isScenarioMenuOpen}
                aria-label="Select forecast version"
                onClick={() => setIsScenarioMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 bg-white dark:bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20"
              >
                <span>{formatScenarioTitleCase(activeForecast.scenarioType)}</span>
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded-md bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                  v{activeForecast.version}
                </span>
                {isViewingHistoricalSnapshot && (
                  <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                    Historical
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-150 ${
                    isScenarioMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isScenarioMenuOpen && (
                <div
                  role="listbox"
                  aria-labelledby="scenario-selector-trigger"
                  className="absolute left-0 top-full mt-1.5 w-52 rounded-xl border border-[var(--border-subtle)] bg-white dark:bg-[var(--surface-card)] shadow-xl py-1 z-50 animate-in fade-in-50 zoom-in-95 duration-100"
                >
                  {isViewingHistoricalSnapshot && (
                    <button
                      type="button"
                      role="option"
                      aria-selected={true}
                      aria-label={`v${activeForecast.version} • ${formatScenarioTitleCase(activeForecast.scenarioType)}`}
                      onClick={() => setIsScenarioMenuOpen(false)}
                      className="w-full flex items-center justify-between px-3.5 py-2 text-xs transition-colors cursor-pointer text-left bg-[var(--surface-elevated)] font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)]/60"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{formatScenarioTitleCase(activeForecast.scenarioType)}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[var(--surface-canvas)] text-[var(--text-muted)] border border-[var(--border-subtle)] font-normal">
                          v{activeForecast.version}
                        </span>
                        <span className="text-[9px] font-medium px-1.5 py-0.2 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                          Historical
                        </span>
                      </div>
                      <Check className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0 ml-2" />
                    </button>
                  )}

                  {scenarioOrder.map((scen) => {
                    const fc = latestByScenario.get(scen);
                    const isSelected = !isViewingHistoricalSnapshot && activeForecast.id === fc?.id;
                    const label = formatScenarioTitleCase(scen);

                    if (fc) {
                      return (
                        <button
                          key={fc.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          aria-label={`v${fc.version} • ${label}`}
                          onClick={() => {
                            void handleSelectVersion(fc.id);
                            setIsScenarioMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2 text-xs transition-colors cursor-pointer text-left ${
                            isSelected
                              ? 'bg-[var(--surface-elevated)] font-semibold text-[var(--text-primary)]'
                              : 'hover:bg-[var(--surface-elevated)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate">{label}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[var(--surface-canvas)] text-[var(--text-muted)] border border-[var(--border-subtle)] font-normal">
                              v{fc.version}
                            </span>
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0 ml-2" />
                          )}
                        </button>
                      );
                    }

                    return (
                      <button
                        key={scen}
                        type="button"
                        role="option"
                        aria-selected={false}
                        aria-label={`${label} (Generate)`}
                        onClick={() => {
                          setModalHorizon(selectedHorizon);
                          setModalScenario(scen);
                          setModalError(null);
                          setIsGenerateModalOpen(true);
                          setIsScenarioMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3.5 py-2 text-xs transition-colors cursor-pointer text-left hover:bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        <span className="truncate">{label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-medium">
                          Generate
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsVersionHistoryOpen(true)}
              className="inline-flex items-center gap-1.5"
              title="View all historical forecast simulation runs"
            >
              <History className="w-3.5 h-3.5" />
              <span>Version History ({forecasts.length})</span>
            </Button>

            {canGenerate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCompareActuals()}
                isLoading={isComparingActuals}
              >
                Compare Actuals
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Historical Snapshot Notice */}
      {isViewingHistoricalSnapshot && activeForecast && (
        <div
          role="status"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200 text-xs"
        >
          <div className="flex items-start gap-2.5">
            <History className="w-4 h-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
            <div>
              <span className="font-semibold block mb-0.5">
                Viewing Historical Snapshot (v{activeForecast.version} •{' '}
                {formatScenarioTitleCase(activeForecast.scenarioType)})
              </span>
              <span className="leading-relaxed opacity-90">
                Generated {formatDate(activeForecast.createdAt || activeForecast.generatedAt || activeForecast.startDate)}.
                This is an immutable historical record for compliance and audit comparison.
              </span>
            </div>
          </div>
          {latestActiveForCurrentScenario && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSelectVersion(latestActiveForCurrentScenario.id)}
              className="shrink-0 bg-white dark:bg-transparent"
            >
              Return to Latest Active (v{latestActiveForCurrentScenario.version})
            </Button>
          )}
        </div>
      )}

      {/* Stale Forecast Banner when underlying financial records changed */}
      {activeForecast?.isStale && (
        <div
          role="status"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <span className="font-bold block mb-0.5">Underlying Financial Records Updated</span>
              <span>
                Invoices, supplier bills, payments, accounts, or ledger transactions were modified
                after this forecast version was generated. Recalculate to reflect the latest
                balances.
              </span>
            </div>
          </div>
          {canGenerate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRecalculateCurrent()}
              isLoading={isRecalculating}
            >
              Recalculate Forecast
            </Button>
          )}
        </div>
      )}

      {/* Liquidity Alert Banner if warning */}
      {activeForecast?.hasLiquidityWarning && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <div>
            <span className="font-bold block mb-0.5">Critical Liquidity Warning</span>
            <span>
              Projected cash balance breaches safety buffer threshold on{' '}
              <strong className="font-mono">
                {formatDate(activeForecast.minimumCashDate ?? activeForecast.startDate)}
              </strong>{' '}
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
          {/* Cash Flow KPI Cards Grid — Cashly Minimal Modern Style (4 Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Opening Cash */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4.5 sm:p-5 shadow-xs transition-all hover:border-[var(--brand-primary)]/30 hover:shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-[13px] font-medium text-[var(--text-secondary)]">
                  Opening Cash
                </span>
                <Wallet className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
              </div>

              <div className="flex items-center justify-between gap-3 my-2.5 min-w-0">
                <span className="text-[clamp(1.15rem,1.5vw,1.4rem)] font-bold tracking-tight text-[var(--text-primary)] tabular-nums whitespace-nowrap">
                  {activeForecast ? formatCurrency(activeForecast.openingCashBalance, currency) : '—'}
                </span>
                <div className="shrink-0 opacity-80" aria-hidden="true">
                  <svg width="56" height="24" viewBox="0 0 56 24" fill="none">
                    <path
                      d="M 2 18 Q 14 22, 26 14 T 44 8 T 54 10"
                      stroke="var(--brand-primary)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <circle cx="54" cy="10" r="2.5" fill="var(--brand-primary)" />
                  </svg>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)]/60 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span className="truncate">Baseline liquid accounts</span>
              </div>
            </div>

            {/* Card 2: Projected Inflows */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4.5 sm:p-5 shadow-xs transition-all hover:border-emerald-500/30 hover:shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-[13px] font-medium text-[var(--text-secondary)]">
                  Projected Inflows ({selectedHorizon}d)
                </span>
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              </div>

              <div className="flex items-center justify-between gap-3 my-2.5 min-w-0">
                <span className="text-[clamp(1.15rem,1.5vw,1.4rem)] font-bold tracking-tight text-[var(--text-primary)] tabular-nums whitespace-nowrap">
                  {activeForecast ? formatCurrency(activeForecast.projectedInflows, currency) : '—'}
                </span>
                <div className="shrink-0 opacity-85" aria-hidden="true">
                  <svg width="48" height="24" viewBox="0 0 48 24" fill="none">
                    <rect x="2" y="14" width="6" height="10" rx="2" fill="#10b981" fillOpacity="0.35" />
                    <rect x="11" y="11" width="6" height="13" rx="2" fill="#10b981" fillOpacity="0.5" />
                    <rect x="20" y="8" width="6" height="16" rx="2" fill="#10b981" fillOpacity="0.7" />
                    <rect x="29" y="5" width="6" height="19" rx="2" fill="#10b981" fillOpacity="0.85" />
                    <rect x="38" y="2" width="6" height="22" rx="2" fill="#10b981" />
                  </svg>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)]/60 flex items-center justify-between gap-1 text-[11px] text-[var(--text-muted)]">
                <div className="flex items-center gap-1.5 min-w-0">
                  {activeForecast && (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums shrink-0">
                      <TrendingUp className="w-3 h-3" />
                      +{formatCurrency(activeForecast.projectedInflows, currency)}
                    </span>
                  )}
                  <span className="truncate">
                    {activeForecast?.projectedReceivablesInflow !== undefined
                      ? `• AR: ${formatCurrency(activeForecast.projectedReceivablesInflow, currency)}`
                      : 'Customer AR & recurring'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Projected Outflows */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4.5 sm:p-5 shadow-xs transition-all hover:border-rose-500/30 hover:shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-[13px] font-medium text-[var(--text-secondary)]">
                  Projected Outflows ({selectedHorizon}d)
                </span>
                <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              </div>

              <div className="flex items-center justify-between gap-3 my-2.5 min-w-0">
                <span className="text-[clamp(1.15rem,1.5vw,1.4rem)] font-bold tracking-tight text-[var(--text-primary)] tabular-nums whitespace-nowrap">
                  {activeForecast ? formatCurrency(activeForecast.projectedOutflows, currency) : '—'}
                </span>
                <div className="shrink-0 opacity-85" aria-hidden="true">
                  <svg width="48" height="24" viewBox="0 0 48 24" fill="none">
                    <rect x="2" y="8" width="6" height="16" rx="2" fill="#e11d48" fillOpacity="0.4" />
                    <rect x="11" y="4" width="6" height="20" rx="2" fill="#e11d48" fillOpacity="0.6" />
                    <rect x="20" y="10" width="6" height="14" rx="2" fill="#e11d48" fillOpacity="0.5" />
                    <rect x="29" y="3" width="6" height="21" rx="2" fill="#e11d48" />
                    <rect x="38" y="7" width="6" height="17" rx="2" fill="#e11d48" fillOpacity="0.75" />
                  </svg>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)]/60 flex items-center justify-between gap-1 text-[11px] text-[var(--text-muted)]">
                <div className="flex items-center gap-1.5 min-w-0">
                  {activeForecast && (
                    <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-semibold tabular-nums shrink-0">
                      <TrendingDown className="w-3 h-3" />
                      -{formatCurrency(activeForecast.projectedOutflows, currency)}
                    </span>
                  )}
                  <span className="truncate">
                    {activeForecast?.projectedPayablesOutflow !== undefined
                      ? `• AP: ${formatCurrency(activeForecast.projectedPayablesOutflow, currency)}`
                      : 'Supplier AP & expenses'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 4: Projected Closing Cash */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4.5 sm:p-5 shadow-xs transition-all hover:border-purple-500/30 hover:shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-[13px] font-medium text-[var(--text-secondary)]">
                  Projected Closing Cash
                </span>
                <Scale className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              </div>

              <div className="flex items-center justify-between gap-3 my-2.5 min-w-0">
                <span className="text-[clamp(1.15rem,1.5vw,1.4rem)] font-bold tracking-tight text-[var(--text-primary)] tabular-nums whitespace-nowrap">
                  {activeForecast ? formatCurrency(activeForecast.projectedClosingCash, currency) : '—'}
                </span>
                <div className="shrink-0 opacity-80" aria-hidden="true">
                  <svg width="48" height="24" viewBox="0 0 48 24" fill="none">
                    <path
                      d="M 2 12 Q 12 18, 22 10 T 36 6 T 46 8"
                      stroke="#7c3aed"
                      strokeWidth="2"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <circle cx="46" cy="8" r="2.5" fill="#7c3aed" />
                  </svg>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)]/60 flex items-center justify-between gap-1 text-[11px] text-[var(--text-muted)]">
                <span className="truncate tabular-nums">
                  {activeForecast
                    ? `Min: ${formatCurrency(activeForecast.minimumProjectedCash, currency)}`
                    : `At end of ${selectedHorizon}d window`}
                </span>
                {activeForecast && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                      activeForecast.hasLiquidityWarning
                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {activeForecast.hasLiquidityWarning ? 'Breach Risk' : 'Buffer Intact'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actuals Comparison Panel (if computed) */}
          {activeForecast?.actualComparison && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">
                    Forecast vs. Actual Ledger Variance
                  </h2>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Compared against {activeForecast.actualComparison.actual.transactionCount}{' '}
                    posted ledger transaction(s) • Updated{' '}
                    {formatDate(activeForecast.actualComparison.comparedAt)}
                  </p>
                </div>
                {activeForecast.actualComparison.isComplete === false && (
                  <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    Missing FX rates:{' '}
                    {activeForecast.actualComparison.missingCurrencies?.join(', ')}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[var(--surface-elevated)]/50 border border-[var(--border-subtle)]">
                  <div className="text-[var(--text-muted)] mb-1">Inflows (Actual vs Projected)</div>
                  <div className="font-mono font-bold text-[var(--text-primary)]">
                    {formatCurrency(activeForecast.actualComparison.actual.inflows, currency)} /{' '}
                    {formatCurrency(activeForecast.actualComparison.projected.inflows, currency)}
                  </div>
                  <div className="font-mono text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Variance:{' '}
                    {formatCurrency(
                      activeForecast.actualComparison.variance.inflowVariance,
                      currency,
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--surface-elevated)]/50 border border-[var(--border-subtle)]">
                  <div className="text-[var(--text-muted)] mb-1">Outflows (Actual vs Projected)</div>
                  <div className="font-mono font-bold text-[var(--text-primary)]">
                    {formatCurrency(activeForecast.actualComparison.actual.outflows, currency)} /{' '}
                    {formatCurrency(activeForecast.actualComparison.projected.outflows, currency)}
                  </div>
                  <div className="font-mono text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Variance:{' '}
                    {formatCurrency(
                      activeForecast.actualComparison.variance.outflowVariance,
                      currency,
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--surface-elevated)]/50 border border-[var(--border-subtle)]">
                  <div className="text-[var(--text-muted)] mb-1">
                    Closing Cash (Actual vs Projected)
                  </div>
                  <div className="font-mono font-bold text-[var(--text-primary)]">
                    {formatCurrency(activeForecast.actualComparison.actual.closingCash, currency)} /{' '}
                    {formatCurrency(
                      activeForecast.actualComparison.projected.closingCash,
                      currency,
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Variance:{' '}
                    {formatCurrency(
                      activeForecast.actualComparison.variance.closingCashVariance,
                      currency,
                    )}{' '}
                    ({activeForecast.actualComparison.variance.closingCashVariancePct}%)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Timeline Table with Daily / Weekly / Monthly aggregation */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  {periodView === 'daily'
                    ? 'Daily Liquidity Projection Timeline'
                    : periodView === 'weekly'
                      ? 'Weekly Liquidity Projection Summary'
                      : 'Monthly Liquidity Projection Summary'}
                </h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Grounded in scheduled invoice due dates, supplier bill payment obligations, and
                  recurring transactions
                </p>
              </div>

              <div className="flex items-center gap-1 bg-[var(--surface-elevated)]/60 p-1 rounded-lg border border-[var(--border-subtle)]">
                {(['daily', 'weekly', 'monthly'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setPeriodView(view)}
                    className={`px-3 py-1 rounded-md text-[11px] font-semibold capitalize cursor-pointer transition-all ${
                      periodView === view
                        ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs text-left">
                <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)] sticky top-0">
                  <tr>
                    <th className="py-3 px-4 font-semibold">
                      {periodView === 'daily' ? 'Date' : 'Period'}
                    </th>
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
                  ) : timelineRows.length > 0 ? (
                    timelineRows.map((row) => (
                      <tr
                        key={row.key}
                        className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-medium text-[var(--text-primary)] whitespace-nowrap">
                          <div>{row.label}</div>
                          {row.sublabel && (
                            <div className="text-[10px] text-[var(--text-muted)] font-sans">
                              {row.sublabel}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {row.inflow > 0 ? `+${formatCurrency(row.inflow, currency)}` : '—'}
                          {row.recurringInflow > 0 && (
                            <div className="text-[10px] text-[var(--text-muted)] font-normal">
                              Rec: +{formatCurrency(row.recurringInflow, currency)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
                          {row.outflow > 0 ? `-${formatCurrency(row.outflow, currency)}` : '—'}
                          {row.recurringOutflow > 0 && (
                            <div className="text-[10px] text-[var(--text-muted)] font-normal">
                              Rec: -{formatCurrency(row.recurringOutflow, currency)}
                            </div>
                          )}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold whitespace-nowrap ${
                            row.netCashFlow > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : row.netCashFlow < 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {row.netCashFlow > 0 ? '+' : ''}
                          {formatCurrency(row.netCashFlow, currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                          {formatCurrency(row.cumulativeBalance, currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700 dark:text-emerald-300 opacity-90 whitespace-nowrap">
                          {row.optimisticBalance !== undefined
                            ? formatCurrency(row.optimisticBalance, currency)
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-700 dark:text-amber-300 opacity-90 whitespace-nowrap">
                          {row.conservativeBalance !== undefined
                            ? formatCurrency(row.conservativeBalance, currency)
                            : '—'}
                        </td>
                      </tr>
                    ))
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

      {/* Version History Modal */}
      <Modal
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        title={`Forecast Version History (${selectedHorizon}-Day Horizon)`}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-muted)]">
            Audit trail of all persisted simulation runs and deterministic forecast snapshots for
            the <strong className="text-[var(--text-primary)] font-semibold">{selectedHorizon}-day horizon</strong> ({forecasts.length} total snapshots).
          </p>

          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)]">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--surface-elevated)]/70 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)] sticky top-0">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Version & Scenario</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Created</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Inflows / Outflows</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Closing Cash</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {forecasts.map((fc) => {
                  const isLatest = latestByScenario.get(fc.scenarioType)?.id === fc.id;
                  const isCurrentlyActive = activeForecast?.id === fc.id;
                  return (
                    <tr
                      key={fc.id}
                      className={`hover:bg-[var(--surface-elevated)]/40 transition-colors ${
                        isCurrentlyActive ? 'bg-[var(--accent-primary)]/5 font-medium' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[var(--text-primary)]">
                          v{fc.version} • {formatScenarioTitleCase(fc.scenarioType)}
                        </div>
                        {fc.hasLiquidityWarning && (
                          <span className="inline-block mt-0.5 text-[10px] text-rose-600 dark:text-rose-400 font-normal">
                            Liquidity Warning
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {isLatest ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            Latest Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                            Historical Run
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)] whitespace-nowrap">
                        {formatDate(fc.createdAt || fc.generatedAt || fc.startDate)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap font-mono text-[11px]">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          +{formatCurrency(fc.projectedInflows, currency)}
                        </span>
                        <span className="text-[var(--text-muted)] mx-1">/</span>
                        <span className="text-rose-600 dark:text-rose-400">
                          -{formatCurrency(fc.projectedOutflows, currency)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                        {formatCurrency(fc.projectedClosingCash, currency)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {isCurrentlyActive ? (
                          <span className="text-[11px] font-semibold text-[var(--brand-primary)]">
                            Viewing
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2.5"
                            onClick={() => {
                              void handleSelectVersion(fc.id);
                              setIsVersionHistoryOpen(false);
                            }}
                          >
                            View
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsVersionHistoryOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
