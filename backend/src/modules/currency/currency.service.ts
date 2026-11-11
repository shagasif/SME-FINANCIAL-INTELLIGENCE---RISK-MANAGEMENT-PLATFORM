import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DecimalInput, DecimalMath } from '../../common/utils/decimal-math.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

export interface ExchangeRateRow {
  id: string;
  organizationId: string | null;
  fromCurrency: string;
  toCurrency: string;
  rate: Prisma.Decimal;
  effectiveDate: Date;
  source: string;
  isActive: boolean;
}

export interface AppliedExchangeRateInfo {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  effectiveDate: string;
  source: string;
  isInverse: boolean;
}

export interface ConvertedAmountResult {
  originalAmount: Prisma.Decimal;
  originalCurrency: string;
  convertedAmount: Prisma.Decimal | null;
  targetCurrency: string;
  isConverted: boolean;
  rateInfo: AppliedExchangeRateInfo | null;
  missingCurrency: string | null;
}

export interface BatchConversionSummary {
  targetCurrency: string;
  totalConverted: Prisma.Decimal | null;
  partialConvertedSum: Prisma.Decimal;
  isComplete: boolean;
  missingCurrencies: string[];
  convertedCount: number;
  unconvertedCount: number;
  appliedRates: AppliedExchangeRateInfo[];
  itemResults: ConvertedAmountResult[];
}

/**
 * Centralized Multi-Currency Conversion Service
 *
 * Enforces Organization.baseCurrency as the single reporting currency of truth,
 * performs deterministic Decimal-safe date-effective FX conversion, and strictly
 * marks calculations as incomplete when an exchange rate is unavailable.
 */
@Injectable()
export class CurrencyConversionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private endOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
    );
  }

  async getOrganizationBaseCurrency(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return this.normalizeCode(org.baseCurrency || 'USD');
  }

  async loadRatesForOrganization(organizationId: string): Promise<ExchangeRateRow[]> {
    return this.prisma.exchangeRate.findMany({
      where: {
        isActive: true,
        OR: [{ organizationId }, { organizationId: null }],
      },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findEffectiveRateFromPreloaded(params: {
    rates: ExchangeRateRow[];
    organizationId: string;
    fromCurrency: string;
    toCurrency: string;
    asOfDate: Date;
  }): {
    multiplier: Prisma.Decimal;
    divisor: Prisma.Decimal | null;
    info: AppliedExchangeRateInfo;
  } | null {
    const from = this.normalizeCode(params.fromCurrency);
    const to = this.normalizeCode(params.toCurrency);

    if (from === to) {
      return {
        multiplier: DecimalMath.ONE,
        divisor: null,
        info: {
          fromCurrency: from,
          toCurrency: to,
          rate: '1.00000000',
          effectiveDate: params.asOfDate.toISOString().slice(0, 10),
          source: 'IDENTITY',
          isInverse: false,
        },
      };
    }

    const cutoff = this.endOfUtcDay(params.asOfDate);

    // Filter eligible candidates on or before transaction date, prioritizing org-specific overrides
    const pickBest = (candidates: ExchangeRateRow[]): ExchangeRateRow | null => {
      const eligible = candidates.filter((r) => r.effectiveDate.getTime() <= cutoff.getTime());
      if (eligible.length === 0) return null;

      eligible.sort((a, b) => {
        const orgPriorityA = a.organizationId === params.organizationId ? 0 : 1;
        const orgPriorityB = b.organizationId === params.organizationId ? 0 : 1;
        if (orgPriorityA !== orgPriorityB) return orgPriorityA - orgPriorityB;
        return b.effectiveDate.getTime() - a.effectiveDate.getTime();
      });

      return eligible[0];
    };

    const direct = pickBest(
      params.rates.filter((r) => r.fromCurrency === from && r.toCurrency === to),
    );
    if (direct) {
      return {
        multiplier: direct.rate,
        divisor: null,
        info: {
          fromCurrency: from,
          toCurrency: to,
          rate: direct.rate.toFixed(8),
          effectiveDate: direct.effectiveDate.toISOString().slice(0, 10),
          source: direct.source,
          isInverse: false,
        },
      };
    }

    const inverse = pickBest(
      params.rates.filter((r) => r.fromCurrency === to && r.toCurrency === from),
    );
    if (inverse && !inverse.rate.isZero()) {
      const effectiveMultiplier = new Prisma.Decimal(1).div(inverse.rate).toDecimalPlaces(12);
      return {
        multiplier: effectiveMultiplier,
        divisor: inverse.rate,
        info: {
          fromCurrency: from,
          toCurrency: to,
          rate: effectiveMultiplier.toFixed(8),
          effectiveDate: inverse.effectiveDate.toISOString().slice(0, 10),
          source: `${inverse.source} (inverse ${to}/${from}=${inverse.rate.toFixed(4)})`,
          isInverse: true,
        },
      };
    }

    return null;
  }

  convertAmountSync(params: {
    rates: ExchangeRateRow[];
    organizationId: string;
    amount: DecimalInput;
    fromCurrency: string;
    toCurrency: string;
    asOfDate: Date;
  }): ConvertedAmountResult {
    const origAmt = DecimalMath.of(params.amount);
    const from = this.normalizeCode(params.fromCurrency);
    const to = this.normalizeCode(params.toCurrency);

    if (from === to) {
      return {
        originalAmount: origAmt,
        originalCurrency: from,
        convertedAmount: origAmt.toDecimalPlaces(4),
        targetCurrency: to,
        isConverted: true,
        rateInfo: {
          fromCurrency: from,
          toCurrency: to,
          rate: '1.00000000',
          effectiveDate: params.asOfDate.toISOString().slice(0, 10),
          source: 'IDENTITY',
          isInverse: false,
        },
        missingCurrency: null,
      };
    }

    const rateMatch = this.findEffectiveRateFromPreloaded({
      rates: params.rates,
      organizationId: params.organizationId,
      fromCurrency: from,
      toCurrency: to,
      asOfDate: params.asOfDate,
    });

    if (!rateMatch) {
      return {
        originalAmount: origAmt,
        originalCurrency: from,
        convertedAmount: null,
        targetCurrency: to,
        isConverted: false,
        rateInfo: null,
        missingCurrency: from,
      };
    }

    // Use exact division when inverse rate is stored to avoid premature rounding drift
    const converted = rateMatch.divisor
      ? origAmt.div(rateMatch.divisor).toDecimalPlaces(4)
      : origAmt.mul(rateMatch.multiplier).toDecimalPlaces(4);

    return {
      originalAmount: origAmt,
      originalCurrency: from,
      convertedAmount: converted,
      targetCurrency: to,
      isConverted: true,
      rateInfo: rateMatch.info,
      missingCurrency: null,
    };
  }

  async convertBatch(params: {
    organizationId: string;
    targetCurrency: string;
    items: Array<{ amount: DecimalInput; currency: string; date: Date }>;
    preloadedRates?: ExchangeRateRow[];
  }): Promise<BatchConversionSummary> {
    const target = this.normalizeCode(params.targetCurrency);
    const rates =
      params.preloadedRates ?? (await this.loadRatesForOrganization(params.organizationId));

    const itemResults: ConvertedAmountResult[] = [];
    const missingSet = new Set<string>();
    const appliedRateMap = new Map<string, AppliedExchangeRateInfo>();

    let partialConvertedSum = DecimalMath.ZERO;
    let convertedCount = 0;
    let unconvertedCount = 0;

    for (const item of params.items) {
      const res = this.convertAmountSync({
        rates,
        organizationId: params.organizationId,
        amount: item.amount,
        fromCurrency: item.currency,
        toCurrency: target,
        asOfDate: item.date,
      });
      itemResults.push(res);

      if (res.isConverted && res.convertedAmount !== null) {
        partialConvertedSum = DecimalMath.add(partialConvertedSum, res.convertedAmount);
        convertedCount += 1;
        if (res.rateInfo && res.rateInfo.source !== 'IDENTITY') {
          const rateKey = `${res.rateInfo.fromCurrency}->${res.rateInfo.toCurrency}@${res.rateInfo.effectiveDate}`;
          if (!appliedRateMap.has(rateKey)) {
            appliedRateMap.set(rateKey, res.rateInfo);
          }
        }
      } else {
        unconvertedCount += 1;
        if (res.missingCurrency) {
          missingSet.add(res.missingCurrency);
        }
      }
    }

    const missingCurrencies = Array.from(missingSet).sort();
    const isComplete = missingCurrencies.length === 0;

    return {
      targetCurrency: target,
      totalConverted: isComplete ? partialConvertedSum : null,
      partialConvertedSum,
      isComplete,
      missingCurrencies,
      convertedCount,
      unconvertedCount,
      appliedRates: Array.from(appliedRateMap.values()),
      itemResults,
    };
  }

  async listExchangeRates(organizationId: string) {
    const [baseCurrency, rates] = await Promise.all([
      this.getOrganizationBaseCurrency(organizationId),
      this.loadRatesForOrganization(organizationId),
    ]);

    return {
      organizationId,
      baseCurrency,
      rates: rates.map((r) => ({
        id: r.id,
        scope: r.organizationId ? 'ORGANIZATION' : 'PLATFORM_REFERENCE',
        fromCurrency: r.fromCurrency,
        toCurrency: r.toCurrency,
        rate: r.rate.toFixed(8),
        effectiveDate: r.effectiveDate.toISOString(),
        source: r.source,
      })),
    };
  }

  async upsertOrganizationRate(
    organizationId: string,
    dto: {
      fromCurrency: string;
      toCurrency: string;
      rate: string;
      effectiveDate: string;
      source?: string;
    },
    actorUserId: string,
  ) {
    const fromCurrency = this.normalizeCode(dto.fromCurrency);
    const toCurrency = this.normalizeCode(dto.toCurrency);
    if (fromCurrency === toCurrency) {
      throw new BadRequestException('fromCurrency and toCurrency must differ');
    }

    const rateDec = DecimalMath.of(dto.rate);
    if (rateDec.lte(DecimalMath.ZERO)) {
      throw new BadRequestException('Exchange rate must be strictly greater than zero');
    }

    const effectiveDate = new Date(dto.effectiveDate);
    if (Number.isNaN(effectiveDate.getTime())) {
      throw new BadRequestException('Invalid effectiveDate');
    }

    const existing = await this.prisma.exchangeRate.findFirst({
      where: {
        organizationId,
        fromCurrency,
        toCurrency,
        effectiveDate,
      },
    });

    const record = existing
      ? await this.prisma.exchangeRate.update({
          where: { id: existing.id },
          data: {
            rate: rateDec,
            source: dto.source?.trim() || 'ORGANIZATION_MANUAL',
            isActive: true,
          },
        })
      : await this.prisma.exchangeRate.create({
          data: {
            organizationId,
            fromCurrency,
            toCurrency,
            rate: rateDec,
            effectiveDate,
            source: dto.source?.trim() || 'ORGANIZATION_MANUAL',
            isActive: true,
          },
        });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'EXCHANGE_RATE_UPSERTED',
      resourceType: 'EXCHANGE_RATE',
      resourceId: record.id,
      details: {
        fromCurrency,
        toCurrency,
        rate: rateDec.toFixed(8),
        effectiveDate: effectiveDate.toISOString(),
        source: record.source,
      },
    });

    return {
      id: record.id,
      fromCurrency: record.fromCurrency,
      toCurrency: record.toCurrency,
      rate: record.rate.toFixed(8),
      effectiveDate: record.effectiveDate.toISOString(),
      source: record.source,
    };
  }
}
