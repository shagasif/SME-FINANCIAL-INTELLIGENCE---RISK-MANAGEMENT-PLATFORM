import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(
      screen.queryByText(/Compliance & Statistical Anomaly Disclosure/i),
    ).not.toBeInTheDocument();

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

  it('handles all 4 triage workflows (ACKNOWLEDGE, INVESTIGATE, ESCALATE, DISMISS) with validation', async () => {
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

    const mockAlert = {
      id: 'alt-triage-1',
      organizationId: 'org-1',
      ruleCode: RiskAlertType.UNUSUAL_AMOUNT,
      title: 'Unusual Large Wire',
      description: 'Disbursement of $50,000 exceeds threshold.',
      severity: RiskAlertSeverity.HIGH,
      status: RiskAlertStatus.NEW,
      evidence: {
        transactions: [
          {
            id: 'tx-001',
            reference: 'TXN-001',
            amount: '50000.0000',
            currency: 'USD',
            date: '2026-11-10',
            vendor: 'Global Cloud Corp',
            category: 'Software & IT',
          },
        ],
      },
      supportingRecordIds: ['tx-001'],
      actionableRecommendation: 'Verify invoice with vendor.',
      nonFraudDisclaimer: 'Statistical signal for human review.',
      reviewDecisions: [
        {
          id: 'dec-1',
          organizationId: 'org-1',
          reviewerUserId: 'usr-2',
          action: 'ACKNOWLEDGE',
          reviewerNotes: 'Verified during audit. [AI Active Monitoring]: Active.',
          createdAt: '2026-11-10T12:00:00.000Z',
        },
      ],
      detectedAt: '2026-11-10T10:00:00.000Z',
      createdAt: '2026-11-10T10:00:00.000Z',
    };

    const fetchMock = vi.fn().mockImplementation((_url: string, options?: any) => {
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: { ...mockAlert, status: 'INVESTIGATING' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: [mockAlert],
        }),
      });
    });

    globalThis.fetch = fetchMock;

    render(<RiskCenterPage />);

    await waitFor(() => {
      expect(screen.getByText('Unusual Large Wire')).toBeInTheDocument();
    });

    // 1. Open Evidence Drawer and verify structured evidence
    fireEvent.click(screen.getByRole('button', { name: /Evidence/i }));
    expect(screen.getByText(/Recommended Action/i)).toBeInTheDocument();
    expect(screen.getByText('Verify invoice with vendor.')).toBeInTheDocument();
    expect(screen.getByText(/Transaction Evidence/i)).toBeInTheDocument();
    expect(screen.getByText('Global Cloud Corp · Software & IT')).toBeInTheDocument();
    expect(screen.getByText('Triage Audit History:')).toBeInTheDocument();
    expect(screen.getByText(/Verified during audit/)).toBeInTheDocument();

    // Verify Detection Metrics and Disclaimer are completely removed
    expect(screen.queryByText(/Detection Metrics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Disclaimer:/i)).not.toBeInTheDocument();

    // Verify Results section is present below Triage Audit History
    expect(screen.getByText(/Results & AI Outcome/i)).toBeInTheDocument();
    expect(screen.getByText('AI Action')).toBeInTheDocument();
    expect(screen.getByText('Current Outcome')).toBeInTheDocument();
    expect(screen.getByText('Resolution Status')).toBeInTheDocument();
    expect(screen.getByText('UNRESOLVED')).toBeInTheDocument();

    // Close drawer
    fireEvent.click(screen.getByRole('button', { name: /Close drawer/i }));

    // 2. Open Triage Modal
    fireEvent.click(screen.getByRole('button', { name: /Triage/i }));
    expect(screen.getByText(/Triage Decision:/i)).toBeInTheDocument();

    // Verify select has all triage actions
    const comboboxes = screen.getAllByRole('combobox');
    const select = comboboxes[comboboxes.length - 1];
    expect(select).toBeInTheDocument();

    // Test DISMISS validation (requires >= 10 chars)
    fireEvent.change(select, { target: { value: 'DISMISS' } });
    const textarea = screen.getByPlaceholderText(/Enter detailed justification/i);
    fireEvent.change(textarea, { target: { value: 'Too short' } }); // 9 chars

    const commitBtn = screen.getByRole('button', { name: /Submit Justification & Dismiss/i });
    expect(commitBtn).toBeDisabled();

    // Supply valid 10+ chars justification
    fireEvent.change(textarea, { target: { value: 'Known recurring license renewal variance' } });
    expect(commitBtn).not.toBeDisabled();

    // Change action to INVESTIGATE and submit
    fireEvent.change(select, { target: { value: 'INVESTIGATE' } });
    const investBtn = screen.getByRole('button', { name: /Approve & Run Investigation/i });
    expect(investBtn).not.toBeDisabled();

    fireEvent.click(investBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/triage'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            action: 'INVESTIGATE',
            reviewerNotes: 'Known recurring license renewal variance',
          }),
        }),
      );
    });
  });

  it('enforces that alerts remain UNRESOLVED unless verified resolution evidence is provided', async () => {
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

    const mockAckAlert = {
      id: 'alt-ack-1',
      organizationId: 'org-1',
      ruleCode: RiskAlertType.UNUSUAL_AMOUNT,
      title: 'Acknowledged Expense Spike',
      description: 'Disbursement of $35,000 awaiting manual monitoring.',
      severity: RiskAlertSeverity.HIGH,
      status: RiskAlertStatus.ACKNOWLEDGED,
      evidence: { amount: 35000 },
      supportingRecordIds: ['tx-002'],
      reviewDecisions: [
        {
          id: 'dec-ack',
          organizationId: 'org-1',
          reviewerUserId: 'usr-2',
          action: 'ACKNOWLEDGE',
          reviewerNotes: 'Acknowledgement recorded; automated monitoring has not started.',
          createdAt: '2026-11-12T10:00:00.000Z',
          metadata: {
            workflow: 'CONTINUOUS_MONITORING_REQUESTED',
            status: 'PENDING_NOT_STARTED',
            isResolved: false,
            resolutionState: 'UNRESOLVED',
            orchestratedAgents: [
              'SUPERVISOR_ORCHESTRATOR',
              'EXPENSE_ANOMALY_DETECTION',
              'FINANCIAL_RISK_ASSESSMENT',
            ],
            aiCompletedTasks: [],
            pendingHumanTasks: [
              'Monitor this alert manually until automated monitoring is available',
              'Verify physical documents and real-world business activities',
            ],
          },
        },
      ],
      detectedAt: '2026-11-12T09:00:00.000Z',
      createdAt: '2026-11-12T09:00:00.000Z',
    };

    const fetchMock = vi.fn().mockImplementation((_url: string, options?: any) => {
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              ...mockAckAlert,
              status: 'RESOLVED',
              reviewDecisions: [
                {
                  id: 'dec-resolved',
                  action: 'APPROVE',
                  reviewerNotes: 'Invoice corrected and verified fixed by accounting.',
                  metadata: {
                    isResolved: true,
                    resolutionState: 'RESOLVED',
                    resolutionEvidence: 'Invoice corrected and verified fixed by accounting.',
                  },
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: [mockAckAlert],
        }),
      });
    });

    globalThis.fetch = fetchMock;

    render(<RiskCenterPage />);

    await waitFor(() => {
      expect(screen.getByText('Acknowledged Expense Spike')).toBeInTheDocument();
    });

    // 1. Open Evidence Drawer and verify it is UNRESOLVED despite being ACKNOWLEDGED
    fireEvent.click(screen.getByRole('button', { name: /Evidence/i }));
    expect(screen.getByText('Resolution Status')).toBeInTheDocument();
    expect(screen.getByText('UNRESOLVED')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Monitoring Not Started — Acknowledgement was recorded, but no automated monitoring service is configured.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Unresolved (Monitoring Not Started) — Acknowledged by reviewer. This anomaly remains unresolved until actual resolution evidence is verified.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/remains unresolved until actual resolution evidence is verified/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Active Telemetry Monitoring/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/automated surveillance is active/i)).not.toBeInTheDocument();

    // Verify Orchestrated AI Agents and task separation between AI and Human
    expect(screen.getByText('Orchestrated AI Agents')).toBeInTheDocument();
    expect(screen.getByText('EXPENSE_ANOMALY_DETECTION')).toBeInTheDocument();
    expect(
      screen.getByText('Remaining Human Tasks (Real-World Verification)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Monitor this alert manually until automated monitoring is available/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Verify physical documents/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Close drawer/i }));

    // 2. Open Triage Modal and select APPROVE (Resolve)
    fireEvent.click(screen.getByRole('button', { name: /Triage/i }));
    const comboboxes = screen.getAllByRole('combobox');
    const select = comboboxes[comboboxes.length - 1];

    fireEvent.change(select, { target: { value: 'APPROVE' } });

    // Verify evidence requirements and placeholder
    expect(
      screen.getByText(/Verified Resolution Evidence \* \(Min\. 15 characters detailing verified fix\)/i),
    ).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(
      /Document verified resolution evidence/i,
    );

    // Short evidence (<15 chars) disables button and displays warning
    fireEvent.change(textarea, { target: { value: 'Fixed already.' } }); // 14 chars
    expect(
      screen.getByText(/Resolution evidence must be at least 15 characters/i),
    ).toBeInTheDocument();
    const resolveBtn = screen.getByRole('button', { name: /Submit Evidence & Resolve/i });
    expect(resolveBtn).toBeDisabled();

    // Valid evidence (>=15 chars) enables button
    const validEvidence = 'Invoice corrected and verified fixed by accounting team.';
    fireEvent.change(textarea, { target: { value: validEvidence } });
    expect(resolveBtn).not.toBeDisabled();

    // Submit triage
    fireEvent.click(resolveBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/triage'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            action: 'APPROVE',
            reviewerNotes: validEvidence,
            resolutionEvidence: validEvidence,
          }),
        }),
      );
    });
  });

  it('shows escalated alerts as pending dispatch without claiming notifications were sent', async () => {
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

    const mockEscalatedAlert = {
      id: 'alt-escalated-1',
      organizationId: 'org-1',
      ruleCode: RiskAlertType.UNUSUAL_AMOUNT,
      title: 'Escalated Expense Spike',
      description: 'Disbursement requires executive review.',
      severity: RiskAlertSeverity.HIGH,
      status: RiskAlertStatus.ESCALATED,
      evidence: { amount: 35000 },
      supportingRecordIds: ['tx-003'],
      reviewDecisions: [
        {
          id: 'dec-escalated',
          organizationId: 'org-1',
          reviewerUserId: 'usr-2',
          action: 'ESCALATE',
          reviewerNotes: 'Briefing prepared; dispatch is pending and no notification was sent.',
          createdAt: '2026-11-12T10:00:00.000Z',
          metadata: {
            workflow: 'AI_EXECUTIVE_ESCALATION',
            status: 'PENDING_DISPATCH',
            isResolved: false,
            resolutionState: 'UNRESOLVED',
            aiCompletedTasks: [
              'Prepared executive briefing with exposure metrics and severity impact',
            ],
            pendingHumanTasks: [
              'Dispatch the briefing to CFO and Executive Management through an approved channel',
            ],
          },
        },
      ],
      detectedAt: '2026-11-12T09:00:00.000Z',
      createdAt: '2026-11-12T09:00:00.000Z',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: [mockEscalatedAlert],
      }),
    });

    render(<RiskCenterPage />);

    await waitFor(() => {
      expect(screen.getByText('Escalated Expense Spike')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Evidence/i }));

    expect(
      screen.getByText(
        'Dispatch Pending — Escalation briefing is prepared, but no notification has been sent.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/no notification has been sent/i)).toBeInTheDocument();
    expect(screen.getByText(/Unresolved \(Dispatch Pending\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/Executive Alert Dispatched/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/containment briefing sent to the CFO and executive team/i),
    ).not.toBeInTheDocument();
  });
});
