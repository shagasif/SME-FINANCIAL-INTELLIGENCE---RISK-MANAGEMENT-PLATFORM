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

  const num =
    typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, ''));
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

  const num =
    typeof amount === 'number' ? amount : Number.parseFloat(String(amount).replace(/,/g, ''));
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
  const num =
    typeof amount === 'number' ? amount : Number.parseFloat(String(amount).replace(/,/g, ''));
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

export function formatReportCurrency(
  amount: string | number | null | undefined,
  currency = 'USD',
): string {
  if (amount === null || amount === undefined || amount === '') {
    return '—';
  }

  const num =
    typeof amount === 'number' ? amount : Number.parseFloat(String(amount).replace(/,/g, ''));
  if (!Number.isFinite(num)) {
    return String(amount);
  }

  const code = currency.trim().toUpperCase();
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  return `${code} ${formatted}`;
}

export function formatReportText(text: string, fallbackCurrency = 'USD'): string {
  if (!text) return text;

  const plainText = text
    .replace(
      /\bcategory[_ ]?baseline[_ ]?mean\s+std[_ ]?dev\b/gi,
      'spending pattern for this category',
    )
    .replace(
      /\bcategory[_ ]?baseline[_ ]?mean\s*[:=]\s*(-?\d[\d,]*(?:\.\d+)?)\b/gi,
      (_match, amount: string) =>
        `average spending for this category: ${formatReportCurrency(amount, fallbackCurrency)}`,
    )
    .replace(/\bcategory[_ ]?baseline[_ ]?mean\b/gi, 'average spending for this category')
    .replace(/\bcreatedAt\b/gi, 'creation date')
    .replace(/\bupdatedAt\b/gi, 'last updated')
    .replace(/\borganizationId\b/gi, 'organization reference')
    .replace(/\b([A-Za-z][A-Za-z0-9]*?)Ids\b/g, '$1 references')
    .replace(/\b([A-Za-z][A-Za-z0-9]*?)Id\b/g, '$1 reference')
    .replace(
      /\b(?:std[_ ]?dev|standard deviation)\s*[:=]\s*-?\d+(?:\.\d+)?/gi,
      'spending variation',
    )
    .replace(
      /\b(?:a\s+)?transaction\s+(?:has|shows)\s+z[-_ ]?score\s*[:=]\s*-?\d+(?:\.\d+)?/gi,
      'unusual transaction activity was identified',
    )
    .replace(/\bz[-_ ]?score\s*[:=]\s*-?\d+(?:\.\d+)?/gi, 'unusual activity indicator')
    .replace(/\boutlier\b/gi, 'unexpectedly high')
    .replace(
      /([a-z0-9])([A-Z])/g,
      (_match, lower: string, upper: string) => `${lower} ${upper.toLowerCase()}`,
    )
    .replace(/_+/g, ' ')
    .replace(/\b([a-z]+)\s+ids?\b/gi, '$1 reference')
    .replace(
      /\boutlier\s+(expense|transaction|payment|amount)\s+detected\b/gi,
      'The $1 was unusually high',
    )
    .replace(/\boutlier\b/gi, 'unexpectedly high')
    .replace(
      /\b(?:std[_ ]?dev|standard deviation)\s*[:=]\s*-?\d+(?:\.\d+)?/gi,
      'spending variation',
    )
    .replace(/\bz[-_ ]?score\s*[:=]\s*-?\d+(?:\.\d+)?/gi, 'unusual activity indicator');
  const protectedAmounts: string[] = [];
  const protectCurrency = (_match: string, code: string, amount: string, suffix?: string) => {
    const marker = `\uE000${protectedAmounts.length}\uE001`;
    protectedAmounts.push(formatAmountWithSuffix(amount, code, suffix));
    return marker;
  };
  const protectSymbol = (_match: string, symbol: string, amount: string, suffix?: string) => {
    const dollarCurrencies = new Set(['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD']);
    const code =
      symbol === '$'
        ? dollarCurrencies.has(fallbackCurrency.toUpperCase())
          ? fallbackCurrency
          : 'USD'
        : symbol === '€'
          ? 'EUR'
          : symbol === '£'
            ? 'GBP'
            : 'INR';
    const marker = `\uE000${protectedAmounts.length}\uE001`;
    protectedAmounts.push(formatAmountWithSuffix(amount, code, suffix));
    return marker;
  };
  const protectBareCurrency = (_match: string, amount: string) => {
    const marker = `\uE000${protectedAmounts.length}\uE001`;
    protectedAmounts.push(formatReportCurrency(amount, fallbackCurrency));
    return marker;
  };

  const protectedText = plainText
    .replace(/\b([A-Z]{3})\s*(-?\d[\d,]*(?:\.\d+)?)([kKmMbB])?\b/g, protectCurrency)
    .replace(/([$€£₹])\s*(-?\d[\d,]*(?:\.\d+)?)([kKmMbB])?\b/g, protectSymbol)
    .replace(
      /\b([A-Z]{3}\s+)?(-?\d[\d,]*\.\d{2,4})(?!\d|\.\d|[%x])/g,
      (match, code: string | undefined, amount: string) =>
        code ? match : protectBareCurrency(match, amount),
    );
  const formatted = formatEmbeddedAmountsInText(protectedText)
    .replace(
      /\bAI[- ](?:generated|synthesized|assisted|advisory|powered|driven|based|analysis)\b/gi,
      '',
    )
    .replace(/\bartificial intelligence\b/gi, '')
    .replace(/\bAI\b/gi, '')
    .replace(/\b(?:std[_ ]?dev|standard deviation)\b/gi, 'spending variation')
    .replace(/\bz[-_ ]?score\b/gi, 'unusual activity indicator')
    .replace(
      /\ban\s+unusual activity indicator note requires review\b/gi,
      'unusual transaction activity requires review',
    )
    .replace(/\bmean\b/gi, 'average')
    .replace(/\bmedian\b/gi, 'typical')
    .replace(/\bstatistical\b/gi, 'unusual')
    .replace(/\bAR\b/g, 'receivables')
    .replace(/\bAP\b/g, 'payables')
    .replace(/\bFX\b/g, 'foreign-exchange')
    .replace(/\s*=\s*/g, ': ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([.;])\s*\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return formatted.replace(
    /\uE000(\d+)\uE001/g,
    (_match, index: string) => protectedAmounts[Number(index)] ?? '',
  );
}

function formatAmountWithSuffix(amount: string, currency: string, suffix?: string): string {
  if (!suffix) return formatReportCurrency(amount, currency);
  const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[
    suffix.toLowerCase() as 'k' | 'm' | 'b'
  ];
  const value = Number.parseFloat(amount.replace(/,/g, ''));
  return formatReportCurrency(value * multiplier, currency);
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

export const RISK_TYPE_LABELS: Record<string, string> = {
  DUPLICATE_CANDIDATE: 'Possible Duplicate Charge',
  OVERDUE_RECEIVABLE: 'Overdue Customer Invoice',
  CASH_SHORTFALL: 'Low Cash Warning',
  BUDGET_OVERRUN: 'Budget Overrun',
  UNUSUAL_AMOUNT: 'Unusual Amount',
  UNUSUAL_FREQUENCY: 'Unusual Frequency',
  CATEGORY_SHIFT: 'Spending Spike',
  TIMING_CHANGE: 'Timing Change',
  EXPENSE_OUTLIER: 'Unusual Expense',
  REVENUE_DROP: 'Revenue Drop',
  ANOMALY: 'Unusual Activity',
};

export const RISK_SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  INFO: 'Info',
};

export const RISK_STATUS_LABELS: Record<string, string> = {
  NEW: 'New Alert',
  OPEN: 'New Alert',
  ACKNOWLEDGED: 'Acknowledged',
  INVESTIGATING: 'Under Review',
  RESOLVED: 'Resolved',
  DISMISSED: 'Dismissed',
  ESCALATED: 'Escalated',
};

export const AGENT_TYPE_LABELS: Record<string, string> = {
  SUPERVISOR_ORCHESTRATOR: 'Financial Supervisor',
  SUPERVISOR: 'Financial Supervisor',
  TRANSACTION_INTELLIGENCE: 'Transaction Reviewer',
  FINANCE_DATA_ANALYST: 'Financial Data Analyst',
  FORENSIC_AUDIT: 'Audit Specialist',
  EXPENSE_ANOMALY_DETECTION: 'Expense Auditor',
  FINANCIAL_ANALYST: 'Financial Analyst',
  FINANCIAL_RISK_ASSESSMENT: 'Risk Assessor',
  RISK_OFFICER: 'Risk Officer',
  CASH_FLOW_FORECASTING: 'Cash Flow Forecaster',
  SCENARIO_PLANNING: 'Scenario Planner',
  STRATEGIC_RECOMMENDATION: 'Strategy Advisor',
  FINANCIAL_REPORTING: 'Financial Reporter',
  VERIFIER_AI: 'Verification Specialist',
  TASK_MONITOR: 'Task Monitor',
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  PENDING: 'To Do',
  OPEN: 'To Do',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Dismissed',
  RESOLVED: 'Completed',
};

export function formatRiskType(type?: string | null): string {
  if (!type) return 'Risk Alert';
  const clean = type.trim();
  return (
    RISK_TYPE_LABELS[clean] ||
    RISK_TYPE_LABELS[clean.toUpperCase()] ||
    clean
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function formatRiskSeverity(severity?: string | null): string {
  if (!severity) return 'Medium';
  const clean = severity.trim().toUpperCase();
  return RISK_SEVERITY_LABELS[clean] || clean;
}

export function formatRiskStatus(status?: string | null): string {
  if (!status) return 'New Alert';
  const clean = status.trim().toUpperCase();
  return RISK_STATUS_LABELS[clean] || clean;
}

export function formatAgentType(agent?: string | null): string {
  if (!agent) return 'Specialist';
  const clean = agent.trim();
  return (
    AGENT_TYPE_LABELS[clean] ||
    AGENT_TYPE_LABELS[clean.toUpperCase()] ||
    clean
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function formatTaskStatus(status?: string | null): string {
  if (!status) return 'To Do';
  const clean = status.trim().toUpperCase();
  return TASK_STATUS_LABELS[clean] || clean;
}

export function formatUserFacingText(text?: string | null): string {
  if (!text) return '';
  let result = text;
  for (const [code, label] of Object.entries(RISK_TYPE_LABELS)) {
    const re = new RegExp(`\\b${code}\\b`, 'g');
    result = result.replace(re, label);
  }
  for (const [code, label] of Object.entries(AGENT_TYPE_LABELS)) {
    const re = new RegExp(`\\b${code}\\b`, 'g');
    result = result.replace(re, label);
  }
  result = result
    .replace(/\bHITL\b/g, 'Human Approval')
    .replace(/\bHITL Review Gate\b/g, 'Human Approval')
    .replace(/\bHUMAN_REVIEW_WAITING\b/g, 'Awaiting Human Approval')
    .replace(/\bREQUIRES_HUMAN_REVIEW\b/g, 'Requires Human Approval')
    .replace(/\bDECIMAL_VERIFIED\b/g, 'Accuracy Verified')
    .replace(/\bVERIFIER_PASSED\b/g, 'Verified')
    .replace(/\bMCP_DISPATCHED\b/g, 'Tool Executed');
  return result;
}

