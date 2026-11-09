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

      // Shift invoice inflows by customerPaymentDelayDays; if pushed beyond horizon, falls out of horizon window!
      const targetInflowIdx = i + customerDelayDays;
      if (targetInflowIdx >= 0 && targetInflowIdx < n) {
        const scaledInflow = DecimalMath.mul(item.expectedInflow, salesMultiplier);
        shiftedInvoiceInflows[targetInflowIdx] = DecimalMath.add(
          shiftedInvoiceInflows[targetInflowIdx],
          scaledInflow,
        );
      }

      // Shift supplier bill outflows by supplierPaymentTimingDays
      const targetOutflowIdx = i + supplierShiftDays;
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

    const impactSummary = {
      customerPaymentDelayDays: customerDelayDays,
      salesGrowthPct: DecimalMath.toFixed4(salesGrowthPct),
      operatingCostChangePct: DecimalMath.toFixed4(costChangePct),
      supplierPaymentTimingDays: supplierShiftDays,
      baselineClosingCash: DecimalMath.toFixed4(baseline.projectedClosingCash),
      scenarioClosingCash: DecimalMath.toFixed4(scenarioBalance),
      netCashImpact: DecimalMath.toFixed4(netCashImpact),
      baselineMinimumCash: DecimalMath.toFixed4(baseline.minimumProjectedCash),
      scenarioMinimumCash: DecimalMath.toFixed4(scenarioMinCash),
      minimumCashDelta: DecimalMath.toFixed4(minCashDelta),
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
      include: { results: true },
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
      include: { results: true },
      orderBy: { createdAt: 'desc' },
    });
    return scenarios.map((s) => this.serializeScenario(s));
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
    return {
      ...scenario,
      salesGrowthPct: DecimalMath.toFixed4(scenario.salesGrowthPct),
      operatingCostChangePct: DecimalMath.toFixed4(scenario.operatingCostChangePct),
      createdAt: scenario.createdAt.toISOString(),
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
