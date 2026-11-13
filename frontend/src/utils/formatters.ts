/**
 * Formats an ISO-8601 timestamp string into a concise, human-readable UTC/local string.
 */
export function formatTimestamp(isoString: string | null): string {
  if (!isoString) {
    return 'Not yet checked';
  }
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return isoString;
  }
  return parsed.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

/**
 * Formats a numeric value with thousands separators, omitting unnecessary
 * trailing decimals on whole amounts and showing up to 2 decimals when fractional.
 */
export function formatNumber(
  value: string | number | null | undefined,
  maxFractionDigits = 2,
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const num = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, ''));
  if (Number.isNaN(num)) {
    return String(value);
  }

  const factor = 10 ** maxFractionDigits;
  const rounded = Math.round((num + Number.EPSILON) * factor) / factor;
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  const isWhole = Math.abs(safe - Math.trunc(safe)) < 1e-9;
  const minDigits = isWhole ? 0 : Math.min(2, maxFractionDigits);
  const maxDigits = isWhole ? 0 : maxFractionDigits;

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  }).format(safe);
}

/**
 * Formats a financial amount with currency symbol and clean decimal formatting.
 * When fractionDigits is omitted, whole amounts omit decimals and fractional
 * amounts display 2 decimal places.
 */
export function formatCurrency(
  amount: string | number | null | undefined,
  currency = 'USD',
  fractionDigits?: number,
): string {
  if (amount === null || amount === undefined || amount === '') {
    return '—';
  }

  const num = typeof amount === 'number' ? amount : Number.parseFloat(String(amount).replace(/,/g, ''));
  if (Number.isNaN(num)) {
    return String(amount);
  }

  let digits: number;
  let valueToFormat = num;

  if (fractionDigits === undefined) {
    const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
    valueToFormat = Object.is(rounded, -0) ? 0 : rounded;
    digits = Math.abs(valueToFormat - Math.trunc(valueToFormat)) < 1e-9 ? 0 : 2;
  } else {
    digits = fractionDigits;
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(valueToFormat);
  } catch {
    const formattedNum = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(valueToFormat);
    return `${currency} ${formattedNum}`;
  }
}

/**
 * Formats a monetary value with an explicit '+' prefix for strictly positive numbers.
 */
export function formatSignedCurrency(
  amount: string | number | null | undefined,
  currency = 'USD',
  fractionDigits?: number,
): string {
  if (amount === null || amount === undefined || amount === '') {
    return '—';
  }
  const num = typeof amount === 'number' ? amount : Number.parseFloat(String(amount).replace(/,/g, ''));
  if (Number.isNaN(num)) {
    return String(amount);
  }
  const formatted = formatCurrency(num, currency, fractionDigits);
  return num > 0 ? `+${formatted}` : formatted;
}

/**
 * Normalizes raw decimal amounts embedded in AI summaries, alerts, and report prose
 * (e.g. `2615400.0000` -> `2,615,400`, `1250.5000` -> `1,250.50`, `PKR 250,000.00` -> `PKR 250,000`).
 */
export function formatEmbeddedAmountsInText(text: string): string {
  if (!text) return text;
  return text.replace(
    /(?<![\d.,-])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2,4})(?![\d.])/g,
    (_match, intPart: string, fracPart: string) => {
      const parsed = Number.parseFloat(`${intPart.replace(/,/g, '')}.${fracPart}`);
      if (Number.isNaN(parsed)) {
        return _match;
      }
      return formatNumber(parsed, 2);
    },
  );
}

/**
 * Resolves consolidated reporting currency strictly using Organization.baseCurrency as the source of truth.
 */
export function resolveReportingCurrency(
  orgBaseCurrency?: string | null,
  fallbackCurrency?: string | null,
): string {
  return (orgBaseCurrency || fallbackCurrency || 'USD').trim().toUpperCase();
}

/**
 * Formats a percentage value with +/- sign if requested.
 */
export function formatPercentage(
  value: string | number | null | undefined,
  includeSign = false,
  fractionDigits = 1,
): string {
  if (value === null || value === undefined) {
    return '—';
  }

  const num = typeof value === 'number' ? value : Number.parseFloat(value);
  if (Number.isNaN(num)) {
    return String(value);
  }

  const formatted = num.toFixed(fractionDigits);
  if (includeSign && num > 0) {
    return `+${formatted}%`;
  }
  return `${formatted}%`;
}

/**
 * Formats a short calendar date (e.g. Nov 10, 2026).
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) {
    return '—';
  }
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) {
    return String(date);
  }
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats customer and supplier names into clean Title Case (e.g. "sara" -> "Sara")
 * while preserving mixed-case brand names (e.g. "NorthStar").
 */
export function toTitleCasePartyName(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, ' ');
  if (!collapsed || /^['=+\-@]/.test(collapsed)) {
    return collapsed;
  }
  return collapsed
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) => {
          if (!part) return part;
          if (part === part.toLowerCase() || part === part.toUpperCase()) {
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
          }
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join('-'),
    )
    .join(' ');
}
