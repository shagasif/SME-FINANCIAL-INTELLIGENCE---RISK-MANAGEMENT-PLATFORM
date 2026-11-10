import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Building,
  CheckCircle2,
  Fingerprint,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiGet, apiPatch, apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { formatDate } from '../../utils/formatters';
import { RoleType } from '../../types/auth.types';
import type { AuditEvent } from '../../types/reports.types';

export interface WorkspaceMemberRecord {
  id: string;
  organizationId: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  role: RoleType;
  status?: string;
  createdAt?: string;
}

export function AdminPage() {
  const { user, activeOrg, hasRole, activeRole } = useAuth();
  const activeOrgId = activeOrg?.id;

  const isAuthorizedAdmin =
    user?.isPlatformAdmin || hasRole([RoleType.PLATFORM_ADMIN, RoleType.BUSINESS_OWNER]);

  const [activeTab, setActiveTab] = useState<'SETTINGS' | 'MEMBERS' | 'AUDIT_LOGS'>('SETTINGS');

  // Org Settings State
  const [orgName, setOrgName] = useState(activeOrg?.name || '');
  const [baseCurrency, setBaseCurrency] = useState(activeOrg?.baseCurrency || 'USD');
  const [fiscalYearStart, setFiscalYearStart] = useState('1');
  const [timezone, setTimezone] = useState('America/New_York');
  const [isSavingOrg, setIsSavingOrg] = useState(false);
  const [orgSuccessNotice, setOrgSuccessNotice] = useState<string | null>(null);

  // Memberships State
  const [memberships, setMemberships] = useState<WorkspaceMemberRecord[]>([]);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<RoleType>(RoleType.ACCOUNTANT);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!activeOrgId || !isAuthorizedAdmin) return;

    let isMounted = true;
    Promise.allSettled([
      apiGet<WorkspaceMemberRecord[]>(`/v1/organizations/${activeOrgId}/memberships`),
      apiGet<AuditEvent[]>(`/v1/organizations/${activeOrgId}/audit-logs?limit=50`),
    ])
      .then(([membersRes, auditRes]) => {
        if (!isMounted) return;

        if (membersRes.status === 'fulfilled') {
          const raw = membersRes.value;
          const list = Array.isArray(raw)
            ? raw
            : (
                raw as unknown as {
                  items?: WorkspaceMemberRecord[];
                  data?: WorkspaceMemberRecord[];
                }
              )?.items ||
              (
                raw as unknown as {
                  items?: WorkspaceMemberRecord[];
                  data?: WorkspaceMemberRecord[];
                }
              )?.data ||
              [];
          setMemberships(list);
        }

        if (auditRes.status === 'fulfilled') {
          const rawAudit = auditRes.value;
          const auditList = Array.isArray(rawAudit)
            ? rawAudit
            : (rawAudit as unknown as { items?: AuditEvent[]; data?: AuditEvent[] })?.items ||
              (rawAudit as unknown as { items?: AuditEvent[]; data?: AuditEvent[] })?.data ||
              [];
          setAuditLogs(auditList);
        }

        setError(null);
      })
      .catch(() => {
        if (!isMounted) return;
        setError('Failed to load administrative governance data.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrgId, isAuthorizedAdmin, reloadKey]);

  // Unauthorized Access Boundary Gate
  if (!isAuthorizedAdmin) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 text-center space-y-3">
          <ShieldAlert className="mx-auto h-12 w-12 text-rose-500 opacity-80" />
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Administration Access Restricted
          </h2>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
            Your current assigned role ({activeRole}) does not have administrative governance
            authority. Only Business Owners and Platform Administrators are authorized to configure
            organization settings, invite members, and review SHA-256 audit logs.
          </p>
        </div>
      </div>
    );
  }

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  const handleSaveOrgSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId) return;

    setIsSavingOrg(true);
    setOrgSuccessNotice(null);
    setError(null);

    try {
      await apiPatch(`/v1/organizations/${activeOrgId}`, {
        name: orgName.trim(),
        baseCurrency,
        fiscalYearStartMonth: parseInt(fiscalYearStart, 10),
        timeZone: timezone,
      });
      setOrgSuccessNotice('Organization governance settings updated successfully.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to update organization settings.');
      }
    } finally {
      setIsSavingOrg(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || !inviteEmail.trim()) return;

    setIsInviting(true);
    setInviteError(null);

    try {
      await apiPost(`/v1/organizations/${activeOrgId}/memberships/invite`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setIsInviteModalOpen(false);
      setInviteEmail('');
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setInviteError(err.message);
      } else {
        setInviteError('Failed to invite workspace member.');
      }
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (membershipId: string, newRole: RoleType) => {
    if (!activeOrgId) return;

    try {
      await apiPatch(`/v1/organizations/${activeOrgId}/memberships/${membershipId}/role`, {
        role: newRole,
      });
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to update member role.');
      }
    }
  };

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (!auditSearchQuery) return true;
    const q = auditSearchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.resourceType.toLowerCase().includes(q) ||
      log.integrityHash.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <Settings className="w-6 h-6 text-[var(--brand-primary)]" />
            Administration & Organization Governance
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Workspace configuration, RBAC team management, and immutable SHA-256 audit logs.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoading}
            title="Refresh settings"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          {activeTab === 'MEMBERS' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setInviteError(null);
                setIsInviteModalOpen(true);
              }}
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Invite Member
            </Button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('SETTINGS')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'SETTINGS'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          Workspace Settings
        </button>

        <button
          onClick={() => setActiveTab('MEMBERS')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'MEMBERS'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Team Members ({memberships.length})
        </button>

        <button
          onClick={() => setActiveTab('AUDIT_LOGS')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'AUDIT_LOGS'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <Fingerprint className="w-3.5 h-3.5" />
          SHA-256 Audit Trail ({auditLogs.length})
        </button>
      </div>

      {orgSuccessNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{orgSuccessNotice}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: ORG SETTINGS */}
      {activeTab === 'SETTINGS' && (
        <form
          onSubmit={handleSaveOrgSettings}
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 shadow-xs space-y-4 max-w-2xl"
        >
          <div className="border-b border-[var(--border-subtle)] pb-2">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Workspace Profile & Currency Preferences
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Authoritative parameters governing deterministic accounting calculations
            </p>
          </div>

          <Input
            id="orgName"
            label="Organization Workspace Name *"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Base Functional Currency *
              </label>
              <select
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 text-xs font-semibold"
              >
                <option value="USD">USD ($ - United States Dollar)</option>
                <option value="EUR">EUR (€ - Euro)</option>
                <option value="GBP">GBP (£ - British Pound)</option>
                <option value="CAD">CAD ($ - Canadian Dollar)</option>
                <option value="AUD">AUD ($ - Australian Dollar)</option>
                <option value="SGD">SGD ($ - Singapore Dollar)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Fiscal Year Start Month *
              </label>
              <select
                value={fiscalYearStart}
                onChange={(e) => setFiscalYearStart(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 text-xs font-semibold"
              >
                <option value="1">January (Standard Calendar Year)</option>
                <option value="4">April (Q1 starts in April)</option>
                <option value="7">July (Mid-year fiscal cycle)</option>
                <option value="10">October (Federal/State cycle)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
              Reporting Timezone *
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 text-xs font-semibold"
            >
              <option value="America/New_York">Eastern Time (US & Canada)</option>
              <option value="America/Chicago">Central Time (US & Canada)</option>
              <option value="America/Denver">Mountain Time (US & Canada)</option>
              <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
              <option value="Europe/London">London (GMT/BST)</option>
              <option value="Asia/Singapore">Singapore (SGT)</option>
            </select>
          </div>

          <div className="flex justify-end pt-3 border-t border-[var(--border-subtle)]">
            <Button variant="primary" type="submit" isLoading={isSavingOrg}>
              Save Workspace Settings
            </Button>
          </div>
        </form>
      )}

      {/* TAB 2: TEAM MEMBERSHIPS */}
      {activeTab === 'MEMBERS' && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Authorized Team Members & Roles ({memberships.length})
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Role-Based Access Control governs granular view, mutation, and export permissions
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="py-3 px-4 font-semibold">User Full Name</th>
                  <th className="py-3 px-4 font-semibold">Assigned Role</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Joined At</th>
                  <th className="py-3 px-4 font-semibold text-center">Change Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                {memberships.map((mem) => (
                  <tr
                    key={mem.id}
                    className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {mem.userName || mem.userEmail || 'Team Member'}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">
                        {mem.userEmail || mem.userId || mem.id}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="rounded bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--brand-primary)]">
                        {mem.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                        {mem.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-[11px] text-[var(--text-muted)]">
                      {mem.createdAt ? formatDate(mem.createdAt) : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <select
                        value={mem.role}
                        onChange={(e) => handleRoleChange(mem.id, e.target.value as RoleType)}
                        className="rounded border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-2 py-1 text-[11px] font-semibold"
                      >
                        <option value={RoleType.BUSINESS_OWNER}>BUSINESS_OWNER</option>
                        <option value={RoleType.FINANCE_MANAGER}>FINANCE_MANAGER</option>
                        <option value={RoleType.ACCOUNTANT}>ACCOUNTANT</option>
                        <option value={RoleType.OPERATIONS_MANAGER}>OPERATIONS_MANAGER</option>
                        <option value={RoleType.FINANCIAL_ANALYST}>FINANCIAL_ANALYST</option>
                        <option value={RoleType.AUDITOR}>AUDITOR (Read-Only Locked)</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SHA-256 AUDIT TRAIL */}
      {activeTab === 'AUDIT_LOGS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search audit actions, resources, hashes..."
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
              />
            </div>
            <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              <span>Immutable Cryptographic SHA-256 Log</span>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Action</th>
                    <th className="py-3 px-4 font-semibold">Actor Role</th>
                    <th className="py-3 px-4 font-semibold">Resource</th>
                    <th className="py-3 px-4 font-semibold">SHA-256 Integrity Hash</th>
                    <th className="py-3 px-4 font-semibold text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                  {filteredAuditLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-[var(--surface-elevated)]/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[var(--brand-primary)]">
                        {log.action}
                      </td>
                      <td className="py-3 px-4">
                        <span className="rounded bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[10px]">
                          {log.actorRole}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">{log.resourceType}</td>
                      <td className="py-3 px-4 font-mono text-[10px] text-[var(--text-muted)] truncate max-w-xs">
                        {log.integrityHash}
                      </td>
                      <td className="py-3 px-4 text-right text-[11px] text-[var(--text-muted)]">
                        {formatDate(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {isInviteModalOpen && (
        <Modal isOpen={true} onClose={() => setIsInviteModalOpen(false)} title="Invite Team Member">
          <form onSubmit={handleInviteMember} className="space-y-4 text-xs">
            {inviteError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-600 dark:text-rose-400">
                {inviteError}
              </div>
            )}

            <Input
              id="inviteEmail"
              label="Work Email Address *"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="e.g. colleague@company.com"
              required
            />

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Assign Initial Role *
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as RoleType)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 text-xs font-semibold"
              >
                <option value={RoleType.BUSINESS_OWNER}>
                  BUSINESS_OWNER (Full Workspace Authority)
                </option>
                <option value={RoleType.FINANCE_MANAGER}>
                  FINANCE_MANAGER (Budgets & Ledger Mutations)
                </option>
                <option value={RoleType.ACCOUNTANT}>ACCOUNTANT (Invoices & Payables)</option>
                <option value={RoleType.OPERATIONS_MANAGER}>
                  OPERATIONS_MANAGER (Operating Expenditures)
                </option>
                <option value={RoleType.FINANCIAL_ANALYST}>
                  FINANCIAL_ANALYST (Forecasts & Analytics)
                </option>
                <option value={RoleType.AUDITOR}>AUDITOR (Read-Only Inspection Locked)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button variant="ghost" type="button" onClick={() => setIsInviteModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={isInviting}
                disabled={!inviteEmail.trim()}
              >
                Send Invitation
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
