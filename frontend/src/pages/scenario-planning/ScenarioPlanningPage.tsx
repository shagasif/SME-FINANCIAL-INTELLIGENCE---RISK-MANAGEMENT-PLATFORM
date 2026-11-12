import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calculator,
  History,
  Play,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface SimulationParameters {
  revenueDeltaPercent: string;
  expenseDeltaPercent: string;
  receivablesDelayDays: string;
  payablesAccelerateDays: string;
  scenarioName: string;
}

interface ScenarioSimulationRecord {
  id: string;
  organizationId: string;
  baselineForecastId: string;
  name: string;
  description?: string | null;
  customerPaymentDelayDays: number;
  salesGrowthPct: string;
  operatingCostChangePct: string;
  supplierPaymentTimingDays: number;
  triggersLiquidityWarning: boolean;
  impactSummary: {
    customerPaymentDelayDays: number;
    salesGrowthPct: string;
    operatingCostChangePct: string;
    supplierPaymentTimingDays: number;
    baselineClosingCash: string;
    scenarioClosingCash: string;
    netCashImpact: string;
    baselineMinCash: string;
    scenarioMinCash: string;
    minCashDelta: string;
    triggersLiquidityWarning: boolean;
  };
  dailyComparisons?: Array<{
    projectionDate: string;
    baselineCumulativeBalance: string;
    scenarioCumulativeBalance: string;
    balanceDelta: string;
    scenarioInflow: string;
    scenarioOutflow: string;
  }>;
  createdAt: string;
}

export function ScenarioPlanningPage() {
  const { activeOrg, isAuditor } = useAuth();
  const activeOrgId = activeOrg?.id;

  const [params, setParams] = useState<SimulationParameters>({
    revenueDeltaPercent: '-15',
    expenseDeltaPercent: '10',
    receivablesDelayDays: '30',
    payablesAccelerateDays: '0',
    scenarioName: 'Q4 Revenue Shock & Supply Inflation',
  });

  const [availableForecasts, setAvailableForecasts] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [selectedForecastId, setSelectedForecastId] = useState<string>('');
  const [pastScenarios, setPastScenarios] = useState<ScenarioSimulationRecord[]>([]);
  const [activeSimulation, setActiveSimulation] = useState<ScenarioSimulationRecord | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(() => Boolean(activeOrgId));
  const [error, setError] = useState<string | null>(null);

  const currency = activeOrg?.baseCurrency || 'USD';

  useEffect(() => {
    if (!activeOrgId) return;
    let isMounted = true;
    queueMicrotask(() => {
      if (isMounted) setIsInitializing(true);
    });

    Promise.allSettled([
      apiGet<Array<{ id: string; name: string }>>(`/v1/organizations/${activeOrgId}/forecasts`),
      apiGet<ScenarioSimulationRecord[]>(`/v1/organizations/${activeOrgId}/scenarios`),
    ])
      .then(([forecastsRes, scenariosRes]) => {
        if (!isMounted) return;

        if (forecastsRes.status === 'fulfilled') {
          const raw = forecastsRes.value;
          const forecastList = Array.isArray(raw) ? raw : [];
          setAvailableForecasts(forecastList);
          if (forecastList.length > 0) {
            setSelectedForecastId(forecastList[0].id);
          }
        }

        if (scenariosRes.status === 'fulfilled') {
          const rawScenarios = scenariosRes.value;
          const scenarioList = Array.isArray(rawScenarios) ? rawScenarios : [];
          setPastScenarios(scenarioList);
          if (scenarioList.length > 0) {
            setActiveSimulation(scenarioList[0]);
          }
        }
      })
      .finally(() => {
        if (isMounted) setIsInitializing(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId]);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || isAuditor) return;

    setIsLoading(true);
    setError(null);

    let baselineId = selectedForecastId;
    if (!baselineId) {
      try {
        const gen = await apiPost<{ id: string }>(`/v1/organizations/${activeOrgId}/forecasts`, {
          horizonDays: 30,
        });
        baselineId = gen.id;
        setSelectedForecastId(gen.id);
      } catch (err: unknown) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to create baseline forecast for simulation.');
        }
        setIsLoading(false);
        return;
      }
    }

    try {
      const payload = {
        baselineForecastId: baselineId,
        name: params.scenarioName.trim() || 'Custom What-If Scenario',
        customerPaymentDelayDays: parseInt(params.receivablesDelayDays, 10) || 0,
        salesGrowthPct: (parseFloat(params.revenueDeltaPercent) || 0).toFixed(4),
        operatingCostChangePct: (parseFloat(params.expenseDeltaPercent) || 0).toFixed(4),
        supplierPaymentTimingDays: parseInt(params.payablesAccelerateDays, 10) || 0,
      };

      const res = await apiPost<ScenarioSimulationRecord>(
        `/v1/organizations/${activeOrgId}/scenarios`,
        payload,
      );

      setActiveSimulation(res);
      setPastScenarios((prev) => [res, ...prev.filter((p) => p.id !== res.id)]);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to execute financial simulation model.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPreset = (preset: 'DOWNTURN' | 'EXPANSION' | 'STAGFLATION') => {
    switch (preset) {
      case 'DOWNTURN':
        setParams({
          scenarioName: 'Severe Market Downturn (-25% Revenue)',
          revenueDeltaPercent: '-25',
          expenseDeltaPercent: '5',
          receivablesDelayDays: '45',
          payablesAccelerateDays: '15',
        });
        break;
      case 'EXPANSION':
        setParams({
          scenarioName: 'Rapid Growth Expansion (+30% Revenue)',
          revenueDeltaPercent: '30',
          expenseDeltaPercent: '15',
          receivablesDelayDays: '-10',
          payablesAccelerateDays: '0',
        });
        break;
      case 'STAGFLATION':
        setParams({
          scenarioName: 'Stagflationary Margin Squeeze',
          revenueDeltaPercent: '-5',
          expenseDeltaPercent: '20',
          receivablesDelayDays: '30',
          payablesAccelerateDays: '10',
        });
        break;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <Calculator className="w-6 h-6 text-[var(--accent-teal)]" />
            <span>Scenario Planning &amp; What-If Simulation</span>
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Test how revenue changes, expense spikes, or payment delays affect future cash.
          </p>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">Presets:</span>
          <button
            type="button"
            onClick={() => handleApplyPreset('DOWNTURN')}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
          >
            Severe Downturn
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('STAGFLATION')}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
          >
            Stagflation
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('EXPANSION')}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
          >
            Rapid Growth
          </button>
        </div>
      </div>

      {/* No Active Organization Warning */}
      {!activeOrgId && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <span className="font-semibold block mb-0.5">No Active Organization Selected</span>
            <span className="leading-relaxed opacity-90">
              Please select or create an organization from the workspace switcher to load baseline forecasts and execute what-if simulations.
            </span>
          </div>
        </div>
      )}

      {/* Simulation Form & Controls */}
      <form
        onSubmit={handleSimulate}
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-xs space-y-4"
      >
        <div className="border-b border-[var(--border-subtle)] pb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Simulation Parameters &amp; Stress Variables
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Adjust revenue, cost inflation, and collection timing to stress-test liquidity runway
            </p>
          </div>
          {availableForecasts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--text-muted)]">Baseline:</span>
              <select
                aria-label="Baseline Cash Flow Forecast"
                value={selectedForecastId}
                onChange={(e) => setSelectedForecastId(e.target.value)}
                className="text-xs px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)]"
              >
                {availableForecasts.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name || `Forecast ${f.id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input
            id="scenarioName"
            label="Scenario Name"
            type="text"
            value={params.scenarioName}
            onChange={(e) => setParams((p) => ({ ...p, scenarioName: e.target.value }))}
            required
          />

          <Input
            id="revenueDelta"
            label="Sales Shift (%)"
            type="number"
            step="1"
            value={params.revenueDeltaPercent}
            onChange={(e) => setParams((p) => ({ ...p, revenueDeltaPercent: e.target.value }))}
            helperText="e.g. -20% sales drop"
            required
          />

          <Input
            id="expenseDelta"
            label="Operating Cost Shift (%)"
            type="number"
            step="1"
            value={params.expenseDeltaPercent}
            onChange={(e) => setParams((p) => ({ ...p, expenseDeltaPercent: e.target.value }))}
            helperText="e.g. +10% COGS/payroll increase"
            required
          />

          <Input
            id="receivablesDelay"
            label="AR Collection Delay (Days)"
            type="number"
            step="5"
            value={params.receivablesDelayDays}
            onChange={(e) => setParams((p) => ({ ...p, receivablesDelayDays: e.target.value }))}
            helperText="e.g. Clients pay 30 days later"
            required
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button
            variant="primary"
            type="submit"
            isLoading={isLoading || isInitializing}
            disabled={isAuditor || !activeOrgId}
            className="flex items-center gap-1.5"
            title={!activeOrgId ? 'Please select an organization first' : isAuditor ? 'Auditors cannot run simulations' : undefined}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run What-If Simulation</span>
          </Button>
        </div>
      </form>

      {/* Simulation Results Display */}
      {activeSimulation && activeSimulation.impactSummary && (
        <div className="space-y-6">
          {/* Liquidity Alert if Breached */}
          {activeSimulation.triggersLiquidityWarning && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-800 dark:text-rose-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div className="space-y-1">
                <p className="font-bold text-sm text-rose-950 dark:text-rose-200">
                  Liquidity Safety Buffer Breached in Simulation
                </p>
                <p className="leading-relaxed opacity-90">
                  Under this stress scenario, projected cash balance drops below the minimum
                  operating buffer to{' '}
                  <span className="font-mono font-bold">
                    {formatCurrency(
                      parseFloat(activeSimulation.impactSummary.scenarioMinCash),
                      currency,
                    )}
                  </span>{' '}
                  (Variance:{' '}
                  <span className="font-mono font-bold">
                    {formatCurrency(
                      parseFloat(activeSimulation.impactSummary.netCashImpact),
                      currency,
                    )}
                  </span>
                  ).
                </p>
              </div>
            </div>
          )}

          {/* Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Projected Ending Cash */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-xs space-y-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)]">
                Projected Ending Cash
              </span>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[11px] text-[var(--text-muted)]">Baseline</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
                    {formatCurrency(
                      parseFloat(activeSimulation.impactSummary.baselineClosingCash),
                      currency,
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                <div className="text-right">
                  <div className="text-[11px] text-[var(--text-muted)]">Simulated</div>
                  <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(
                      parseFloat(activeSimulation.impactSummary.scenarioClosingCash),
                      currency,
                    )}
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)]">Net Cash Impact:</span>
                <span
                  className={`font-mono font-bold ${
                    parseFloat(activeSimulation.impactSummary.netCashImpact) < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatCurrency(
                    parseFloat(activeSimulation.impactSummary.netCashImpact),
                    currency,
                  )}
                </span>
              </div>
            </div>

            {/* Minimum Projected Cash */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-xs space-y-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)]">
                Minimum Cash Reserve
              </span>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[11px] text-[var(--text-muted)]">Baseline Low</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
                    {formatCurrency(
                      parseFloat(activeSimulation.impactSummary.baselineMinCash),
                      currency,
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                <div className="text-right">
                  <div className="text-[11px] text-[var(--text-muted)]">Simulated Low</div>
                  <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
                    {formatCurrency(
                      parseFloat(activeSimulation.impactSummary.scenarioMinCash),
                      currency,
                    )}
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)]">Buffer Delta:</span>
                <span className="font-mono font-bold text-[var(--text-primary)]">
                  {formatCurrency(
                    parseFloat(activeSimulation.impactSummary.minCashDelta),
                    currency,
                  )}
                </span>
              </div>
            </div>

            {/* Assumptions Breakdown */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-xs space-y-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)]">
                Scenario Configuration
              </span>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Sales Adjustment:</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {parseFloat(activeSimulation.impactSummary.salesGrowthPct) > 0 ? '+' : ''}
                    {parseFloat(activeSimulation.impactSummary.salesGrowthPct)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Cost Inflation:</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {parseFloat(activeSimulation.impactSummary.operatingCostChangePct) > 0
                      ? '+'
                      : ''}
                    {parseFloat(activeSimulation.impactSummary.operatingCostChangePct)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">AR Collection Delay:</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    +{activeSimulation.impactSummary.customerPaymentDelayDays} days
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                Non-destructive deterministic simulation
              </div>
            </div>
          </div>

          {/* Daily Comparisons Table */}
          {activeSimulation.dailyComparisons && activeSimulation.dailyComparisons.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
              <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Daily Projection Matrix: Baseline vs. Simulated
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Step-by-step liquidity shifts across the forecast window
                  </p>
                </div>
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  {activeSimulation.dailyComparisons.length} days projected
                </span>
              </div>

              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[var(--surface-elevated)]/60 text-[10px] uppercase font-semibold text-[var(--text-muted)] border-b border-[var(--border-subtle)] sticky top-0">
                    <tr>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4 text-right">Baseline Balance</th>
                      <th className="py-2.5 px-4 text-right">Simulated Balance</th>
                      <th className="py-2.5 px-4 text-right">Net Delta</th>
                      <th className="py-2.5 px-4 text-right">Inflow</th>
                      <th className="py-2.5 px-4 text-right">Outflow</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                    {activeSimulation.dailyComparisons.slice(0, 15).map((row, idx) => (
                      <tr key={idx} className="hover:bg-[var(--surface-elevated)]/30">
                        <td className="py-2 px-4 font-mono text-[11px] text-[var(--text-primary)]">
                          {formatDate(row.projectionDate)}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-[var(--text-secondary)]">
                          {formatCurrency(parseFloat(row.baselineCumulativeBalance), currency)}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-[var(--text-primary)]">
                          {formatCurrency(parseFloat(row.scenarioCumulativeBalance), currency)}
                        </td>
                        <td
                          className={`py-2 px-4 text-right font-mono font-bold ${
                            parseFloat(row.balanceDelta) < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {formatCurrency(parseFloat(row.balanceDelta), currency)}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-emerald-600">
                          +{formatCurrency(parseFloat(row.scenarioInflow), currency)}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-rose-600">
                          -{formatCurrency(parseFloat(row.scenarioOutflow), currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historical Scenarios Table */}
      {pastScenarios.length > 0 && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[var(--accent-teal)]" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Scenario Simulation History
              </h3>
            </div>
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {pastScenarios.length} saved models
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--surface-elevated)]/60 text-[10px] uppercase font-semibold text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="py-2.5 px-4">Scenario Name</th>
                  <th className="py-2.5 px-4">Created</th>
                  <th className="py-2.5 px-4 text-right">Sales Shock</th>
                  <th className="py-2.5 px-4 text-right">Cost Shift</th>
                  <th className="py-2.5 px-4 text-right">Net Impact</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                  <th className="py-2.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                {pastScenarios.map((sc) => (
                  <tr key={sc.id} className="hover:bg-[var(--surface-elevated)]/30">
                    <td className="py-2.5 px-4 font-semibold text-[var(--text-primary)]">
                      {sc.name}
                    </td>
                    <td className="py-2.5 px-4 text-[var(--text-muted)]">
                      {formatDate(sc.createdAt)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[var(--text-secondary)]">
                      {parseFloat(sc.salesGrowthPct) > 0 ? '+' : ''}
                      {parseFloat(sc.salesGrowthPct)}%
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[var(--text-secondary)]">
                      {parseFloat(sc.operatingCostChangePct) > 0 ? '+' : ''}
                      {parseFloat(sc.operatingCostChangePct)}%
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono font-bold ${
                        sc.impactSummary && parseFloat(sc.impactSummary.netCashImpact) < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {sc.impactSummary
                        ? formatCurrency(parseFloat(sc.impactSummary.netCashImpact), currency)
                        : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {sc.triggersLiquidityWarning ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400">
                          <TrendingDown className="w-3 h-3" />
                          <span>Breached</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <TrendingUp className="w-3 h-3" />
                          <span>Safe</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setActiveSimulation(sc)}
                        className="text-xs font-semibold text-[var(--accent-teal)] hover:underline cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
