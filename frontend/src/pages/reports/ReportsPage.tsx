import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Lock,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Drawer } from '../../components/ui/Drawer';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatDate } from '../../utils/formatters';
import { ReportType, type ReportRecord } from '../../types/reports.types';

export function ReportsPage() {
  const { activeOrg, isAuditor, canExportReports } = useAuth();
  const activeOrgId = activeOrg?.id;

  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Generate Report Modal
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [reportType, setReportType] = useState<ReportType>(ReportType.BUSINESS_HEALTH);
  const [isGenerating, setIsGenerating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Report View Drawer
  const [inspectReport, setInspectReport] = useState<ReportRecord | null>(null);

  // Export State
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOrgId) return;

    let isMounted = true;
    apiGet<ReportRecord[]>(`/v1/organizations/${activeOrgId}/reports`)
      .then((res) => {
        if (!isMounted) return;
        const list = Array.isArray(res)
          ? res
          : (res as unknown as { items?: ReportRecord[]; data?: ReportRecord[] })?.items ||
            (res as unknown as { items?: ReportRecord[]; data?: ReportRecord[] })?.data ||
            [];
        setReports(list);
        setError(null);
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to fetch financial reports.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, reloadKey]);

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || !title.trim()) return;

    setIsGenerating(true);
    setModalError(null);

    try {
      await apiPost(`/v1/organizations/${activeOrgId}/reports`, {
        title: title.trim(),
        reportType,
      });
      setIsGenerateModalOpen(false);
      setTitle('');
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError('Failed to generate report.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async (reportId: string, format: 'json' | 'csv' = 'json') => {
    if (isAuditor || !canExportReports) {
      setExportNotice(
        'Export Restricted for Auditor Role: Platform compliance policy prohibits unredacted report file downloads (HTTP 403 Forbidden). On-screen inspection is permitted.',
      );
      return;
    }

    try {
      const data = await apiGet<unknown>(
        `/v1/organizations/${activeOrgId}/reports/${reportId}/export?format=${format}`,
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: format === 'json' ? 'application/json' : 'text/csv',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${reportId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setExportNotice(err.message);
      } else {
        setExportNotice('Failed to download report export.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <FileText className="w-6 h-6 text-[var(--brand-primary)]" />
            Financial Reports & Executive Dossiers
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Grounded executive summaries, cash flow statements, and RBAC-enforced compliance
            exports.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoading}
            title="Refresh reports"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          {!isAuditor && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setModalError(null);
                setIsGenerateModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Generate Report
            </Button>
          )}
        </div>
      </div>

      {/* Auditor Notice Banner */}
      {isAuditor && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs"
        >
          <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <span className="font-semibold block">Auditor Mode: Export Download Lock Enforced</span>
            <span className="leading-relaxed opacity-90">
              Pursuant to regulatory separation-of-duties guidelines, Auditor users can perform
              complete on-screen examination of report sections and citations. Raw CSV/JSON file
              exports and generating new reports are strictly blocked (HTTP 403 Forbidden).
            </span>
          </div>
        </div>
      )}

      {exportNotice && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{exportNotice}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Reports Table */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Report Archive ({reports.length} Generated Reports)
          </h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            All reports include auditable transaction citations and data limitation disclosures
          </p>
        </div>

        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : reports.length === 0 ? (
          <div className="py-16 text-center text-xs text-[var(--text-muted)]">
            <FileSpreadsheet className="mx-auto h-8 w-8 text-[var(--text-muted)] opacity-50 mb-2" />
            No financial reports generated yet. Click Generate Report to create your first executive
            dossier.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Report Title</th>
                  <th className="py-3 px-4 font-semibold">Report Type</th>
                  <th className="py-3 px-4 font-semibold">Executive Summary</th>
                  <th className="py-3 px-4 font-semibold text-right">Generated At</th>
                  <th className="py-3 px-4 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                {reports.map((report) => (
                  <tr
                    key={report.id}
                    className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                      {report.title}
                    </td>
                    <td className="py-3 px-4">
                      <span className="rounded bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--brand-primary)]">
                        {report.reportType}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-sm text-[var(--text-secondary)] line-clamp-1">
                      {report.summary}
                    </td>
                    <td className="py-3 px-4 text-right text-[11px] text-[var(--text-muted)]">
                      {formatDate(report.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInspectReport(report)}
                          className="h-7 px-2 text-[11px] flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </Button>

                        <button
                          onClick={() => handleExport(report.id, 'json')}
                          disabled={isAuditor || !canExportReports}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            isAuditor || !canExportReports
                              ? 'cursor-not-allowed text-gray-400 bg-gray-100 dark:bg-gray-800 dark:text-gray-500'
                              : 'text-[var(--brand-primary)] hover:bg-[var(--surface-hover)]'
                          }`}
                          title={
                            isAuditor || !canExportReports
                              ? 'Report export is restricted for Auditor roles'
                              : 'Download JSON Export'
                          }
                        >
                          {isAuditor ? (
                            <Lock className="h-3 w-3" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                          Export
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Report View Drawer */}
      <Drawer
        isOpen={Boolean(inspectReport)}
        onClose={() => setInspectReport(null)}
        title={inspectReport?.title || 'Report Inspection'}
        width="lg"
      >
        {inspectReport && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--brand-primary)]">
                  Report Type
                </span>
                <div className="font-semibold text-sm text-[var(--text-primary)] mt-0.5">
                  {inspectReport.reportType}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
                  Generated
                </span>
                <div className="font-mono text-xs text-[var(--text-secondary)] mt-0.5">
                  {formatDate(inspectReport.createdAt)}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="font-bold text-[var(--text-primary)]">Executive Summary:</span>
              <p className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                {inspectReport.summary}
              </p>
            </div>

            {inspectReport.sections?.map((sec, idx) => (
              <div key={idx} className="space-y-1 border-t border-[var(--border-subtle)] pt-3">
                <h3 className="font-bold text-sm text-[var(--text-primary)]">{sec.heading}</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {sec.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      {/* Generate Report Modal */}
      {isGenerateModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsGenerateModalOpen(false)}
          title="Generate Financial Report"
        >
          <form onSubmit={handleGenerateReport} className="space-y-4 text-xs">
            {modalError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-600 dark:text-rose-400">
                {modalError}
              </div>
            )}

            <Input
              id="reportTitle"
              label="Report Title *"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. FY2026 Q1 Executive Financial Dossier"
              required
            />

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Report Type *
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 text-xs font-semibold"
              >
                <option value={ReportType.BUSINESS_HEALTH}>
                  BUSINESS_HEALTH (Comprehensive SME Scorecard)
                </option>
                <option value={ReportType.CASH_FLOW}>CASH_FLOW (7-90 Day Horizon Analysis)</option>
                <option value={ReportType.EXPENSE}>EXPENSE (Operating Cost & Burn Audit)</option>
                <option value={ReportType.BUDGET}>BUDGET (Allocated vs Actual Spending)</option>
                <option value={ReportType.RISK}>RISK (Statistical Anomaly Digest)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button variant="ghost" type="button" onClick={() => setIsGenerateModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={isGenerating}
                disabled={!title.trim()}
              >
                Compile Report
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
