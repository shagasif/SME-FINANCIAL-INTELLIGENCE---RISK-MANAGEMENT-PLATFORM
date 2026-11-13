import { BadRequestException } from '@nestjs/common';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { SecurityUtil } from '../../common/utils/security.util.js';

export type DocumentTargetType = 'INVOICE' | 'BILL';
export type DocumentFileFormat = 'pdf' | 'jpeg' | 'png';

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const EXTENSION_FORMAT_MAP: Record<string, DocumentFileFormat> = {
  '.pdf': 'pdf',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
};

const MIME_FORMAT_MAP: Record<string, DocumentFileFormat> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
};

export interface ValidatedUploadDescriptor {
  originalName: string;
  extension: string;
  format: DocumentFileFormat;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface ExtractedLineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  lineSubtotal: string;
  lineTaxAmount: string;
  lineTotal: string;
  confidence: number;
}

export interface ExtractedFieldConfidence {
  documentNumber: number;
  counterpartyName: number;
  counterpartyEmail: number;
  issueDate: number;
  dueDate: number;
  currency: number;
  subtotalAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  lineItems: number;
}

export interface ParsedDocumentFields {
  documentType: DocumentTargetType;
  documentNumber: string | null;
  counterpartyName: string | null;
  counterpartyEmail: string | null;
  category: string;
  department: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  currencySource: 'DOCUMENT' | 'ORGANIZATION_DEFAULT';
  subtotalAmount: string | null;
  discountRate?: string | null;
  discountAmount?: string | null;
  taxRate: string | null;
  taxAmount: string | null;
  totalAmount: string | null;
  lineItems: ExtractedLineItem[];
  notes: string | null;
  fieldConfidence: ExtractedFieldConfidence;
  extractionNotes: string[];
  sanitizationFlags: string[];
}

export interface DocumentArithmeticVerification {
  isValid: boolean;
  arithmeticValid: boolean;
  lineItemsMatchSubtotal: boolean | null;
  subtotalPlusTaxMatchesTotal: boolean | null;
  taxRateMatchesTaxAmount: boolean | null;
  dateOrderValid: boolean | null;
  calculatedLineItemsSubtotal: string | null;
  calculatedTotalAmount: string | null;
  discrepancies: string[];
  missingRequiredFields: string[];
  summary: string;
}

/**
 * Inspects file buffer magic bytes to identify genuine file format regardless of client headers.
 */
export function detectMagicByteFormat(buffer: Buffer): DocumentFileFormat | null {
  if (!buffer || buffer.length < 4) return null;

  // PDF: %PDF- (25 50 44 46 2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return 'pdf';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  return null;
}

/**
 * Validates file presence, size <= 10 MB, allowed extension, declared MIME type,
 * and actual magic-byte signature consistency.
 */
export function validateUploadedDocumentFile(file: {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
} | null | undefined): ValidatedUploadDescriptor {
  if (!file || !file.buffer) {
    throw new BadRequestException('A document file (PDF, JPG, JPEG, or PNG) is required in the "file" field.');
  }

  const sizeBytes = file.buffer.length;
  if (sizeBytes === 0) {
    throw new BadRequestException('Uploaded document file is empty (0 bytes).');
  }
  if (sizeBytes > MAX_DOCUMENT_FILE_SIZE_BYTES || (file.size ?? 0) > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    throw new BadRequestException('Uploaded document exceeds the maximum allowed size of 10 MB.');
  }

  const rawName = (file.originalname ?? '').trim();
  const extMatch = rawName.toLowerCase().match(/(\.[a-z0-9]+)$/);
  const extension = extMatch ? extMatch[1] : '';
  const extFormat = EXTENSION_FORMAT_MAP[extension];
  if (!extFormat) {
    throw new BadRequestException(
      'Unsupported file extension. Only .pdf, .jpg, .jpeg, and .png documents are permitted.',
    );
  }

  const mimeType = (file.mimetype ?? '').toLowerCase().split(';')[0].trim();
  const mimeFormat = MIME_FORMAT_MAP[mimeType];
  if (!mimeFormat) {
    throw new BadRequestException(
      `Unsupported MIME type "${mimeType || 'unknown'}". Only application/pdf, image/jpeg, and image/png are permitted.`,
    );
  }

  const magicFormat = detectMagicByteFormat(file.buffer);
  if (!magicFormat) {
    throw new BadRequestException(
      'File signature verification failed: uploaded bytes do not match a valid PDF, JPEG, or PNG header.',
    );
  }

  if (magicFormat !== extFormat || magicFormat !== mimeFormat) {
    throw new BadRequestException(
      `File type mismatch: extension "${extension}" and MIME "${mimeType}" do not match detected file signature (${magicFormat.toUpperCase()}).`,
    );
  }

  return {
    originalName: rawName.slice(0, 200),
    extension,
    format: magicFormat,
    mimeType,
    sizeBytes,
    checksumSha256: SecurityUtil.sha256(file.buffer),
  };
}

const MONTH_INDEX_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function parseFlexibleDocumentDate(raw: string): string | null {
  const cleaned = raw.trim().replace(/,$/, '');
  if (!cleaned) return null;

  const isoMatch = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch.map(Number);
    if (y >= 1970 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const dmyMatch = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const first = Number(dmyMatch[1]);
    const second = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (year >= 1970 && year <= 2100) {
      // Disambiguate DD/MM/YYYY vs MM/DD/YYYY safely
      const month = second > 12 ? first : first > 12 ? second : second;
      const day = second > 12 ? second : first;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  // Month DD, YYYY (parsed deterministically in UTC to avoid local timezone day-shift)
  const monthFirstMatch = cleaned.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthFirstMatch) {
    const m = MONTH_INDEX_MAP[monthFirstMatch[1].toLowerCase()];
    const d = Number(monthFirstMatch[2]);
    const y = Number(monthFirstMatch[3]);
    if (m && y >= 1970 && y <= 2100 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // DD Month YYYY
  const dayFirstMatch = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/);
  if (dayFirstMatch) {
    const d = Number(dayFirstMatch[1]);
    const m = MONTH_INDEX_MAP[dayFirstMatch[2].toLowerCase()];
    const y = Number(dayFirstMatch[3]);
    if (m && y >= 1970 && y <= 2100 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // DD-MMM-YYYY or DD.MM.YYYY
  const dmyAlphaMatch = cleaned.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/);
  if (dmyAlphaMatch) {
    const d = Number(dmyAlphaMatch[1]);
    const m = MONTH_INDEX_MAP[dmyAlphaMatch[2].toLowerCase()];
    const y = Number(dmyAlphaMatch[3]);
    if (m && y >= 1970 && y <= 2100 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const dmyDotMatch = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmyDotMatch) {
    const d = Number(dmyDotMatch[1]);
    const m = Number(dmyDotMatch[2]);
    const y = Number(dmyDotMatch[3]);
    if (y >= 1970 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}

function parseMoneyString(raw: string): string | null {
  const cleaned = raw.replace(/[^0-9.,-]/g, '').replace(/,/g, '').trim();
  if (!cleaned || !/^\d+(\.\d{1,4})?$/.test(cleaned)) return null;
  const val = DecimalMath.of(cleaned);
  return val.gte(DecimalMath.ZERO) ? DecimalMath.toFixed4(val) : null;
}

function detectCurrency(text: string, defaultCurrency: string): {
  currency: string;
  source: 'DOCUMENT' | 'ORGANIZATION_DEFAULT';
  confidence: number;
} {
  const isoMatch = text.match(/\b(USD|PKR|EUR|GBP|AED|SAR|CAD|AUD)\b/i);
  if (isoMatch) {
    return {
      currency: isoMatch[1].toUpperCase(),
      source: 'DOCUMENT',
      confidence: 0.94,
    };
  }
  if (/(?:\bRs\.?|\bPKR\b|₨)/i.test(text)) {
    return { currency: 'PKR', source: 'DOCUMENT', confidence: 0.85 };
  }
  if (/€/.test(text)) return { currency: 'EUR', source: 'DOCUMENT', confidence: 0.85 };
  if (/£/.test(text)) return { currency: 'GBP', source: 'DOCUMENT', confidence: 0.85 };
  if (/\$/.test(text)) return { currency: 'USD', source: 'DOCUMENT', confidence: 0.8 };

  return {
    currency: (defaultCurrency || 'USD').trim().toUpperCase(),
    source: 'ORGANIZATION_DEFAULT',
    confidence: 0.4,
  };
}

function sanitizeFieldValue(
  raw: string | null,
  flagsCollector: Set<string>,
): string | null {
  if (!raw || !raw.trim()) return null;
  const result = SecurityUtil.sanitizeImportedText(raw);
  result.flaggedPatterns.forEach((flag) => flagsCollector.add(flag));
  return result.sanitized || null;
}

/**
 * Deterministic structured parser for sanitized invoice/bill text.
 * Never fabricates missing values: returns null and zero confidence when absent.
 */
export function parseInvoiceOrBillText(params: {
  sanitizedText: string;
  documentType: DocumentTargetType;
  defaultCurrency: string;
  sanitizationFlags?: string[];
}): ParsedDocumentFields {
  const lines = params.sanitizedText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const flagsSet = new Set<string>(params.sanitizationFlags ?? []);
  const notesList: string[] = [];

  // 1. Document Number
  const docNumberPatterns =
    params.documentType === 'INVOICE'
      ? [
          /(?:tax\s*invoice|proforma\s*invoice|invoice|inv|receipt|voucher|document|doc|ref(?:erence)?)\s*(?:no\.?|number|id|#)\s*[:-]?\s*([A-Z0-9][A-Z0-9/-]{1,40})/i,
          /\b(INV[-\s][A-Z0-9-]{2,40})\b/i,
        ]
      : [
          /(?:vendor\s*invoice|supplier\s*invoice|bill|invoice|voucher|receipt|document|doc|ref(?:erence)?)\s*(?:no\.?|number|id|#)\s*[:-]?\s*([A-Z0-9][A-Z0-9/-]{1,40})/i,
          /\b((?:BILL|INV)[-\s][A-Z0-9-]{2,40})\b/i,
        ];

  let rawDocNum: string | null = null;
  for (const regex of docNumberPatterns) {
    const m = params.sanitizedText.match(regex);
    const candidate = m?.[1]?.trim();
    if (candidate && !/^(?:date|na|n\/a|none|null|tbd|missing)$/i.test(candidate)) {
      rawDocNum = candidate;
      break;
    }
  }
  const documentNumber = sanitizeFieldValue(rawDocNum, flagsSet);

  // 2. Counterparty Name (Customer for INVOICE, Supplier/Vendor for BILL)
  let rawCounterparty: string | null = null;
  let counterpartyConf = 0;
  const counterpartyLabels =
    params.documentType === 'INVOICE'
      ? [
          /(?:bill\s*to|billed\s*to|customer(?:\s*name)?|client(?:\s*name)?|sold\s*to|buyer|recipient|consignee)\s*[:-]\s*([^\n\r]+)/i,
        ]
      : [
          /(?:supplier(?:\s*name)?|vendor(?:\s*name)?|billed\s*from|issued\s*by|from|seller|payee|merchant)\s*[:-]\s*([^\n\r]+)/i,
        ];

  const sectionHeadingRegex =
    params.documentType === 'INVOICE'
      ? /^(?:bill\s*to|billed\s*to|customer(?:\s*details|\s*info(?:rmation)?|\s*name)?|client(?:\s*details|\s*info(?:rmation)?|\s*name)?|sold\s*to|buyer|recipient)(?:\s*\([^)]*\))*\s*:?\s*$/i
      : /^(?:supplier(?:\s*details|\s*info(?:rmation)?|\s*name)?|vendor(?:\s*details|\s*info(?:rmation)?|\s*name)?|billed\s*from|issued\s*by|from|remit\s*to)(?:\s*\([^)]*\))*\s*:?\s*$/i;

  const isNonNameDetailLine = (candidate: string): boolean => {
    const trimmed = candidate.trim();
    if (trimmed.length < 2) return true;
    if (/^[-_=*.]{2,}$/.test(trimmed)) return true;
    if (/^\([^)]*\)$/.test(trimmed)) return true;
    if (sectionHeadingRegex.test(trimmed)) return true;
    if (
      /^(?:address|street|road|block|sector|city|country|email|e-mail|phone|tel|mobile|fax|ntn|gst|vat|tax\s*id)\b\s*[:-]?/i.test(
        trimmed,
      )
    ) {
      return true;
    }
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(trimmed)) return true;
    if (/^\+?\d[\d\s\-()]{5,}$/.test(trimmed)) return true;
    return false;
  };

  const splitInlineCounterpartyAndPaymentMode = (
    raw: string,
  ): { party: string; paymentMode: string | null } => {
    const paymentMatch = raw.match(
      /^(.*?)(?:\t+|\s{2,}|\s+)(?:payment\s*(?:mode|method|terms|type)|mode\s*of\s*payment)\s*[:\-]\s*(.+)$/i,
    );
    if (paymentMatch && paymentMatch[1].trim().length >= 2) {
      return {
        party: paymentMatch[1].trim(),
        paymentMode: paymentMatch[2].trim() || null,
      };
    }
    const stripped = raw
      .replace(
        /(?:\t+|\s{2,})(?:invoice\s*(?:no|number|#)|bill\s*(?:no|number|#)|(?:issue\s*|due\s*)?date|currency|status)\s*[:\-].*$/i,
        '',
      )
      .trim();
    return { party: stripped, paymentMode: null };
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    for (const regex of counterpartyLabels) {
      const m = line.match(regex);
      const inlineRaw = m?.[1]?.trim();
      if (inlineRaw) {
        const { party, paymentMode } = splitInlineCounterpartyAndPaymentMode(inlineRaw);
        if (party && !isNonNameDetailLine(party)) {
          rawCounterparty = party;
          counterpartyConf = 0.88;
          if (paymentMode) {
            notesList.push(`Payment mode detected separately: ${paymentMode}.`);
          }
          break;
        }
      }
    }
    if (rawCounterparty) break;

    if (sectionHeadingRegex.test(line)) {
      for (let lookahead = idx + 1; lookahead < Math.min(lines.length, idx + 4); lookahead += 1) {
        let candidate = lines[lookahead].trim();
        const namedSubfield = candidate.match(/^(?:name|company|attention|attn)\s*[:-]\s*(.+)$/i);
        if (namedSubfield?.[1]) {
          candidate = namedSubfield[1].trim();
        }
        const { party, paymentMode } = splitInlineCounterpartyAndPaymentMode(candidate);
        candidate = party;
        // Skip visual separators or secondary parenthetical captions immediately under heading
        if (/^[-_=*.]{2,}$/.test(candidate) || /^\([^)]*\)$/.test(candidate) || sectionHeadingRegex.test(candidate)) {
          continue;
        }
        // Stop before address/contact detail lines so multi-line addresses are not misclassified
        if (isNonNameDetailLine(candidate)) {
          break;
        }
        rawCounterparty = candidate;
        counterpartyConf = 0.85;
        if (paymentMode) {
          notesList.push(`Payment mode detected separately: ${paymentMode}.`);
        }
        break;
      }
      if (rawCounterparty) break;
    }
  }

  // Fallback for BILL header line (first descriptive company line if no label matched)
  if (!rawCounterparty && params.documentType === 'BILL') {
    const candidateHeader = lines.find(
      (l) =>
        l.length >= 3 &&
        l.length <= 80 &&
        !/^(tax\s*)?(invoice|bill|receipt|statement|date|total|subtotal|amount|page)/i.test(l) &&
        !/^\d/.test(l) &&
        !/@/.test(l),
    );
    if (candidateHeader) {
      rawCounterparty = candidateHeader;
      counterpartyConf = 0.55;
      notesList.push('Supplier name inferred from top header line; please verify.');
    }
  }
  const counterpartyName = sanitizeFieldValue(rawCounterparty, flagsSet);

  // 3. Counterparty Email (prefer email in counterparty block or matching counterparty name over issuer header email)
  const emailRegexGlobal = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const emailCandidates: Array<{ email: string; lineIdx: number }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const found = lines[i].match(emailRegexGlobal);
    if (found) {
      for (const e of found) {
        emailCandidates.push({ email: e.trim().toLowerCase(), lineIdx: i });
      }
    }
  }

  let counterpartyEmail: string | null = null;
  if (emailCandidates.length === 1) {
    counterpartyEmail = emailCandidates[0].email;
  } else if (emailCandidates.length > 1) {
    const partyTokens = (counterpartyName ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4);
    const tokenMatch =
      partyTokens.length > 0
        ? emailCandidates.find((c) => partyTokens.some((tok) => c.email.includes(tok)))
        : undefined;
    if (tokenMatch) {
      counterpartyEmail = tokenMatch.email;
    } else {
      const counterpartyHeaderIdx = lines.findIndex((l) =>
        params.documentType === 'INVOICE'
          ? /(?:bill\s*to|billed\s*to|customer|client|sold\s*to)/i.test(l)
          : /(?:supplier|vendor|billed\s*from|seller)/i.test(l),
      );
      const blockMatch =
        counterpartyHeaderIdx >= 0
          ? emailCandidates.find(
              (c) => c.lineIdx >= counterpartyHeaderIdx && c.lineIdx <= counterpartyHeaderIdx + 6,
            )
          : undefined;
      counterpartyEmail = (blockMatch ?? emailCandidates[emailCandidates.length - 1]).email;
    }
  }

  // 4. Issue Date & Due Date
  const datePattern =
    '(\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4}|\\d{1,2}[-\\s][A-Za-z]{3,9}[-\\s]\\d{4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+[A-Za-z]{3,9},?\\s+\\d{4})';
  const issueMatch = params.sanitizedText.match(
    new RegExp(
      `(?:issue\\s*date|invoice\\s*date|bill\\s*date|date\\s*of\\s*issue|issued\\s*on|transaction\\s*date|dated|(?<!due\\s*|payment\\s*)date)\\s*[:\\-]?\\s*${datePattern}`,
      'i',
    ),
  );
  const dueMatch = params.sanitizedText.match(
    new RegExp(
      `(?:due\\s*date|payment\\s*due\\s*date|payment\\s*due|pay\\s*by|due\\s*on|valid\\s*until|due)\\s*[:\\-]?\\s*${datePattern}`,
      'i',
    ),
  );

  const issueDate = issueMatch?.[1] ? parseFlexibleDocumentDate(issueMatch[1]) : null;
  let dueDate = dueMatch?.[1] ? parseFlexibleDocumentDate(dueMatch[1]) : null;
  let dueDateConf = dueDate ? 0.9 : 0;

  if (!dueDate && issueDate) {
    const netDaysMatch = params.sanitizedText.match(/\bNet\s+(\d{1,3})\b/i);
    if (netDaysMatch?.[1]) {
      const days = Number(netDaysMatch[1]);
      if (days >= 0 && days <= 365) {
        const dt = new Date(`${issueDate}T00:00:00.000Z`);
        dt.setUTCDate(dt.getUTCDate() + days);
        dueDate = dt.toISOString().slice(0, 10);
        dueDateConf = 0.72;
        notesList.push(`Due date derived from Issue Date + Net ${days} payment terms.`);
      }
    }
  }

  // 5. Currency
  const detectedCurrency = detectCurrency(params.sanitizedText, params.defaultCurrency);
  if (detectedCurrency.source === 'ORGANIZATION_DEFAULT') {
    notesList.push(
      `No explicit currency symbol/code found; defaulted to organization base currency (${detectedCurrency.currency}).`,
    );
  }

  // 6. Subtotal, Discount, Tax, and Total Amounts
  const moneyPattern = '(?:USD|PKR|EUR|GBP|Rs\\.?|[$€£₨])?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,4})?)';
  const subtotalMatch = params.sanitizedText.match(
    new RegExp(`(?:sub\\s*-?\\s*total|net\\s*amount)\\s*[:\\-]?\\s*${moneyPattern}`, 'i'),
  );
  const discountMatch = params.sanitizedText.match(
    new RegExp(
      `(?:less\\s+)?discount(?:\\s*\\(?(\\d{1,2}(?:\\.\\d{1,2})?)\\s*%\\)?)?\\s*[:\\-]?\\s*-?\\s*${moneyPattern}`,
      'i',
    ),
  );
  const taxLineMatch = params.sanitizedText.match(
    new RegExp(
      `(?:sales\\s*tax|vat|gst|tax)(?:\\s*\\(?(\\d{1,2}(?:\\.\\d{1,2})?)\\s*%\\)?)?\\s*[:\\-]?\\s*${moneyPattern}`,
      'i',
    ),
  );
  const totalMatch = params.sanitizedText.match(
    new RegExp(
      `(?:final\\s*total\\s*payable|total\\s*payable|net\\s*payable|final\\s*total|payable\\s*amount|grand\\s*total|total\\s*amount\\s*due|total\\s*due|balance\\s*due|amount\\s*due|^total|\\btotal)\\s*[:\\-]?\\s*${moneyPattern}`,
      'im',
    ),
  );

  let subtotalAmount = subtotalMatch?.[1] ? parseMoneyString(subtotalMatch[1]) : null;
  let discountRate = discountMatch?.[1] ? DecimalMath.toFixed4(DecimalMath.of(discountMatch[1])) : null;
  const discountAmount = discountMatch?.[2] ? parseMoneyString(discountMatch[2]) : null;
  let taxRate = taxLineMatch?.[1] ? DecimalMath.toFixed4(DecimalMath.of(taxLineMatch[1])) : null;
  const taxAmount = taxLineMatch?.[2] ? parseMoneyString(taxLineMatch[2]) : null;
  let totalAmount = totalMatch?.[1] ? parseMoneyString(totalMatch[1]) : null;

  // 7. Line Items Parsing (matches patterns like: "Cloud Advisory | 2 x 1500.00 = 3000.00" or "Cloud Advisory   2   1,500.00   3,000.00")
  const lineItems: ExtractedLineItem[] = [];
  for (const line of lines) {
    if (
      /^(sub\s*-?\s*total|tax|vat|gst|grand\s*total|total|balance\s*due|amount\s*due|description\s+qty)/i.test(
        line,
      )
    ) {
      continue;
    }

    // Pattern A: Description  |  Qty  x  UnitPrice  =  LineTotal (or whitespace columns)
    const colMatch = line.match(
      /^(.{2,140}?)\s{1,}(?:qty\s*[:=]?\s*)?(\d+(?:\.\d{1,4})?)\s*(?:x|\*|\s)\s*(?:USD|PKR|EUR|GBP|Rs\.?|[$€£₨])?\s*([0-9][0-9,]*(?:\.[0-9]{1,4})?)\s*(?:=|\s)\s*(?:USD|PKR|EUR|GBP|Rs\.?|[$€£₨])?\s*([0-9][0-9,]*(?:\.[0-9]{1,4})?)$/i,
    );

    if (colMatch) {
      const desc = sanitizeFieldValue(colMatch[1].replace(/[|]+$/g, '').trim(), flagsSet);
      const qtyStr = parseMoneyString(colMatch[2]);
      const unitStr = parseMoneyString(colMatch[3]);
      const totalStr = parseMoneyString(colMatch[4]);
      if (desc && qtyStr && unitStr && totalStr && Number(qtyStr) > 0) {
        const expectedSubtotal = DecimalMath.mul(qtyStr, unitStr);
        const extractedLineTotal = DecimalMath.of(totalStr);
        const diff = DecimalMath.sub(expectedSubtotal, extractedLineTotal).abs();
        // Accept row when qty * unitPrice matches line total (within 0.05 or includes line tax)
        if (diff.lte(DecimalMath.of('0.05')) || extractedLineTotal.gte(expectedSubtotal)) {
          const lineTax = extractedLineTotal.gt(expectedSubtotal)
            ? DecimalMath.sub(extractedLineTotal, expectedSubtotal)
            : DecimalMath.ZERO;
          const lineTaxPct =
            lineTax.gt(DecimalMath.ZERO) && expectedSubtotal.gt(DecimalMath.ZERO)
              ? DecimalMath.mul(DecimalMath.divSafe(lineTax, expectedSubtotal) ?? DecimalMath.ZERO, 100)
              : DecimalMath.ZERO;
          lineItems.push({
            description: desc,
            quantity: qtyStr,
            unitPrice: unitStr,
            taxRate: DecimalMath.toFixed4(lineTaxPct),
            lineSubtotal: DecimalMath.toFixed4(expectedSubtotal),
            lineTaxAmount: DecimalMath.toFixed4(lineTax),
            lineTotal: DecimalMath.toFixed4(extractedLineTotal),
            confidence: diff.lte(DecimalMath.of('0.05')) ? 0.9 : 0.78,
          });
        }
      }
    }
  }

  // Derive subtotal from line items ONLY if document had line items and no explicit subtotal
  if (!subtotalAmount && lineItems.length > 0) {
    subtotalAmount = DecimalMath.toFixed4(
      DecimalMath.sum(lineItems.map((li) => li.lineSubtotal)),
    );
  }
  if (!discountRate && subtotalAmount && discountAmount && DecimalMath.of(subtotalAmount).gt(DecimalMath.ZERO)) {
    const discPct = DecimalMath.mul(
      DecimalMath.divSafe(discountAmount, subtotalAmount) ?? DecimalMath.ZERO,
      100,
    );
    discountRate = DecimalMath.toFixed4(discPct);
  }
  if (discountAmount && DecimalMath.of(discountAmount).gt(DecimalMath.ZERO)) {
    notesList.push(
      `Discount detected: ${detectedCurrency.currency} ${discountAmount}${discountRate ? ` (${Number.parseFloat(discountRate)}%)` : ''}.`,
    );
  }
  // Never invent totalAmount if neither total nor lineItems/subtotal were found
  if (!totalAmount && subtotalAmount) {
    const netAfterDiscount = DecimalMath.sub(subtotalAmount, discountAmount ?? '0');
    const computedTotal = DecimalMath.add(netAfterDiscount, taxAmount ?? '0');
    totalAmount = DecimalMath.toFixed4(computedTotal);
    notesList.push('Total amount derived from extracted subtotal - discount + tax.');
  }
  if (!taxRate && subtotalAmount && taxAmount && DecimalMath.of(subtotalAmount).gt(DecimalMath.ZERO)) {
    const pct = DecimalMath.mul(
      DecimalMath.divSafe(taxAmount, subtotalAmount) ?? DecimalMath.ZERO,
      100,
    );
    taxRate = DecimalMath.toFixed4(pct);
  }

  // 7b. Optional Category, Department, Payment Terms & Notes
  const categoryMatch = params.sanitizedText.match(
    /^(?:revenue\s*category|expense\s*category|category)\s*[:\-]\s*([^\n\r]{2,60})$/im,
  );
  const departmentMatch = params.sanitizedText.match(
    /^(?:department|dept|cost\s*center)\s*[:\-]\s*([^\n\r]{2,60})$/im,
  );
  const explicitNotesMatch = params.sanitizedText.match(
    /^(?:notes?|remarks?|payment\s*terms|terms(?:\s*&\s*conditions)?)\s*[:\-]\s*([^\n\r]{2,200})$/im,
  );
  const paymentModeNote = notesList.find((n) => n.startsWith('Payment mode detected separately:'));

  const defaultCategory =
    sanitizeFieldValue(categoryMatch?.[1] ?? null, flagsSet) ||
    (params.documentType === 'INVOICE' ? 'Sales Revenue' : 'Operating Expense');
  const extractedDepartment = sanitizeFieldValue(departmentMatch?.[1] ?? null, flagsSet);

  const combinedNotesParts: string[] = [];
  if (discountAmount && DecimalMath.of(discountAmount).gt(DecimalMath.ZERO)) {
    combinedNotesParts.push(
      `Discount: ${detectedCurrency.currency} ${Number.parseFloat(discountAmount).toLocaleString('en-US')}${discountRate ? ` (${Number.parseFloat(discountRate)}%)` : ''}`,
    );
  }
  if (paymentModeNote) {
    combinedNotesParts.push(paymentModeNote.replace(/^Payment mode detected separately:\s*/i, 'Payment Mode: ').replace(/\.$/, ''));
  }
  const cleanExplicitNotes = sanitizeFieldValue(explicitNotesMatch?.[1] ?? null, flagsSet);
  if (cleanExplicitNotes) {
    combinedNotesParts.push(cleanExplicitNotes);
  }
  const extractedNotesSummary =
    combinedNotesParts.length > 0 ? combinedNotesParts.join(' | ') : null;

  return {
    documentType: params.documentType,
    documentNumber,
    counterpartyName,
    counterpartyEmail,
    category: defaultCategory,
    department: extractedDepartment,
    issueDate,
    dueDate,
    currency: detectedCurrency.currency,
    currencySource: detectedCurrency.source,
    subtotalAmount,
    discountRate,
    discountAmount,
    taxRate,
    taxAmount,
    totalAmount,
    lineItems,
    notes: extractedNotesSummary,
    fieldConfidence: {
      documentNumber: documentNumber ? 0.9 : 0,
      counterpartyName: counterpartyName ? counterpartyConf : 0,
      counterpartyEmail: counterpartyEmail ? 0.92 : 0,
      issueDate: issueDate ? 0.9 : 0,
      dueDate: dueDateConf,
      currency: detectedCurrency.confidence,
      subtotalAmount: subtotalAmount ? (subtotalMatch ? 0.9 : 0.75) : 0,
      taxRate: taxRate ? (taxLineMatch?.[1] ? 0.88 : 0.72) : 0,
      taxAmount: taxAmount ? 0.88 : 0,
      totalAmount: totalAmount ? (totalMatch ? 0.92 : 0.75) : 0,
      lineItems:
        lineItems.length > 0
          ? Number(
              (
                lineItems.reduce((sum, li) => sum + li.confidence, 0) / lineItems.length
              ).toFixed(2),
            )
          : 0,
    },
    extractionNotes: notesList,
    sanitizationFlags: Array.from(flagsSet),
  };
}

/**
 * Verifies arithmetic integrity, date ordering, and schema completeness using DecimalMath.
 */
export function verifyExtractedDocumentArithmetic(
  parsed: ParsedDocumentFields,
): DocumentArithmeticVerification {
  const discrepancies: string[] = [];
  const missingRequiredFields: string[] = [];
  const tolerance = DecimalMath.of('0.05');

  if (!parsed.documentNumber) {
    missingRequiredFields.push(
      parsed.documentType === 'INVOICE' ? 'invoiceNumber' : 'billNumber',
    );
  }
  if (!parsed.counterpartyName) {
    missingRequiredFields.push(
      parsed.documentType === 'INVOICE' ? 'customerName' : 'supplierName',
    );
  }
  if (!parsed.issueDate) missingRequiredFields.push('issueDate');
  if (!parsed.dueDate) missingRequiredFields.push('dueDate');
  if (!parsed.totalAmount) missingRequiredFields.push('totalAmount');

  let calculatedLineItemsSubtotal: string | null = null;
  let lineItemsMatchSubtotal: boolean | null = null;
  if (parsed.lineItems.length > 0) {
    const liSub = DecimalMath.sum(
      parsed.lineItems.map((li) => DecimalMath.mul(li.quantity, li.unitPrice)),
    );
    calculatedLineItemsSubtotal = DecimalMath.toFixed4(liSub);
    if (parsed.subtotalAmount) {
      const diff = DecimalMath.sub(liSub, parsed.subtotalAmount).abs();
      lineItemsMatchSubtotal = diff.lte(tolerance);
      if (!lineItemsMatchSubtotal) {
        discrepancies.push(
          `Sum of line item subtotals (${calculatedLineItemsSubtotal}) differs from extracted subtotal (${parsed.subtotalAmount}).`,
        );
      }
    }
  }

  let calculatedTotalAmount: string | null = null;
  let subtotalPlusTaxMatchesTotal: boolean | null = null;
  if (parsed.subtotalAmount && parsed.totalAmount) {
    const netSubtotal = DecimalMath.sub(parsed.subtotalAmount, parsed.discountAmount ?? '0');
    if (parsed.taxAmount !== null && parsed.taxAmount !== undefined) {
      const calcTotal = DecimalMath.add(netSubtotal, parsed.taxAmount);
      calculatedTotalAmount = DecimalMath.toFixed4(calcTotal);
      const diff = DecimalMath.sub(calcTotal, parsed.totalAmount).abs();
      subtotalPlusTaxMatchesTotal = diff.lte(tolerance);
      if (!subtotalPlusTaxMatchesTotal) {
        discrepancies.push(
          `Subtotal (${parsed.subtotalAmount})${parsed.discountAmount ? ` - Discount (${parsed.discountAmount})` : ''} + Tax (${parsed.taxAmount}) = ${calculatedTotalAmount}, which differs from Total (${parsed.totalAmount}).`,
        );
      }
    } else {
      // Missing tax must not be silently treated as verified zero tax
      calculatedTotalAmount = DecimalMath.toFixed4(netSubtotal);
      const diff = DecimalMath.sub(netSubtotal, parsed.totalAmount).abs();
      if (!diff.lte(tolerance)) {
        subtotalPlusTaxMatchesTotal = false;
        discrepancies.push(
          `Subtotal (${parsed.subtotalAmount})${parsed.discountAmount ? ` - Discount (${parsed.discountAmount})` : ''} differs from Total (${parsed.totalAmount}) and tax information is missing.`,
        );
      } else {
        subtotalPlusTaxMatchesTotal = null;
      }
    }
  }

  let taxRateMatchesTaxAmount: boolean | null = null;
  if (
    parsed.subtotalAmount &&
    parsed.taxRate &&
    parsed.taxAmount &&
    DecimalMath.of(parsed.subtotalAmount).gt(DecimalMath.ZERO)
  ) {
    const expectedTax = DecimalMath.divSafe(
      DecimalMath.mul(parsed.subtotalAmount, parsed.taxRate),
      100,
    );
    if (expectedTax !== null) {
      const diff = DecimalMath.sub(expectedTax, parsed.taxAmount).abs();
      taxRateMatchesTaxAmount = diff.lte(DecimalMath.of('0.10'));
      if (!taxRateMatchesTaxAmount) {
        discrepancies.push(
          `Tax rate (${parsed.taxRate}%) applied to subtotal (${parsed.subtotalAmount}) yields ${DecimalMath.toFixed4(expectedTax)}, which differs from Tax Amount (${parsed.taxAmount}).`,
        );
      }
    }
  }

  let dateOrderValid: boolean | null = null;
  if (parsed.issueDate && parsed.dueDate) {
    dateOrderValid = new Date(`${parsed.dueDate}T00:00:00.000Z`).getTime() >=
      new Date(`${parsed.issueDate}T00:00:00.000Z`).getTime();
    if (!dateOrderValid) {
      discrepancies.push(
        `Extracted dueDate (${parsed.dueDate}) is earlier than issueDate (${parsed.issueDate}).`,
      );
    }
  }

  const hasNumericCheck =
    lineItemsMatchSubtotal !== null ||
    subtotalPlusTaxMatchesTotal !== null ||
    taxRateMatchesTaxAmount !== null;
  const arithmeticValid =
    discrepancies.length === 0 &&
    hasNumericCheck &&
    lineItemsMatchSubtotal !== false &&
    subtotalPlusTaxMatchesTotal !== false &&
    taxRateMatchesTaxAmount !== false;

  const isValid = discrepancies.length === 0 && missingRequiredFields.length === 0;
  const summary = isValid
    ? 'Extracted document passed deterministic arithmetic, date order, and required field verification.'
    : arithmeticValid && missingRequiredFields.length > 0
      ? `Arithmetic checks passed (0 discrepancies); manual review required for ${missingRequiredFields.length} missing field(s): ${missingRequiredFields.join(', ')}.`
      : `Manual review required: ${missingRequiredFields.length} missing field(s), ${discrepancies.length} verification discrepancy(ies).`;

  return {
    isValid,
    arithmeticValid,
    lineItemsMatchSubtotal,
    subtotalPlusTaxMatchesTotal,
    taxRateMatchesTaxAmount,
    dateOrderValid,
    calculatedLineItemsSubtotal,
    calculatedTotalAmount,
    discrepancies,
    missingRequiredFields,
    summary,
  };
}
