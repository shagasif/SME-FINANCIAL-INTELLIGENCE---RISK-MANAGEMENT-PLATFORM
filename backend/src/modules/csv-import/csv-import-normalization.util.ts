import { Prisma, TransactionType } from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';

export const INCOME_BUSINESS_TERMS: ReadonlySet<string> = new Set([
  'INCOME',
  'IN',
  'INFLOW',
  'CREDIT',
  'CR',
  'SALE',
  'SALES',
  'REVENUE',
  'EARNINGS',
  'GAIN',
  'RECEIPT',
  'RECEIPTS',
  'DEPOSIT',
  'DEPOSITS',
  'DEP',
  'INVOICE',
  'INVOICES',
  'BILLING',
  'COLLECTION',
  'COLLECTIONS',
  'PROCEEDS',
  'RETURN',
  'INTEREST',
  'DIVIDEND',
  'REFUND RECEIVED',
]);

export const EXPENSE_BUSINESS_TERMS: ReadonlySet<string> = new Set([
  'EXPENSE',
  'EXPENSES',
  'OUT',
  'OUTFLOW',
  'DEBIT',
  'DR',
  'PURCHASE',
  'PURCHASES',
  'COST',
  'COSTS',
  'SPEND',
  'SPENDING',
  'PAYMENT',
  'PAYMENTS',
  'WITHDRAWAL',
  'WITHDRAWALS',
  'WD',
  'PAYOUT',
  'PAYOUTS',
  'DISBURSEMENT',
  'DISBURSEMENTS',
  'FEE',
  'FEES',
  'CHARGE',
  'CHARGES',
  'BILL',
  'BILLS',
  'EXPENDITURE',
  'EXPENDITURES',
  'SETTLEMENT',
  'REFUND PAID',
]);

export const TRANSFER_BUSINESS_TERMS: ReadonlySet<string> = new Set([
  'TRANSFER',
  'TRANSFERS',
  'INTERNAL_TRANSFER',
  'XFER',
  'CONTRA',
  'INTERNAL',
  'INTERACCOUNT',
  'INTER_ACCOUNT',
  'ACCOUNT_TRANSFER',
]);

/**
 * Normalizes arbitrary business transaction terms (e.g. SALE, PURCHASE, DEBIT, CREDIT)
 * into canonical platform TransactionType (INCOME, EXPENSE, TRANSFER).
 * When rawType is omitted, infers type from numeric amount sign.
 */
export function normalizeBusinessTransactionType(
  rawType: unknown,
  numericAmount?: Prisma.Decimal | null,
): {
  resolvedType: TransactionType;
  unrecognized: boolean;
  unrecognizedValue?: string;
} {
  const rawStr = rawType !== null && rawType !== undefined ? String(rawType).trim() : '';
  if (rawStr) {
    const norm = rawStr.toUpperCase().replace(/[\s_-]+/g, ' ').trim();
    const normUnderscore = norm.replace(/\s+/g, '_');

    if (INCOME_BUSINESS_TERMS.has(norm) || INCOME_BUSINESS_TERMS.has(normUnderscore)) {
      return { resolvedType: TransactionType.INCOME, unrecognized: false };
    }
    if (EXPENSE_BUSINESS_TERMS.has(norm) || EXPENSE_BUSINESS_TERMS.has(normUnderscore)) {
      return { resolvedType: TransactionType.EXPENSE, unrecognized: false };
    }
    if (TRANSFER_BUSINESS_TERMS.has(norm) || TRANSFER_BUSINESS_TERMS.has(normUnderscore)) {
      return { resolvedType: TransactionType.TRANSFER, unrecognized: false };
    }

    return {
      resolvedType: TransactionType.EXPENSE,
      unrecognized: true,
      unrecognizedValue: rawStr,
    };
  }

  if (numericAmount && !numericAmount.isZero()) {
    return {
      resolvedType: numericAmount.gt(DecimalMath.ZERO)
        ? TransactionType.INCOME
        : TransactionType.EXPENSE,
      unrecognized: false,
    };
  }

  return {
    resolvedType: TransactionType.EXPENSE,
    unrecognized: false,
  };
}

export function isRecognizedTypeValue(val: string): boolean {
  if (!val || typeof val !== 'string') return false;
  const res = normalizeBusinessTransactionType(val);
  return !res.unrecognized;
}

/**
 * Flexible financial amount parser supporting:
 * - Positive & negative numeric values
 * - Accounting parentheses negative values: (9,200) -> -9200, (3,800.50) -> -3800.50, (Rs 900) -> -900
 * - Currency prefixes and abbreviations: Rs, Rs., Re, Re., PKR, PKR., USD, EUR, etc. (with or without spaces)
 * - Currency symbols: $, €, £, ¥, ₨, ₹, ₩, ¢, ₺, ₽, ₪, etc.
 * - Thousands separators: "18,500", "1,234,567.89", "Rs  1,300"
 * - Trailing negative signs: "9,200-" -> -9200
 * - Fractional amounts without leading zero: ".50" -> 0.50, "(.50)" -> -0.50
 * - Currency suffix notations: "9,200 PKR", "18,500 USD", "700 Rs"
 * Returns a signed Prisma.Decimal or null if invalid/unparseable.
 */
export function parseFlexibleAmount(raw: unknown): Prisma.Decimal | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (Number.isNaN(raw) || !Number.isFinite(raw)) return null;
    return DecimalMath.of(raw);
  }
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Must contain at least one digit
  if (!/\d/.test(trimmed)) return null;

  let s = trimmed;

  // 1. Detect accounting parentheses (outermost): e.g. "(Rs 900)", "Rs (900)", "(9,200)", "(PKR 1,020.50)"
  let isNegative = false;
  if (/^\(.*\)$/.test(s)) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  }

  // 2. Remove currency codes and symbols (prefix, suffix, or inside parens)
  // Strip 2-letter rupee abbreviations with optional abbreviation period: Rs, Rs., Re, Re.
  s = s.replace(/(^|[^a-z0-9])(rs|re)\.?(?=\d|\s|[-+(]|$)/gi, '$1 ');
  s = s.replace(/\b(rs|re)\.?\b/gi, ' ');

  // Strip 3-letter currency codes with optional abbreviation period: PKR, PKR., USD, USD., etc.
  s = s.replace(/(^|[^a-z0-9])([A-Za-z]{3})\.?(?=\d|\s|[-+(]|$)/g, '$1 ');
  s = s.replace(/\b[A-Za-z]{3}\b/g, ' ');

  // Strip currency symbols: $, €, £, ¥, ₨, ₹, ₩, ¢, etc.
  s = s.replace(/[\$\u00A3\u20AC\u00A5\u20A8\u20B9\u20AA\u20BD\u20A9\u00A2\u20BA\u20BD\u20AA]/g, ' ');

  s = s.trim();

  // 3. Check again for parentheses that might have been wrapped inside currency: e.g. "Rs (900)" -> "(900)"
  if (/^\(.*\)$/.test(s)) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  }

  // 4. Handle leading, trailing, or internal negative/positive signs
  if (s.startsWith('-')) {
    isNegative = true;
    s = s.slice(1).trim();
  } else if (s.endsWith('-')) {
    isNegative = true;
    s = s.slice(0, -1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }

  // 5. Strip thousands separators (commas) and extra whitespace
  s = s.replace(/,/g, '').replace(/\s+/g, '').trim();

  // 6. Handle fractional amounts missing leading zero (e.g. .50 -> 0.50)
  if (s.startsWith('.')) {
    s = '0' + s;
  }

  // 7. Must be strictly valid numeric format digits[.digits]
  if (!/^\d+(\.\d+)?$/.test(s)) {
    return null;
  }

  try {
    const signedStr = (isNegative ? '-' : '') + s;
    return DecimalMath.of(signedStr);
  } catch {
    return null;
  }
}

export function isRecognizedAmountValue(val: string): boolean {
  return parseFlexibleAmount(val) !== null;
}

/**
 * Robust date parser handling ISO-8601, standard date strings (YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, DD-Mon-YYYY),
 * and Excel serial date numbers (e.g. 45506). Returns null if the value cannot be parsed or falls
 * outside reasonable sanity boundaries.
 */
export function parseFlexibleDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Excel serial dates: 4 to 5 digits (e.g. 45506 represents ~Aug 2024; valid range 1000 to 90000)
  if (/^\d{4,5}(\.\d+)?$/.test(trimmed)) {
    const serial = parseFloat(trimmed);
    if (serial >= 1000 && serial <= 90000) {
      // Excel base date: Dec 30, 1899 taking into account Lotus 1900 leap bug
      const excelEpochMs = Date.UTC(1899, 11, 30);
      const dateMs = excelEpochMs + Math.round(serial * 86400 * 1000);
      const d = new Date(dateMs);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  // Standard date parsing (ISO-8601, YYYY-MM-DD, MM/DD/YYYY, 01-Oct-2026, Oct 1 2026, etc.)
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    const y = d.getUTCFullYear();
    if (y >= 1970 && y <= 2100) return d;
  }

  // Common DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY formats
  const parts = trimmed.split(/[/.-]/);
  if (parts.length === 3) {
    const [p1, p2, p3] = parts.map((p) => parseInt(p, 10));
    // YYYY-MM-DD
    if (p1 > 1000 && p2 >= 1 && p2 <= 12 && p3 >= 1 && p3 <= 31) {
      return new Date(Date.UTC(p1, p2 - 1, p3));
    }
    // DD-MM-YYYY
    if (p3 > 1000 && p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
      return new Date(Date.UTC(p3, p2 - 1, p1));
    }
  }

  return null;
}

export function isRecognizedDateValue(val: string): boolean {
  return parseFlexibleDate(val) !== null;
}
