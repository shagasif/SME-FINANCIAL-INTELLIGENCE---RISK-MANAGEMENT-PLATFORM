import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { FORM_LABEL_CLASS, Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { apiPost, ApiClientError } from '../../services/apiClient';
import { formatCurrency, toTitleCasePartyName } from '../../utils/formatters';
import {
  BillStatus,
  InvoiceStatus,
  type DocumentImportExtractionResponse,
  type DocumentImportTargetType,
} from '../../types/financial.types';

export const MAX_DOCUMENT_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'] as const;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const BASE_CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'PKR', label: 'PKR — Pakistani Rupee' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'AED', label: 'AED — UAE Dirham' },
];

export interface EditableImportedLineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  confidence?: number;
}

interface DocumentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: DocumentImportTargetType;
  orgId: string;
  orgCurrency: string;
  onSuccess: () => void;
}

function validateClientDocumentFile(file: File): string | null {
  if (file.size === 0) {
    return 'The selected file is empty (0 bytes). Please choose a valid PDF, JPG, JPEG, or PNG document.';
  }
  if (file.size > MAX_DOCUMENT_IMPORT_BYTES) {
    return 'File exceeds the 10 MB maximum upload limit. Please upload a smaller PDF or image.';
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const declaredMime = (file.type || '').toLowerCase().trim();
  const hasAllowedMime = !declaredMime || ALLOWED_MIME_TYPES.has(declaredMime);

  if (!hasAllowedExtension || !hasAllowedMime) {
    return 'Unsupported file format. Only PDF, JPG, JPEG, and PNG documents are supported.';
  }
  return null;
}

function renderWarningIndicator(issue: string | null, fieldLabel: string) {
  if (!issue) return undefined;
  return (
    <span
      title={issue}
      aria-label={`${fieldLabel}: ${issue}`}
      className="inline-flex items-center text-amber-600 dark:text-amber-400"
    >
      <AlertCircle className="w-4 h-4" />
    </span>
  );
}

export function DocumentImportModal({
  isOpen,
  onClose,
  documentType,
  orgId,
  orgCurrency,
  onSuccess,
}: DocumentImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInvoice = documentType === 'INVOICE';
  const entityLabel = isInvoice ? 'Customer Invoice' : 'Supplier Bill';

  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractionResult, setExtractionResult] =
    useState<DocumentImportExtractionResponse | null>(null);

  // Editable document fields
  const [documentNumber, setDocumentNumber] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [counterpartyEmail, setCounterpartyEmail] = useState('');
  const [category, setCategory] = useState(isInvoice ? 'Sales Revenue' : 'Operating Expense');
  const [department, setDepartment] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState(orgCurrency || 'USD');
  const [statusInput, setStatusInput] = useState<string>('DRAFT');
  const [taxRate, setTaxRate] = useState('0');
  const [totalAmount, setTotalAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<EditableImportedLineItem[]>([]);
  const [editedFields, setEditedFields] = useState<Record<string, boolean>>({});

  const markEdited = (key: string) => {
    setEditedFields((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const resetModalState = () => {
    setStep('upload');
    setIsExtracting(false);
    setIsSaving(false);
    setError(null);
    setShowRawText(false);
    setSelectedFile(null);
    setExtractionResult(null);
    setDocumentNumber('');
    setCounterpartyName('');
    setCounterpartyEmail('');
    setCategory(isInvoice ? 'Sales Revenue' : 'Operating Expense');
    setDepartment('');
    setIssueDate('');
    setDueDate('');
    setCurrency(orgCurrency || 'USD');
    setStatusInput('DRAFT');
    setTaxRate('0');
    setTotalAmount('');
    setNotes('');
    setLineItems([]);
    setEditedFields({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetModalState();
    onClose();
  };

  const populateFormFromExtraction = (res: DocumentImportExtractionResponse) => {
    const doc = res.extractedDocument;
    setDocumentNumber(doc.documentNumber ?? '');
    setCounterpartyName(doc.counterpartyName ? toTitleCasePartyName(doc.counterpartyName) : '');
    setCounterpartyEmail(doc.counterpartyEmail ?? '');
    setCategory(doc.category || (isInvoice ? 'Sales Revenue' : 'Operating Expense'));
    setDepartment(doc.department ?? '');
    setIssueDate(doc.issueDate ?? '');
    setDueDate(doc.dueDate ?? '');
    setCurrency((doc.currency || orgCurrency || 'USD').toUpperCase());
    setStatusInput('DRAFT');
    setTaxRate(doc.taxRate ? String(Number.parseFloat(doc.taxRate)) : '0');
    setTotalAmount(doc.totalAmount ? String(Number.parseFloat(doc.totalAmount)) : '');
    setNotes(doc.notes ?? '');
    setEditedFields({});
    setLineItems(
      (res.lineItems ?? []).map((li) => ({
        description: li.description,
        quantity: String(Number.parseFloat(li.quantity || '1') || 1),
        unitPrice: String(Number.parseFloat(li.unitPrice || '0') || 0),
        taxRate: li.taxRate ? String(Number.parseFloat(li.taxRate)) : '',
        confidence: li.confidence,
      })),
    );
  };

  const processSelectedFile = async (file: File) => {
    setError(null);
    const clientValidationError = validateClientDocumentFile(file);
    if (clientValidationError) {
      setSelectedFile(null);
      setError(clientValidationError);
      return;
    }

    setSelectedFile(file);
    setIsExtracting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const endpoint = isInvoice
        ? `/v1/organizations/${orgId}/invoices/import/extract`
        : `/v1/organizations/${orgId}/bills/import/extract`;

      const res = await apiPost<DocumentImportExtractionResponse>(
        endpoint,
        formData,
        undefined,
        undefined,
        60_000,
      );

      setExtractionResult(res);
      populateFormFromExtraction(res);
      setStep('preview');
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(`Failed to extract fields from "${file.name}". Please try again.`);
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void processSelectedFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isExtracting) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void processSelectedFile(file);
  };

  const computeLiveTotals = () => {
    const headerTax = Number.parseFloat(taxRate || '0') || 0;
    if (lineItems.length > 0) {
      let subtotal = 0;
      let tax = 0;
      for (const li of lineItems) {
        const qty = Number.parseFloat(li.quantity || '0') || 0;
        const unit = Number.parseFloat(li.unitPrice || '0') || 0;
        const rate = li.taxRate.trim() !== '' ? Number.parseFloat(li.taxRate) || 0 : headerTax;
        const lineSub = qty * unit;
        const lineTax = (lineSub * rate) / 100;
        subtotal += lineSub;
        tax += lineTax;
      }
      return { subtotal, tax, total: subtotal + tax };
    }
    const rawTotal = Number.parseFloat(totalAmount || '0') || 0;
    const divisor = 1 + headerTax / 100;
    const subtotal = divisor > 0 ? rawTotal / divisor : rawTotal;
    const tax = rawTotal - subtotal;
    return { subtotal, tax, total: rawTotal };
  };

  const liveTotals = computeLiveTotals();
  const isSavedDuplicate = Boolean(extractionResult?.duplicateWarnings.checksumMatched);

  /**
   * Returns a warning message ONLY for fields that are missing required info,
   * invalid, or low-confidence and need review. Valid fields return null cleanly.
   */
  const getFieldIssues = () => {
    const conf = extractionResult?.fieldConfidence;
    const emailTrimmed = counterpartyEmail.trim();
    const emailSyntaxOk = !emailTrimmed || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
    const parsedTax = Number.parseFloat(taxRate || '0');
    const taxValid = !Number.isNaN(parsedTax) && parsedTax >= 0 && parsedTax <= 100;
    const usingLines = lineItems.length > 0;
    const totalNum = usingLines ? liveTotals.total : Number.parseFloat(totalAmount || '0');
    const totalValid = !Number.isNaN(totalNum) && totalNum > 0;

    const checkRequired = (
      isSyntaxValid: boolean,
      missingMessage: string,
      rawConf: number | undefined,
      editedKey: string,
    ): string | null => {
      if (!isSyntaxValid) return missingMessage;
      if (!editedFields[editedKey] && rawConf !== undefined && rawConf > 0 && rawConf < 0.7) {
        return 'Needs review';
      }
      if (!editedFields[editedKey] && (rawConf ?? 0) === 0) {
        return 'Needs review';
      }
      return null;
    };

    const dueDateIssue = !dueDate
      ? 'Required field missing'
      : issueDate && dueDate < issueDate
        ? 'Due date cannot be earlier than issue date'
        : !editedFields.dueDate && (conf?.dueDate ?? 0) > 0 && (conf?.dueDate ?? 0) < 0.7
          ? 'Needs review'
          : null;

    const hasInvalidLineItem =
      usingLines &&
      lineItems.some(
        (li) =>
          !li.description.trim() ||
          Number.isNaN(Number.parseFloat(li.quantity)) ||
          Number.parseFloat(li.quantity) <= 0 ||
          Number.isNaN(Number.parseFloat(li.unitPrice)) ||
          Number.parseFloat(li.unitPrice) < 0,
      );

    return {
      documentNumber: checkRequired(
        documentNumber.trim().length >= 2,
        'Required field missing',
        conf?.documentNumber,
        'documentNumber',
      ),
      counterpartyName: checkRequired(
        counterpartyName.trim().length >= 2,
        'Required field missing',
        conf?.counterpartyName,
        'counterpartyName',
      ),
      counterpartyEmail: !emailSyntaxOk ? 'Invalid email format' : null,
      category: category.trim().length === 0 ? 'Category is required' : null,
      department: null as string | null,
      issueDate: checkRequired(
        Boolean(issueDate),
        'Required field missing',
        conf?.issueDate,
        'issueDate',
      ),
      dueDate: dueDateIssue,
      currency:
        currency.trim().length !== 3
          ? 'Invalid currency code'
          : !editedFields.currency &&
              extractionResult?.extractedDocument.currencySource === 'ORGANIZATION_DEFAULT' &&
              (conf?.currency ?? 0) < 0.7
            ? 'Currency defaulted — please verify'
            : null,
      taxRate: !taxValid ? 'Tax rate must be between 0 and 100' : null,
      totalAmount: hasInvalidLineItem
        ? 'Line items contain incomplete values'
        : !totalValid
          ? 'Required field missing'
          : !usingLines &&
              !editedFields.totalAmount &&
              ((conf?.totalAmount ?? 0) === 0 || (conf?.totalAmount ?? 0) < 0.7)
            ? 'Needs review'
            : null,
    };
  };

  const fieldIssues = getFieldIssues();
  const hasAnyFieldIssue = Object.values(fieldIssues).some((issue) => issue !== null);
  const isDocumentVerified = Boolean(
    extractionResult &&
      extractionResult.extractionMetadata.extractedCharCount > 0 &&
      extractionResult.arithmeticVerification.discrepancies.length === 0 &&
      extractionResult.sanitizationFlags.length === 0 &&
      !hasAnyFieldIssue &&
      !isSavedDuplicate,
  );

  // Filter out the non-actionable derived-total note; keep genuine actionable warnings if any
  const visibleWarnings = (extractionResult?.extractionMetadata.warnings ?? []).filter(
    (warn) => !warn.toLowerCase().includes('total amount derived from extracted subtotal + tax'),
  );

  const handleSaveConfirmedDocument = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgId || !extractionResult) return;

    if (extractionResult.duplicateWarnings.checksumMatched) {
      setError(
        `This document has already been saved as an active ${entityLabel.toLowerCase()} and cannot be imported again.`,
      );
      return;
    }

    const cleanNumber = documentNumber.trim();
    const cleanParty = toTitleCasePartyName(counterpartyName);
    if (cleanNumber.length < 2) {
      setError(`${isInvoice ? 'Invoice' : 'Bill'} number must be at least 2 characters.`);
      return;
    }
    if (cleanParty.length < 2) {
      setError(`${isInvoice ? 'Customer' : 'Supplier'} name must be at least 2 characters.`);
      return;
    }
    if (!issueDate || !dueDate) {
      setError('Both Issue Date and Due Date are required before saving.');
      return;
    }
    if (dueDate < issueDate) {
      setError('Due date cannot be earlier than issue date.');
      return;
    }

    const parsedTaxRate = Number.parseFloat(taxRate || '0');
    if (Number.isNaN(parsedTaxRate) || parsedTaxRate < 0 || parsedTaxRate > 100) {
      setError('Tax rate percentage must be between 0 and 100.');
      return;
    }

    const usingLines = lineItems.length > 0;
    if (usingLines) {
      for (let idx = 0; idx < lineItems.length; idx += 1) {
        const li = lineItems[idx];
        if (!li.description.trim()) {
          setError(`Line item ${idx + 1} description cannot be empty.`);
          return;
        }
        const qty = Number.parseFloat(li.quantity);
        const unit = Number.parseFloat(li.unitPrice);
        if (Number.isNaN(qty) || qty <= 0) {
          setError(`Line item ${idx + 1} quantity must be greater than zero.`);
          return;
        }
        if (Number.isNaN(unit) || unit < 0) {
          setError(`Line item ${idx + 1} unit price cannot be negative.`);
          return;
        }
      }
      if (liveTotals.total <= 0) {
        setError('Total amount across line items must be strictly greater than zero.');
        return;
      }
    } else {
      const parsedTotal = Number.parseFloat(totalAmount);
      if (Number.isNaN(parsedTotal) || parsedTotal <= 0) {
        setError('Total amount must be strictly greater than zero (or add line items).');
        return;
      }
    }

    setIsSaving(true);
    setError(null);

    const dtoLineItems = lineItems.map((li) => ({
      description: li.description.trim(),
      quantity: (Number.parseFloat(li.quantity || '0') || 0).toFixed(4),
      unitPrice: (Number.parseFloat(li.unitPrice || '0') || 0).toFixed(4),
      ...(li.taxRate.trim() !== ''
        ? { taxRate: (Number.parseFloat(li.taxRate) || 0).toFixed(4) }
        : {}),
    }));

    try {
      const normalizedCurrency = (currency || orgCurrency || 'USD').trim().toUpperCase();
      const baseFields = {
        category: category.trim() || (isInvoice ? 'Sales Revenue' : 'Operating Expense'),
        ...(department.trim() ? { department: department.trim() } : {}),
        issueDate: new Date(issueDate).toISOString(),
        dueDate: new Date(dueDate).toISOString(),
        currency: normalizedCurrency,
        status: statusInput,
        taxRate: parsedTaxRate.toFixed(4),
        ...(usingLines
          ? { lineItems: dtoLineItems }
          : { totalAmount: Number.parseFloat(totalAmount).toFixed(4) }),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        sourceDocumentChecksum: extractionResult.fileMetadata.checksumSha256,
      };

      if (isInvoice) {
        await apiPost(`/v1/organizations/${orgId}/invoices`, {
          invoiceNumber: cleanNumber,
          customerName: cleanParty,
          ...(counterpartyEmail.trim() ? { customerEmail: counterpartyEmail.trim() } : {}),
          ...baseFields,
        });
      } else {
        await apiPost(`/v1/organizations/${orgId}/bills`, {
          billNumber: cleanNumber,
          supplierName: cleanParty,
          ...(counterpartyEmail.trim() ? { supplierEmail: counterpartyEmail.trim() } : {}),
          ...baseFields,
        });
      }

      resetModalState();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(`Failed to save ${entityLabel.toLowerCase()}. Please review your inputs.`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const currencyOptions = BASE_CURRENCIES.some((c) => c.value === currency)
    ? BASE_CURRENCIES
    : [{ value: currency, label: `${currency} — Detected Document Currency` }, ...BASE_CURRENCIES];

  const statusOptions = isInvoice
    ? [
        { value: InvoiceStatus.DRAFT, label: 'DRAFT (Review Before Issuing)' },
        { value: InvoiceStatus.ISSUED, label: 'ISSUED (Active Receivable)' },
      ]
    : [
        { value: BillStatus.DRAFT, label: 'DRAFT (Review Before Opening)' },
        { value: BillStatus.OPEN, label: 'OPEN (Active Payable)' },
      ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Import ${entityLabel}`} size="xl">
      <div className="space-y-5">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 text-xs"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/60 text-xs text-[var(--text-secondary)]">
              <Sparkles className="w-4 h-4 shrink-0 text-[var(--accent-teal)] mt-0.5" />
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  Preview-First Document Extraction
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  Uploads are inspected to extract fields and line items for your review. Nothing is
                  saved until you confirm.
                </p>
              </div>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--accent-teal)] rounded-2xl p-8 text-center transition-colors bg-[var(--surface-elevated)]/30"
            >
              <input
                ref={fileInputRef}
                type="file"
                aria-label={`Select ${entityLabel} Document`}
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={handleFileChange}
                className="hidden"
              />

              {isExtracting ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-teal)]" />
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Extracting "{selectedFile?.name}"...
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Reading document text, checking duplicates, and verifying totals.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="p-3 rounded-xl bg-[var(--accent-teal)]/10 text-[var(--accent-teal)]">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      Upload {entityLabel} Document
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Supported formats: <strong>PDF, JPG, JPEG, PNG</strong> (Maximum size: 10 MB)
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    Choose PDF or Image
                  </Button>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={isExtracting}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && extractionResult && (
          <form onSubmit={handleSaveConfirmedDocument} className="space-y-4">
            {/* Top File Bar + Single Document Verified Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/50 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono font-semibold text-[var(--text-primary)] truncate">
                  {extractionResult.fileMetadata.fileName}
                </span>
                {isDocumentVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                className="whitespace-nowrap shrink-0"
                onClick={() => {
                  setStep('upload');
                  setError(null);
                }}
              >
                Upload Different File
              </Button>
            </div>

            {/* Duplicate Warnings (Shown ONLY when an Invoice/Bill was actually saved before) */}
            {extractionResult.duplicateWarnings.hasPotentialDuplicate && (
              <div
                role="status"
                aria-label="Duplicate Document Detected"
                className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs space-y-1"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>Duplicate Document Detected</span>
                </div>
                <div className="space-y-1 text-[11px] pl-6">
                  {extractionResult.duplicateWarnings.matches.map((match, idx) => {
                    const docKind = isInvoice ? 'Invoice' : 'Bill';
                    const prettyStatus = match.status
                      ? ` (${match.status
                          .toLowerCase()
                          .split('_')
                          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                          .join(' ')})`
                      : '';
                    const numVal = match.totalAmount
                      ? Number.parseFloat(match.totalAmount)
                      : Number.NaN;
                    const matchCurr = (match.currency || currency || orgCurrency || '')
                      .trim()
                      .toUpperCase();
                    const hasFractional = !Number.isNaN(numVal) && Math.abs(numVal % 1) > 0.0001;
                    const formattedAmt = !Number.isNaN(numVal)
                      ? `${matchCurr ? `${matchCurr} ` : ''}${new Intl.NumberFormat('en-US', {
                          minimumFractionDigits: hasFractional ? 2 : 0,
                          maximumFractionDigits: 2,
                        }).format(numVal)}`
                      : '';

                    let messageText = match.reason;
                    if (match.matchType === 'FILE_CHECKSUM' && match.documentNumber) {
                      messageText = `This file is already saved as ${docKind} ${match.documentNumber}${prettyStatus}${formattedAmt ? ` for ${formattedAmt}` : ''}.`;
                    } else if (match.matchType === 'DOCUMENT_NUMBER' && match.documentNumber) {
                      messageText = `${docKind} ${match.documentNumber}${prettyStatus} already exists${formattedAmt ? ` for ${formattedAmt}` : ''}.`;
                    } else if (match.matchType === 'SIMILAR_RECORD' && match.documentNumber) {
                      messageText = `A similar ${docKind.toLowerCase()} (${match.documentNumber}${prettyStatus})${formattedAmt ? ` for ${formattedAmt}` : ''} already exists.`;
                    }

                    return <p key={`${match.recordId}-${idx}`}>{messageText}</p>;
                  })}
                </div>
              </div>
            )}

            {/* Actionable Warnings (if any) & Sanitization Alerts */}
            {(visibleWarnings.length > 0 || extractionResult.sanitizationFlags.length > 0) && (
              <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/40 text-[11px] text-[var(--text-secondary)] space-y-1">
                {visibleWarnings.map((warn, i) => (
                  <div key={`warn-${i}`} className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                    <span>{warn}</span>
                  </div>
                ))}
                {extractionResult.sanitizationFlags.length > 0 && (
                  <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      <strong>Security Sanitization Applied:</strong>{' '}
                      {extractionResult.sanitizationFlags.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Collapsible Extracted Text Preview */}
            <div className="text-xs">
              <button
                type="button"
                onClick={() => setShowRawText((prev) => !prev)}
                className="text-[11px] font-semibold text-[var(--accent-teal)] hover:underline cursor-pointer"
              >
                {showRawText ? 'Hide Extracted Raw Text Preview' : 'Show Extracted Raw Text Preview'}
              </button>
              {showRawText && (
                <pre className="mt-1.5 p-2.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto text-[var(--text-secondary)]">
                  {extractionResult.extractedTextPreview || '(Empty)'}
                </pre>
              )}
            </div>

            {/* Editable Extracted Fields: Valid fields stay clean; ONLY problematic fields show warning border & ! icon */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                id="docImportNumber"
                label={isInvoice ? 'Invoice Number *' : 'Bill Number *'}
                value={documentNumber}
                onChange={(e) => {
                  setDocumentNumber(e.target.value);
                  markEdited('documentNumber');
                }}
                placeholder={isInvoice ? 'e.g. INV-2026-1001' : 'e.g. BILL-2026-500'}
                hasWarning={Boolean(fieldIssues.documentNumber)}
                rightIcon={renderWarningIndicator(
                  fieldIssues.documentNumber,
                  isInvoice ? 'Invoice Number' : 'Bill Number',
                )}
                required
              />

              <Input
                id="docImportParty"
                label={isInvoice ? 'Customer Name *' : 'Supplier Name *'}
                value={counterpartyName}
                onChange={(e) => {
                  setCounterpartyName(e.target.value);
                  markEdited('counterpartyName');
                }}
                placeholder={isInvoice ? 'Customer company' : 'Supplier company'}
                hasWarning={Boolean(fieldIssues.counterpartyName)}
                rightIcon={renderWarningIndicator(
                  fieldIssues.counterpartyName,
                  isInvoice ? 'Customer Name' : 'Supplier Name',
                )}
                required
              />

              <Input
                id="docImportEmail"
                label={isInvoice ? 'Customer Email' : 'Supplier Email'}
                type="email"
                value={counterpartyEmail}
                onChange={(e) => {
                  setCounterpartyEmail(e.target.value);
                  markEdited('counterpartyEmail');
                }}
                placeholder="billing@company.com"
                hasWarning={Boolean(fieldIssues.counterpartyEmail)}
                rightIcon={renderWarningIndicator(
                  fieldIssues.counterpartyEmail,
                  isInvoice ? 'Customer Email' : 'Supplier Email',
                )}
              />

              <div className="grid grid-cols-2 gap-2">
                <Input
                  id="docImportCategory"
                  label="Category"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    markEdited('category');
                  }}
                  hasWarning={Boolean(fieldIssues.category)}
                  rightIcon={renderWarningIndicator(fieldIssues.category, 'Category')}
                />
                <Input
                  id="docImportDepartment"
                  label="Department"
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    markEdited('department');
                  }}
                  placeholder="Optional"
                />
              </div>

              <Input
                id="docImportIssueDate"
                label="Issue Date *"
                type="date"
                value={issueDate}
                onChange={(e) => {
                  setIssueDate(e.target.value);
                  markEdited('issueDate');
                }}
                hasWarning={Boolean(fieldIssues.issueDate)}
                rightIcon={renderWarningIndicator(fieldIssues.issueDate, 'Issue Date')}
                required
              />

              <Input
                id="docImportDueDate"
                label="Due Date *"
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  markEdited('dueDate');
                }}
                hasWarning={Boolean(fieldIssues.dueDate)}
                rightIcon={renderWarningIndicator(fieldIssues.dueDate, 'Due Date')}
                required
              />

              <Select
                id="docImportCurrency"
                label="Currency"
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  markEdited('currency');
                }}
                options={currencyOptions}
                hasWarning={Boolean(fieldIssues.currency)}
                rightIcon={renderWarningIndicator(fieldIssues.currency, 'Currency')}
              />

              <Select
                id="docImportStatus"
                label="Save As Status"
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value)}
                options={statusOptions}
              />

              <Input
                id="docImportTaxRate"
                label="Tax Rate (%)"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={taxRate}
                onChange={(e) => {
                  setTaxRate(e.target.value);
                  markEdited('taxRate');
                }}
                hasWarning={Boolean(fieldIssues.taxRate)}
                rightIcon={renderWarningIndicator(fieldIssues.taxRate, 'Tax Rate')}
              />

              <Input
                id="docImportTotalAmount"
                label={lineItems.length > 0 ? 'Computed Total Amount' : 'Total Amount *'}
                type="number"
                step="0.01"
                min="0.01"
                value={lineItems.length > 0 ? liveTotals.total.toFixed(2) : totalAmount}
                onChange={(e) => {
                  setTotalAmount(e.target.value);
                  markEdited('totalAmount');
                }}
                disabled={lineItems.length > 0}
                hasWarning={Boolean(fieldIssues.totalAmount)}
                rightIcon={renderWarningIndicator(fieldIssues.totalAmount, 'Total Amount')}
                required={lineItems.length === 0}
              />
            </div>

            {/* Editable Line Items with Muted Column Headers & Responsive Column Widths */}
            <div className="space-y-2.5 rounded-xl border border-[var(--border-subtle)] p-3 bg-[var(--surface-elevated)]/30">
              <div className="flex items-center justify-between gap-2">
                <span className={FORM_LABEL_CLASS}>
                  Extracted Line Items ({lineItems.length})
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  className="whitespace-nowrap shrink-0"
                  onClick={() =>
                    setLineItems((prev) => [
                      ...prev,
                      { description: '', quantity: '1', unitPrice: '0', taxRate: '' },
                    ])
                  }
                >
                  Add Item
                </Button>
              </div>

              {lineItems.length > 0 ? (
                <div className="space-y-1.5 max-h-56 overflow-y-auto overflow-x-hidden">
                  <div className="grid grid-cols-[minmax(0,1fr)_3.75rem_5.75rem_3.75rem_1.5rem] sm:grid-cols-[minmax(0,1fr)_4.25rem_6.75rem_4.25rem_1.75rem] gap-2 px-2 text-[11px] font-medium text-[var(--text-muted)]">
                    <span>Description</span>
                    <span>Qty</span>
                    <span>Unit Price</span>
                    <span>Tax %</span>
                    <span className="sr-only">Actions</span>
                  </div>
                  {lineItems.map((li, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[minmax(0,1fr)_3.75rem_5.75rem_3.75rem_1.5rem] sm:grid-cols-[minmax(0,1fr)_4.25rem_6.75rem_4.25rem_1.75rem] gap-2 items-center bg-[var(--surface-card)] p-2 rounded-lg border border-[var(--border-subtle)]"
                    >
                      <input
                        type="text"
                        aria-label={`Line item ${idx + 1} description`}
                        value={li.description}
                        onChange={(e) =>
                          setLineItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, description: e.target.value } : row,
                            ),
                          )
                        }
                        placeholder="Item description"
                        className="min-w-0 w-full px-2 py-1 text-xs rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)]"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        aria-label={`Line item ${idx + 1} quantity`}
                        value={li.quantity}
                        onChange={(e) =>
                          setLineItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, quantity: e.target.value } : row,
                            ),
                          )
                        }
                        placeholder="Qty"
                        className="min-w-0 w-full px-1.5 py-1 text-xs rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] font-mono"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`Line item ${idx + 1} unit price`}
                        value={li.unitPrice}
                        onChange={(e) =>
                          setLineItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, unitPrice: e.target.value } : row,
                            ),
                          )
                        }
                        placeholder="Unit Price"
                        className="min-w-0 w-full px-1.5 py-1 text-xs rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] font-mono"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        aria-label={`Line item ${idx + 1} tax rate`}
                        value={li.taxRate}
                        onChange={(e) =>
                          setLineItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, taxRate: e.target.value } : row,
                            ),
                          )
                        }
                        placeholder="Tax %"
                        className="min-w-0 w-full px-1.5 py-1 text-xs rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] font-mono"
                      />
                      <button
                        type="button"
                        aria-label={`Remove line item ${idx + 1}`}
                        onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="flex justify-center text-red-500 hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-col items-end gap-1 pt-2 border-t border-[var(--border-subtle)] font-mono">
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      Subtotal: {formatCurrency(liveTotals.subtotal, currency)}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      Tax: {formatCurrency(liveTotals.tax, currency)}
                    </div>
                    <div className="text-sm font-bold text-[var(--text-primary)] pt-1 border-t border-[var(--border-subtle)]">
                      Total: {formatCurrency(liveTotals.total, currency)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-[var(--text-muted)]">
                  No line items were detected in the document. Using header Total Amount &amp; Tax Rate
                  (or click + Add Item).
                </p>
              )}
            </div>

            <Input
              id="docImportNotes"
              label="Notes (Optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional reference or audit notes"
            />

            {/* Short Plain-Text Disclaimer Above Action Buttons */}
            <p className="text-[11px] text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)]">
              Saving creates only this {entityLabel.toLowerCase()} record and does not create ledger
              transactions, payment records, or account balance changes.
            </p>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSaving}
                disabled={isSavedDuplicate}
              >
                {isInvoice ? 'Save Invoice' : 'Save Bill'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
