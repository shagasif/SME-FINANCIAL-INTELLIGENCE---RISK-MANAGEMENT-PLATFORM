import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { AgentType, ExecutionStatus, VerificationStatus } from '../../types/ai.types';
import { AiOrchestrationPage } from './AiOrchestrationPage';

describe('AiOrchestrationPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Multi-Agent dashboard, specialist agent tabs, and actions for Business Owner', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'owner@apex.local',
        fullName: 'Jane Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.BUSINESS_OWNER,
      },
      memberships: [],
      activeRole: RoleType.BUSINESS_OWNER,
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

    const mockRuns = [
      {
        id: 'run-1',
        organizationId: 'org-1',
        requestedByUserId: 'usr-1',
        prompt: 'Audit Q1 operating expenses and check cash runway',
        taskClassification: 'EXPENSE_AUDIT',
        selectedAgents: [
          AgentType.SUPERVISOR_ORCHESTRATOR,
          AgentType.EXPENSE_ANOMALY_DETECTION,
          AgentType.VERIFIER_AI,
        ],
        executionMode: 'PARALLEL',
        status: ExecutionStatus.COMPLETED,
        verificationStatus: VerificationStatus.APPROVED,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:05.000Z',
      },
    ];

    const mockModelStatus = {
      configuration: {
        activeProvider: 'gemini',
        externalCredentialsConfigured: true,
        secretsExposed: false,
        timeoutMs: 15000,
        maxRetries: 2,
        rateLimitPerMinute: 60,
        modelMapping: {
          [AgentType.SUPERVISOR_ORCHESTRATOR]: 'gemini-1.5-flash',
          [AgentType.FINANCE_DATA_ANALYST]: 'gemini-1.5-flash',
          [AgentType.CASH_FLOW_FORECASTING]: 'gemini-1.5-flash',
          [AgentType.EXPENSE_ANOMALY_DETECTION]: 'gemini-1.5-flash',
          [AgentType.FINANCIAL_RISK_ASSESSMENT]: 'gemini-1.5-flash',
          [AgentType.SCENARIO_PLANNING]: 'gemini-1.5-flash',
          [AgentType.STRATEGIC_RECOMMENDATION]: 'gemini-1.5-flash',
          [AgentType.FINANCIAL_REPORTING]: 'gemini-1.5-flash',
          [AgentType.VERIFIER_AI]: 'gemini-1.5-flash',
        },
      },
      usage: {
        organizationId: 'org-1',
        totalInvocations: 42,
        totalTokens: 125000,
        totalEstimatedCostUsd: '0.0185',
        recentInvocations: [],
      },
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/model-status')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: mockModelStatus }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockRuns }),
      });
    });

    render(<AiOrchestrationPage />);

    expect(screen.getByText('Multi-Agent AI Orchestration Dashboard')).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText('Audit Q1 operating expenses and check cash runway'),
      ).toBeInTheDocument();
      expect(screen.getByText('EXPENSE_AUDIT')).toBeInTheDocument();
    });

    expect(screen.getByText('Dispatch Orchestration')).toBeInTheDocument();
  });

  it('renders Auditor restriction and hides Dispatch Orchestration button', async () => {
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
      json: async () => ({ success: true, data: [] }),
    });

    render(<AiOrchestrationPage />);

    expect(screen.getByText('Auditor Mode Active')).toBeInTheDocument();
    expect(screen.queryByText('Dispatch Orchestration')).not.toBeInTheDocument();
  });
});
