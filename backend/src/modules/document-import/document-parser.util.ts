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

  const parsed = Date.parse(cleaned);
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed);
    const y = dt.getUTCFullYear();
    if (y >= 1970 && y <= 2100) {
      return dt.toISOString().slice(0, 10);
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
          /(?:invoice\s*(?:no\.?|number|#)|inv\s*(?:no\.?|#))\s*[:-]?\s*([A-Z0-9][A-Z0-9/-]{2,40})/i,
          /\b(INV-[A-Z0-9-]{3,40})\b/i,
        ]
      : [
          /(?:bill\s*(?:no\.?|number|#)|vendor\s*invoice\s*(?:no\.?|#)|invoice\s*(?:no\.?|number|#)|ref(?:erence)?\s*(?:no\.?|#))\s*[:-]?\s*([A-Z0-9][A-Z0-9/-]{2,40})/i,
          /\b((?:BILL|INV)-[A-Z0-9-]{3,40})\b/i,
        ];

  let rawDocNum: string | null = null;
  for (const regex of docNumberPatterns) {
    const m = params.sanitizedText.match(regex);
    if (m?.[1]) {
      rawDocNum = m[1].trim();
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
          /(?:bill\s*to|billed\s*to|customer(?:\s*name)?|client(?:\s*name)?|sold\s*to)\s*[:-]\s*([^\n\r]+)/i,
        ]
      : [
          /(?:supplier(?:\s*name)?|vendor(?:\s*name)?|billed\s*from|from|seller)\s*[:-]\s*([^\n\r]+)/i,
        ];

  const sectionHeadingRegex =
    params.documentType === 'INVOICE'
      ? /^(?:bill\s*to|billed\s*to|customer(?:\s*details|\s*info(?:rmation)?|\s*name)?|client(?:\s*details|\s*info(?:rmation)?|\s*name)?|sold\s*to)(?:\s*\([^)]*\))*\s*:?\s*$/i
      : /^(?:supplier(?:\s*details|\s*info(?:rmation)?|\s*name)?|vendor(?:\s*details|\s*info(?:rmation)?|\s*name)?|billed\s*from|from|remit\s*to)(?:\s*\([^)]*\))*\s*:?\s*$/i;

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

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    for (const regex of counterpartyLabels) {
      const m = line.match(regex);
      const inlineVal = m?.[1]?.trim();
      if (inlineVal && !isNonNameDetailLine(inlineVal)) {
        rawCounterparty = inlineVal;
        counterpartyConf = 0.88;
        break;
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

  // 3. Counterparty Email
  const emailMatch = params.sanitizedText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  const counterpartyEmail = emailMatch ? emailMatch[0].trim().toLowerCase() : null;

  // 4. Issue Date & Due Date
  const datePattern =
    '(\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4})';
  const issueMatch = params.sanitizedText.match(
    new RegExp(`(?:issue\\s*date|invoice\\s*date|bill\\s*date|dated|date)\\s*[:\\-]?\\s*${datePattern}`, 'i'),
  );
  const dueMatch = params.sanitizedText.match(
    new RegExp(`(?:due\\s*date|payment\\s*due|pay\\s*by|due)\\s*[:\\-]?\\s*${datePattern}`, 'i'),
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

  // 6. Subtotal, Tax, and Total Amounts
  const moneyPattern = '(?:USD|PKR|EUR|GBP|Rs\\.?|[$€£₨])?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,4})?)';
  const subtotalMatch = params.sanitizedText.match(
    new RegExp(`(?:sub\\s*-?\\s*total|net\\s*amount)\\s*[:\\-]?\\s*${moneyPattern}`, 'i'),
  );
  const taxLineMatch = params.sanitizedText.match(
    new RegExp(
      `(?:sales\\s*tax|vat|gst|tax)(?:\\s*\\(?(\\d{1,2}(?:\\.\\d{1,2})?)\\s*%\\)?)?\\s*[:\\-]?\\s*${moneyPattern}`,
      'i',
    ),
  );
  const totalMatch = params.sanitizedText.match(
    new RegExp(
      `(?:grand\\s*total|total\\s*amount\\s*due|total\\s*due|balance\\s*due|amount\\s*due|^total|\\btotal)\\s*[:\\-]?\\s*${moneyPattern}`,
      'im',
    ),
  );

  let subtotalAmount = subtotalMatch?.[1] ? parseMoneyString(subtotalMatch[1]) : null;
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
  // Never invent totalAmount if neither total nor lineItems/subtotal were found
  if (!totalAmount && subtotalAmount) {
    const computedTotal = DecimalMath.add(subtotalAmount, taxAmount ?? '0');
    totalAmount = DecimalMath.toFixed4(computedTotal);
    notesList.push('Total amount derived from extracted subtotal + tax.');
  }
  if (!taxRate && subtotalAmount && taxAmount && DecimalMath.of(subtotalAmount).gt(DecimalMath.ZERO)) {
    const pct = DecimalMath.mul(
      DecimalMath.divSafe(taxAmount, subtotalAmount) ?? DecimalMath.ZERO,
      100,
    );
    taxRate = DecimalMath.toFixed4(pct);
  }

  const defaultCategory =
    params.documentType === 'INVOICE' ? 'Sales Revenue' : 'Operating Expense';

  return {
    documentType: params.documentType,
    documentNumber,
    counterpartyName,
    counterpartyEmail,
    category: defaultCategory,
    department: null,
    issueDate,
    dueDate,
    currency: detectedCurrency.currency,
    currencySource: detectedCurrency.source,
    subtotalAmount,
    taxRate,
    taxAmount,
    totalAmount,
    lineItems,
    notes: null,
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
    const calcTotal = DecimalMath.add(parsed.subtotalAmount, parsed.taxAmount ?? '0');
    calculatedTotalAmount = DecimalMath.toFixed4(calcTotal);
    const diff = DecimalMath.sub(calcTotal, parsed.totalAmount).abs();
    subtotalPlusTaxMatchesTotal = diff.lte(tolerance);
    if (!subtotalPlusTaxMatchesTotal) {
      discrepancies.push(
        `Subtotal (${parsed.subtotalAmount}) + Tax (${parsed.taxAmount ?? '0.0000'}) = ${calculatedTotalAmount}, which differs from Total (${parsed.totalAmount}).`,
      );
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

  const isValid = discrepancies.length === 0 && missingRequiredFields.length === 0;
  const summary = isValid
    ? 'Extracted document passed deterministic arithmetic, date order, and required field verification.'
    : `Manual review required: ${missingRequiredFields.length} missing field(s), ${discrepancies.length} verification discrepancy(ies).`;

  return {
    isValid,
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
