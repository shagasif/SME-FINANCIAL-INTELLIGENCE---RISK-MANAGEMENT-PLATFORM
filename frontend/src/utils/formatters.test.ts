import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatEmbeddedAmountsInText,
  formatNumber,
  formatSignedCurrency,
} from './formatters';

describe('formatters', () => {
  describe('formatNumber', () => {
    it('formats whole numbers with thousands separators and no trailing decimals', () => {
      expect(formatNumber('2615400.0000')).toBe('2,615,400');
      expect(formatNumber('597100.0000')).toBe('597,100');
      expect(formatNumber('0.0000')).toBe('0');
      expect(formatNumber('1250.0000')).toBe('1,250');
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(-0)).toBe('0');
    });

    it('formats fractional numbers with up to 2 decimal places', () => {
      expect(formatNumber('1250.5000')).toBe('1,250.50');
      expect(formatNumber('1250.25')).toBe('1,250.25');
      expect(formatNumber(-42.5)).toBe('-42.50');
    });

    it('returns em-dash for null, undefined, or empty string', () => {
      expect(formatNumber(null)).toBe('—');
      expect(formatNumber(undefined)).toBe('—');
      expect(formatNumber('')).toBe('—');
    });
  });

  describe('formatCurrency', () => {
    it('omits unnecessary decimals on whole amounts and preserves currency', () => {
      expect(formatCurrency('2615400.0000', 'PKR')).toBe('PKR\u00a02,615,400');
      expect(formatCurrency('597100.0000', 'USD')).toBe('$597,100');
      expect(formatCurrency('0.0000', 'USD')).toBe('$0');
      expect(formatCurrency('1250.0000', 'USD')).toBe('$1,250');
    });

    it('shows 2 decimals when meaningful fractional values are present', () => {
      expect(formatCurrency('1250.5000', 'USD')).toBe('$1,250.50');
      expect(formatCurrency('1250.5000', 'PKR')).toBe('PKR\u00a01,250.50');
    });

    it('honors explicit fractionDigits when provided', () => {
      expect(formatCurrency('1250', 'USD', 2)).toBe('$1,250.00');
    });
  });

  describe('formatSignedCurrency', () => {
    it('prefixes strictly positive amounts with + and omits .00 on whole numbers', () => {
      expect(formatSignedCurrency('1500.0000', 'USD')).toBe('+$1,500');
      expect(formatSignedCurrency('1500.5000', 'USD')).toBe('+$1,500.50');
      expect(formatSignedCurrency('-500.0000', 'USD')).toBe('-$500');
      expect(formatSignedCurrency('0.0000', 'USD')).toBe('$0');
    });
  });

  describe('formatEmbeddedAmountsInText', () => {
    it('formats raw decimal numbers in AI summaries and report prose without touching dates or IDs', () => {
      expect(
        formatEmbeddedAmountsInText(
          'Cash balance is PKR 2615400.0000 with overdue AR 0.0000 and fee 1250.5000 on 2026-11-12 (v1.0.0).',
        ),
      ).toBe('Cash balance is PKR 2,615,400 with overdue AR 0 and fee 1,250.50 on 2026-11-12 (v1.0.0).');

      expect(formatEmbeddedAmountsInText('Total: PKR 250,000.00')).toBe('Total: PKR 250,000');
    });
  });
});
