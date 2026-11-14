import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateScenarioSimulationDto } from './dto/scenario.dto.js';

@Injectable()
export class ScenarioPlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Executes a non-destructive scenario simulation against a baseline forecast.
   * Strictly isolated: never mutates FinancialAccount, FinancialTransaction, Invoice, Bill, or Budget tables.
   */
  async runScenarioSimulation(
    organizationId: string,
    dto: CreateScenarioSimulationDto,
    actorUserId: string,
  ) {
    const baseline = await this.prisma.cashFlowForecast.findFirst({
      where: { id: dto.baselineForecastId, organizationId },
      include: { items: { orderBy: { projectionDate: 'asc' } } },
    });
    if (!baseline) {
      throw new NotFoundException('Baseline cash-flow forecast not found in organization');
    }

    const customerDelayDays = dto.customerPaymentDelayDays ?? 0;
    const supplierShiftDays = dto.supplierPaymentTimingDays ?? 0;
    const salesGrowthPct = DecimalMath.of(dto.salesGrowthPct ?? '0.0000');
    const costChangePct = DecimalMath.of(dto.operatingCostChangePct ?? '0.0000');

    const salesMultiplier = DecimalMath.add(
      DecimalMath.ONE,
      DecimalMath.divSafe(salesGrowthPct, DecimalMath.HUNDRED) ?? DecimalMath.ZERO,
    );
    const costMultiplier = DecimalMath.add(
      DecimalMath.ONE,
      DecimalMath.divSafe(costChangePct, DecimalMath.HUNDRED) ?? DecimalMath.ZERO,
    );

    const n = baseline.items.length;
    const shiftedInvoiceInflows: Prisma.Decimal[] = Array.from(
      { length: n },
      () => DecimalMath.ZERO,
    );
    const shiftedBillOutflows: Prisma.Decimal[] = Array.from({ length: n }, () => DecimalMath.ZERO);

    for (let i = 0; i < n; i += 1) {
      const item = baseline.items[i];

      // Shift invoice inflows by customerPaymentDelayDays;
      // If customer pays earlier than day 0, cash arrives on day 0 (start of forecast horizon).
      // If shifted beyond horizon, it falls outside the forecast window.
      const rawTargetInflowIdx = i + customerDelayDays;
      const targetInflowIdx = customerDelayDays < 0 ? Math.max(0, rawTargetInflowIdx) : rawTargetInflowIdx;
      if (targetInflowIdx >= 0 && targetInflowIdx < n) {
        const scaledInflow = DecimalMath.mul(item.expectedInflow, salesMultiplier);
        shiftedInvoiceInflows[targetInflowIdx] = DecimalMath.add(
          shiftedInvoiceInflows[targetInflowIdx],
          scaledInflow,
        );
      }

      // Shift supplier bill outflows by supplierPaymentTimingDays;
      // If bills are accelerated before day 0, they are settled on day 0.
      // If shifted beyond horizon, they fall outside the forecast window.
      const rawTargetOutflowIdx = i + supplierShiftDays;
      const targetOutflowIdx = supplierShiftDays < 0 ? Math.max(0, rawTargetOutflowIdx) : rawTargetOutflowIdx;
      if (targetOutflowIdx >= 0 && targetOutflowIdx < n) {
        const scaledOutflow = DecimalMath.mul(item.expectedOutflow, costMultiplier);
        shiftedBillOutflows[targetOutflowIdx] = DecimalMath.add(
          shiftedBillOutflows[targetOutflowIdx],
          scaledOutflow,
        );
      }
    }

    let scenarioBalance = baseline.openingCashBalance;
    let scenarioMinCash = scenarioBalance;
    const safetyBuffer = DecimalMath.of('5000.0000');
    let triggersLiquidityWarning = scenarioBalance.lt(safetyBuffer);

    const dailyComparisons = baseline.items.map((baseItem, idx) => {
      const recInflow = DecimalMath.mul(baseItem.recurringInflow, salesMultiplier);
      const recOutflow = DecimalMath.mul(baseItem.recurringOutflow, costMultiplier);

      const dayInflow = DecimalMath.add(shiftedInvoiceInflows[idx], recInflow);
      const dayOutflow = DecimalMath.add(shiftedBillOutflows[idx], recOutflow);
      const dayNet = DecimalMath.sub(dayInflow, dayOutflow);

      scenarioBalance = DecimalMath.add(scenarioBalance, dayNet);
      if (scenarioBalance.lt(scenarioMinCash)) {
        scenarioMinCash = scenarioBalance;
      }
      if (scenarioBalance.lt(safetyBuffer) || scenarioBalance.lt(DecimalMath.ZERO)) {
        triggersLiquidityWarning = true;
      }

      return {
        projectionDate: baseItem.projectionDate.toISOString(),
        baselineCumulativeBalance: DecimalMath.toFixed4(baseItem.cumulativeBalance),
        scenarioCumulativeBalance: DecimalMath.toFixed4(scenarioBalance),
        balanceDelta: DecimalMath.toFixed4(
          DecimalMath.sub(scenarioBalance, baseItem.cumulativeBalance),
        ),
        scenarioInflow: DecimalMath.toFixed4(dayInflow),
        scenarioOutflow: DecimalMath.toFixed4(dayOutflow),
      };
    });

    const netCashImpact = DecimalMath.sub(scenarioBalance, baseline.projectedClosingCash);
    const minCashDelta = DecimalMath.sub(scenarioMinCash, baseline.minimumProjectedCash);

    const baselineClosingCash = DecimalMath.toFixed4(baseline.projectedClosingCash);
    const scenarioClosingCash = DecimalMath.toFixed4(scenarioBalance);
    const netCashImpactStr = DecimalMath.toFixed4(netCashImpact);
    const baselineMinCashStr = DecimalMath.toFixed4(baseline.minimumProjectedCash);
    const scenarioMinCashStr = DecimalMath.toFixed4(scenarioMinCash);
    const minCashDeltaStr = DecimalMath.toFixed4(minCashDelta);

    const impactSummary = {
      customerPaymentDelayDays: customerDelayDays,
      salesGrowthPct: DecimalMath.toFixed4(salesGrowthPct),
      operatingCostChangePct: DecimalMath.toFixed4(costChangePct),
      supplierPaymentTimingDays: supplierShiftDays,
      baselineClosingCash,
      scenarioClosingCash,
      netCashImpact: netCashImpactStr,
      baselineMinCash: baselineMinCashStr,
      baselineMinimumCash: baselineMinCashStr,
      scenarioMinCash: scenarioMinCashStr,
      scenarioMinimumCash: scenarioMinCashStr,
      minCashDelta: minCashDeltaStr,
      minimumCashDelta: minCashDeltaStr,
      triggersLiquidityWarning,
      isolationGuarantee:
        'Scenario simulation executed in read-only isolation; zero authoritative financial records were modified.',
    };

    const created = await this.prisma.scenario.create({
      data: {
        organizationId,
        baselineForecastId: baseline.id,
        name: dto.name.trim(),
        description: dto.description ?? null,
        customerPaymentDelayDays: customerDelayDays,
        salesGrowthPct,
        operatingCostChangePct: costChangePct,
        supplierPaymentTimingDays: supplierShiftDays,
        createdByUserId: actorUserId,
        results: {
          create: {
            baselineClosingCash: baseline.projectedClosingCash,
            scenarioClosingCash: scenarioBalance,
            netCashImpact,
            baselineMinimumCash: baseline.minimumProjectedCash,
            scenarioMinimumCash: scenarioMinCash,
            triggersLiquidityWarning,
            dailyComparisons: dailyComparisons as unknown as Prisma.InputJsonValue,
            impactSummary: impactSummary as unknown as Prisma.InputJsonValue,
          },
        },
      },
      include: { results: { orderBy: { createdAt: 'desc' } } },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'SCENARIO_SIMULATION_EXECUTED',
      resourceType: 'SCENARIO',
      resourceId: created.id,
      details: {
        baselineForecastId: baseline.id,
        netCashImpact: DecimalMath.toFixed4(netCashImpact),
        triggersLiquidityWarning,
      },
    });

    return this.serializeScenario(created);
  }

  async listScenarios(organizationId: string) {
    const scenarios = await this.prisma.scenario.findMany({
      where: { organizationId },
      include: { results: { orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return scenarios.map((s) => this.serializeScenario(s));
  }

  async getScenarioById(organizationId: string, scenarioId: string) {
    const scenario = await this.prisma.scenario.findFirst({
      where: { id: scenarioId, organizationId },
      include: { results: { orderBy: { createdAt: 'desc' } } },
    });
    if (!scenario) {
      throw new NotFoundException('Scenario simulation not found in organization');
    }
    return this.serializeScenario(scenario);
  }

  private generateRiskAssessment(params: {
    triggersLiquidityWarning: boolean;
    netCashImpact: string;
    scenarioMinCash: string;
    customerPaymentDelayDays: number;
    salesGrowthPct: string;
    operatingCostChangePct: string;
  }) {
    const netImpactNum = parseFloat(params.netCashImpact) || 0;
    const minCashNum = parseFloat(params.scenarioMinCash) || 0;

    let level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    let summary: string;

    if (minCashNum < 0) {
      level = 'CRITICAL';
      summary =
        'Critical Liquidity Deficit: Projected cash balance drops below zero into negative territory. Immediate working capital intervention or credit facility required.';
    } else if (params.triggersLiquidityWarning) {
      level = 'HIGH';
      summary =
        'High Liquidity Risk: Projected cash buffer breaches the $5,000 minimum operating threshold. Cash cushion is severely compressed under this stress model.';
    } else if (netImpactNum < 0) {
      level = 'MEDIUM';
      summary =
        'Moderate Operational Strain: Scenario experiences negative net cash flow, but reserves remain above minimum safety buffer thresholds.';
    } else {
      level = 'LOW';
      summary =
        'Low Risk (Safe): Cash reserves remain comfortably above safety thresholds across the projection horizon. The business model absorbs the tested variances.';
    }

    const vulnerabilities: string[] = [];
    if (parseFloat(params.salesGrowthPct) < 0) {
      vulnerabilities.push(`Sales revenue contraction of ${params.salesGrowthPct}%`);
    }
    if (parseFloat(params.operatingCostChangePct) > 0) {
      vulnerabilities.push(`Operating cost inflation surge of +${params.operatingCostChangePct}%`);
    }
    if (params.customerPaymentDelayDays > 0) {
      vulnerabilities.push(`Receivables collection delay of +${params.customerPaymentDelayDays} days`);
    }
    if (vulnerabilities.length === 0) {
      vulnerabilities.push('No severe stress factors identified; healthy baseline operations');
    }

    return {
      level,
      summary,
      vulnerabilities,
    };
  }

  private generateRecommendations(params: {
    triggersLiquidityWarning: boolean;
    netCashImpact: string;
    customerPaymentDelayDays: number;
    salesGrowthPct: string;
    operatingCostChangePct: string;
    supplierPaymentTimingDays: number;
  }) {
    const recommendations: Array<{
      category: 'RECEIVABLES' | 'COST_CONTROL' | 'LIQUIDITY_BUFFER' | 'PRICING';
      action: string;
      rationale: string;
      impact: 'HIGH' | 'MEDIUM' | 'LOW';
    }> = [];

    if (params.customerPaymentDelayDays > 0) {
      recommendations.push({
        category: 'RECEIVABLES',
        action: 'Enforce dynamic payment incentives (e.g. 2/10 net 30) or automated AR dunning',
        rationale: `Counteracts the modeled +${params.customerPaymentDelayDays}-day collection delay by motivating earlier cash settlements.`,
        impact: 'HIGH',
      });
    }

    if (parseFloat(params.operatingCostChangePct) > 0) {
      recommendations.push({
        category: 'COST_CONTROL',
        action: 'Institute discretionary expense freeze and renegotiate supplier credit terms',
        rationale: `Mitigates +${params.operatingCostChangePct}% cost expansion by deferring non-essential capital expenditures.`,
        impact: 'HIGH',
      });
    }

    if (parseFloat(params.salesGrowthPct) < 0) {
      recommendations.push({
        category: 'PRICING',
        action: 'Protect contribution margins via selective price adjustments or customer tiering',
        rationale: `Defends cash gross margins against the simulated ${params.salesGrowthPct}% demand downturn.`,
        impact: 'MEDIUM',
      });
    }

    if (params.triggersLiquidityWarning) {
      recommendations.push({
        category: 'LIQUIDITY_BUFFER',
        action: 'Secure revolving credit facility or standby invoice discounting line',
        rationale:
          'Provides an emergency liquidity backstop to prevent operating balance from breaching reserve covenants.',
        impact: 'HIGH',
      });
    } else {
      recommendations.push({
        category: 'LIQUIDITY_BUFFER',
        action: 'Maintain existing working capital cadence and monitor actuals against baseline',
        rationale: 'Surplus reserves provide adequate cushion; continue weekly variance tracking.',
        impact: 'LOW',
      });
    }

    return recommendations;
  }

  serializeScenario(scenario: {
    id: string;
    organizationId: string;
    baselineForecastId: string;
    name: string;
    description: string | null;
    customerPaymentDelayDays: number;
    salesGrowthPct: Prisma.Decimal;
    operatingCostChangePct: Prisma.Decimal;
    supplierPaymentTimingDays: number;
    createdAt: Date;
    results?: Array<{
      id: string;
      baselineClosingCash: Prisma.Decimal;
      scenarioClosingCash: Prisma.Decimal;
      netCashImpact: Prisma.Decimal;
      baselineMinimumCash: Prisma.Decimal;
      scenarioMinimumCash: Prisma.Decimal;
      triggersLiquidityWarning: boolean;
      dailyComparisons: unknown;
      impactSummary: unknown;
      createdAt: Date;
    }>;
  }) {
    const latestResult = scenario.results?.[0];
    const rawImpact = (latestResult?.impactSummary as Record<string, unknown>) ?? {};

    const baselineClosingCash = latestResult
      ? DecimalMath.toFixed4(latestResult.baselineClosingCash)
      : '0.0000';
    const scenarioClosingCash = latestResult
      ? DecimalMath.toFixed4(latestResult.scenarioClosingCash)
      : '0.0000';
    const netCashImpact = latestResult
      ? DecimalMath.toFixed4(latestResult.netCashImpact)
      : '0.0000';
    const baselineMinCash = latestResult
      ? DecimalMath.toFixed4(latestResult.baselineMinimumCash)
      : '0.0000';
    const scenarioMinCash = latestResult
      ? DecimalMath.toFixed4(latestResult.scenarioMinimumCash)
      : '0.0000';
    const minCashDelta = latestResult
      ? DecimalMath.toFixed4(
          DecimalMath.sub(latestResult.scenarioMinimumCash, latestResult.baselineMinimumCash),
        )
      : '0.0000';
    const triggersLiquidityWarning = latestResult?.triggersLiquidityWarning ?? false;

    const riskAssessment = this.generateRiskAssessment({
      triggersLiquidityWarning,
      netCashImpact,
      scenarioMinCash,
      customerPaymentDelayDays: scenario.customerPaymentDelayDays,
      salesGrowthPct: DecimalMath.toFixed4(scenario.salesGrowthPct),
      operatingCostChangePct: DecimalMath.toFixed4(scenario.operatingCostChangePct),
    });

    const recommendations = this.generateRecommendations({
      triggersLiquidityWarning,
      netCashImpact,
      customerPaymentDelayDays: scenario.customerPaymentDelayDays,
      salesGrowthPct: DecimalMath.toFixed4(scenario.salesGrowthPct),
      operatingCostChangePct: DecimalMath.toFixed4(scenario.operatingCostChangePct),
      supplierPaymentTimingDays: scenario.supplierPaymentTimingDays,
    });

    const impactSummary = latestResult
      ? {
          customerPaymentDelayDays: scenario.customerPaymentDelayDays,
          salesGrowthPct: DecimalMath.toFixed4(scenario.salesGrowthPct),
          operatingCostChangePct: DecimalMath.toFixed4(scenario.operatingCostChangePct),
          supplierPaymentTimingDays: scenario.supplierPaymentTimingDays,
          baselineClosingCash,
          scenarioClosingCash,
          netCashImpact,
          baselineMinimumCash: baselineMinCash,
          scenarioMinimumCash: scenarioMinCash,
          minimumCashDelta: minCashDelta,
          triggersLiquidityWarning,
          isolationGuarantee:
            'Scenario simulation executed in read-only isolation; zero authoritative financial records were modified.',
          ...rawImpact,
          baselineMinCash: (rawImpact['baselineMinCash'] as string) || baselineMinCash,
          scenarioMinCash: (rawImpact['scenarioMinCash'] as string) || scenarioMinCash,
          minCashDelta: (rawImpact['minCashDelta'] as string) || minCashDelta,
        }
      : null;

    const dailyComparisons = (latestResult?.dailyComparisons as unknown[]) ?? [];

    return {
      ...scenario,
      salesGrowthPct: DecimalMath.toFixed4(scenario.salesGrowthPct),
      operatingCostChangePct: DecimalMath.toFixed4(scenario.operatingCostChangePct),
      createdAt: scenario.createdAt.toISOString(),
      triggersLiquidityWarning,
      impactSummary,
      dailyComparisons,
      riskAssessment,
      recommendations,
      results: scenario.results?.map((r) => ({
        ...r,
        baselineClosingCash: DecimalMath.toFixed4(r.baselineClosingCash),
        scenarioClosingCash: DecimalMath.toFixed4(r.scenarioClosingCash),
        netCashImpact: DecimalMath.toFixed4(r.netCashImpact),
        baselineMinimumCash: DecimalMath.toFixed4(r.baselineMinimumCash),
        scenarioMinimumCash: DecimalMath.toFixed4(r.scenarioMinimumCash),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
