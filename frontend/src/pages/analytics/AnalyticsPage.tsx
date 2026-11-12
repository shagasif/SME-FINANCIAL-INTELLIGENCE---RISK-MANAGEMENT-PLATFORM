import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatPercentage, resolveReportingCurrency } from '../../utils/formatters';
import type {
  AllMetricsResponse,
  DeterministicMetricResult,
  MetricReportingPeriod,
  MetricSourceRecordIds,
} from '../../types/analytics.types';

function isMetricComputed(status?: DeterministicMetricResult['status']): boolean {
  return status === 'COMPUTED' || status === 'CALCULATED';
}

function formatReportingPeriodLabel(period?: MetricReportingPeriod): string {
  if (!period) return 'Current Scope';
  if (typeof period === 'string') return period;
  return `${period.startDate.slice(0, 10)} to ${period.endDate.slice(0, 10)}`;
}

function flattenSourceRecordIds(raw?: MetricSourceRecordIds): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const ids: string[] = [];
  for (const list of Object.values(raw)) {
    if (Array.isArray(list)) {
      ids.push(...list);
    }
  }
  return Array.from(new Set(ids));
}

interface MetricMeta {
  key: keyof AllMetricsResponse['metrics'];
  label: string;
  category: 'Liquidity' | 'Profitability' | 'Efficiency' | 'Operational';
  description: string;
  isCurrency?: boolean;
  isRatio?: boolean;
  isPercentage?: boolean;
  isDays?: boolean;
}

const METRIC_DEFINITIONS: MetricMeta[] = [
  {
    key: 'operatingCashFlow',
    label: 'Operating Cash Flow (OCF)',
    category: 'Liquidity',
    description: 'Net cash generated from regular business operating activities.',
    isCurrency: true,
  },
  {
    key: 'cashRunway',
    label: 'Cash Runway',
    category: 'Liquidity',
    description:
      'Estimated number of months before cash reserves are exhausted at current burn rate.',
    isDays: true,
  },
  {
    key: 'currentRatio',
    label: 'Current Ratio',
    category: 'Liquidity',
    description: 'Ability to cover short-term obligations (Current Assets / Current Liabilities).',
    isRatio: true,
  },
  {
    key: 'quickRatio',
    label: 'Quick Ratio (Acid-Test)',
    category: 'Liquidity',
    description: 'Liquid assets available to cover immediate short-term obligations.',
    isRatio: true,
  },
  {
    key: 'workingCapital',
    label: 'Net Working Capital',
    category: 'Operational',
    description: 'Operating liquidity buffer: Current Assets minus Current Liabilities.',
    isCurrency: true,
  },
  {
    key: 'grossMargin',
    label: 'Gross Profit Margin',
    category: 'Profitability',
    description: 'Percentage of revenue retained after incurring direct costs of goods/services.',
    isPercentage: true,
  },
  {
    key: 'expenseGrowth',
    label: 'Expense Growth Rate',
    category: 'Operational',
    description: 'Period-over-period rate of growth in total operating expenditures.',
    isPercentage: true,
  },
  {
    key: 'budgetVariance',
    label: 'Budget Variance',
    category: 'Operational',
    description: 'Net difference between budgeted expenditures and actual booked spending.',
    isPercentage: true,
  },
  {
    key: 'receivableAging',
    label: 'Days Sales Outstanding (DSO)',
    category: 'Efficiency',
    description: 'Average number of days taken to collect payment after a credit sale.',
    isDays: true,
  },
  {
    key: 'payableAging',
    label: 'Days Payable Outstanding (DPO)',
    category: 'Efficiency',
    description: 'Average number of days taken to settle accounts payable with vendors.',
    isDays: true,
  },
];

export function AnalyticsPage() {
  const { activeOrg, isLoading: isAuthLoading } = useAuth();

  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  });

  const [metricsData, setMetricsData] = useState<AllMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Expanded card state to show citations and limitations
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [inspectMetric, setInspectMetric] = useState<{
    meta: MetricMeta;
    result: DeterministicMetricResult;
  } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const activeOrgId = activeOrg?.id;

  useEffect(() => {
    if (isAuthLoading || !activeOrgId) return;

    let isMounted = true;
    const query = new URLSearchParams({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    });

    apiGet<AllMetricsResponse>(
      `/v1/organizations/${activeOrgId}/analytics/metrics?${query.toString()}`,
    )
      .then((data) => {
        if (!isMounted) return;
        setMetricsData(data);
        setError(null);
      })
      .catch((err) => {
        if (!isMounted) return;
        setMetricsData(null);
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to fetch financial metrics from live API.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, dateRange.startDate, dateRange.endDate, reloadKey, isAuthLoading]);

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  const handleApplyPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setDateRange({
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    });
    setIsLoading(true);
  };

  const toggleExpand = (metricKey: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [metricKey]: !prev[metricKey],
    }));
  };

  const formatMetricValue = (meta: MetricMeta, result?: DeterministicMetricResult) => {
    if (!result || !isMetricComputed(result.status) || result.value === null || result.value === undefined) {
      return '—';
    }

    const reportingCurrency = resolveReportingCurrency(
      activeOrg?.baseCurrency,
      result.currency || metricsData?.currency,
    );

    // Handle structured SCHEDULE aging metric payloads from backend
    if (typeof result.value === 'object') {
      if (result.value.isComplete === false) {
        return 'Incomplete';
      }
      const total = Number.parseFloat(result.value.totalOutstanding ?? '0');
      if (Number.isNaN(total)) return '—';
      return formatCurrency(total, reportingCurrency);
    }

    const val = typeof result.value === 'number' ? result.value : Number.parseFloat(result.value);
    if (Number.isNaN(val)) return String(result.value);

    if (meta.isCurrency) {
      return formatCurrency(val, reportingCurrency);
    }
    if (meta.isPercentage) {
      return formatPercentage(val);
    }
    if (meta.isRatio) {
      return `${val.toFixed(2)}x`;
    }
    if (meta.isDays) {
      if (result.unit === 'MONTHS') {
        return `${val.toFixed(1)} months`;
      }
      return `${val.toFixed(1)} ${result.unit || 'days'}`;
    }
    return `${val} ${result.unit || ''}`;
  };

  const getStatusBadge = (
    status: DeterministicMetricResult['status'],
    dataLimitations?: string[],
  ) => {
    if (isMetricComputed(status)) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          Verified
        </span>
      );
    }
    if (status === 'UNSUPPORTED_MISSING_DATA' || status === 'INSUFFICIENT_DATA') {
      const hasMissingFx = dataLimitations?.some((l) => /missing exchange rate/i.test(l));
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          {hasMissingFx ? 'Incomplete FX' : 'Insufficient Data'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
        <AlertCircle className="h-3 w-3" />
        Unsupported
      </span>
    );
  };

  const categories = ['ALL', 'Liquidity', 'Profitability', 'Efficiency', 'Operational'];

  const filteredMetrics = METRIC_DEFINITIONS.filter(
    (m) => selectedCategory === 'ALL' || m.category === selectedCategory,
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Financial Analytics
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Track key financial health, liquidity, and efficiency metrics for your business.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Date Range & Category Filter Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-[var(--brand-primary)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Date Filters & Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleApplyPreset(30)}
              className="rounded border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            >
              30D
            </button>
            <button
              onClick={() => handleApplyPreset(60)}
              className="rounded border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            >
              60D
            </button>
            <button
              onClick={() => handleApplyPreset(90)}
              className="rounded border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            >
              90D
            </button>
          </div>

          <div className="flex items-center gap-2 border-l border-[var(--border-subtle)] pl-2">
            <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange((prev) => ({ ...prev, startDate: e.target.value }))}
              className="rounded border border-[var(--border-subtle)] bg-transparent px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            />
            <span className="text-xs text-[var(--text-muted)]">to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange((prev) => ({ ...prev, endDate: e.target.value }))}
              className="rounded border border-[var(--border-subtle)] bg-transparent px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            />
            <Button size="sm" variant="outline" onClick={handleRefresh} className="text-xs">
              Apply
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {metricsData?.conversionContext && !metricsData.conversionContext.isComplete && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Consolidated {metricsData.conversionContext.baseCurrency} metrics are partially
            incomplete due to missing exchange rate(s) for:{' '}
            <strong>{metricsData.conversionContext.missingCurrencies.join(', ')}</strong>.
          </span>
        </div>
      )}

      {/* Metrics Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 space-y-3"
            >
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredMetrics.map((meta) => {
            const result = metricsData?.metrics?.[meta.key];
            const isExpanded = Boolean(expandedCards[meta.key]);
            const isCalculated = isMetricComputed(result?.status);
            const citationIds = flattenSourceRecordIds(result?.sourceRecordIds);

            return (
              <div
                key={meta.key}
                className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 transition-shadow hover:shadow-sm"
              >
                <div>
                  {/* Category & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-primary)]">
                      {meta.category}
                    </span>
                    {getStatusBadge(result?.status || 'UNSUPPORTED', result?.dataLimitations)}
                  </div>

                  {/* Metric Name */}
                  <h3 className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                    {meta.label}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)] leading-relaxed line-clamp-2">
                    {meta.description}
                  </p>

                  {/* Calculated Value Display */}
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                      {formatMetricValue(meta, result)}
                    </span>
                    {isCalculated && result?.reportingPeriod && (
                      <span className="text-[11px] text-[var(--text-muted)]">
                        ({formatReportingPeriodLabel(result.reportingPeriod)})
                      </span>
                    )}
                  </div>

                  {!isCalculated && result?.dataLimitations && result.dataLimitations.length > 0 && (
                    <p className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                      {result.dataLimitations[0]}
                    </p>
                  )}

                  {/* Expanded Section: Formula, Records Count & Notes (Hidden until 'View Formula' clicked) */}
                  {isExpanded && result && (
                    <div className="mt-3 space-y-3 pt-3 border-t border-[var(--border-subtle)] text-xs">
                      {result.formula && (
                        <div className="rounded-lg bg-[var(--surface-subtle)] p-2.5 font-mono text-[11px] text-[var(--text-secondary)] break-all border border-[var(--border-subtle)]">
                          <span className="text-[10px] text-[var(--text-muted)] block font-sans font-medium mb-0.5">
                            Formula:
                          </span>
                          {result.formula}
                        </div>
                      )}

                      {/* Citations Count */}
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                            <BookOpen className="h-3 w-3 text-[var(--text-muted)]" />
                            Source Records:
                          </span>
                          <span className="font-mono text-[11px] text-[var(--text-primary)] font-semibold">
                            {citationIds.length} records
                          </span>
                        </div>
                        {citationIds.length > 0 && (
                          <div className="mt-1.5 max-h-24 overflow-y-auto rounded bg-[var(--surface-subtle)] p-1.5 font-mono text-[10px] text-[var(--text-muted)] space-y-0.5 border border-[var(--border-subtle)]">
                            {citationIds.slice(0, 10).map((id, i) => (
                              <div key={i} className="truncate">
                                • {id}
                              </div>
                            ))}
                            {citationIds.length > 10 && (
                              <div className="text-[10px] text-[var(--brand-primary)] font-semibold pt-0.5">
                                + {citationIds.length - 10} more records
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Data Limitations */}
                      {result.dataLimitations && result.dataLimitations.length > 0 && (
                        <div>
                          <span className="font-medium text-[var(--text-secondary)] flex items-center gap-1.5 mb-1">
                            <Info className="h-3 w-3 text-amber-500" />
                            Notes:
                          </span>
                          <ul className="space-y-1 pl-4 list-disc text-[11px] text-[var(--text-muted)]">
                            {result.dataLimitations.map((lim, idx) => (
                              <li key={idx} className="leading-tight">
                                {lim}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="mt-4 flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
                  {result ? (
                    <button
                      type="button"
                      onClick={() => toggleExpand(meta.key)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-primary)] hover:underline cursor-pointer"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" /> Hide Formula
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" /> View Formula
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="text-[11px] text-[var(--text-muted)]">Unavailable</span>
                  )}

                  {result && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setInspectMetric({ meta, result })}
                      className="h-7 px-2 text-[11px]"
                    >
                      Details
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inspect Modal */}
      {inspectMetric && (
        <Modal
          isOpen={true}
          onClose={() => setInspectMetric(null)}
          title={`Audit Trace: ${inspectMetric.meta.label}`}
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface-subtle)] p-3 border border-[var(--border-subtle)]">
              <div>
                <div className="text-[10px] uppercase font-bold text-[var(--brand-primary)]">
                  Calculated Output
                </div>
                <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">
                  {formatMetricValue(inspectMetric.meta, inspectMetric.result)}
                </div>
              </div>
              <div>
                {getStatusBadge(
                  inspectMetric.result.status,
                  inspectMetric.result.dataLimitations,
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Calculation Formula:
              </label>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-2.5 font-mono text-[11px] text-[var(--text-primary)]">
                {inspectMetric.result.formula}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[var(--border-subtle)] p-2.5">
                <span className="text-[10px] text-[var(--text-muted)] block">Reporting Period</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {formatReportingPeriodLabel(inspectMetric.result.reportingPeriod)}
                </span>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] p-2.5">
                <span className="text-[10px] text-[var(--text-muted)] block">Currency Base</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {resolveReportingCurrency(
                    activeOrg?.baseCurrency,
                    inspectMetric.result.currency || metricsData?.currency,
                  )}
                </span>
              </div>
            </div>

            <div>
              {(() => {
                const modalIds = flattenSourceRecordIds(inspectMetric.result.sourceRecordIds);
                return (
                  <>
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                      Source Citations ({modalIds.length} Ledger Records):
                    </label>
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-2.5 font-mono text-[10px] text-[var(--text-muted)] space-y-1">
                      {modalIds.length ? (
                        modalIds.map((id, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <span>{id}</span>
                            <span className="text-[9px] text-[var(--brand-primary)]">
                              Verified Citation
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="italic text-[var(--text-muted)]">
                          No underlying transaction IDs cited for this metric period.
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Data Limitations & Assumptions:
              </label>
              {inspectMetric.result.dataLimitations?.length ? (
                <ul className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 list-disc pl-5 text-[11px] text-amber-800 dark:text-amber-300">
                  {inspectMetric.result.dataLimitations.map((lim, i) => (
                    <li key={i}>{lim}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-[var(--text-muted)]">
                  Zero data limitations reported for this dataset.
                </p>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setInspectMetric(null)}>
                Close Audit View
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
