import { describe, expect, it } from 'vitest';
import {
  formatAgentType,
  formatCurrency,
  formatEmbeddedAmountsInText,
  formatNumber,
  formatReportCurrency,
  formatReportText,
  formatRiskSeverity,
  formatRiskStatus,
  formatRiskType,
  formatSignedCurrency,
  formatTaskStatus,
  formatUserFacingText,
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

  describe('report formatting', () => {
    it('uses currency codes, grouping, and two decimals without changing other currencies', () => {
      expect(formatReportCurrency('55000', 'PKR')).toBe('PKR 55,000.00');
      expect(formatReportCurrency('1250.5', 'USD')).toBe('USD 1,250.50');
    });

    it('formats currency prose and translates technical report language', () => {
      expect(
        formatReportText(
          'Spend was PKR 250,000.00; stdDev=1.2000, z-score=2.1, and categoryBaselineMean=1250.0000. AI-synthesized.',
          'PKR',
        ),
      ).toBe(
        'Spend was PKR 250,000.00; spending variation, unusual activity indicator, and average spending for this category: PKR 1,250.00.',
      );
    });

    it('humanizes common database-derived names and technical expense terms', () => {
      expect(
        formatReportText('categoryBaselineMean=1250; outlierExpenseDetected; invoiceIds', 'PKR'),
      ).toBe(
        'average spending for this category: PKR 1,250.00; The expense was unusually high; invoice references',
      );
    });

    it('normalizes abbreviated currency amounts without losing the currency code', () => {
      expect(formatReportText('Cash reserves are $385k.', 'USD')).toBe(
        'Cash reserves are USD 385,000.00.',
      );
    });

    it('does not mistake ordinary words ending in "id" for identifier suffixes', () => {
      expect(formatReportText('Liquid cash reserves are $1,248,500.', 'USD')).toBe(
        'Liquid cash reserves are USD 1,248,500.00.',
      );
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
      ).toBe(
        'Cash balance is PKR 2,615,400 with overdue AR 0 and fee 1,250.50 on 2026-11-12 (v1.0.0).',
      );

      expect(formatEmbeddedAmountsInText('Total: PKR 250,000.00')).toBe('Total: PKR 250,000');
    });
  });

  describe('business-friendly enum formatters', () => {
    it('formats raw technical risk type codes to clean English labels', () => {
      expect(formatRiskType('DUPLICATE_CANDIDATE')).toBe('Possible Duplicate Charge');
      expect(formatRiskType('OVERDUE_RECEIVABLE')).toBe('Overdue Customer Invoice');
      expect(formatRiskType('CASH_SHORTFALL')).toBe('Low Cash Warning');
      expect(formatRiskType('BUDGET_OVERRUN')).toBe('Budget Overrun');
      expect(formatRiskType('CATEGORY_SHIFT')).toBe('Spending Spike');
    });

    it('formats risk severity and status to clean English labels', () => {
      expect(formatRiskSeverity('CRITICAL')).toBe('Critical');
      expect(formatRiskSeverity('HIGH')).toBe('High');
      expect(formatRiskStatus('ACKNOWLEDGED')).toBe('Acknowledged');
      expect(formatRiskStatus('INVESTIGATING')).toBe('Under Review');
      expect(formatRiskStatus('DISMISSED')).toBe('Dismissed');
    });

    it('formats agent types and task statuses', () => {
      expect(formatAgentType('SUPERVISOR_ORCHESTRATOR')).toBe('Financial Supervisor');
      expect(formatAgentType('TRANSACTION_INTELLIGENCE')).toBe('Transaction Reviewer');
      expect(formatAgentType('FORENSIC_AUDIT')).toBe('Audit Specialist');
      expect(formatTaskStatus('OPEN')).toBe('To Do');
      expect(formatTaskStatus('CANCELLED')).toBe('Dismissed');
    });

    it('replaces embedded technical codes and jargon with formatUserFacingText', () => {
      expect(
        formatUserFacingText('Detected DUPLICATE_CANDIDATE for vendor. HITL required.'),
      ).toBe('Detected Possible Duplicate Charge for vendor. Human Approval required.');
      expect(
        formatUserFacingText('Workflow waiting at HUMAN_REVIEW_WAITING from SUPERVISOR_ORCHESTRATOR.'),
      ).toBe('Workflow waiting at Awaiting Human Approval from Financial Supervisor.');
    });
  });
});
