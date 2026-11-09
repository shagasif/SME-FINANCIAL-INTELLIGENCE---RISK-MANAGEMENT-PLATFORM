import { Prisma } from '../../generated/prisma/client.js';

export type DecimalInput = Prisma.Decimal | string | number | null | undefined;

/**
 * Decimal-Safe Financial Arithmetic Utility
 *
 * Wraps Prisma.Decimal (Decimal.js) to ensure all authoritative financial
 * calculations operate with fixed-precision decimal math and never use
 * IEEE-754 binary floating-point arithmetic.
 */
export class DecimalMath {
  static readonly ZERO = new Prisma.Decimal('0.0000');
  static readonly ONE = new Prisma.Decimal('1.0000');
  static readonly HUNDRED = new Prisma.Decimal('100.0000');

  static of(value: DecimalInput): Prisma.Decimal {
    if (value === null || value === undefined || value === '') {
      return DecimalMath.ZERO;
    }
    if (value instanceof Prisma.Decimal) {
      return value;
    }
    return new Prisma.Decimal(String(value));
  }

  static add(a: DecimalInput, b: DecimalInput): Prisma.Decimal {
    return DecimalMath.of(a).plus(DecimalMath.of(b)).toDecimalPlaces(4);
  }

  static sub(a: DecimalInput, b: DecimalInput): Prisma.Decimal {
    return DecimalMath.of(a).minus(DecimalMath.of(b)).toDecimalPlaces(4);
  }

  static mul(a: DecimalInput, b: DecimalInput): Prisma.Decimal {
    return DecimalMath.of(a).mul(DecimalMath.of(b)).toDecimalPlaces(4);
  }

  /**
   * Divides numerator by denominator safely. Returns null when denominator is zero.
   */
  static divSafe(
    numerator: DecimalInput,
    denominator: DecimalInput,
    scale = 4,
  ): Prisma.Decimal | null {
    const den = DecimalMath.of(denominator);
    if (den.isZero()) {
      return null;
    }
    return DecimalMath.of(numerator).div(den).toDecimalPlaces(scale);
  }

  /**
   * Computes (part / whole) * 100. Returns null when whole is zero.
   */
  static percentage(part: DecimalInput, whole: DecimalInput): Prisma.Decimal | null {
    const ratio = DecimalMath.divSafe(part, whole, 8);
    if (ratio === null) {
      return null;
    }
    return ratio.mul(DecimalMath.HUNDRED).toDecimalPlaces(4);
  }

  /**
   * Computes ((current - previous) / |previous|) * 100. Returns null when previous is zero.
   */
  static growthRatePct(current: DecimalInput, previous: DecimalInput): Prisma.Decimal | null {
    const prev = DecimalMath.of(previous);
    if (prev.isZero()) {
      return null;
    }
    const diff = DecimalMath.sub(current, prev);
    return diff.div(prev.abs()).mul(DecimalMath.HUNDRED).toDecimalPlaces(4);
  }

  static sum(values: DecimalInput[]): Prisma.Decimal {
    return values
      .reduce<Prisma.Decimal>((acc, val) => acc.plus(DecimalMath.of(val)), DecimalMath.ZERO)
      .toDecimalPlaces(4);
  }

  static min(values: DecimalInput[]): Prisma.Decimal {
    if (values.length === 0) return DecimalMath.ZERO;
    return Prisma.Decimal.min(...values.map((v) => DecimalMath.of(v))).toDecimalPlaces(4);
  }

  static max(values: DecimalInput[]): Prisma.Decimal {
    if (values.length === 0) return DecimalMath.ZERO;
    return Prisma.Decimal.max(...values.map((v) => DecimalMath.of(v))).toDecimalPlaces(4);
  }

  static mean(values: DecimalInput[]): Prisma.Decimal {
    if (values.length === 0) return DecimalMath.ZERO;
    return DecimalMath.sum(values).div(values.length).toDecimalPlaces(4);
  }

  /**
   * Population standard deviation computed using Decimal arithmetic.
   */
  static stdDev(values: DecimalInput[]): Prisma.Decimal {
    if (values.length <= 1) return DecimalMath.ZERO;
    const avg = DecimalMath.mean(values);
    const squaredDiffSum = values.reduce<Prisma.Decimal>((acc, val) => {
      const diff = DecimalMath.of(val).minus(avg);
      return acc.plus(diff.mul(diff));
    }, DecimalMath.ZERO);
    return squaredDiffSum.div(values.length).sqrt().toDecimalPlaces(4);
  }

  static toFixed4(value: DecimalInput): string {
    return DecimalMath.of(value).toFixed(4);
  }

  static toFixed2(value: DecimalInput): string {
    return DecimalMath.of(value).toFixed(2);
  }
}
