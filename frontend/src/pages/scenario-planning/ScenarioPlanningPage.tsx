import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calculator,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { formatCurrency } from '../../utils/formatters';

interface SimulationParameters {
  revenueDeltaPercent: string;
  expenseDeltaPercent: string;
  receivablesDelayDays: string;
  payablesAccelerateDays: string;
  inflationRatePercent: string;
}

interface SimulationOutput {
  scenarioName: string;
  baseline: {
    operatingCashFlow: string;
    cashRunwayMonths: string;
    endingCashBalance: string;
    lowestProjectedBalance: string;
  };
  simulated: {
    operatingCashFlow: string;
    cashRunwayMonths: string;
    endingCashBalance: string;
    lowestProjectedBalance: string;
    runwayDeltaMonths: string;
    cashVariance: string;
  };
  sensitivityAttribution: Array<{
    factor: string;
    impactAmount: string;
    impactDirection: 'NEGATIVE' | 'POSITIVE' | 'NEUTRAL';
  }>;
  riskAssessment: {
    liquidityBreached: boolean;
    breachDate?: string | null;
    recommendedReserve: string;
  };
}

export function ScenarioPlanningPage() {
  const { activeOrg } = useAuth();
  const activeOrgId = activeOrg?.id;

  const [params, setParams] = useState<SimulationParameters>({
    revenueDeltaPercent: '-15',
    expenseDeltaPercent: '10',
    receivablesDelayDays: '30',
    payablesAccelerateDays: '0',
    inflationRatePercent: '4.5',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<SimulationOutput | null>(null);

  const currency = activeOrg?.baseCurrency || 'USD';

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await apiPost<SimulationOutput>(
        `/v1/organizations/${activeOrgId}/scenarios/simulate`,
        {
          revenueDeltaPercent: parseFloat(params.revenueDeltaPercent) || 0,
          expenseDeltaPercent: parseFloat(params.expenseDeltaPercent) || 0,
          receivablesDelayDays: parseInt(params.receivablesDelayDays, 10) || 0,
          payablesAccelerateDays: parseInt(params.payablesAccelerateDays, 10) || 0,
          inflationRatePercent: parseFloat(params.inflationRatePercent) || 0,
        },
      );
      setSimulationResult(res);
    } catch (err) {
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
          revenueDeltaPercent: '-25',
          expenseDeltaPercent: '5',
          receivablesDelayDays: '45',
          payablesAccelerateDays: '15',
          inflationRatePercent: '6.0',
        });
        break;
      case 'EXPANSION':
        setParams({
          revenueDeltaPercent: '30',
          expenseDeltaPercent: '15',
          receivablesDelayDays: '-10',
          payablesAccelerateDays: '0',
          inflationRatePercent: '3.0',
        });
        break;
      case 'STAGFLATION':
        setParams({
          revenueDeltaPercent: '-5',
          expenseDeltaPercent: '20',
          receivablesDelayDays: '30',
          payablesAccelerateDays: '10',
          inflationRatePercent: '8.5',
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
            <Calculator className="w-6 h-6 text-[var(--brand-primary)]" />
            Scenario Planning & What-If Simulation
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Simulate revenue shocks, expense spikes, working capital delays, and inflation
            sensitivity in an isolated model.
          </p>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">Presets:</span>
          <button
            type="button"
            onClick={() => handleApplyPreset('DOWNTURN')}
            className="rounded border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          >
            Severe Downturn
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('STAGFLATION')}
            className="rounded border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          >
            Stagflation
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('EXPANSION')}
            className="rounded border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          >
            Aggressive Growth
          </button>
        </div>
      </div>

      {/* Authoritative Ledger Isolation Guarantee Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-800 dark:text-emerald-300">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="space-y-1">
          <p className="font-semibold text-emerald-950 dark:text-emerald-200">
            Authoritative Ledger Sandbox Isolation
          </p>
          <p className="text-[11px] leading-relaxed opacity-90">
            All scenario models are executed strictly in ephemeral memory against deterministic
            projection matrices. Simulations NEVER write or modify the general ledger, invoices, or
            bank balances.
          </p>
        </div>
      </div>

      {/* Simulation Form & Controls */}
      <form
        onSubmit={handleSimulate}
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-xs space-y-4"
      >
        <div className="border-b border-[var(--border-subtle)] pb-2">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Simulation Parameters & Sensitivities
          </h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            Configure macro and operational stress variables to stress-test SME liquidity
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Input
            id="revenueDelta"
            label="Revenue Shock (%)"
            type="number"
            step="1"
            value={params.revenueDeltaPercent}
            onChange={(e) => setParams((p) => ({ ...p, revenueDeltaPercent: e.target.value }))}
            helperText="e.g. -20% sales drop"
            required
          />

          <Input
            id="expenseDelta"
            label="Operating Expenses (%)"
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

          <Input
            id="payablesAccelerate"
            label="AP Payment Pull (Days)"
            type="number"
            step="5"
            value={params.payablesAccelerateDays}
            onChange={(e) => setParams((p) => ({ ...p, payablesAccelerateDays: e.target.value }))}
            helperText="e.g. Vendors require immediate payment"
            required
          />

          <Input
            id="inflationRate"
            label="Inflation Rate (%)"
            type="number"
            step="0.5"
            value={params.inflationRatePercent}
            onChange={(e) => setParams((p) => ({ ...p, inflationRatePercent: e.target.value }))}
            helperText="Annualized benchmark inflation"
            required
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button
            variant="primary"
            type="submit"
            isLoading={isLoading}
            className="flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Run What-If Simulation
          </Button>
        </div>
      </form>

      {/* Simulation Results Display */}
      {simulationResult && (
        <div className="space-y-6">
          {/* Liquidity Alert if Breached */}
          {simulationResult.riskAssessment.liquidityBreached && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-800 dark:text-rose-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div className="space-y-1">
                <p className="font-bold text-sm text-rose-950 dark:text-rose-200">
                  Liquidity Safety Threshold Breached in Simulation
                </p>
                <p className="leading-relaxed opacity-90">
                  Under this stress scenario, cash reserves fall below the minimum operating buffer{' '}
                  {simulationResult.riskAssessment.breachDate && (
                    <span className="font-semibold">
                      around {simulationResult.riskAssessment.breachDate}
                    </span>
                  )}
                  . Recommended liquidity buffer enhancement:{' '}
                  <span className="font-mono font-bold">
                    {formatCurrency(
                      parseFloat(simulationResult.riskAssessment.recommendedReserve),
                      currency,
                    )}
                  </span>
                  .
                </p>
              </div>
            </div>
          )}

          {/* Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Cash Runway Comparison */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-xs space-y-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)]">
                Cash Runway Impact
              </span>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[11px] text-[var(--text-muted)]">Baseline</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
                    {simulationResult.baseline.cashRunwayMonths} mos
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                <div className="text-right">
                  <div className="text-[11px] text-[var(--text-muted)]">Simulated</div>
                  <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
                    {simulationResult.simulated.cashRunwayMonths} mos
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-secondary)]">
                Net Shift: {simulationResult.simulated.runwayDeltaMonths} months
              </div>
            </div>

            {/* Operating Cash Flow Comparison */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-xs space-y-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)]">
                Operating Cash Flow
              </span>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[11px] text-[var(--text-muted)]">Baseline</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
                    {formatCurrency(
                      parseFloat(simulationResult.baseline.operatingCashFlow),
                      currency,
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                <div className="text-right">
                  <div className="text-[11px] text-[var(--text-muted)]">Simulated</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
                    {formatCurrency(
                      parseFloat(simulationResult.simulated.operatingCashFlow),
                      currency,
                    )}
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                Variance:{' '}
                {formatCurrency(parseFloat(simulationResult.simulated.cashVariance), currency)}
              </div>
            </div>

            {/* Ending Cash Balance Comparison */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-xs space-y-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)]">
                Projected Ending Balance
              </span>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[11px] text-[var(--text-muted)]">Baseline</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
                    {formatCurrency(
                      parseFloat(simulationResult.baseline.endingCashBalance),
                      currency,
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                <div className="text-right">
                  <div className="text-[11px] text-[var(--text-muted)]">Simulated</div>
                  <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
                    {formatCurrency(
                      parseFloat(simulationResult.simulated.endingCashBalance),
                      currency,
                    )}
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                Lowest Point:{' '}
                {formatCurrency(
                  parseFloat(simulationResult.simulated.lowestProjectedBalance),
                  currency,
                )}
              </div>
            </div>
          </div>

          {/* Sensitivity Attribution Table */}
          {simulationResult.sensitivityAttribution?.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
              <div className="p-4 border-b border-[var(--border-subtle)]">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Sensitivity Decomposition by Stress Vector
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Identifies which operational and macroeconomic variables drive the largest cash
                  drain
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[var(--surface-elevated)]/60 text-[10px] uppercase font-semibold text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                    <tr>
                      <th className="py-2.5 px-4">Stress Vector</th>
                      <th className="py-2.5 px-4 text-right">Attributed Cash Impact</th>
                      <th className="py-2.5 px-4 text-center">Directional Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                    {simulationResult.sensitivityAttribution.map((item, index) => (
                      <tr key={index} className="hover:bg-[var(--surface-elevated)]/30">
                        <td className="py-2.5 px-4 font-semibold text-[var(--text-primary)]">
                          {item.factor}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-[var(--text-primary)]">
                          {formatCurrency(parseFloat(item.impactAmount), currency)}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.impactDirection === 'NEGATIVE'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : item.impactDirection === 'POSITIVE'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-slate-500/10 text-slate-500'
                            }`}
                          >
                            {item.impactDirection}
                          </span>
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
    </div>
  );
}
