import { NotFoundException } from '@nestjs/common';
import { ScenarioPlanningService } from './scenario-planning.service.js';
import { Prisma } from '../../generated/prisma/client.js';

describe('ScenarioPlanningService', () => {
  let service: ScenarioPlanningService;
  let findFirstCalls: Array<{ where: unknown; include: unknown }> = [];
  let findManyCalls: Array<{ where: unknown; include: unknown }> = [];

  const sampleScenarioDb = {
    id: 'sc-123',
    organizationId: 'org-test-1',
    baselineForecastId: 'fc-test-1',
    name: 'Severe Market Shock',
    description: 'Testing downturn',
    customerPaymentDelayDays: 30,
    salesGrowthPct: new Prisma.Decimal('-20.0000'),
    operatingCostChangePct: new Prisma.Decimal('10.0000'),
    supplierPaymentTimingDays: 0,
    createdAt: new Date('2026-11-01T12:00:00Z'),
    results: [
      {
        id: 'res-123',
        baselineClosingCash: new Prisma.Decimal('50000.0000'),
        scenarioClosingCash: new Prisma.Decimal('38000.0000'),
        netCashImpact: new Prisma.Decimal('-12000.0000'),
        baselineMinimumCash: new Prisma.Decimal('30000.0000'),
        scenarioMinimumCash: new Prisma.Decimal('18000.0000'),
        triggersLiquidityWarning: false,
        dailyComparisons: [
          {
            projectionDate: '2026-11-02T00:00:00.000Z',
            baselineCumulativeBalance: '50000.0000',
            scenarioCumulativeBalance: '48000.0000',
            balanceDelta: '-2000.0000',
            scenarioInflow: '1000.0000',
            scenarioOutflow: '3000.0000',
          },
        ],
        impactSummary: {
          customerPaymentDelayDays: 30,
          salesGrowthPct: '-20.0000',
          operatingCostChangePct: '10.0000',
          supplierPaymentTimingDays: 0,
          baselineClosingCash: '50000.0000',
          scenarioClosingCash: '38000.0000',
          netCashImpact: '-12000.0000',
          baselineMinCash: '30000.0000',
          scenarioMinCash: '18000.0000',
          minCashDelta: '-12000.0000',
          triggersLiquidityWarning: false,
        },
        createdAt: new Date('2026-11-01T12:00:00Z'),
      },
    ],
  };

  beforeEach(() => {
    findFirstCalls = [];
    findManyCalls = [];

    const prismaStub = {
      scenario: {
        findFirst: async (args: { where: unknown; include: unknown }) => {
          findFirstCalls.push(args);
          const where = args.where as { id: string };
          if (where.id === 'sc-123') return sampleScenarioDb;
          return null;
        },
        findMany: async (args: { where: unknown; include: unknown }) => {
          findManyCalls.push(args);
          return [sampleScenarioDb];
        },
      },
      cashFlowForecast: {
        findFirst: async () => null,
      },
    };

    const auditStub = {
      record: async () => undefined,
    };

    service = new ScenarioPlanningService(prismaStub as never, auditStub as never);
  });

  describe('runScenarioSimulation payment shifts', () => {
    type ScenarioCreateArgs = {
      data: {
        results: {
          create: {
            scenarioClosingCash: Prisma.Decimal;
            netCashImpact: Prisma.Decimal;
            scenarioMinimumCash: Prisma.Decimal;
            dailyComparisons: Prisma.InputJsonValue;
            impactSummary: Prisma.InputJsonValue;
          };
        };
      };
    };

    const createSimulationFixture = () => {
      const baseline = {
        id: 'fc-test-1',
        openingCashBalance: new Prisma.Decimal('1000.0000'),
        projectedClosingCash: new Prisma.Decimal('1555.0000'),
        minimumProjectedCash: new Prisma.Decimal('1000.0000'),
        items: [
          {
            projectionDate: new Date('2026-11-02T00:00:00.000Z'),
            expectedInflow: new Prisma.Decimal('100.0000'),
            expectedOutflow: new Prisma.Decimal('10.0000'),
            recurringInflow: new Prisma.Decimal('10.0000'),
            recurringOutflow: new Prisma.Decimal('5.0000'),
            cumulativeBalance: new Prisma.Decimal('1095.0000'),
          },
          {
            projectionDate: new Date('2026-11-03T00:00:00.000Z'),
            expectedInflow: new Prisma.Decimal('200.0000'),
            expectedOutflow: new Prisma.Decimal('20.0000'),
            recurringInflow: new Prisma.Decimal('10.0000'),
            recurringOutflow: new Prisma.Decimal('5.0000'),
            cumulativeBalance: new Prisma.Decimal('1280.0000'),
          },
          {
            projectionDate: new Date('2026-11-04T00:00:00.000Z'),
            expectedInflow: new Prisma.Decimal('300.0000'),
            expectedOutflow: new Prisma.Decimal('30.0000'),
            recurringInflow: new Prisma.Decimal('10.0000'),
            recurringOutflow: new Prisma.Decimal('5.0000'),
            cumulativeBalance: new Prisma.Decimal('1555.0000'),
          },
        ],
      };
      let createArgs: ScenarioCreateArgs | undefined;

      const prismaStub = {
        cashFlowForecast: {
          findFirst: async () => baseline,
        },
        scenario: {
          create: async (args: ScenarioCreateArgs) => {
            createArgs = args;
            return sampleScenarioDb;
          },
        },
      };
      const auditStub = { record: async () => undefined };

      return {
        service: new ScenarioPlanningService(prismaStub as never, auditStub as never),
        getCreateArgs: () => createArgs,
      };
    };

    it('clamps negative customer-payment shifts to day zero without changing forecast totals', async () => {
      const fixture = createSimulationFixture();
      await fixture.service.runScenarioSimulation(
        'org-test-1',
        {
          baselineForecastId: 'fc-test-1',
          name: 'Negative customer payment shift',
          customerPaymentDelayDays: -1,
          salesGrowthPct: '0.0000',
          operatingCostChangePct: '0.0000',
          supplierPaymentTimingDays: 0,
        },
        'user-test-1',
      );

      const result = fixture.getCreateArgs()?.data.results.create;
      expect(result).toBeDefined();
      expect(result?.dailyComparisons).toEqual([
        {
          projectionDate: '2026-11-02T00:00:00.000Z',
          baselineCumulativeBalance: '1095.0000',
          scenarioCumulativeBalance: '1295.0000',
          balanceDelta: '200.0000',
          scenarioInflow: '310.0000',
          scenarioOutflow: '15.0000',
        },
        {
          projectionDate: '2026-11-03T00:00:00.000Z',
          baselineCumulativeBalance: '1280.0000',
          scenarioCumulativeBalance: '1580.0000',
          balanceDelta: '300.0000',
          scenarioInflow: '310.0000',
          scenarioOutflow: '25.0000',
        },
        {
          projectionDate: '2026-11-04T00:00:00.000Z',
          baselineCumulativeBalance: '1555.0000',
          scenarioCumulativeBalance: '1555.0000',
          balanceDelta: '0.0000',
          scenarioInflow: '10.0000',
          scenarioOutflow: '35.0000',
        },
      ]);
      expect(result?.scenarioClosingCash).toEqual(new Prisma.Decimal('1555.0000'));
      expect(result?.netCashImpact).toEqual(new Prisma.Decimal('0.0000'));
      expect(result?.scenarioMinimumCash).toEqual(new Prisma.Decimal('1000.0000'));
    });

    it('clamps negative supplier-payment shifts to day zero without changing forecast totals', async () => {
      const fixture = createSimulationFixture();
      await fixture.service.runScenarioSimulation(
        'org-test-1',
        {
          baselineForecastId: 'fc-test-1',
          name: 'Negative supplier payment shift',
          customerPaymentDelayDays: 0,
          salesGrowthPct: '0.0000',
          operatingCostChangePct: '0.0000',
          supplierPaymentTimingDays: -1,
        },
        'user-test-1',
      );

      const result = fixture.getCreateArgs()?.data.results.create;
      expect(result).toBeDefined();
      expect(result?.dailyComparisons).toEqual([
        {
          projectionDate: '2026-11-02T00:00:00.000Z',
          baselineCumulativeBalance: '1095.0000',
          scenarioCumulativeBalance: '1075.0000',
          balanceDelta: '-20.0000',
          scenarioInflow: '110.0000',
          scenarioOutflow: '35.0000',
        },
        {
          projectionDate: '2026-11-03T00:00:00.000Z',
          baselineCumulativeBalance: '1280.0000',
          scenarioCumulativeBalance: '1250.0000',
          balanceDelta: '-30.0000',
          scenarioInflow: '210.0000',
          scenarioOutflow: '35.0000',
        },
        {
          projectionDate: '2026-11-04T00:00:00.000Z',
          baselineCumulativeBalance: '1555.0000',
          scenarioCumulativeBalance: '1555.0000',
          balanceDelta: '0.0000',
          scenarioInflow: '310.0000',
          scenarioOutflow: '5.0000',
        },
      ]);
      expect(result?.scenarioClosingCash).toEqual(new Prisma.Decimal('1555.0000'));
      expect(result?.netCashImpact).toEqual(new Prisma.Decimal('0.0000'));
      expect(result?.scenarioMinimumCash).toEqual(new Prisma.Decimal('1000.0000'));
    });
  });

  describe('serializeScenario', () => {
    it('promotes impactSummary, triggersLiquidityWarning, dailyComparisons and adds riskAssessment and recommendations', () => {
      const serialized = service.serializeScenario(sampleScenarioDb);

      expect(serialized.id).toBe('sc-123');
      expect(serialized.name).toBe('Severe Market Shock');
      expect(serialized.impactSummary).toBeDefined();
      expect(serialized.impactSummary?.netCashImpact).toBe('-12000.0000');
      expect(serialized.impactSummary?.baselineMinCash).toBe('30000.0000');
      expect(serialized.impactSummary?.scenarioMinCash).toBe('18000.0000');
      expect(serialized.triggersLiquidityWarning).toBe(false);
      expect(serialized.dailyComparisons).toHaveLength(1);

      // Risk assessment
      expect(serialized.riskAssessment).toBeDefined();
      expect(serialized.riskAssessment?.level).toBe('MEDIUM');
      expect(serialized.riskAssessment?.vulnerabilities.length).toBeGreaterThanOrEqual(1);

      // Recommendations
      expect(serialized.recommendations).toBeDefined();
      expect(serialized.recommendations?.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getScenarioById', () => {
    it('returns serialized scenario when found', async () => {
      const result = await service.getScenarioById('org-test-1', 'sc-123');

      expect(findFirstCalls).toHaveLength(1);
      expect(findFirstCalls[0]).toEqual({
        where: { id: 'sc-123', organizationId: 'org-test-1' },
        include: { results: { orderBy: { createdAt: 'desc' } } },
      });
      expect(result.id).toBe('sc-123');
      expect(result.impactSummary?.netCashImpact).toBe('-12000.0000');
    });

    it('throws NotFoundException when scenario does not exist', async () => {
      await expect(service.getScenarioById('org-test-1', 'sc-missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listScenarios', () => {
    it('returns array of serialized scenarios with top-level impactSummary and riskAssessment', async () => {
      const result = await service.listScenarios('org-test-1');

      expect(findManyCalls).toHaveLength(1);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sc-123');
      expect(result[0].impactSummary?.netCashImpact).toBe('-12000.0000');
      expect(result[0].riskAssessment?.level).toBe('MEDIUM');
    });
  });
});
