import { useMemo, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
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
import { formatDate, formatReportText } from '../../utils/formatters';
import {
  getReportDataSources,
  getReportRecordCounts,
  getRiskSeverityCounts,
  getSourceReferenceLabel,
  formatSourceReferenceValues,
  resolveExecutiveBrief,
} from '../../utils/reportBriefAdapter';
import { buildExecutiveReportPdfBytes } from '../../utils/reportPdfGenerator';
import { ReportType, type ExecutiveBrief, type ReportRecord } from '../../types/reports.types';
import { DEFAULT_DEMO_ORG } from '../../config/demo.config';

const DEFAULT_REPORTS: ReportRecord[] = [
  {
    id: 'rep-001',
    organizationId: DEFAULT_DEMO_ORG.id,
    title: 'Executive Financial Health Summary - October 2026',
    reportType: ReportType.BUSINESS_HEALTH,
    generatedByUserId: 'demo-user-owner-001',
    summary: 'Cash runway healthy at 8.4 months; working capital positive at $385k.',
    sections: [
      {
        heading: 'Liquidity & Runway',
        content: 'Liquid cash reserves stand at $1,248,500 with unencumbered bank balances.',
        keyMetrics: { liquidCash: '1248500.00', runwayMonths: '8.4' },
      },
    ],
    sourceRecordIds: { metrics: ['operatingCashFlow', 'cashRunway'] },
    dataLimitations: [],
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'rep-002',
    organizationId: DEFAULT_DEMO_ORG.id,
    title: 'Working Capital & Liquidity Risk Report - Q3',
    reportType: ReportType.RISK,
    generatedByUserId: 'demo-user-owner-001',
    summary: 'AR overdue by $35k in 30+ day bucket. Recommended for AP follow up.',
    sections: [
      {
        heading: 'Aging Breakdown',
        content: 'Overdue receivables concentrated in Cascade Retail invoice.',
      },
    ],
    sourceRecordIds: { invoices: ['inv-842'] },
    dataLimitations: [],
    createdAt: '2026-10-15T00:00:00.000Z',
  },
];

function formatReportType(reportType: string): string {
  return reportType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ReportsPage() {
  const { activeOrg, isAuditor, canExportReports } = useAuth();
  const effectiveOrg = activeOrg || DEFAULT_DEMO_ORG;
  const activeOrgId = effectiveOrg.id;

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
  const [showSourceIds, setShowSourceIds] = useState(false);

  // Export State
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const inspectBrief = useMemo(
    () =>
      inspectReport
        ? resolveExecutiveBrief(inspectReport, effectiveOrg.baseCurrency || 'USD')
        : null,
    [inspectReport, effectiveOrg.baseCurrency],
  );
  const riskSeverityCounts = useMemo(
    () => (inspectBrief ? getRiskSeverityCounts(inspectBrief.risksAndAnomalies) : []),
    [inspectBrief],
  );
  const sourceRecordCounts = inspectBrief ? getReportRecordCounts(inspectBrief) : [];
  const reportDataSources = inspectBrief ? getReportDataSources(inspectBrief) : [];
  const hasRiskDistributionTable =
    inspectBrief?.tables.some((table) =>
      table.title.toLowerCase().includes('alert distribution by severity'),
    ) ?? false;
  const maxRiskSeverityCount = Math.max(1, ...riskSeverityCounts.map((item) => item.count));
  const hasSourceReferences = Object.values(inspectReport?.sourceRecordIds ?? {}).some(
    (ids) => Array.isArray(ids) && ids.length > 0,
  );
  const hasGroundingDetails = Boolean(
    inspectBrief &&
    (sourceRecordCounts.length > 0 ||
      reportDataSources.length > 0 ||
      inspectBrief.dataGrounding.missingInputs.length > 0 ||
      Boolean(inspectBrief.dataGrounding.methodologyNote.trim()) ||
      hasSourceReferences),
  );

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
        setReports((prev) => (prev.length > 0 ? prev : DEFAULT_REPORTS));
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to fetch reports from live API. Displaying verified demo baseline.');
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
      const created = await apiPost<ReportRecord>(`/v1/organizations/${activeOrgId}/reports`, {
        title: title.trim(),
        type: reportType,
      });
      setIsGenerateModalOpen(false);
      setTitle('');
      setShowSourceIds(false);
      if (created && created.id) {
        setInspectReport(created);
      }
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

  const handleExport = async (report: ReportRecord, format: 'PDF' | 'CSV' = 'PDF') => {
    if (isAuditor || !canExportReports) {
      setExportNotice(
        'Export Restricted for Auditor Role: Platform compliance policy prohibits unredacted report file downloads (HTTP 403 Forbidden). On-screen inspection is permitted.',
      );
      return;
    }

    setIsExporting(true);
    setExportNotice(null);
    try {
      if (format === 'CSV') {
        const res = await apiGet<{ content: string; fileName?: string }>(
          `/v1/organizations/${activeOrgId}/reports/${report.id}/export?format=CSV`,
        );
        const blob = new Blob([res.content ?? ''], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.fileName || `report-${report.id.slice(0, 8)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const res = await apiGet<{
          fileName?: string;
          documentStructure?: {
            executiveBrief?: ExecutiveBrief | null;
          };
        }>(`/v1/organizations/${activeOrgId}/reports/${report.id}/export?format=PDF`);
        const briefForPdf =
          res.documentStructure?.executiveBrief ??
          resolveExecutiveBrief(report, effectiveOrg.baseCurrency || 'USD');
        const pdfBytes = buildExecutiveReportPdfBytes(
          report,
          briefForPdf,
          effectiveOrg.name || 'Organization',
        );
        const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
        new Uint8Array(pdfBuffer).set(pdfBytes);
        const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          res.fileName ||
          `${(report.reportType || report.type || 'report').toLowerCase()}_${report.id.slice(0, 8)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setExportNotice(err.message);
      } else {
        setExportNotice(`Failed to download ${format} report export.`);
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <FileText className="w-6 h-6 text-[var(--accent-primary)]" />
            Financial reports
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Review financial performance, liquidity, and risk across your saved reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
              Create report
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
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Report archive</h2>
            <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
              {reports.length} {reports.length === 1 ? 'report' : 'reports'}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Saved reports with reporting periods, summaries, and source details.
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
            No financial reports yet. Create a report to review financial performance, liquidity,
            and risk in one place.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            <div
              aria-hidden="true"
              className="hidden xl:grid xl:grid-cols-[minmax(12rem,1.1fr)_7rem_minmax(15rem,1.8fr)_7rem_8.5rem] xl:items-center xl:gap-3 bg-[var(--surface-elevated)]/50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
            >
              <span>Report</span>
              <span>Type</span>
              <span>Summary</span>
              <span>Date</span>
              <span className="text-right">Actions</span>
            </div>
            {reports.map((report) => {
              const displayType = report.reportType || report.type || 'REPORT';
              const previewBrief = resolveExecutiveBrief(
                report,
                effectiveOrg.baseCurrency || 'USD',
              );
              const reportCurrency = previewBrief.dataGrounding.currency;
              const headlineSummary = formatReportText(
                report.summary || previewBrief.executiveSummary[0] || 'No summary provided.',
                reportCurrency,
              );

              return (
                <article
                  key={report.id}
                  className="grid grid-cols-1 gap-3 px-4 py-4 transition-colors hover:bg-[var(--surface-elevated)]/25 xl:grid-cols-[minmax(12rem,1.1fr)_7rem_minmax(15rem,1.8fr)_7rem_8.5rem] xl:items-center xl:gap-3"
                >
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold leading-snug text-[var(--text-primary)]">
                      {formatReportText(report.title, reportCurrency)}
                    </h3>
                    <span className="mt-2 inline-flex rounded-md bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--accent-primary)] xl:hidden">
                      {formatReportType(displayType)}
                    </span>
                  </div>
                  <span className="hidden rounded-md bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--accent-primary)] xl:inline-flex xl:w-fit">
                    {formatReportType(displayType)}
                  </span>
                  <p className="text-xs leading-relaxed text-[var(--text-secondary)] xl:line-clamp-2">
                    {headlineSummary}
                  </p>
                  <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums text-[var(--text-muted)] xl:block">
                    <span className="xl:hidden">Generated</span>
                    <time dateTime={report.createdAt}>{formatDate(report.createdAt)}</time>
                  </div>
                  <div className="flex items-center gap-2 xl:justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowSourceIds(false);
                        setInspectReport(report);
                      }}
                      className="h-8 px-2.5 text-xs"
                      title="View report details"
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      View
                    </Button>

                    <button
                      onClick={() => handleExport(report, 'PDF')}
                      disabled={isAuditor || !canExportReports || isExporting}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                        isAuditor || !canExportReports
                          ? 'cursor-not-allowed text-gray-400 bg-gray-100 dark:bg-gray-800 dark:text-gray-500'
                          : 'text-[var(--accent-primary)] hover:bg-[var(--surface-elevated)] cursor-pointer'
                      }`}
                      title={
                        isAuditor || !canExportReports
                          ? 'Report export is restricted for Auditor roles'
                          : 'Download PDF report'
                      }
                    >
                      {isAuditor ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Export
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Report View Drawer */}
      <Drawer
        isOpen={Boolean(inspectReport && inspectBrief)}
        onClose={() => {
          setInspectReport(null);
          setShowSourceIds(false);
        }}
        title={
          inspectReport && inspectBrief
            ? formatReportText(inspectReport.title, inspectBrief.dataGrounding.currency)
            : 'Executive Financial Brief'
        }
        subtitle={
          inspectBrief && inspectReport
            ? `Period: ${formatDate(inspectBrief.dataGrounding.reportingPeriodStart)} – ${formatDate(inspectBrief.dataGrounding.reportingPeriodEnd)} · Generated ${formatDate(inspectReport.createdAt)}`
            : undefined
        }
        headerBadge={
          inspectBrief && (
            <>
              <span className="inline-flex items-center rounded-md bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-primary)]">
                {formatReportType(inspectBrief.reportType)}
              </span>
              <span className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                {inspectBrief.dataGrounding.currency}
              </span>
            </>
          )
        }
        headerActions={
          inspectReport && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport(inspectReport, 'PDF')}
                disabled={isAuditor || !canExportReports || isExporting}
                title={
                  isAuditor || !canExportReports
                    ? 'Export is restricted for Auditor role'
                    : 'Export Executive PDF'
                }
                className="h-8 px-2.5 text-xs"
              >
                {isAuditor ? (
                  <Lock className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1" />
                )}
                Export PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleExport(inspectReport, 'CSV')}
                disabled={isAuditor || !canExportReports || isExporting}
                title={
                  isAuditor || !canExportReports
                    ? 'Export is restricted for Auditor role'
                    : 'Export Raw CSV'
                }
                className="h-8 px-2 text-xs text-[var(--text-secondary)]"
              >
                CSV
              </Button>
            </div>
          )
        }
        width="xl"
      >
        {inspectReport && inspectBrief && (
          <div className="space-y-7 text-xs text-[var(--text-primary)]">
            {/* 1. Executive Summary */}
            {inspectBrief.executiveSummary.length > 0 && (
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Executive summary
                </h3>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-4 space-y-2.5">
                  {inspectBrief.executiveSummary.map((sentence, idx) => (
                    <p key={idx} className="text-sm leading-relaxed text-[var(--text-secondary)]">
                      {sentence}
                    </p>
                  ))}
                </div>
              </section>
            )}

            {/* 2. Key Financial KPIs */}
            {inspectBrief.kpis.length > 0 && (
              <section className="space-y-3 border-t border-[var(--border-subtle)] pt-5">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Financial indicators
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {inspectBrief.kpis.map((kpi, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-4 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[var(--text-muted)]">
                          {kpi.label}
                        </span>
                        {kpi.status === 'MISSING_DATA' && (
                          <span className="rounded bg-[var(--status-warn-bg)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--status-warn-text)]">
                            Missing Data
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-0.5">
                        <span
                          className={`text-lg font-semibold tabular-nums tracking-tight ${
                            kpi.status === 'MISSING_DATA'
                              ? 'text-[var(--status-warn-text)]'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {kpi.value}
                        </span>
                        {kpi.secondaryValue && (
                          <span className="text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
                            {kpi.secondaryLabel ? `${kpi.secondaryLabel} ` : ''}
                            {kpi.secondaryValue}
                          </span>
                        )}
                      </div>
                      {kpi.subtext && (
                        <p className="text-xs text-[var(--text-muted)] leading-snug tabular-nums">
                          {kpi.subtext}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 3. Core Performance Breakdown */}
            {inspectBrief.tables.length > 0 && (
              <section className="space-y-4 border-t border-[var(--border-subtle)] pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                    Performance detail
                  </h3>
                </div>

                {inspectBrief.tables.map((table, tIdx) => (
                  <div
                    key={tIdx}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] overflow-hidden"
                  >
                    <div className="px-3.5 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 bg-[var(--surface-elevated)]/45">
                      <h4 className="text-xs font-bold text-[var(--text-primary)]">
                        {table.title}
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-[var(--surface-elevated)]/30 text-[10px] uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                          <tr>
                            {table.columns.map((col, cIdx) => (
                              <th
                                key={cIdx}
                                className={`py-2 px-3.5 font-semibold ${
                                  col.align === 'right'
                                    ? 'text-right'
                                    : col.align === 'center'
                                      ? 'text-center'
                                      : 'text-left'
                                }`}
                              >
                                {col.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {table.rows.map((row, rIdx) => {
                            const toneClass =
                              row.tone === 'danger'
                                ? 'text-[var(--status-err-text)]'
                                : row.tone === 'warning'
                                  ? 'text-[var(--status-warn-text)]'
                                  : row.tone === 'positive'
                                    ? 'text-[var(--status-ok-text)]'
                                    : 'text-[var(--text-primary)]';
                            return (
                              <tr
                                key={rIdx}
                                className={
                                  row.isTotal
                                    ? 'bg-[var(--surface-elevated)]/40 font-bold'
                                    : 'hover:bg-[var(--surface-elevated)]/20'
                                }
                              >
                                {row.cells.map((cell, cIdx) => {
                                  const col = table.columns[cIdx];
                                  return (
                                    <td
                                      key={cIdx}
                                      className={`py-2 px-3.5 ${
                                        col?.align === 'right'
                                          ? 'text-right'
                                          : col?.align === 'center'
                                            ? 'text-center'
                                            : 'text-left'
                                      } ${col?.isNumeric ? 'tabular-nums font-medium' : ''} ${
                                        cIdx === 0 && !row.isTotal
                                          ? 'text-[var(--text-secondary)] font-medium'
                                          : toneClass
                                      }`}
                                    >
                                      {cell}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {table.note && (
                      <div className="px-3.5 py-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                        {table.note}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {/* 4. Risk observations */}
            {inspectBrief.risksAndAnomalies.length > 0 && (
              <section className="space-y-3 border-t border-[var(--border-subtle)] pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Risk observations
                  </h3>
                </div>
                {!hasRiskDistributionTable && (
                  <div
                    role="img"
                    aria-label={`Risk observations by severity: ${riskSeverityCounts
                      .map(({ severity, count }) => `${severity.toLowerCase()} ${count}`)
                      .join(', ')}`}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-4"
                  >
                    <h4 className="mb-3 text-xs font-medium text-[var(--text-secondary)]">
                      Severity profile
                    </h4>
                    <div className="space-y-2.5">
                      {riskSeverityCounts.map(({ severity, count }) => {
                        const toneClass =
                          severity === 'CRITICAL' || severity === 'HIGH'
                            ? 'bg-[var(--status-err-text)]'
                            : severity === 'MEDIUM'
                              ? 'bg-[var(--status-warn-text)]'
                              : 'bg-[var(--status-ok-text)]';

                        return (
                          <div
                            key={severity}
                            className="grid grid-cols-[5.5rem_minmax(0,1fr)_2rem] items-center gap-3"
                          >
                            <span className="text-[11px] text-[var(--text-secondary)]">
                              {formatReportType(severity)}
                            </span>
                            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
                              <div
                                className={`h-full rounded-full ${toneClass}`}
                                style={{ width: `${(count / maxRiskSeverityCount) * 100}%` }}
                              />
                            </div>
                            <span className="text-right text-xs font-medium tabular-nums text-[var(--text-primary)]">
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <ul className="space-y-2">
                  {inspectBrief.risksAndAnomalies.map((risk, idx) => {
                    const isCritOrHigh = risk.severity === 'CRITICAL' || risk.severity === 'HIGH';
                    return (
                      <li
                        key={idx}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-4 flex items-start gap-3"
                      >
                        <span
                          className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            isCritOrHigh
                              ? 'bg-[var(--status-err-bg)] text-[var(--status-err-text)]'
                              : 'bg-[var(--status-warn-bg)] text-[var(--status-warn-text)]'
                          }`}
                        >
                          {risk.severity}
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-sm font-semibold text-[var(--text-primary)]">
                              {risk.title}
                            </span>
                            <span className="text-[11px] text-[var(--text-muted)]">
                              Source: {risk.sourceTag}
                            </span>
                          </div>
                          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                            {risk.detail}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* 5. Prioritized Action Plan */}
            {inspectBrief.prioritizedActionPlan.length > 0 && (
              <section className="space-y-3 border-t border-[var(--border-subtle)] pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Recommended actions
                  </h3>
                </div>
                <ol className="space-y-2">
                  {inspectBrief.prioritizedActionPlan.map((action) => (
                    <li
                      key={action.priority}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-4 flex items-start gap-3"
                    >
                      <span className="shrink-0 rounded-md bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-semibold text-[var(--accent-primary)] tabular-nums">
                        P{action.priority}
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            {action.title}
                          </span>
                          <span className="text-[10px] font-medium text-[var(--text-muted)]">
                            {action.targetArea} · {action.impact.toLowerCase()} impact
                          </span>
                        </div>
                        <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                          {action.rationale}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* 6. Sources and limitations */}
            {hasGroundingDetails && (
              <section className="border-t border-[var(--border-subtle)] pt-5">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Sources & limitations
                    </h3>
                  </div>

                  {sourceRecordCounts.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {sourceRecordCounts.map(({ label, count }) => (
                        <div
                          key={label}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2"
                        >
                          <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                          <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {reportDataSources.length > 0 && (
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                      <strong className="font-medium text-[var(--text-primary)]">Sources:</strong>{' '}
                      {reportDataSources.join(' · ')}
                    </p>
                  )}

                  {inspectBrief.dataGrounding.missingInputs.length > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-[var(--status-warn-bg)]/60 p-2.5 space-y-1">
                      {inspectBrief.dataGrounding.missingInputs.map((lim, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-1.5 text-xs leading-relaxed text-[var(--status-warn-text)]"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{lim}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {(inspectBrief.dataGrounding.methodologyNote || hasSourceReferences) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]">
                      {inspectBrief.dataGrounding.methodologyNote && (
                        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed max-w-lg">
                          {inspectBrief.dataGrounding.methodologyNote}
                        </p>
                      )}
                      {hasSourceReferences && (
                        <button
                          type="button"
                          onClick={() => setShowSourceIds((prev) => !prev)}
                          aria-expanded={showSourceIds}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
                        >
                          {showSourceIds ? (
                            <>
                              Hide Source IDs
                              <ChevronUp className="h-3.5 w-3.5" />
                            </>
                          ) : (
                            <>
                              View Source IDs
                              <ChevronDown className="h-3.5 w-3.5" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {showSourceIds && (
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 space-y-1 text-[10px] text-[var(--text-muted)] font-mono">
                      {Object.entries(inspectReport.sourceRecordIds ?? {})
                        .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
                        .map(([key, ids]) => (
                          <div key={key} className="break-all">
                            <span className="font-semibold text-[var(--text-secondary)]">
                              {getSourceReferenceLabel(key)}:
                            </span>{' '}
                            {formatSourceReferenceValues(key, ids).join(', ')}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </Drawer>

      {/* Generate Report Modal */}
      {isGenerateModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsGenerateModalOpen(false)}
          title="Create financial report"
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
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-2 text-xs font-semibold"
              >
                <option value={ReportType.BUSINESS_HEALTH}>Business health</option>
                <option value={ReportType.CASH_FLOW}>Cash flow</option>
                <option value={ReportType.EXPENSE}>Expenses</option>
                <option value={ReportType.BUDGET}>Budget performance</option>
                <option value={ReportType.RISK}>Risk</option>
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
                Create report
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
