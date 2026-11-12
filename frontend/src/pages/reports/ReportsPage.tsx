import { useMemo, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Lock,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Drawer } from '../../components/ui/Drawer';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatDate } from '../../utils/formatters';
import { resolveExecutiveBrief } from '../../utils/reportBriefAdapter';
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
                {reports.map((report) => {
                  const displayType = report.reportType || report.type || 'REPORT';
                  const previewBrief = resolveExecutiveBrief(
                    report,
                    effectiveOrg.baseCurrency || 'USD',
                  );
                  const headlineSummary =
                    report.summary ||
                    previewBrief.executiveSummary[0] ||
                    'Generated from authoritative ledger records';

                  return (
                    <tr
                      key={report.id}
                      className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                        {report.title}
                      </td>
                      <td className="py-3 px-4">
                        <span className="rounded bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent-primary)]">
                          {displayType}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-sm text-[var(--text-secondary)] line-clamp-1">
                        {headlineSummary}
                      </td>
                    <td className="py-3 px-4 text-right text-[11px] text-[var(--text-muted)] tabular-nums">
                      {formatDate(report.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowSourceIds(false);
                            setInspectReport(report);
                          }}
                          className="h-7 px-2 text-[11px] flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </Button>

                        <button
                          onClick={() => handleExport(report, 'PDF')}
                          disabled={isAuditor || !canExportReports || isExporting}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            isAuditor || !canExportReports
                              ? 'cursor-not-allowed text-gray-400 bg-gray-100 dark:bg-gray-800 dark:text-gray-500'
                              : 'text-[var(--accent-primary)] hover:bg-[var(--surface-elevated)] cursor-pointer'
                          }`}
                          title={
                            isAuditor || !canExportReports
                              ? 'Report export is restricted for Auditor roles'
                              : 'Download Executive PDF Brief'
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
                  );
                })}
              </tbody>
            </table>
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
        title={inspectReport?.title || 'Executive Financial Brief'}
        subtitle={
          inspectBrief && inspectReport
            ? `Period: ${formatDate(inspectBrief.dataGrounding.reportingPeriodStart)} – ${formatDate(inspectBrief.dataGrounding.reportingPeriodEnd)} · Generated ${formatDate(inspectReport.createdAt)}`
            : undefined
        }
        headerBadge={
          inspectBrief && (
            <>
              <span className="inline-flex items-center rounded-md bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                {inspectBrief.reportType.replace(/_/g, ' ')}
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
          <div className="space-y-6 text-xs text-[var(--text-primary)]">
            {/* 1. Executive Summary */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                  Executive Summary
                </h3>
                <span className="text-[10px] font-medium text-[var(--text-muted)]">
                  Grounded Financial Brief
                </span>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-4 space-y-2">
                {inspectBrief.executiveSummary.map((sentence, idx) => (
                  <p
                    key={idx}
                    className="text-[13px] leading-relaxed text-[var(--text-secondary)]"
                  >
                    {sentence}
                  </p>
                ))}
              </div>
            </section>

            {/* 2. Key Financial KPIs */}
            {inspectBrief.kpis.length > 0 && (
              <section className="space-y-3 border-t border-[var(--border-subtle)] pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                    Key Financial KPIs
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--status-ok-text)]">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified Ledger
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {inspectBrief.kpis.map((kpi, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-3.5 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
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
                          className={`text-base font-bold tabular-nums tracking-tight ${
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
                        <p className="text-[11px] text-[var(--text-muted)] leading-snug tabular-nums">
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
                    Core Performance Breakdown
                  </h3>
                  <span className="text-[10px] font-medium text-[var(--text-muted)]">
                    Verified Calculations ({inspectBrief.dataGrounding.currency})
                  </span>
                </div>

                {inspectBrief.tables.map((table, tIdx) => (
                  <div
                    key={tIdx}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] overflow-hidden"
                  >
                    <div className="px-3.5 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 bg-[var(--surface-elevated)]/45">
                      <h4 className="text-xs font-bold text-[var(--text-primary)]">{table.title}</h4>
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

            {/* 4. Key Risks & Anomalies (Omitted cleanly when zero issues exist) */}
            {inspectBrief.risksAndAnomalies.length > 0 && (
              <section className="space-y-3 border-t border-[var(--border-subtle)] pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                    Key Risks & Anomalies
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--status-warn-text)]">
                    <ShieldAlert className="h-3 w-3" />
                    {inspectBrief.risksAndAnomalies.length} Detected Signal(s)
                  </span>
                </div>
                <ul className="space-y-2">
                  {inspectBrief.risksAndAnomalies.map((risk, idx) => {
                    const isCritOrHigh = risk.severity === 'CRITICAL' || risk.severity === 'HIGH';
                    return (
                      <li
                        key={idx}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-3 flex items-start gap-2.5"
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
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[var(--text-primary)]">
                              {risk.title}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">
                              · {risk.sourceTag}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
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
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                    Prioritized Action Plan
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                    <Sparkles className="h-3 w-3 text-[var(--accent-amber)]" />
                    AI Advisory (Grounded)
                  </span>
                </div>
                <ol className="space-y-2">
                  {inspectBrief.prioritizedActionPlan.map((action) => (
                    <li
                      key={action.priority}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-3 flex items-start gap-3"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[10px] font-bold text-white tabular-nums">
                        {action.priority}
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {action.title}
                          </span>
                          <span className="text-[10px] font-medium text-[var(--text-muted)]">
                            {action.targetArea} · {action.impact} Impact
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                          {action.rationale}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* 6. Data Grounding & Limitations Footer */}
            <section className="border-t border-[var(--border-subtle)] pt-5">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Data Grounding & Limitations
                  </h3>
                  <span className="text-[10px] font-medium text-[var(--text-muted)] tabular-nums">
                    {inspectBrief.dataGrounding.currency} ·{' '}
                    {formatDate(inspectBrief.dataGrounding.reportingPeriodStart)} –{' '}
                    {formatDate(inspectBrief.dataGrounding.reportingPeriodEnd)}
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                  {(
                    [
                      ['Accounts', inspectBrief.dataGrounding.recordCounts.accounts],
                      ['Transactions', inspectBrief.dataGrounding.recordCounts.transactions],
                      ['Invoices', inspectBrief.dataGrounding.recordCounts.invoices],
                      ['Bills', inspectBrief.dataGrounding.recordCounts.bills],
                      ['Budgets', inspectBrief.dataGrounding.recordCounts.budgets],
                      ['Alerts', inspectBrief.dataGrounding.recordCounts.riskAlerts],
                    ] as const
                  ).map(([label, count]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 py-1.5"
                    >
                      <div className="text-xs font-bold text-[var(--text-primary)] tabular-nums">
                        {count}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
                    </div>
                  ))}
                </div>

                {inspectBrief.dataGrounding.dataSources.length > 0 && (
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    <strong className="text-[var(--text-primary)]">Sources:</strong>{' '}
                    {inspectBrief.dataGrounding.dataSources.join(' · ')}
                  </p>
                )}

                {inspectBrief.dataGrounding.missingInputs.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-[var(--status-warn-bg)]/60 p-2.5 space-y-1">
                    {inspectBrief.dataGrounding.missingInputs.map((lim, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-1.5 text-[11px] text-[var(--status-warn-text)]"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{lim}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]">
                  <p className="text-[10px] text-[var(--text-muted)] leading-snug max-w-lg">
                    {inspectBrief.dataGrounding.methodologyNote}
                  </p>
                  {Object.values(inspectReport.sourceRecordIds ?? {}).some(
                    (ids) => Array.isArray(ids) && ids.length > 0,
                  ) && (
                    <button
                      type="button"
                      onClick={() => setShowSourceIds((prev) => !prev)}
                      aria-expanded={showSourceIds}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
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

                {showSourceIds && (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 space-y-1 text-[10px] text-[var(--text-muted)] font-mono">
                    {Object.entries(inspectReport.sourceRecordIds ?? {})
                      .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
                      .map(([key, ids]) => (
                        <div key={key} className="break-all">
                          <span className="font-semibold text-[var(--text-secondary)]">{key}:</span>{' '}
                          {ids.join(', ')}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </section>
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
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-2 text-xs font-semibold"
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
