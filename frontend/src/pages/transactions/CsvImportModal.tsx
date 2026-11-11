import { useRef, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { apiPost, ApiClientError } from '../../services/apiClient';
import type { FinancialAccount, ImportBatch } from '../../types/financial.types';

export interface AiMappingResponse {
  success: boolean;
  provider: string;
  externalCredentialsConfigured: boolean;
  workflowRunId: string;
  taskClassification: string;
  durationMs: number;
  analystResult: {
    detectedMappings: {
      dateColumn?: string | null;
      amountColumn?: string | null;
      descriptionColumn?: string | null;
      typeColumn?: string | null;
      categoryColumn?: string | null;
      counterpartyColumn?: string | null;
      departmentColumn?: string | null;
      referenceColumn?: string | null;
    };
    confidenceScores: Record<string, number>;
    fieldAnalysis: Record<string, string>;
    unmappedHeaders: string[];
    notes: string;
  };
  verifierResult: {
    isApproved: boolean;
    verifiedMappings: Record<string, string | null>;
    validationErrors: string[];
    confidenceScore: number;
    requiresManualReview: boolean;
    notes: string;
  };
}

type SupportedImportFormat = 'csv' | 'xlsx' | 'xls' | 'json';

function detectFileFormat(file: File): SupportedImportFormat | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') return 'csv';
  if (
    name.endsWith('.xlsx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'xlsx';
  }
  if (name.endsWith('.xls') || file.type === 'application/vnd.ms-excel') {
    return 'xls';
  }
  if (name.endsWith('.json') || file.type === 'application/json') {
    return 'json';
  }
  return null;
}

function jsonArrayToCsv(records: Record<string, unknown>[]): string {
  if (!records || records.length === 0) return '';
  const headers = Array.from(
    new Set(
      records.flatMap((item) =>
        item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item) : [],
      ),
    ),
  );
  if (headers.length === 0) return '';

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCell).join(','),
    ...records.map((r) => headers.map((h) => escapeCell(r[h])).join(',')),
  ];
  return lines.join('\n');
}

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: FinancialAccount[];
  orgId: string;
  onSuccess: () => void;
}

export function CsvImportModal({
  isOpen,
  onClose,
  accounts,
  orgId,
  onSuccess,
}: CsvImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
  const [fileName, setFileName] = useState('');
  const [fileFormat, setFileFormat] = useState<SupportedImportFormat | null>(null);
  const [csvContent, setCsvContent] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewSample, setPreviewSample] = useState<string[][]>([]);

  // Excel multi-sheet support
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');

  // Step 2 Mapping state
  const [dateColumn, setDateColumn] = useState('');
  const [amountColumn, setAmountColumn] = useState('');
  const [descriptionColumn, setDescriptionColumn] = useState('');
  const [typeColumn, setTypeColumn] = useState('');
  const [categoryColumn, setCategoryColumn] = useState('');
  const [counterpartyColumn, setCounterpartyColumn] = useState('');

  // Step 3 Validation & Preview Batch state
  const [createdBatch, setCreatedBatch] = useState<ImportBatch | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // AI Multi-Agent Orchestration state (Supervisor, Finance Data Analyst & Verifier AI)
  const [aiMappingResult, setAiMappingResult] = useState<AiMappingResponse | null>(null);
  const [isAiMappingLoading, setIsAiMappingLoading] = useState(false);
  const [aiMappingError, setAiMappingError] = useState<string | null>(null);

  // General loading & error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setStep(1);
    setFileName('');
    setFileFormat(null);
    setCsvContent('');
    setHeaders([]);
    setPreviewSample([]);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet('');
    setDateColumn('');
    setAmountColumn('');
    setDescriptionColumn('');
    setTypeColumn('');
    setCategoryColumn('');
    setCounterpartyColumn('');
    setCreatedBatch(null);
    setAiMappingResult(null);
    setIsAiMappingLoading(false);
    setAiMappingError(null);
    setError(null);
    setIsLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const triggerAiAutoMap = async (
    headersList: string[],
    sampleRowsList: string[][],
    targetFileName: string,
  ) => {
    if (!headersList || headersList.length === 0) return;

    setIsAiMappingLoading(true);
    setAiMappingError(null);

    try {
      const res = await apiPost<AiMappingResponse>(
        `/v1/organizations/${orgId}/csv-imports/auto-map`,
        {
          fileName: targetFileName || 'uploaded_statement.csv',
          headers: headersList,
          sampleRows: sampleRowsList,
        },
      );

      if (res && res.success) {
        setAiMappingResult(res);

        const mappings =
          res.verifierResult?.verifiedMappings || res.analystResult?.detectedMappings;
        if (mappings) {
          if (mappings.dateColumn) setDateColumn(mappings.dateColumn);
          if (mappings.amountColumn) setAmountColumn(mappings.amountColumn);
          if (mappings.descriptionColumn) setDescriptionColumn(mappings.descriptionColumn);
          if (mappings.typeColumn) setTypeColumn(mappings.typeColumn);
          if (mappings.categoryColumn) setCategoryColumn(mappings.categoryColumn);
          if (mappings.counterpartyColumn) setCounterpartyColumn(mappings.counterpartyColumn);
        }
      }
    } catch (err: unknown) {
      console.warn('AI column auto-mapping request encountered an error, falling back:', err);
      const detail = err instanceof ApiClientError && err.message ? ` (${err.message})` : '';
      setAiMappingError(
        `Supervisor AI Orchestrator could not complete automatic mapping${detail}. Manual selection enabled.`,
      );
    } finally {
      setIsAiMappingLoading(false);
    }
  };

  const processCsvText = (text: string, currentFileName?: string) => {
    setCsvContent(text);

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      setError('The selected file or worksheet must have at least one header row and one data row.');
      setHeaders([]);
      setPreviewSample([]);
      setAiMappingResult(null);
      return;
    }

    const parsedHeaders = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
    if (parsedHeaders.length === 0 || parsedHeaders.every((h) => !h)) {
      setError('The selected file or worksheet does not contain valid column headers.');
      setHeaders([]);
      setPreviewSample([]);
      setAiMappingResult(null);
      return;
    }

    setHeaders(parsedHeaders);

    const samples = lines
      .slice(1, 4)
      .map((l) => l.split(',').map((cell) => cell.trim().replace(/^["']|["']$/g, '')));
    setPreviewSample(samples);

    // Initial baseline heuristic while AI agent orchestration executes
    const lower = parsedHeaders.map((h) => h.toLowerCase());
    const findCol = (keys: string[]) =>
      parsedHeaders[lower.findIndex((h) => keys.some((k) => h.includes(k)))] || '';

    setDateColumn(findCol(['date', 'timestamp', 'time']));
    setAmountColumn(findCol(['amount', 'total', 'sum', 'value']));
    setDescriptionColumn(findCol(['desc', 'memo', 'narration', 'detail']));
    setTypeColumn(findCol(['type', 'direction', 'dr_cr']));
    setCategoryColumn(findCol(['cat', 'class']));
    setCounterpartyColumn(findCol(['payee', 'vendor', 'customer', 'counterparty', 'merchant']));

    // Extract up to 10 sample rows for backend AI Supervisor Orchestrator
    const extendedSampleRows = lines
      .slice(1, 11)
      .map((l) => l.split(',').map((cell) => cell.trim().replace(/^["']|["']$/g, '')));

    triggerAiAutoMap(
      parsedHeaders,
      extendedSampleRows,
      currentFileName || fileName || 'uploaded_statement.csv',
    );
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (!workbook) return;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      setError(`Worksheet "${sheetName}" was not found in the Excel workbook.`);
      return;
    }
    setError(null);
    const sheetCsv = XLSX.utils.sheet_to_csv(sheet);
    processCsvText(sheetCsv, `${fileName} [${sheetName}]`);
  };

  // Step 1: File selection & parsing for CSV, XLSX, XLS, and JSON
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so re-uploading the same file triggers onChange
    e.target.value = '';

    setError(null);

    const lowerName = file.name.toLowerCase();

    // Explicitly reject PDF files
    if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
      setError('PDF files are not supported. Please upload a CSV, XLSX, XLS, or JSON financial statement.');
      setFileName('');
      setFileFormat(null);
      setCsvContent('');
      setHeaders([]);
      setPreviewSample([]);
      setWorkbook(null);
      setSheetNames([]);
      setSelectedSheet('');
      return;
    }

    const detected = detectFileFormat(file);
    if (!detected) {
      setError('Unsupported file type. Please upload a CSV, XLSX, XLS, or JSON financial statement.');
      setFileName('');
      setFileFormat(null);
      setCsvContent('');
      setHeaders([]);
      setPreviewSample([]);
      setWorkbook(null);
      setSheetNames([]);
      setSelectedSheet('');
      return;
    }

    setFileName(file.name);
    setFileFormat(detected);

    if (detected === 'csv') {
      setWorkbook(null);
      setSheetNames([]);
      setSelectedSheet('');

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = (event.target?.result as string) || '';
          processCsvText(text, file.name);
        } catch {
          setError('Failed to parse CSV file content. Please check file formatting.');
          setHeaders([]);
          setPreviewSample([]);
        }
      };
      reader.onerror = () => {
        setError('Failed to read the selected CSV file. Please try again.');
      };
      reader.readAsText(file);
    } else if (detected === 'xlsx' || detected === 'xls') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
          if (!wb.SheetNames || wb.SheetNames.length === 0) {
            setError('The selected Excel workbook contains no worksheets.');
            setHeaders([]);
            setPreviewSample([]);
            return;
          }
          setWorkbook(wb);
          setSheetNames(wb.SheetNames);
          const initialSheet = wb.SheetNames[0];
          setSelectedSheet(initialSheet);

          const sheet = wb.Sheets[initialSheet];
          const sheetCsv = XLSX.utils.sheet_to_csv(sheet);
          processCsvText(sheetCsv, `${file.name} [${initialSheet}]`);
        } catch {
          setError('Failed to parse Excel workbook. Please verify the file is not corrupted.');
          setHeaders([]);
          setPreviewSample([]);
        }
      };
      reader.onerror = () => {
        setError('Failed to read the selected Excel file. Please try again.');
      };
      reader.readAsArrayBuffer(file);
    } else if (detected === 'json') {
      setWorkbook(null);
      setSheetNames([]);
      setSelectedSheet('');

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = (event.target?.result as string) || '';
          const parsed = JSON.parse(text);

          let records: Record<string, unknown>[] = [];
          if (Array.isArray(parsed)) {
            records = parsed;
          } else if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.transactions)) {
              records = parsed.transactions;
            } else if (Array.isArray(parsed.items)) {
              records = parsed.items;
            } else if (Array.isArray(parsed.records)) {
              records = parsed.records;
            } else if (Array.isArray(parsed.data)) {
              records = parsed.data;
            } else {
              records = [parsed];
            }
          }

          if (records.length === 0) {
            setError('The JSON file must contain an array of transaction records.');
            setHeaders([]);
            setPreviewSample([]);
            return;
          }

          const generatedCsv = jsonArrayToCsv(records);
          processCsvText(generatedCsv, file.name);
        } catch {
          setError('Failed to parse JSON file content. Ensure the file contains valid JSON formatted records.');
          setHeaders([]);
          setPreviewSample([]);
        }
      };
      reader.onerror = () => {
        setError('Failed to read the selected JSON file. Please try again.');
      };
      reader.readAsText(file);
    }
  };

  // Step 2 -> Step 3: Call preview API
  const handleGeneratePreview = async () => {
    if (!selectedAccountId) {
      setError('Please select a target financial account.');
      return;
    }
    if (!dateColumn || !amountColumn || !descriptionColumn) {
      setError('Date, Amount, and Description column mappings are strictly required.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const batch = await apiPost<ImportBatch>(`/v1/organizations/${orgId}/csv-imports/preview`, {
        accountId: selectedAccountId,
        fileName: fileName || 'uploaded_statement.csv',
        csvContent,
        columnMapping: {
          dateColumn,
          amountColumn,
          descriptionColumn,
          ...(typeColumn ? { typeColumn } : {}),
          ...(categoryColumn ? { categoryColumn } : {}),
          ...(counterpartyColumn ? { counterpartyColumn } : {}),
        },
      });

      setCreatedBatch(batch);
      setStep(3);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to validate CSV with server.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3 -> Step 4: Commit batch
  const handleCommitBatch = async () => {
    if (!createdBatch) return;

    setIsLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/organizations/${orgId}/csv-imports/${createdBatch.id}/confirm`, {
        skipDuplicates,
      });

      setStep(4);
      onSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to commit import batch to ledger.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderConfidenceBadge = (fieldKey: string) => {
    if (isAiMappingLoading) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin" />
          Profiling...
        </span>
      );
    }
    if (!aiMappingResult) return null;

    const score = aiMappingResult.analystResult?.confidenceScores?.[fieldKey] ?? 0;
    const mappings =
      aiMappingResult.verifierResult?.verifiedMappings ||
      aiMappingResult.analystResult?.detectedMappings;
    const mappedHeader = mappings?.[`${fieldKey}Column` as keyof typeof mappings];

    if (!mappedHeader || score === 0) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
          Unmapped
        </span>
      );
    }

    if (score >= 0.85) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          <Check className="w-2.5 h-2.5" />
          {Math.round(score * 100)}% Confidence
        </span>
      );
    }

    if (score >= 0.6) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
          <AlertTriangle className="w-2.5 h-2.5" />
          {Math.round(score * 100)}% Review Suggested
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
        Low Confidence ({Math.round(score * 100)}%)
      </span>
    );
  };

  const headerOptions = [
    { value: '', label: '— Do Not Map —' },
    ...headers.map((h) => ({ value: h, label: h })),
  ];

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.name} (${a.currency})`,
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="4-Step Financial File Import Wizard (CSV, Excel, JSON)"
      size="xl"
    >
      <div className="space-y-6">
        {/* Step Progression Bar */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4 text-xs font-medium">
          <div
            className={`flex items-center gap-1.5 ${
              step >= 1 ? 'text-[var(--accent-teal)] font-bold' : 'text-[var(--text-muted)]'
            }`}
          >
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">
              1
            </span>
            <span>Upload File</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <div
            className={`flex items-center gap-1.5 ${
              step >= 2 ? 'text-[var(--accent-teal)] font-bold' : 'text-[var(--text-muted)]'
            }`}
          >
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">
              2
            </span>
            <span>Column Mapping</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <div
            className={`flex items-center gap-1.5 ${
              step >= 3 ? 'text-[var(--accent-teal)] font-bold' : 'text-[var(--text-muted)]'
            }`}
          >
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">
              3
            </span>
            <span>Validation Preview</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <div
            className={`flex items-center gap-1.5 ${
              step >= 4 ? 'text-[var(--accent-teal)] font-bold' : 'text-[var(--text-muted)]'
            }`}
          >
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">
              4
            </span>
            <span>Committed</span>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Step 1: Upload File & Select Account */}
        {step === 1 && (
          <div className="space-y-4">
            <Select
              id="targetAccount"
              label="Destination Financial Account"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              options={accountOptions}
              helperText="The account whose balance will be updated by this imported batch"
            />

            <div className="border-2 border-dashed border-[var(--border-subtle)] rounded-2xl p-8 text-center bg-[var(--surface-canvas)]/50 hover:bg-[var(--surface-elevated)]/40 transition-colors">
              <FileSpreadsheet className="w-10 h-10 text-[var(--accent-teal)] mx-auto mb-3" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Select CSV, Excel (.xlsx, .xls), or JSON statement
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1 mb-2">
                Supported formats: CSV, XLSX, XLS, JSON (up to 5MB)
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mb-4">
                Note: PDF files are strictly not supported.
              </p>

              <div className="inline-flex flex-col items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/json"
                  onChange={handleFileUpload}
                  className="sr-only"
                  aria-label="Upload financial file"
                  data-testid="csv-file-input"
                />
                <Button
                  variant="primary"
                  size="md"
                  type="button"
                  onClick={handleBrowseClick}
                  className="cursor-pointer"
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  Browse Financial File
                </Button>
              </div>

              {fileName && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]">
                    <FileText className="w-3.5 h-3.5 text-[var(--accent-teal)]" />
                    <span className="font-medium">{fileName}</span>
                    {fileFormat && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] border border-[var(--accent-teal)]/20">
                        {fileFormat === 'xlsx' || fileFormat === 'xls'
                          ? `Excel (${fileFormat.toUpperCase()})`
                          : fileFormat.toUpperCase()}
                      </span>
                    )}
                    <span className="text-[var(--text-muted)]">({headers.length} columns)</span>
                  </div>
                </div>
              )}
            </div>

            {sheetNames.length > 1 && (
              <div className="p-4 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="worksheetSelect"
                    className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider"
                  >
                    Select Excel Worksheet
                  </label>
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">
                    {sheetNames.length} worksheets detected
                  </span>
                </div>
                <Select
                  id="worksheetSelect"
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  options={sheetNames.map((s) => ({ value: s, label: s }))}
                  helperText="Choose which worksheet to extract transactions from"
                />
              </div>
            )}

            {previewSample.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Raw File Header Preview
                </p>
                <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[var(--surface-elevated)] text-[var(--text-muted)]">
                      <tr>
                        {headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--surface-card)]">
                      {previewSample.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-3 py-1.5 text-[var(--text-secondary)]">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setStep(2)} disabled={headers.length === 0}>
                Continue to Column Mapping
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === 2 && (
          <div className="space-y-4">
            {/* AI Orchestration Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Step 2: AI Column Mapping & Ledger Schema Alignment
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Mappings identified by Finance Data Analyst and independently audited by Verifier AI. You may manually adjust any selection.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  if (headers.length > 0) {
                    const extendedRows = previewSample.length > 0 ? previewSample : [];
                    triggerAiAutoMap(headers, extendedRows, fileName || 'statement.csv');
                  }
                }}
                disabled={isAiMappingLoading || headers.length === 0}
                className="self-start sm:self-auto text-xs"
              >
                {isAiMappingLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Profiling...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 mr-1.5 text-[var(--accent-teal)]" />
                    Re-run AI Mapping
                  </>
                )}
              </Button>
            </div>

            {/* AI Loading Banner */}
            {isAiMappingLoading && (
              <div className="p-3.5 rounded-xl border border-[var(--accent-teal)]/30 bg-[var(--accent-teal)]/5 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[var(--accent-teal)] animate-spin flex-shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-[var(--text-primary)]">
                    Supervisor Orchestrator running Finance Data Analyst & Verifier AI...
                  </p>
                  <p className="text-[var(--text-muted)] mt-0.5">
                    Analyzing column semantics, inspecting representative sample rows, and enforcing required ledger guardrails.
                  </p>
                </div>
              </div>
            )}

            {/* AI Result Card */}
            {!isAiMappingLoading && aiMappingResult && (
              <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          AI Agent Auto-Mapping Active
                        </span>
                        {aiMappingResult.verifierResult?.isApproved ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            <ShieldCheck className="w-3 h-3" />
                            Verified by Verifier AI ({Math.round(aiMappingResult.verifierResult.confidenceScore * 100)}%)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            <AlertTriangle className="w-3 h-3" />
                            Review Required: Ambiguous or Missing Columns
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Supervisor Orchestrator &bull; Analyst: Finance Data Analyst &bull; Engine: {aiMappingResult.provider} {aiMappingResult.externalCredentialsConfigured ? '(External Model)' : '(Grounded Deterministic Engine)'} &bull; {aiMappingResult.durationMs}ms
                      </p>
                    </div>
                  </div>
                </div>

                {aiMappingResult.verifierResult?.validationErrors && aiMappingResult.verifierResult.validationErrors.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      Verifier AI Audit Notes:
                    </p>
                    <ul className="list-disc list-inside pl-1 space-y-0.5 text-[11px]">
                      {aiMappingResult.verifierResult.validationErrors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {aiMappingError && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{aiMappingError}</span>
              </div>
            )}

            {/* Mapping Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="dateCol"
                    className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase"
                  >
                    Transaction Date *
                  </label>
                  {renderConfidenceBadge('date')}
                </div>
                <Select
                  id="dateCol"
                  aria-label="Transaction Date *"
                  value={dateColumn}
                  onChange={(e) => setDateColumn(e.target.value)}
                  options={headerOptions}
                  helperText={
                    aiMappingResult?.analystResult?.fieldAnalysis?.date ||
                    'ISO-8601 or YYYY-MM-DD format'
                  }
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="amountCol"
                    className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase"
                  >
                    Amount *
                  </label>
                  {renderConfidenceBadge('amount')}
                </div>
                <Select
                  id="amountCol"
                  aria-label="Amount *"
                  value={amountColumn}
                  onChange={(e) => setAmountColumn(e.target.value)}
                  options={headerOptions}
                  helperText={
                    aiMappingResult?.analystResult?.fieldAnalysis?.amount ||
                    'Numeric amount (currency symbols stripped automatically)'
                  }
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="descCol"
                    className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase"
                  >
                    Description / Memo *
                  </label>
                  {renderConfidenceBadge('description')}
                </div>
                <Select
                  id="descCol"
                  aria-label="Description / Memo *"
                  value={descriptionColumn}
                  onChange={(e) => setDescriptionColumn(e.target.value)}
                  options={headerOptions}
                  helperText={
                    aiMappingResult?.analystResult?.fieldAnalysis?.description ||
                    'Primary journal line text'
                  }
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="typeCol"
                    className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase"
                  >
                    Transaction Type (Optional)
                  </label>
                  {renderConfidenceBadge('type')}
                </div>
                <Select
                  id="typeCol"
                  aria-label="Transaction Type (Optional)"
                  value={typeColumn}
                  onChange={(e) => setTypeColumn(e.target.value)}
                  options={headerOptions}
                  helperText={
                    aiMappingResult?.analystResult?.fieldAnalysis?.type ||
                    'INCOME, EXPENSE, or TRANSFER'
                  }
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="catCol"
                    className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase"
                  >
                    Category (Optional)
                  </label>
                  {renderConfidenceBadge('category')}
                </div>
                <Select
                  id="catCol"
                  aria-label="Category (Optional)"
                  value={categoryColumn}
                  onChange={(e) => setCategoryColumn(e.target.value)}
                  options={headerOptions}
                  helperText={
                    aiMappingResult?.analystResult?.fieldAnalysis?.category ||
                    'Chart of accounts classification'
                  }
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="counterpartyCol"
                    className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase"
                  >
                    Counterparty / Vendor (Optional)
                  </label>
                  {renderConfidenceBadge('counterparty')}
                </div>
                <Select
                  id="counterpartyCol"
                  aria-label="Counterparty / Vendor (Optional)"
                  value={counterpartyColumn}
                  onChange={(e) => setCounterpartyColumn(e.target.value)}
                  options={headerOptions}
                  helperText={
                    aiMappingResult?.analystResult?.fieldAnalysis?.counterparty ||
                    'Customer, vendor, or merchant name'
                  }
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-[var(--border-subtle)]">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={handleGeneratePreview}
                isLoading={isLoading}
                disabled={!dateColumn || !amountColumn || !descriptionColumn}
              >
                Validate & Preview Batch
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Validation Preview & Duplicate Review */}
        {step === 3 && createdBatch && (
          <div className="space-y-4">
            {/* KPI Validation Summary */}
            <div className="grid grid-cols-4 gap-3 text-center text-xs">
              <div className="p-3 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                  Total Rows
                </span>
                <span className="font-mono text-base font-bold text-[var(--text-primary)]">
                  {createdBatch.totalRows}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--surface-canvas)] border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                <span className="text-[10px] uppercase block opacity-80">Valid Rows</span>
                <span className="font-mono text-base font-bold">
                  {createdBatch.validRowsCount ?? createdBatch.validRows ?? 0}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--surface-canvas)] border border-amber-500/20 text-amber-700 dark:text-amber-400">
                <span className="text-[10px] uppercase block opacity-80">Duplicates</span>
                <span className="font-mono text-base font-bold">
                  {createdBatch.duplicateRowsCount ?? 0}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--surface-canvas)] border border-red-500/20 text-red-600 dark:text-red-400">
                <span className="text-[10px] uppercase block opacity-80">Invalid Rows</span>
                <span className="font-mono text-base font-bold">
                  {createdBatch.errorRowsCount ?? createdBatch.invalidRows ?? 0}
                </span>
              </div>
            </div>

            {/* Sanitization & Duplicate options */}
            {createdBatch.duplicateRowsCount > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="rounded border-[var(--border-subtle)] text-[var(--accent-teal)]"
                  />
                  <span>
                    Skip {createdBatch.duplicateRowsCount} duplicate records during commitment
                    (Recommended)
                  </span>
                </label>
              </div>
            )}

            {/* Row Errors (if any) */}
            {createdBatch.rowErrors && createdBatch.rowErrors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                  Row Validation Errors ({createdBatch.rowErrors.length})
                </p>
                <div className="max-h-36 overflow-y-auto space-y-1 text-xs">
                  {createdBatch.rowErrors.map((err, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 font-mono text-[11px]"
                    >
                      Row {err.rowNumber}:{' '}
                      {Array.isArray(err.errors)
                        ? err.errors.join('; ')
                        : err.reason || 'Validation error'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Valid Rows Preview Table */}
            {createdBatch.previewRows && createdBatch.previewRows.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Validated Preview Records (First {createdBatch.previewRows.length})
                </p>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--border-subtle)]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[var(--surface-elevated)] text-[var(--text-muted)] sticky top-0">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--surface-card)]">
                      {createdBatch.previewRows.map((r, i) => (
                        <tr key={i} className="hover:bg-[var(--surface-elevated)]/30">
                          <td className="px-3 py-2 whitespace-nowrap font-mono">
                            {(() => {
                              const rawDate = r.transactionDate || r.date;
                              if (!rawDate || typeof rawDate !== 'string') return '—';
                              return rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
                            })()}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[200px]">
                            {String(r.description || '—')}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {String(r.type || 'EXPENSE')}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">
                            {String(r.amount || '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(() => {
              const validCount = createdBatch.validRowsCount ?? createdBatch.validRows ?? 0;
              const duplicateCount = createdBatch.duplicateRowsCount ?? 0;
              const recordsToCommit = skipDuplicates
                ? Math.max(0, validCount - duplicateCount)
                : validCount;

              return (
                <div className="flex justify-between items-center pt-4 border-t border-[var(--border-subtle)]">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Back to Mapping
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleCommitBatch}
                    isLoading={isLoading}
                    disabled={validCount === 0}
                  >
                    Commit {recordsToCommit} Records to Ledger
                    <Check className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              );
            })()}
          </div>
        )}

        {/* Step 4: Success Confirmation */}
        {step === 4 && (
          <div className="py-8 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              Import Committed Successfully!
            </h3>
            <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
              All validated transaction records have been posted to the chart of accounts. Account
              balances and deterministic metrics have been updated.
            </p>
            <div className="pt-4">
              <Button variant="primary" onClick={handleClose}>
                Done & Return to Ledger
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
