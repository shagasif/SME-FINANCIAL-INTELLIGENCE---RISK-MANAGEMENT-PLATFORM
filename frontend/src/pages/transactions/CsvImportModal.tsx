import { useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Upload,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { apiPost, ApiClientError } from '../../services/apiClient';
import type { FinancialAccount, ImportBatch } from '../../types/financial.types';

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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
  const [fileName, setFileName] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewSample, setPreviewSample] = useState<string[][]>([]);

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

  // General loading & error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setStep(1);
    setFileName('');
    setCsvContent('');
    setHeaders([]);
    setPreviewSample([]);
    setDateColumn('');
    setAmountColumn('');
    setDescriptionColumn('');
    setTypeColumn('');
    setCategoryColumn('');
    setCounterpartyColumn('');
    setCreatedBatch(null);
    setError(null);
    setIsLoading(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Step 1: File selection & parsing
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      setCsvContent(text);

      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        setError('The selected CSV file must have at least one header row and one data row.');
        return;
      }

      const parsedHeaders = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
      setHeaders(parsedHeaders);

      const samples = lines
        .slice(1, 4)
        .map((l) => l.split(',').map((cell) => cell.trim().replace(/^["']|["']$/g, '')));
      setPreviewSample(samples);

      // Auto-detect columns intelligently
      const lower = parsedHeaders.map((h) => h.toLowerCase());
      const findCol = (keys: string[]) =>
        parsedHeaders[lower.findIndex((h) => keys.some((k) => h.includes(k)))] || '';

      setDateColumn(findCol(['date', 'timestamp', 'time']));
      setAmountColumn(findCol(['amount', 'total', 'sum', 'value']));
      setDescriptionColumn(findCol(['desc', 'memo', 'narration', 'detail']));
      setTypeColumn(findCol(['type', 'direction', 'dr_cr']));
      setCategoryColumn(findCol(['cat', 'class']));
      setCounterpartyColumn(findCol(['payee', 'vendor', 'customer', 'counterparty', 'merchant']));
    };

    reader.onerror = () => {
      setError('Failed to read the selected file.');
    };

    reader.readAsText(file);
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
      title="4-Step CSV Financial Import Wizard"
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
                Select CSV bank or ledger statement
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">
                Supports UTF-8 encoded files with header row (up to 2MB)
              </p>

              <label className="inline-flex">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
                <Button variant="primary" size="md" type="button" className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-1.5" />
                  Browse CSV File
                </Button>
              </label>

              {fileName && (
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]">
                  <FileText className="w-3.5 h-3.5 text-[var(--accent-teal)]" />
                  <span className="font-medium">{fileName}</span>
                  <span className="text-[var(--text-muted)]">({headers.length} columns)</span>
                </div>
              )}
            </div>

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
            <p className="text-xs text-[var(--text-secondary)]">
              Map your CSV columns to the platform ledger schema. Date, Amount, and Description are
              required.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                id="dateCol"
                label="Transaction Date *"
                value={dateColumn}
                onChange={(e) => setDateColumn(e.target.value)}
                options={headerOptions}
                helperText="ISO-8601 or YYYY-MM-DD format"
              />

              <Select
                id="amountCol"
                label="Amount *"
                value={amountColumn}
                onChange={(e) => setAmountColumn(e.target.value)}
                options={headerOptions}
                helperText="Numeric amount (currency symbols stripped automatically)"
              />

              <Select
                id="descCol"
                label="Description / Memo *"
                value={descriptionColumn}
                onChange={(e) => setDescriptionColumn(e.target.value)}
                options={headerOptions}
                helperText="Primary journal line text"
              />

              <Select
                id="typeCol"
                label="Transaction Type (Optional)"
                value={typeColumn}
                onChange={(e) => setTypeColumn(e.target.value)}
                options={headerOptions}
                helperText="INCOME, EXPENSE, or TRANSFER"
              />

              <Select
                id="catCol"
                label="Category (Optional)"
                value={categoryColumn}
                onChange={(e) => setCategoryColumn(e.target.value)}
                options={headerOptions}
                helperText="Chart of accounts classification"
              />

              <Select
                id="counterpartyCol"
                label="Counterparty / Vendor (Optional)"
                value={counterpartyColumn}
                onChange={(e) => setCounterpartyColumn(e.target.value)}
                options={headerOptions}
                helperText="Customer, vendor, or merchant name"
              />
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
                <span className="font-mono text-base font-bold">{createdBatch.validRows}</span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--surface-canvas)] border border-amber-500/20 text-amber-700 dark:text-amber-400">
                <span className="text-[10px] uppercase block opacity-80">Duplicates</span>
                <span className="font-mono text-base font-bold">
                  {createdBatch.duplicateRowsCount}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--surface-canvas)] border border-red-500/20 text-red-600 dark:text-red-400">
                <span className="text-[10px] uppercase block opacity-80">Invalid Rows</span>
                <span className="font-mono text-base font-bold">{createdBatch.invalidRows}</span>
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
                      Row {err.rowNumber}: {err.reason}
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
                            {String(r.date || '—')}
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

            <div className="flex justify-between items-center pt-4 border-t border-[var(--border-subtle)]">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back to Mapping
              </Button>
              <Button
                variant="primary"
                onClick={handleCommitBatch}
                isLoading={isLoading}
                disabled={createdBatch.validRows === 0}
              >
                Commit{' '}
                {skipDuplicates
                  ? createdBatch.validRows - createdBatch.duplicateRowsCount
                  : createdBatch.validRows}{' '}
                Records to Ledger
                <Check className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
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
