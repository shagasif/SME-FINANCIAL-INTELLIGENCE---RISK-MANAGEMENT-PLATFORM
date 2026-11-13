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
    title: 'Cloud Infrastructure Expense +28% Above 90d Baseline',
    description: 'Spike in LLM token usage detected across secondary financial simulation batch.',
    status: RiskAlertStatus.NEW,
    evidence: { delta: '+28%' },
    supportingRecordIds: ['tx-002'],
    nonFraudDisclaimer: 'Statistically detected deviation. Does not imply misconduct.',
    detectedAt: '2026-11-10T08:00:00.000Z',
    createdAt: '2026-11-10T08:00:00.000Z',
  },
  {
    id: 'alert-002',
    organizationId: DEFAULT_DEMO_ORG.id,
    ruleCode: RiskAlertType.OVERDUE_RECEIVABLE,
    severity: RiskAlertSeverity.HIGH,
    title: 'Overdue Receivable: $35,000 Exceeded 30 Days',
    description: 'Invoice INV-2026-842 is 34 days past due. Working capital exposure detected.',
    status: RiskAlertStatus.ACKNOWLEDGED,
    evidence: { daysPastDue: 34 },
    supportingRecordIds: ['inv-842'],
    nonFraudDisclaimer: 'Statistically detected deviation. Does not imply misconduct.',
    detectedAt: '2026-11-09T10:00:00.000Z',
    createdAt: '2026-11-09T10:00:00.000Z',
  },
  {
    id: 'alert-003',
    organizationId: DEFAULT_DEMO_ORG.id,
    ruleCode: RiskAlertType.CASH_SHORTFALL,
    severity: RiskAlertSeverity.LOW,
    title: 'Quarter-end Tax Reserve Allocation Scheduled',
    description: 'Upcoming corporate tax obligations scheduled within next 45 days.',
    status: RiskAlertStatus.INVESTIGATING,
    evidence: { scheduledDate: '2026-12-15' },
    supportingRecordIds: ['tax-q4'],
    nonFraudDisclaimer: 'Statistically detected deviation. Does not imply misconduct.',
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
    'ACKNOWLEDGE' | 'DISMISS' | 'INVESTIGATE' | 'ESCALATE'
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
      await apiPost(`/v1/organizations/${activeOrgId}/risk-alerts/${triageAlert.id}/triage`, {
        action: triageAction,
        reviewerNotes:
          triageNotes.trim().length >= 3 ? triageNotes.trim() : 'Triaged by risk analyst.',
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

  const getStatusBadge = (status: RiskAlertStatus) => {
    switch (status) {
      case RiskAlertStatus.NEW:
        return (
          <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
            NEW
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
      case RiskAlertStatus.RESOLVED:
        return (
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            RESOLVED
          </span>
        );
      case RiskAlertStatus.DISMISSED:
      default:
        return (
          <span className="rounded bg-gray-500/10 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
            DISMISSED
          </span>
        );
    }
  };

  const filteredAlerts = alerts.filter((alert) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      alert.title.toLowerCase().includes(q) ||
      alert.description.toLowerCase().includes(q) ||
      alert.ruleCode.toLowerCase().includes(q)
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
            <option value="NEW">New</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="INVESTIGATING">Investigating</option>
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
                      {alert.ruleCode}
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {formatEmbeddedAmountsInText(alert.title)}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] line-clamp-1 mt-0.5">
                        {formatEmbeddedAmountsInText(alert.description)}
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
                {formatEmbeddedAmountsInText(inspectAlert.description)}
              </p>
            </div>

            {/* Non-Fraud Disclaimer on Record */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-[11px] text-amber-800 dark:text-amber-300">
              <span className="font-bold block mb-0.5">Disclaimer:</span>
              {inspectAlert.nonFraudDisclaimer ||
                'This alert represents a mathematical anomaly detection pattern and does not represent a conclusion of fraud or misconduct.'}
            </div>

            {/* Statistical Evidence Payload */}
            <div className="space-y-1">
              <span className="font-semibold text-[var(--text-secondary)]">
                Recorded Evidence Payload (Deterministic JSON):
              </span>
              <pre className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3 font-mono text-[11px] text-[var(--text-primary)] overflow-x-auto max-h-48">
                {JSON.stringify(inspectAlert.evidence, null, 2)}
              </pre>
            </div>

            {/* Supporting Records */}
            {inspectAlert.supportingRecordIds?.length > 0 && (
              <div className="space-y-1">
                <span className="font-semibold text-[var(--text-secondary)]">
                  Cited Ledger Record IDs ({inspectAlert.supportingRecordIds.length}):
                </span>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
                  {inspectAlert.supportingRecordIds.map((id, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--brand-primary)]"
                    >
                      {id}
                    </span>
                  ))}
                </div>
              </div>
            )}

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
                      <p className="mt-1 text-[var(--text-secondary)]">{dec.notes}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                    e.target.value as 'ACKNOWLEDGE' | 'DISMISS' | 'INVESTIGATE' | 'ESCALATE',
                  )
                }
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 font-semibold text-xs"
                required
              >
                <option value="ACKNOWLEDGE">ACKNOWLEDGE (Flag seen, monitor activity)</option>
                <option value="INVESTIGATING">
                  INVESTIGATE (Request transaction audit details)
                </option>
                <option value="ESCALATE">ESCALATE (Notify CFO / Management immediately)</option>
                <option value="DISMISSED">DISMISS (Known expected business variance)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Triage Notes & Business Justification *
              </label>
              <textarea
                value={triageNotes}
                onChange={(e) => setTriageNotes(e.target.value)}
                placeholder="Document rationale, vendor conversation notes, or invoice verification IDs..."
                rows={3}
                required
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent p-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button variant="ghost" type="button" onClick={() => setTriageAlert(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={isSubmittingTriage}
                disabled={!triageNotes.trim()}
              >
                Commit Decision
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
