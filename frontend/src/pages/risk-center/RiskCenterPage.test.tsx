import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { RiskAlertSeverity, RiskAlertStatus, RiskAlertType } from '../../types/risk.types';
import { RiskCenterPage } from './RiskCenterPage';

describe('RiskCenterPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders risk alerts, non-fraud disclosure, and scanning actions for Finance Manager', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-2',
        email: 'finance@apex.local',
        fullName: 'Finance Manager',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.FINANCE_MANAGER,
      },
      memberships: [],
      activeRole: RoleType.FINANCE_MANAGER,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => true,
      canMutateLedger: true,
      canManageBudgets: true,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    const mockAlerts = [
      {
        id: 'alt-1',
        organizationId: 'org-1',
        ruleCode: RiskAlertType.UNUSUAL_AMOUNT,
        title: 'High Single Transaction Outlier',
        description: 'Wire disbursement of $45,000 exceeds 3x the 90-day category average.',
        severity: RiskAlertSeverity.HIGH,
        status: RiskAlertStatus.NEW,
        evidence: { amount: 45000, categoryAverage: 12000, thresholdMultiplier: 3 },
        supportingRecordIds: ['tx-999'],
        nonFraudDisclaimer:
          'This alert represents a statistical anomaly pattern and does not represent a conclusion of fraud or misconduct.',
        reviewDecisions: [],
        detectedAt: '2026-03-01T12:00:00.000Z',
        createdAt: '2026-03-01T12:00:00.000Z',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: mockAlerts,
      }),
    });

    render(<RiskCenterPage />);

    expect(screen.getByText('Financial Risk & Anomaly Center')).toBeInTheDocument();
    expect(screen.getByText(/Compliance & Statistical Anomaly Disclosure/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('High Single Transaction Outlier')).toBeInTheDocument();
      expect(screen.getByText('UNUSUAL_AMOUNT')).toBeInTheDocument();
    });

    expect(screen.getByText('Run Anomaly Scan')).toBeInTheDocument();
    expect(screen.getByText('Triage')).toBeInTheDocument();
  });

  it('renders Auditor restriction and hides Run Anomaly Scan and Triage buttons', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-auditor',
        email: 'auditor@apex.local',
        fullName: 'Auditor User',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.AUDITOR,
      },
      memberships: [],
      activeRole: RoleType.AUDITOR,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: (roles) =>
        Array.isArray(roles) ? roles.includes(RoleType.AUDITOR) : roles === RoleType.AUDITOR,
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: false,
      canExportReports: false,
      isAuditor: true,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: [],
      }),
    });

    render(<RiskCenterPage />);

    expect(screen.getByText('Auditor Mode Active')).toBeInTheDocument();
    expect(screen.queryByText('Run Anomaly Scan')).not.toBeInTheDocument();
  });
});
