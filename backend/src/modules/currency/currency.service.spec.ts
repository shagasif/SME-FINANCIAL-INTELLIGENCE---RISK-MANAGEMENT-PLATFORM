import { Prisma } from '../../generated/prisma/client.js';
import { CurrencyConversionService, ExchangeRateRow } from './currency.service.js';

describe('CurrencyConversionService', () => {
  const sampleRates: ExchangeRateRow[] = [
    {
      id: 'rate-nov',
      organizationId: null,
      fromCurrency: 'USD',
      toCurrency: 'PKR',
      rate: new Prisma.Decimal('276.62140000'),
      effectiveDate: new Date('2026-11-01T00:00:00.000Z'),
      source: 'SBP_M2M',
      isActive: true,
    },
    {
      id: 'rate-oct',
      organizationId: null,
      fromCurrency: 'USD',
      toCurrency: 'PKR',
      rate: new Prisma.Decimal('276.82000000'),
      effectiveDate: new Date('2026-10-01T00:00:00.000Z'),
      source: 'SBP_M2M',
      isActive: true,
    },
    {
      id: 'rate-aug',
      organizationId: null,
      fromCurrency: 'USD',
      toCurrency: 'PKR',
      rate: new Prisma.Decimal('277.47000000'),
      effectiveDate: new Date('2026-08-01T00:00:00.000Z'),
      source: 'SBP_M2M',
      isActive: true,
    },
  ];

  const stubPrisma = {
    organization: { findUnique: async () => ({ baseCurrency: 'USD' }) },
    exchangeRate: { findMany: async () => sampleRates },
  };
  const service = new CurrencyConversionService(stubPrisma as never, {} as never);

  it('returns identity conversion without lookup when source and target currencies match', () => {
    const res = service.convertAmountSync({
      rates: sampleRates,
      organizationId: 'org-star',
      amount: '1250.5000',
      fromCurrency: 'USD',
      toCurrency: 'USD',
      asOfDate: new Date('2026-10-15T00:00:00.000Z'),
    });

    expect(res.isConverted).toBe(true);
    expect(res.convertedAmount?.toFixed(4)).toBe('1250.5000');
    expect(res.rateInfo?.source).toBe('IDENTITY');
  });

  it('selects date-appropriate SBP rate on or before transactionDate via inverse division', () => {
    // Aug transaction uses 2026-08-01 rate (277.47)
    const augRes = service.convertAmountSync({
      rates: sampleRates,
      organizationId: 'org-star',
      amount: '185000.0000',
      fromCurrency: 'PKR',
      toCurrency: 'USD',
      asOfDate: new Date('2026-08-02T00:00:00.000Z'),
    });
    expect(augRes.isConverted).toBe(true);
    expect(augRes.rateInfo?.effectiveDate).toBe('2026-08-01');
    expect(augRes.convertedAmount?.toFixed(4)).toBe('666.7387');

    // Oct transaction uses 2026-10-01 rate (276.82)
    const octRes = service.convertAmountSync({
      rates: sampleRates,
      organizationId: 'org-star',
      amount: '275000.0000',
      fromCurrency: 'PKR',
      toCurrency: 'USD',
      asOfDate: new Date('2026-10-28T00:00:00.000Z'),
    });
    expect(octRes.isConverted).toBe(true);
    expect(octRes.rateInfo?.effectiveDate).toBe('2026-10-01');
    expect(octRes.convertedAmount?.toFixed(4)).toBe('993.4253');
  });

  it('never assumes an exchange rate and marks batch incomplete with missingCurrencies when unavailable', async () => {
    const batch = await service.convertBatch({
      organizationId: 'org-star',
      targetCurrency: 'USD',
      preloadedRates: sampleRates,
      items: [
        { amount: '27682.0000', currency: 'PKR', date: new Date('2026-10-15T00:00:00.000Z') },
        { amount: '500.0000', currency: 'EUR', date: new Date('2026-10-15T00:00:00.000Z') },
      ],
    });

    expect(batch.isComplete).toBe(false);
    expect(batch.totalConverted).toBeNull();
    expect(batch.missingCurrencies).toEqual(['EUR']);
    expect(batch.convertedCount).toBe(1);
    expect(batch.unconvertedCount).toBe(1);
  });

  it('prioritizes organization-specific override rate over platform reference rate', () => {
    const ratesWithOverride: ExchangeRateRow[] = [
      ...sampleRates,
      {
        id: 'rate-org-override',
        organizationId: 'org-star',
        fromCurrency: 'USD',
        toCurrency: 'PKR',
        rate: new Prisma.Decimal('280.00000000'),
        effectiveDate: new Date('2026-10-15T00:00:00.000Z'),
        source: 'ORG_TREASURY_CONTRACT',
        isActive: true,
      },
    ];

    const res = service.convertAmountSync({
      rates: ratesWithOverride,
      organizationId: 'org-star',
      amount: '28000.0000',
      fromCurrency: 'PKR',
      toCurrency: 'USD',
      asOfDate: new Date('2026-10-20T00:00:00.000Z'),
    });

    expect(res.isConverted).toBe(true);
    expect(res.convertedAmount?.toFixed(4)).toBe('100.0000');
    expect(res.rateInfo?.source).toMatch(/ORG_TREASURY_CONTRACT/);
  });

  it('marks historical transactions prior to the earliest authoritative rate effectiveDate as missing instead of assuming future rates', async () => {
    const batch = await service.convertBatch({
      organizationId: 'org-star',
      targetCurrency: 'USD',
      preloadedRates: sampleRates, // earliest is 2026-08-01
      items: [
        { amount: '50000.0000', currency: 'PKR', date: new Date('2026-07-15T00:00:00.000Z') },
      ],
    });

    expect(batch.isComplete).toBe(false);
    expect(batch.totalConverted).toBeNull();
    expect(batch.missingCurrencies).toEqual(['PKR']);
    expect(batch.unconvertedCount).toBe(1);
  });
});
