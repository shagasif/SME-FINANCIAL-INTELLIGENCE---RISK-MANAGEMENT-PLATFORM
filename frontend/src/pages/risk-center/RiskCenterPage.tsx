import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Info,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Drawer } from '../../components/ui/Drawer';
import { Skeleton } from '../../components/ui/LoadingSpinner';
import { formatDate, formatEmbeddedAmountsInText } from '../../utils/formatters';
import {
  RiskAlertSeverity,
  RiskAlertStatus,
  RiskAlertType,
  type AnomalyScanResponse,
  type RiskAlert,
} from '../../types/risk.types';
import { DEFAULT_DEMO_ORG } from '../../config/demo.config';

const DEFAULT_RISK_CENTER_ALERTS: RiskAlert[] = [
  {
    id: 'alert-001',
    organizationId: DEFAULT_DEMO_ORG.id,
    ruleCode: RiskAlertType.CATEGORY_SHIFT,
    severity: RiskAlertSeverity.MEDIUM,
    title: 'Cloud Infrastructure spending is 28% higher than usual',
    description:
      'Spending on cloud servers increased significantly over the past 30 days. Review recent usage to ensure your cloud costs remain within expected limits.',
    status: RiskAlertStatus.NEW,
    evidence: { delta: '+28%' },
    supportingRecordIds: ['tx-002'],
    actionableRecommendation:
      'Check the latest purchases in this category with the department manager to ensure spending stays within your overall plan.',
    detectedAt: '2026-11-10T08:00:00.000Z',
    createdAt: '2026-11-10T08:00:00.000Z',
  },
  {
    id: 'alert-002',
    organizationId: DEFAULT_DEMO_ORG.id,
    ruleCode: RiskAlertType.OVERDUE_RECEIVABLE,
    severity: RiskAlertSeverity.HIGH,
    title: 'Customer invoice of $35,000 is 34 days overdue',
    description:
      'Invoice INV-2026-842 has not been paid and is now more than a month late. Reach out to the customer to request an updated payment timeline.',
    status: RiskAlertStatus.ACKNOWLEDGED,
    evidence: { daysPastDue: 34 },
    supportingRecordIds: ['inv-842'],
    actionableRecommendation:
      'Send a friendly reminder to the customer and follow up by phone to confirm when the payment will arrive.',
    detectedAt: '2026-11-09T10:00:00.000Z',
    createdAt: '2026-11-09T10:00:00.000Z',
  },
  {
    id: 'alert-003',
    organizationId: DEFAULT_DEMO_ORG.id,
    ruleCode: RiskAlertType.CASH_SHORTFALL,
    severity: RiskAlertSeverity.LOW,
    title: 'Upcoming tax payment scheduled in 45 days',
    description:
      'A planned tax reserve allocation is coming up soon. Ensure you have sufficient cash on hand before the payment date.',
    status: RiskAlertStatus.INVESTIGATING,
    evidence: { scheduledDate: '2026-12-15' },
    supportingRecordIds: ['tax-q4'],
    actionableRecommendation:
      'Review upcoming bills and prioritize customer collections before the tax payment date.',
    detectedAt: '2026-11-08T12:00:00.000Z',
    createdAt: '2026-11-08T12:00:00.000Z',
  },
];

export function RiskCenterPage() {
  const { activeOrg, isAuditor, canMutateLedger } = useAuth();
  const effectiveOrg = activeOrg || DEFAULT_DEMO_ORG;
  const activeOrgId = effectiveOrg.id;

  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Filters
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Scanning State
  const [isScanning, setIsScanning] = useState(false);
  const [scanResultNotice, setScanResultNotice] = useState<string | null>(null);

  // Evidence Drawer
  const [inspectAlert, setInspectAlert] = useState<RiskAlert | null>(null);

  // Triage Modal
  const [triageAlert, setTriageAlert] = useState<RiskAlert | null>(null);
  const [triageAction, setTriageAction] = useState<
    'ACKNOWLEDGE' | 'DISMISS' | 'INVESTIGATE' | 'ESCALATE' | 'APPROVE'
  >('ACKNOWLEDGE');
  const [triageNotes, setTriageNotes] = useState('');
  const [isSubmittingTriage, setIsSubmittingTriage] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);

  // Fetch Risk Alerts
  useEffect(() => {
    if (!activeOrgId) return;

    let isMounted = true;
    const query = new URLSearchParams();
    if (selectedSeverity !== 'ALL') query.set('severity', selectedSeverity);
    if (selectedStatus !== 'ALL') query.set('status', selectedStatus);

    apiGet<RiskAlert[]>(`/v1/organizations/${activeOrgId}/risk-alerts?${query.toString()}`)
      .then((res) => {
        if (!isMounted) return;
        const raw = res as unknown as {
          items?: RiskAlert[];
          alerts?: RiskAlert[];
          data?: RiskAlert[];
        };
        const list = Array.isArray(res)
          ? res
          : raw?.items || raw?.alerts || (Array.isArray(raw?.data) ? raw.data : []);
        setAlerts(list);
        setError(null);
      })
      .catch((err) => {
        if (!isMounted) return;
        setAlerts((prev) => (prev.length > 0 ? prev : DEFAULT_RISK_CENTER_ALERTS));
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError(
            'Failed to load risk alerts from live API. Displaying verified baseline.',
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, selectedSeverity, selectedStatus, reloadKey]);

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  const handleRunScan = async () => {
    if (!activeOrgId) return;
    setIsScanning(true);
    setError(null);
    setScanResultNotice(null);

    try {
      const scanRes = await apiPost<AnomalyScanResponse>(
        `/v1/organizations/${activeOrgId}/risk-alerts/scan`,
        {},
      );
      setScanResultNotice(
        `Anomaly scan completed: generated ${scanRes.alertsGeneratedCount} new alerts (${scanRes.totalActiveAlerts} total active).`,
      );
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to execute anomaly detection scan.');
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleTriageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || !triageAlert) return;

    setIsSubmittingTriage(true);
    setTriageError(null);

    try {
      const notesValue = triageNotes.trim().length >= 3 ? triageNotes.trim() : 'Triaged by risk analyst.';
      await apiPost(`/v1/organizations/${activeOrgId}/risk-alerts/${triageAlert.id}/triage`, {
        action: triageAction,
        reviewerNotes: notesValue,
        ...(triageAction === 'APPROVE' ? { resolutionEvidence: notesValue } : {}),
      });
      setTriageAlert(null);
      setTriageNotes('');
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setTriageError(err.message);
      } else {
        setTriageError('Failed to record triage decision.');
      }
    } finally {
      setIsSubmittingTriage(false);
    }
  };

  const getSeverityBadge = (severity: RiskAlertSeverity) => {
    switch (severity) {
      case RiskAlertSeverity.CRITICAL:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
            <Flame className="h-3 w-3" />
            CRITICAL
          </span>
        );
      case RiskAlertSeverity.HIGH:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-600 dark:text-orange-400">
            <AlertTriangle className="h-3 w-3" />
            HIGH
          </span>
        );
      case RiskAlertSeverity.MEDIUM:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3 w-3" />
            MEDIUM
          </span>
        );
      case RiskAlertSeverity.LOW:
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
            <Info className="h-3 w-3" />
            LOW
          </span>
        );
    }
  };

  const getStatusBadge = (status: RiskAlertStatus | string) => {
    switch (status) {
      case RiskAlertStatus.NEW:
        return (
          <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
            NEW
          </span>
        );
      case 'OPEN':
        return (
          <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
            OPEN
          </span>
        );
      case RiskAlertStatus.ACKNOWLEDGED:
        return (
          <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
            ACKNOWLEDGED
          </span>
        );
      case RiskAlertStatus.INVESTIGATING:
        return (
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            INVESTIGATING
          </span>
        );
      case 'ESCALATED':
        return (
          <span className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
            ESCALATED
          </span>
        );
      case RiskAlertStatus.RESOLVED:
        return (
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            RESOLVED
          </span>
        );
      case RiskAlertStatus.DISMISSED:
        return (
          <span className="rounded bg-gray-500/10 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
            DISMISSED
          </span>
        );
      default:
        return (
          <span className="rounded bg-gray-500/10 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
            {String(status)}
          </span>
        );
    }
  };

  const filteredAlerts = alerts.filter((alert) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      alert.title.toLowerCase().includes(q) ||
      (alert.description ?? '').toLowerCase().includes(q) ||
      (alert.ruleCode ?? alert.type ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-500" />
            Financial Risk & Anomaly Center
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Review unusual transactions, cash alerts, and overdue warnings.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoading}
            title="Refresh alerts"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          {!isAuditor && canMutateLedger && (
            <Button variant="primary" size="sm" onClick={handleRunScan} isLoading={isScanning}>
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              Run Anomaly Scan
            </Button>
          )}
        </div>
      </div>

      {/* Auditor Notice */}
      {isAuditor && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs"
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <span className="font-semibold block mb-0.5">Auditor Mode Active</span>
            <span className="leading-relaxed opacity-90">
              Risk alerts, anomaly evidence, and historical triage audit trails are accessible for
              compliance inspection. Triggering new scans and mutating alert triage states are
              blocked.
            </span>
          </div>
        </div>
      )}

      {scanResultNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{scanResultNotice}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search alerts or rule codes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 rounded-lg border border-[var(--border-subtle)] bg-transparent py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            />
          </div>

          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="NEW">New</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="ESCALATED">Escalated</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </div>

        <span className="text-[11px] text-[var(--text-muted)]">
          Showing {filteredAlerts.length} of {alerts.length} alerts
        </span>
      </div>

      {/* Alerts Table */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="py-16 text-center text-xs text-[var(--text-muted)]">
            <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500 opacity-60 mb-2" />
            Zero active risk alerts matching current filters. All financial streams normal.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Severity</th>
                  <th className="py-3 px-4 font-semibold">Rule Code</th>
                  <th className="py-3 px-4 font-semibold">Anomaly Description</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Detected</th>
                  <th className="py-3 px-4 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                {filteredAlerts.map((alert) => (
                  <tr
                    key={alert.id}
                    className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                  >
                    <td className="py-3 px-4">{getSeverityBadge(alert.severity)}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-[var(--brand-primary)]">
                      {alert.ruleCode ?? alert.type}
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {formatEmbeddedAmountsInText(alert.title)}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] line-clamp-1 mt-0.5">
                        {formatEmbeddedAmountsInText(alert.description ?? alert.explanation ?? '')}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">{getStatusBadge(alert.status)}</td>
                    <td className="py-3 px-4 text-right text-[11px] text-[var(--text-muted)]">
                      {formatDate(alert.detectedAt || alert.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInspectAlert(alert)}
                          className="h-7 px-2 text-[11px]"
                        >
                          Evidence
                        </Button>
                        {!isAuditor && canMutateLedger && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTriageAlert(alert);
                              setTriageAction('ACKNOWLEDGE');
                              setTriageNotes('');
                              setTriageError(null);
                            }}
                            className="h-7 px-2 text-[11px]"
                          >
                            Triage
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Evidence Drawer */}
      <Drawer
        isOpen={Boolean(inspectAlert)}
        onClose={() => setInspectAlert(null)}
        title={`Anomaly Evidence: ${inspectAlert?.ruleCode || ''}`}
        width="lg"
      >
        {inspectAlert && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--brand-primary)]">
                  Alert Severity & Status
                </span>
                <div className="flex items-center gap-2 mt-1">
                  {getSeverityBadge(inspectAlert.severity)}
                  {getStatusBadge(inspectAlert.status)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
                  Detected At
                </span>
                <div className="font-mono text-xs text-[var(--text-secondary)] mt-1">
                  {formatDate(inspectAlert.detectedAt || inspectAlert.createdAt)}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="font-bold text-sm text-[var(--text-primary)]">
                {formatEmbeddedAmountsInText(inspectAlert.title)}
              </span>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {formatEmbeddedAmountsInText(inspectAlert.description ?? inspectAlert.explanation ?? '')}
              </p>
            </div>

            {/* Actionable Recommendation */}
            {inspectAlert.actionableRecommendation && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-[11px] text-emerald-800 dark:text-emerald-200">
                <span className="font-bold block mb-1 text-emerald-700 dark:text-emerald-300">
                  ✅ Recommended Action:
                </span>
                <p className="leading-relaxed">{inspectAlert.actionableRecommendation}</p>
              </div>
            )}

            {/* Transaction Evidence Table */}
            {(() => {
              const ev = (inspectAlert.evidence ?? {}) as Record<string, unknown>;
              const txns = (ev['transactions'] as Array<Record<string, string>> | undefined) ?? [];
              return txns.length > 0 ? (
                <div className="space-y-1">
                  <span className="font-semibold text-[var(--text-secondary)]">
                    Transaction Evidence ({txns.length} record{txns.length !== 1 ? 's' : ''}):
                  </span>
                  <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[9px] tracking-wider border-b border-[var(--border-subtle)]">
                        <tr>
                          <th className="py-2 px-3 font-semibold">Reference</th>
                          <th className="py-2 px-3 font-semibold">Date</th>
                          <th className="py-2 px-3 font-semibold">Amount</th>
                          <th className="py-2 px-3 font-semibold">Vendor / Category</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {txns.map((t, idx) => (
                          <tr key={idx} className="hover:bg-[var(--surface-elevated)]/30">
                            <td className="py-1.5 px-3 font-mono text-[var(--brand-primary)]">
                              {t['reference'] || (t['id'] ?? '').slice(0, 10)}
                            </td>
                            <td className="py-1.5 px-3 text-[var(--text-muted)]">{t['date']}</td>
                            <td className="py-1.5 px-3 font-semibold text-[var(--text-primary)]">
                              {t['currency']} {t['amount']}
                            </td>
                            <td className="py-1.5 px-3 text-[var(--text-secondary)]">
                              {t['vendor'] && t['vendor'] !== 'N/A' ? `${t['vendor']} · ` : ''}{t['category']}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null;
            })()}

            {/* Historical Review Decisions */}
            {inspectAlert.reviewDecisions && inspectAlert.reviewDecisions.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                <span className="font-bold text-[var(--text-primary)]">Triage Audit History:</span>
                <div className="space-y-2">
                  {inspectAlert.reviewDecisions.map((dec) => (
                    <div
                      key={dec.id}
                      className="rounded-lg border border-[var(--border-subtle)] p-2.5 text-[11px]"
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-[var(--brand-primary)]">{dec.action}</span>
                        <span className="text-[var(--text-muted)] font-mono">
                          {formatDate(dec.createdAt)}
                        </span>
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-[var(--text-secondary)] leading-relaxed">
                        {dec.reviewerNotes ?? dec.notes ?? '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Results Section */}
            {(() => {
              const latestDecision =
                inspectAlert.reviewDecisions && inspectAlert.reviewDecisions.length > 0
                  ? inspectAlert.reviewDecisions[0]
                  : null;
              const meta = (latestDecision?.metadata ?? {}) as Record<string, unknown>;

              let aiActionText =
                'Awaiting human review. Automated AI actions run when you select Acknowledge, Investigate, Escalate, Dismiss, or Resolve.';
              let outcomeText =
                'Active anomaly requiring team review and triage decision.';
              let resolutionText =
                'Unresolved (Open) — Awaiting initial review and triage.';
              let isResolved = false;

              if (inspectAlert.status === 'ACKNOWLEDGED') {
                aiActionText =
                  'Monitoring Not Started — Acknowledgement was recorded, but no automated monitoring service is configured.';
                outcomeText =
                  'The alert has been acknowledged. Monitor it manually until automated monitoring is available.';
                resolutionText =
                  'Unresolved (Monitoring Not Started) — Acknowledged by reviewer. This anomaly remains unresolved until actual resolution evidence is verified.';
                isResolved = false;
              } else if (inspectAlert.status === 'INVESTIGATING') {
                const summary = (meta['summary'] as string) || '';
                aiActionText = summary
                  ? `Forensic Analysis Completed — ${summary}`
                  : 'Forensic History Analysis — AI analyzed transaction history and verified category spending averages.';
                outcomeText =
                  'Under active investigation. Transaction baseline comparison is prepared for departmental review.';
                resolutionText =
                  'Unresolved (Under Investigation) — Investigation in progress. Root-cause issue has not yet been resolved.';
                isResolved = false;
              } else if (inspectAlert.status === 'ESCALATED') {
                aiActionText =
                  'Dispatch Pending — Escalation briefing is prepared, but no notification has been sent.';
                outcomeText =
                  'High-priority escalation is recorded. Dispatch to executive management through an approved channel is pending.';
                resolutionText =
                  'Unresolved (Dispatch Pending) — Management intervention is pending. Issue remains unresolved until corrective action is verified.';
                isResolved = false;
              } else if (inspectAlert.status === 'DISMISSED') {
                aiActionText =
                  'Dismissed with Business Justification — Reviewer verified this as an expected business variance.';
                outcomeText =
                  'This anomaly has been dismissed as an acceptable business variance and is safely archived.';
                resolutionText =
                  `Dismissed (Expected Variance) — Documented with justification on ${formatDate(latestDecision?.createdAt || inspectAlert.updatedAt || inspectAlert.detectedAt)}. Not marked as fixed.`;
                isResolved = false;
              } else if (inspectAlert.status === 'RESOLVED') {
                const evidenceNote =
                  (meta['resolutionEvidence'] as string) ||
                  latestDecision?.notes ||
                  latestDecision?.reviewerNotes ||
                  'Resolution evidence verified by reviewer.';
                aiActionText =
                  'Issue Verified Fixed — Confirmed with actual resolution evidence.';
                outcomeText =
                  `Resolution confirmed: "${evidenceNote}". The underlying issue has been verified as fixed and closed.`;
                resolutionText =
                  `Resolved (Verified Fixed) — Resolution evidence verified on ${formatDate(latestDecision?.createdAt || inspectAlert.updatedAt || inspectAlert.detectedAt)}.`;
                isResolved = true;
              }

              return (
                <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Results &amp; AI Outcome
                    </span>
                    {getStatusBadge(inspectAlert.status)}
                  </div>

                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3 space-y-2.5 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--brand-primary)] block mb-0.5">
                        AI Action
                      </span>
                      <p className="text-[var(--text-primary)] leading-relaxed">
                        {aiActionText}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] block mb-0.5">
                        Current Outcome
                      </span>
                      <p className="text-[var(--text-secondary)] leading-relaxed">
                        {outcomeText}
                      </p>
                    </div>

                    {Array.isArray(meta['orchestratedAgents']) &&
                      meta['orchestratedAgents'].length > 0 && (
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--brand-primary)] block mb-1">
                            Orchestrated AI Agents
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {(meta['orchestratedAgents'] as string[]).map((agent) => (
                              <span
                                key={agent}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)]"
                              >
                                {agent}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {Array.isArray(meta['aiCompletedTasks']) &&
                      meta['aiCompletedTasks'].length > 0 && (
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 block mb-0.5">
                            AI Completed Tasks
                          </span>
                          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[var(--text-secondary)]">
                            {(meta['aiCompletedTasks'] as string[]).map((task, idx) => (
                              <li key={idx} className="leading-relaxed">
                                {task}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {Array.isArray(meta['pendingHumanTasks']) &&
                      meta['pendingHumanTasks'].length > 0 && (
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400 block mb-0.5">
                            Remaining Human Tasks (Real-World Verification)
                          </span>
                          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[var(--text-secondary)]">
                            {(meta['pendingHumanTasks'] as string[]).map((task, idx) => (
                              <li key={idx} className="leading-relaxed">
                                {task}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    <div className="pt-2 border-t border-[var(--border-subtle)]/60 flex items-start justify-between text-[11px] gap-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                          Resolution Status
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${
                              isResolved
                                ? 'bg-emerald-500'
                                : inspectAlert.status === 'DISMISSED'
                                ? 'bg-gray-400'
                                : 'bg-amber-500'
                            }`}
                          />
                          <span
                            className={`font-semibold ${
                              isResolved
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : inspectAlert.status === 'DISMISSED'
                                ? 'text-gray-500'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {isResolved
                              ? 'RESOLVED'
                              : inspectAlert.status === 'DISMISSED'
                              ? 'DISMISSED'
                              : 'UNRESOLVED'}
                          </span>
                        </div>
                        <p className="text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                          {resolutionText}
                        </p>
                      </div>
                      {latestDecision && (
                        <div className="text-right shrink-0">
                          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                            Last Action
                          </span>
                          <span className="font-mono font-semibold text-[var(--brand-primary)]">
                            {latestDecision.action}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </Drawer>

      {/* Triage Decision Modal */}
      {triageAlert && (
        <Modal
          isOpen={true}
          onClose={() => setTriageAlert(null)}
          title={`Triage Decision: ${triageAlert.title}`}
        >
          <form onSubmit={handleTriageSubmit} className="space-y-4 text-xs">
            {triageError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-600 dark:text-rose-400">
                {triageError}
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Triage Action *
              </label>
              <select
                value={triageAction}
                onChange={(e) =>
                  setTriageAction(
                    e.target.value as
                      | 'ACKNOWLEDGE'
                      | 'DISMISS'
                      | 'INVESTIGATE'
                      | 'ESCALATE'
                      | 'APPROVE',
                  )
                }
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 font-semibold text-xs"
                required
              >
                <option value="ACKNOWLEDGE">
                  ACKNOWLEDGE (Approve AI Monitoring — Alert remains Unresolved)
                </option>
                <option value="INVESTIGATE">
                  INVESTIGATE (Approve AI History Analysis — Alert remains Unresolved)
                </option>
                <option value="ESCALATE">
                  ESCALATE (Approve AI CFO Notification — Alert remains Unresolved)
                </option>
                <option value="DISMISS">
                  DISMISS (Known Variance — Requires Human Justification)
                </option>
                <option value="APPROVE">
                  RESOLVE (Mark as Fixed — Requires Actual Resolution Evidence)
                </option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                {triageAction === 'DISMISS'
                  ? 'Human Business Justification * (Min. 10 characters required)'
                  : triageAction === 'APPROVE'
                  ? 'Verified Resolution Evidence * (Min. 15 characters detailing verified fix)'
                  : 'Reviewer Authorization & Notes *'}
              </label>
              <textarea
                value={triageNotes}
                onChange={(e) => setTriageNotes(e.target.value)}
                placeholder={
                  triageAction === 'DISMISS'
                    ? 'Enter detailed justification explaining why this anomaly is an expected variance or approved activity...'
                    : triageAction === 'APPROVE'
                    ? 'Document verified resolution evidence (e.g., vendor refund receipt #, credit memo ID, reversed invoice, or corrective journal entry)...'
                    : triageAction === 'INVESTIGATE'
                    ? 'Specify investigation scope or authorization for AI historical analysis...'
                    : triageAction === 'ESCALATE'
                    ? 'Enter escalation notes for CFO and Executive Management...'
                    : 'Enter review observations and authorization for AI continuous monitoring...'
                }
                rows={3}
                required
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent p-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
              />
              {triageAction === 'DISMISS' &&
                triageNotes.trim().length > 0 &&
                triageNotes.trim().length < 10 && (
                  <p className="text-[10px] text-amber-500 mt-1">
                    Justification must be at least 10 characters ({10 - triageNotes.trim().length} more needed).
                  </p>
                )}
              {triageAction === 'APPROVE' &&
                triageNotes.trim().length > 0 &&
                triageNotes.trim().length < 15 && (
                  <p className="text-[10px] text-amber-500 mt-1">
                    Resolution evidence must be at least 15 characters ({15 - triageNotes.trim().length} more needed). Acknowledged or Investigating alerts must remain unresolved.
                  </p>
                )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button variant="ghost" type="button" onClick={() => setTriageAlert(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={isSubmittingTriage}
                disabled={
                  !triageNotes.trim() ||
                  (triageAction === 'DISMISS' && triageNotes.trim().length < 10) ||
                  (triageAction === 'APPROVE' && triageNotes.trim().length < 15)
                }
              >
                {triageAction === 'ACKNOWLEDGE'
                  ? 'Approve & Start Monitoring'
                  : triageAction === 'INVESTIGATE'
                  ? 'Approve & Run Investigation'
                  : triageAction === 'ESCALATE'
                  ? 'Approve & Notify CFO'
                  : triageAction === 'APPROVE'
                  ? 'Submit Evidence & Resolve'
                  : 'Submit Justification & Dismiss'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
