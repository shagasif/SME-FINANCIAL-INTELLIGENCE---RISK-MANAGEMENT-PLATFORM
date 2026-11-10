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
 * Formats a financial amount with currency symbol and decimal formatting.
 */
export function formatCurrency(
  amount: string | number | null | undefined,
  currency = 'USD',
  fractionDigits = 2,
): string {
  if (amount === null || amount === undefined) {
    return '—';
  }

  const num = typeof amount === 'number' ? amount : Number.parseFloat(amount);
  if (Number.isNaN(num)) {
    return String(amount);
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(fractionDigits)}`;
  }
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
