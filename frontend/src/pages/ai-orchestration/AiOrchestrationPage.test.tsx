import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('displays synthesizedResult, specialist outputs, Verifier AI report, citations, and failed/missing agent warnings inside HITL review modal', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'owner@star.com',
        fullName: 'Star Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
        name: 'star',
        slug: 'star',
        baseCurrency: 'PKR',
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

    const hitlRun = {
      id: 'wf-hitl-1',
      organizationId: 'org-star',
      requestedByUserId: 'usr-1',
      prompt: 'Automatic post-bill save intelligence workflow [doc:bill-1] for BILL-2026-01',
      taskClassification: 'AUTO_POST_BILL_ORCHESTRATION',
      selectedAgents: [
        AgentType.FINANCE_DATA_ANALYST,
        AgentType.CASH_FLOW_FORECASTING,
        AgentType.EXPENSE_ANOMALY_DETECTION,
        AgentType.STRATEGIC_RECOMMENDATION,
        AgentType.VERIFIER_AI,
      ],
      executionMode: 'AUTO_POST_SAVE_PARALLEL_THEN_SEQUENTIAL_VERIFIER',
      status: ExecutionStatus.COMPLETED,
      verificationStatus: VerificationStatus.REQUIRES_HUMAN_REVIEW,
      synthesizedResult: {
        executiveSummary:
          'Completed AUTO_POST_BILL_ORCHESTRATION across 2 specialist agent(s) and Verifier AI.',
        providerMode: 'deterministic-grounded',
        limitations: [
          'External AI provider is not configured; workflow executed using deterministic grounded calculations.',
        ],
        failedAgents: [
          { agentType: AgentType.CASH_FLOW_FORECASTING, error: 'Forecast engine timeout' },
        ],
        sourceRecordIds: {
          billIds: ['bill-1'],
          invoiceIds: ['inv-9'],
        },
      },
      verifierReport: {
        verificationPassed: true,
        arithmeticVerified: true,
        citationsVerified: true,
        nonFraudComplianceVerified: true,
        checkedSpecialistCount: 2,
        auditNotes: 'All numeric metrics match authoritative ledger balances and include source citations.',
      },
      agentRuns: [
        {
          id: 'ar-1',
          workflowRunId: 'wf-hitl-1',
          agentType: AgentType.FINANCE_DATA_ANALYST,
          sandboxId: 'sb-1',
          status: ExecutionStatus.COMPLETED,
          loadedSkills: ['skill.financial-data-analysis'],
          allowedTools: [],
          invokedTools: [],
          durationMs: 42,
          outputPayload: {
            skillResults: [
              {
                summary: 'Operating cash flow is PKR 85,000.00 with payables of PKR 35,000.00.',
              },
            ],
          },
          createdAt: '2026-11-12T08:00:00.000Z',
        },
        {
          id: 'ar-2',
          workflowRunId: 'wf-hitl-1',
          agentType: AgentType.CASH_FLOW_FORECASTING,
          sandboxId: 'sb-2',
          status: ExecutionStatus.FAILED,
          loadedSkills: ['skill.cash-flow-forecasting'],
          allowedTools: [],
          invokedTools: [],
          durationMs: 12,
          errorDetails: 'Forecast engine timeout',
          createdAt: '2026-11-12T08:00:00.000Z',
        },
        {
          id: 'ar-3',
          workflowRunId: 'wf-hitl-1',
          agentType: AgentType.STRATEGIC_RECOMMENDATION,
          sandboxId: 'sb-3',
          status: ExecutionStatus.COMPLETED,
          loadedSkills: ['skill.strategic-financial-recommendations'],
          allowedTools: [],
          invokedTools: [],
          durationMs: 18,
          outputPayload: {
            skillResults: [
              {
                summary: 'Prioritize settlement of overdue supplier bill BILL-2026-01.',
                recommendations: [
                  {
                    priority: 1,
                    action: 'Schedule vendor payment from primary PKR bank account',
                    rationale: 'Preserves supplier credit terms.',
                  },
                ],
              },
            ],
          },
          createdAt: '2026-11-12T08:00:00.000Z',
        },
      ],
      createdAt: '2026-11-12T08:00:00.000Z',
      updatedAt: '2026-11-12T08:00:01.000Z',
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/workflows')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: [hitlRun] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(<AiOrchestrationPage />);

    // Open Human-in-the-Loop tab and click Review & Decide
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Human-in-the-Loop \(1\)/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Human-in-the-Loop \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /Review & Decide/i }));

    const modal = within(screen.getByRole('dialog'));

    // 1. SynthesizedResult & Executive Summary + limitations
    expect(
      modal.getByText(/Completed AUTO_POST_BILL_ORCHESTRATION across 2 specialist agent/i),
    ).toBeInTheDocument();
    expect(modal.getByText(/External AI provider is not configured/i)).toBeInTheDocument();

    // 2. Individual specialist outputs & recommendations
    expect(
      modal.getByText(/Operating cash flow is PKR 85,000 with payables of PKR 35,000/i),
    ).toBeInTheDocument();
    expect(
      modal.getByText(/Schedule vendor payment from primary PKR bank account/i),
    ).toBeInTheDocument();

    // 3. Verifier AI report & explanation
    expect(modal.getByText('VERIFICATION PASSED')).toBeInTheDocument();
    expect(
      modal.getByText(/All numeric metrics match authoritative ledger balances/i),
    ).toBeInTheDocument();

    // 4. Evidence & source citations
    expect(modal.getByText('bill-1')).toBeInTheDocument();
    expect(modal.getByText('inv-9')).toBeInTheDocument();

    // 5. Failed & Missing agent warning banner
    expect(modal.getByRole('alert')).toHaveTextContent(/Forecast engine timeout/i);
    expect(modal.getByRole('alert')).toHaveTextContent(/EXPENSE_ANOMALY_DETECTION \(MISSING\)/i);

    // 6. Preserved APPROVE / OVERRIDE / REJECT options & disabled submit until notes entered
    expect(modal.getByRole('option', { name: /APPROVE/i })).toBeInTheDocument();
    expect(modal.getByRole('option', { name: /OVERRIDE/i })).toBeInTheDocument();
    expect(modal.getByRole('option', { name: /REJECT/i })).toBeInTheDocument();
    expect(modal.getByRole('button', { name: /Commit Review Decision/i })).toBeDisabled();
  });

  it('displays extracted invoice fields, line items, low-confidence warnings, and Verifier AI AgentRun report for CUSTOMER_INVOICE_DOCUMENT_EXTRACTION', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'owner@starbusiness.pk',
        fullName: 'Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
        name: 'Star Business',
        slug: 'star-business',
        role: RoleType.BUSINESS_OWNER,
        baseCurrency: 'PKR',
      },
      memberships: [],
      activeRole: RoleType.BUSINESS_OWNER,
      isAuthenticated: true,
      isLoading: false,
      isAuditor: false,
      hasRole: () => true,
      canRunAiWorkflows: true,
      canMutateLedger: true,
      canManageBudgets: true,
      canExportReports: true,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
    });

    const docExtractionRun = {
      id: 'wf-doc-1',
      organizationId: 'org-star',
      requestedByUserId: 'usr-1',
      prompt: 'Extract and verify INVOICE fields from uploaded document "Star_Business_Invoice.pdf"',
      taskClassification: 'CUSTOMER_INVOICE_DOCUMENT_EXTRACTION',
      selectedAgents: [
        AgentType.SUPERVISOR_ORCHESTRATOR,
        AgentType.FINANCE_DATA_ANALYST,
        AgentType.VERIFIER_AI,
      ],
      executionMode: 'SPECIALIST_ANALYST_THEN_SEQUENTIAL_VERIFIER',
      status: ExecutionStatus.COMPLETED,
      verificationStatus: VerificationStatus.REQUIRES_HUMAN_REVIEW,
      synthesizedResult: null,
      verifierReport: null,
      agentRuns: [
        {
          id: 'ar-doc-analyst',
          workflowRunId: 'wf-doc-1',
          agentType: AgentType.FINANCE_DATA_ANALYST,
          sandboxId: 'sb-doc-1',
          status: ExecutionStatus.COMPLETED,
          loadedSkills: ['skill.document-invoice-bill-extraction'],
          allowedTools: [],
          invokedTools: [],
          inputContext: { fileName: 'Star_Business_Invoice.pdf', documentType: 'INVOICE' },
          outputPayload: {
            skillId: 'skill.document-invoice-bill-extraction',
            extractedDocument: {
              documentType: 'INVOICE',
              documentNumber: 'INV-SB-2026-101',
              counterpartyName: 'Al-Madina Traders',
              counterpartyEmail: 'billing@starbusiness.pk',
              issueDate: '2026-11-11',
              dueDate: '2026-11-18',
              currency: 'PKR',
              currencySource: 'DOCUMENT',
              subtotalAmount: '55000.0000',
              taxAmount: '0.0000',
              taxRate: '0.0000',
              totalAmount: '55000.0000',
            },
            lineItems: [
              {
                description: 'Responsive storefront & admin dashboard',
                quantity: '1.0000',
                unitPrice: '40000.0000',
                taxRate: '0.0000',
                lineTotal: '40000.0000',
              },
              {
                description: 'SEO optimization & backups',
                quantity: '1.0000',
                unitPrice: '15000.0000',
                taxRate: '0.0000',
                lineTotal: '15000.0000',
              },
            ],
            fieldConfidence: {
              documentNumber: 0.9,
              counterpartyName: 0.85,
              totalAmount: 0.75,
            },
            extractionNotes: ['Total amount derived from extracted subtotal + tax.'],
            sanitizationFlags: [],
          },
          durationMs: 34,
        },
        {
          id: 'ar-doc-verifier',
          workflowRunId: 'wf-doc-1',
          agentType: AgentType.VERIFIER_AI,
          sandboxId: 'sb-doc-2',
          status: ExecutionStatus.COMPLETED,
          loadedSkills: ['skill.document-extraction-verification'],
          allowedTools: [],
          invokedTools: [],
          outputPayload: {
            skillId: 'skill.document-extraction-verification',
            isApproved: true,
            confidenceScore: 0.86,
            validationErrors: [],
            notes: 'Extracted document passed deterministic arithmetic, date order, and required field verification.',
            arithmeticVerification: {
              isValid: true,
              dateOrderValid: true,
              discrepancies: [],
              missingRequiredFields: [],
            },
          },
          durationMs: 15,
        },
      ],
      createdAt: '2026-11-12T00:00:00.000Z',
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/workflows')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: [docExtractionRun] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(<AiOrchestrationPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Human-in-the-Loop \(1\)/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Human-in-the-Loop \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /Review & Decide/i }));

    const modal = within(screen.getByRole('dialog'));

    // Derived Executive Summary & Document Reference
    expect(
      modal.getByText(/Extracted INVOICE INV-SB-2026-101 for Al-Madina Traders .* from "Star_Business_Invoice\.pdf"/i),
    ).toBeInTheDocument();
    expect(modal.getByText('Document: Star_Business_Invoice.pdf')).toBeInTheDocument();

    // Extracted Invoice Fields & Line Items
    expect(modal.getByText('INV-SB-2026-101')).toBeInTheDocument();
    expect(modal.getByText('Al-Madina Traders')).toBeInTheDocument();
    expect(modal.getByText('2026-11-11')).toBeInTheDocument();
    expect(modal.getByText('2026-11-18')).toBeInTheDocument();
    expect(modal.getByText('Responsive storefront & admin dashboard')).toBeInTheDocument();
    expect(modal.getByText('SEO optimization & backups')).toBeInTheDocument();

    // Low-confidence warning for totalAmount (75%)
    expect(modal.getByText(/Missing or Uncertain Fields/i)).toBeInTheDocument();
    expect(modal.getByText(/Total Amount \(75%\)/i)).toBeInTheDocument();

    // Finance Data Analyst structured summary & notes
    expect(
      modal.getByText(/Extracted INVOICE INV-SB-2026-101 for Al-Madina Traders \(PKR\s*55,000, 2 line item\(s\)\)/i),
    ).toBeInTheDocument();
    expect(modal.getByText(/Total amount derived from extracted subtotal \+ tax/i)).toBeInTheDocument();

    // Verifier AI AgentRun report & citations
    expect(modal.getByText('VERIFICATION PASSED')).toBeInTheDocument();
    expect(modal.getByText(/Confidence Score:/i)).toBeInTheDocument();
    expect(
      modal.getByText(/Extracted document passed deterministic arithmetic, date order, and required field verification/i),
    ).toBeInTheDocument();
    expect(modal.getByText('Star_Business_Invoice.pdf')).toBeInTheDocument();
  });

  it('shows explicit warnings when extraction payload is missing and when Verifier AI report is unavailable', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'owner@starbusiness.pk',
        fullName: 'Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
        name: 'Star Business',
        slug: 'star-business',
        role: RoleType.BUSINESS_OWNER,
        baseCurrency: 'PKR',
      },
      memberships: [],
      activeRole: RoleType.BUSINESS_OWNER,
      isAuthenticated: true,
      isLoading: false,
      isAuditor: false,
      hasRole: () => true,
      canRunAiWorkflows: true,
      canMutateLedger: true,
      canManageBudgets: true,
      canExportReports: true,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
    });

    const incompleteDocRun = {
      id: 'wf-doc-missing',
      organizationId: 'org-star',
      requestedByUserId: 'usr-1',
      prompt: 'Extract and verify INVOICE fields from uploaded document "missing_scan.pdf"',
      taskClassification: 'CUSTOMER_INVOICE_DOCUMENT_EXTRACTION',
      selectedAgents: [
        AgentType.SUPERVISOR_ORCHESTRATOR,
        AgentType.FINANCE_DATA_ANALYST,
        AgentType.VERIFIER_AI,
      ],
      executionMode: 'SPECIALIST_ANALYST_THEN_SEQUENTIAL_VERIFIER',
      status: ExecutionStatus.COMPLETED,
      verificationStatus: VerificationStatus.REQUIRES_HUMAN_REVIEW,
      synthesizedResult: null,
      verifierReport: null,
      agentRuns: [
        {
          id: 'ar-doc-missing-analyst',
          workflowRunId: 'wf-doc-missing',
          agentType: AgentType.FINANCE_DATA_ANALYST,
          sandboxId: 'sb-missing-1',
          status: ExecutionStatus.COMPLETED,
          loadedSkills: ['skill.document-invoice-bill-extraction'],
          allowedTools: [],
          invokedTools: [],
          inputContext: { fileName: 'missing_scan.pdf', documentType: 'INVOICE' },
          outputPayload: {},
        },
      ],
      createdAt: '2026-11-12T00:00:00.000Z',
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/workflows')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: [incompleteDocRun] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(<AiOrchestrationPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Human-in-the-Loop \(1\)/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Human-in-the-Loop \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /Review & Decide/i }));

    const modal = within(screen.getByRole('dialog'));

    expect(
      modal.getByText(/Document extraction payload is missing or unavailable for "missing_scan\.pdf"/i),
    ).toBeInTheDocument();
    expect(
      modal.getByText(/Extracted invoice fields are unavailable in the recorded specialist agent payload/i),
    ).toBeInTheDocument();
    expect(modal.getByText('VERIFICATION INCOMPLETE')).toBeInTheDocument();
    expect(modal.queryByText('VERIFICATION PASSED')).not.toBeInTheDocument();
    expect(
      modal.getByText(/Verifier AI did not execute or attach a report\. Verification is incomplete and this workflow is not verified/i),
    ).toBeInTheDocument();
  });

  it('displays Arithmetic: YES with VERIFICATION FLAGGED when line-item arithmetic passes (0 discrepancies) but required metadata fields are missing', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'owner@starbusiness.pk',
        fullName: 'Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
        name: 'Star Business',
        slug: 'star-business',
        role: RoleType.BUSINESS_OWNER,
        baseCurrency: 'PKR',
      },
      memberships: [],
      activeRole: RoleType.BUSINESS_OWNER,
      isAuthenticated: true,
      isLoading: false,
      isAuditor: false,
      hasRole: () => true,
      canRunAiWorkflows: true,
      canMutateLedger: true,
      canManageBudgets: true,
      canExportReports: true,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
    });

    const partialMetadataRun = {
      id: 'wf-doc-star-bill',
      organizationId: 'org-star',
      requestedByUserId: 'usr-1',
      prompt: 'Extract and verify INVOICE fields from uploaded document "Star_Business_Bill.pdf"',
      taskClassification: 'CUSTOMER_INVOICE_DOCUMENT_EXTRACTION',
      selectedAgents: [
        AgentType.SUPERVISOR_ORCHESTRATOR,
        AgentType.FINANCE_DATA_ANALYST,
        AgentType.VERIFIER_AI,
      ],
      executionMode: 'SPECIALIST_ANALYST_THEN_SEQUENTIAL_VERIFIER',
      status: ExecutionStatus.COMPLETED,
      verificationStatus: VerificationStatus.REQUIRES_HUMAN_REVIEW,
      synthesizedResult: null,
      verifierReport: null,
      agentRuns: [
        {
          id: 'ar-star-analyst',
          workflowRunId: 'wf-doc-star-bill',
          agentType: AgentType.FINANCE_DATA_ANALYST,
          sandboxId: 'sb-star-1',
          status: ExecutionStatus.COMPLETED,
          loadedSkills: ['skill.document-invoice-bill-extraction'],
          allowedTools: [],
          invokedTools: [],
          inputContext: { fileName: 'Star_Business_Bill.pdf', documentType: 'INVOICE' },
          outputPayload: {
            skillId: 'skill.document-invoice-bill-extraction',
            extractedDocument: {
              documentType: 'INVOICE',
              documentNumber: null,
              counterpartyName: 'Walk-in Customer (Bilal Ahmed)',
              issueDate: null,
              dueDate: null,
              currency: 'PKR',
              subtotalAmount: '9400.0000',
              taxAmount: null,
              taxRate: null,
              totalAmount: '9400.0000',
            },
            lineItems: [
              {
                description: 'Office Stationery Bundle',
                quantity: '2.0000',
                unitPrice: '1500.0000',
                taxRate: '0.0000',
                lineTotal: '3000.0000',
              },
              {
                description: 'Wireless Mouse (Logitech)',
                quantity: '1.0000',
                unitPrice: '2800.0000',
                taxRate: '0.0000',
                lineTotal: '2800.0000',
              },
              {
                description: 'A4 Printing Paper Rim (70gsm)',
                quantity: '3.0000',
                unitPrice: '1200.0000',
                taxRate: '0.0000',
                lineTotal: '3600.0000',
              },
            ],
            fieldConfidence: {
              documentNumber: 0,
              counterpartyName: 0.88,
              issueDate: 0,
              dueDate: 0,
              totalAmount: 0.92,
            },
            extractionNotes: ['Payment mode detected separately: Cash / JazzCash.'],
          },
        },
        {
          id: 'ar-star-verifier',
          workflowRunId: 'wf-doc-star-bill',
          agentType: AgentType.VERIFIER_AI,
          sandboxId: 'sb-star-2',
          status: ExecutionStatus.COMPLETED,
          loadedSkills: ['skill.document-extraction-verification'],
          allowedTools: [],
          invokedTools: [],
          outputPayload: {
            skillId: 'skill.document-extraction-verification',
            isApproved: false,
            confidenceScore: 0.36,
            validationErrors: [
              'Missing required field: invoiceNumber',
              'Missing required field: issueDate',
              'Missing required field: dueDate',
            ],
            notes: 'Arithmetic checks passed (0 discrepancies); manual review required for 3 missing field(s): invoiceNumber, issueDate, dueDate.',
            arithmeticVerification: {
              isValid: false,
              discrepancies: [],
              lineItemsMatchSubtotal: true,
              subtotalPlusTaxMatchesTotal: null,
              missingRequiredFields: ['invoiceNumber', 'issueDate', 'dueDate'],
            },
          },
        },
      ],
      createdAt: '2026-11-12T02:16:18.000Z',
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/workflows')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: [partialMetadataRun] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(<AiOrchestrationPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Human-in-the-Loop \(1\)/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Human-in-the-Loop \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /Review & Decide/i }));

    const modal = within(screen.getByRole('dialog'));

    expect(modal.getByText('VERIFICATION FLAGGED')).toBeInTheDocument();
    expect(modal.getByText(/Arithmetic:/i).textContent).toContain('YES');
    expect(modal.getByText('Walk-in Customer (Bilal Ahmed)')).toBeInTheDocument();
    expect(
      modal.getByText(/Missing required field: invoiceNumber/i),
    ).toBeInTheDocument();
  });

  it('displays derived summary, specialist notes, and verifier report for historical FILE_SCHEMA_PROFILING_AND_COLUMN_MAPPING runs with null synthesizedResult', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'owner@starbusiness.pk',
        fullName: 'Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
        name: 'Star Business',
        slug: 'star-business',
        role: RoleType.BUSINESS_OWNER,
        baseCurrency: 'PKR',
      },
      memberships: [],
      activeRole: RoleType.BUSINESS_OWNER,
      isAuthenticated: true,
      isLoading: false,
      isAuditor: false,
      hasRole: () => true,
      canRunAiWorkflows: true,
      canMutateLedger: true,
      canManageBudgets: true,
      canExportReports: true,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
    });

    const schemaRun = {
      id: 'wf-schema-1',
      organizationId: 'org-star',
      requestedByUserId: 'usr-1',
      prompt: 'File schema profiling and auto-mapping for november_ledger.csv (6 headers)',
      taskClassification: 'FILE_SCHEMA_PROFILING_AND_COLUMN_MAPPING',
      selectedAgents: [
        AgentType.SUPERVISOR_ORCHESTRATOR,
        AgentType.FINANCE_DATA_ANALYST,
        AgentType.VERIFIER_AI,
      ],
      executionMode: 'SPECIALIST_ANALYST_THEN_SEQUENTIAL_VERIFIER',
      status: ExecutionStatus.COMPLETED,
      verificationStatus: VerificationStatus.REQUIRES_HUMAN_REVIEW,
      synthesizedResult: null,
      verifierReport: null,
      agentRuns: [
        {
          id: 'ar-schema-analyst',
          workflowRunId: 'wf-schema-1',
          agentType: AgentType.FINANCE_DATA_ANALYST,
          sandboxId: 'sb-schema-1',
          status: ExecutionStatus.COMPLETED,
          loadedSkills: ['skill.file-schema-profiling-and-column-mapping'],
          allowedTools: [],
          invokedTools: [],
          outputPayload: {
            notes: 'Finance Data Analyst profiled 6 headers across 1 sample row(s): mapped 6 canonical fields (0 unmapped).',
          },
        },
        {
          id: 'ar-schema-verifier',
          workflowRunId: 'wf-schema-1',
          agentType: AgentType.VERIFIER_AI,
          sandboxId: 'sb-schema-2',
          status: ExecutionStatus.COMPLETED,
          loadedSkills: ['skill.column-mapping-verification'],
          allowedTools: [],
          invokedTools: [],
          outputPayload: {
            isApproved: false,
            confidenceScore: 0.65,
            validationErrors: [],
            notes: 'Verifier AI flagged proposed mappings: 0 error(s) found. Manual user confirmation required.',
          },
        },
      ],
      createdAt: '2026-11-12T01:00:00.000Z',
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/workflows')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: [schemaRun] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(<AiOrchestrationPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Human-in-the-Loop \(1\)/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Human-in-the-Loop \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /Review & Decide/i }));

    const modal = within(screen.getByRole('dialog'));
    expect(
      modal.getAllByText(/Finance Data Analyst profiled 6 headers across 1 sample row\(s\)/i).length,
    ).toBeGreaterThanOrEqual(2);
    expect(modal.getByText('VERIFICATION FLAGGED')).toBeInTheDocument();
    expect(
      modal.getByText(/Verifier AI flagged proposed mappings: 0 error\(s\) found/i),
    ).toBeInTheDocument();
  });

  it('displays full normalized Executive Summary, Specialist Results, and Verifier status inside Inspect Run Drawer without marking RUNNING workflows as PASSED', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'owner@starbusiness.pk',
        fullName: 'Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
        name: 'Star Business',
        slug: 'star-business',
        role: RoleType.BUSINESS_OWNER,
        baseCurrency: 'PKR',
      },
      memberships: [],
      activeRole: RoleType.BUSINESS_OWNER,
      isAuthenticated: true,
      isLoading: false,
      isAuditor: false,
      hasRole: () => true,
      canRunAiWorkflows: true,
      canMutateLedger: true,
      canManageBudgets: true,
      canExportReports: true,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
    });

    const runningWorkflow = {
      id: 'wf-running-inspect',
      organizationId: 'org-star',
      requestedByUserId: 'usr-1',
      prompt: 'File schema profiling and auto-mapping for SME_Financial_Test_Data.xlsx',
      taskClassification: 'FILE_SCHEMA_PROFILING_AND_COLUMN_MAPPING',
      selectedAgents: [
        AgentType.SUPERVISOR_ORCHESTRATOR,
        AgentType.FINANCE_DATA_ANALYST,
        AgentType.VERIFIER_AI,
      ],
      executionMode: 'SPECIALIST_ANALYST_THEN_SEQUENTIAL_VERIFIER',
      status: ExecutionStatus.RUNNING,
      verificationStatus: VerificationStatus.PENDING,
      synthesizedResult: {
        executiveSummary:
          'No usable agent findings available (incomplete/missing: FINANCE_DATA_ANALYST).',
      },
      agentRuns: [],
      createdAt: '2026-11-12T03:00:00.000Z',
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/workflows')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: [runningWorkflow] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(<AiOrchestrationPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Inspect/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Inspect/i }));

    expect(
      screen.getByText(/Workflow Run Inspection: FILE_SCHEMA_PROFILING_AND_COLUMN_MAPPING/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No usable agent findings available \(incomplete\/missing: FINANCE_DATA_ANALYST\)/i),
    ).toBeInTheDocument();
    expect(screen.getByText('VERIFICATION INCOMPLETE')).toBeInTheDocument();
    expect(screen.queryByText('VERIFICATION PASSED')).not.toBeInTheDocument();
  });

  it('displays reconciled database + PDF fields, provenance badges, and PDF-vs-DB conflict alerts in HITL modal', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'owner@starbusiness.pk',
        fullName: 'Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
        name: 'Star Business',
        slug: 'star-business',
        role: RoleType.BUSINESS_OWNER,
        baseCurrency: 'PKR',
      },
      memberships: [],
      activeRole: RoleType.BUSINESS_OWNER,
      isAuthenticated: true,
      isLoading: false,
      isAuditor: false,
      hasRole: () => true,
      canRunAiWorkflows: true,
      canMutateLedger: true,
      canManageBudgets: true,
      canExportReports: true,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
    });

    const reconciledRun = {
      id: 'wf-reconciled-1',
      organizationId: 'org-star',
      requestedByUserId: 'usr-1',
      prompt: 'Automatic post-invoice save intelligence workflow [doc:inv-db-1] for INV-SB-2026-101',
      taskClassification: 'AUTO_POST_INVOICE_ORCHESTRATION',
      selectedAgents: [AgentType.FINANCE_DATA_ANALYST, AgentType.VERIFIER_AI],
      executionMode: 'AUTO_POST_SAVE_PARALLEL_THEN_SEQUENTIAL_VERIFIER',
      status: ExecutionStatus.COMPLETED,
      verificationStatus: VerificationStatus.REQUIRES_HUMAN_REVIEW,
      synthesizedResult: {
        executiveSummary: 'Reconciled INV-SB-2026-101 with database record.',
        reconciledRecord: {
          recordId: 'inv-db-1',
          organizationId: 'org-star',
          documentType: 'INVOICE' as const,
          status: 'ISSUED',
          fields: {
            documentNumber: 'INV-SB-2026-101',
            counterpartyName: 'Al-Madina Traders',
            counterpartyEmail: 'accounts@almadinatraders.pk',
            category: 'Sales Revenue',
            department: 'Enterprise Sales',
            currency: 'PKR',
            issueDate: '2026-11-12',
            dueDate: '2026-11-19',
            subtotalAmount: '55000.0000',
            discountRate: '5.0000',
            discountAmount: '2750.0000',
            taxRate: '0.0000',
            taxAmount: '0.0000',
            totalAmount: '52250.0000',
            notes: 'Discount: PKR 2,750 (5%) | Net 7',
            lineItems: [
              {
                description: 'Storefront & Dashboard',
                quantity: '1.0000',
                unitPrice: '55000.0000',
                taxRate: '0.0000',
                lineTotal: '55000.0000',
              },
            ],
          },
          fieldSources: {
            documentNumber: 'VERIFIED' as const,
            counterpartyName: 'VERIFIED' as const,
            counterpartyEmail: 'DATABASE' as const,
            category: 'DATABASE' as const,
            department: 'DATABASE' as const,
            currency: 'VERIFIED' as const,
            issueDate: 'VERIFIED' as const,
            dueDate: 'CONFLICT' as const,
            subtotalAmount: 'VERIFIED' as const,
            discountAmount: 'DATABASE' as const,
            taxAmount: 'VERIFIED' as const,
            totalAmount: 'VERIFIED' as const,
            notes: 'DATABASE' as const,
            lineItems: 'VERIFIED' as const,
          },
          conflicts: [
            { field: 'dueDate', pdfValue: '2026-11-18', databaseValue: '2026-11-19' },
          ],
          missingInPdfOnly: ['counterpartyEmail', 'department'],
          missingInRecord: [],
          hasDatabaseRecord: true,
          hasPdfExtraction: true,
        },
      },
      verifierReport: {
        verificationPassed: false,
        arithmeticVerified: true,
        citationsVerified: true,
        nonFraudComplianceVerified: true,
        auditNotes: 'PDF vs Database conflict on dueDate.',
      },
      agentRuns: [],
      createdAt: '2026-11-12T04:00:00.000Z',
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/workflows')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: [reconciledRun] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(<AiOrchestrationPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Human-in-the-Loop \(1\)/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Human-in-the-Loop \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /Review & Decide/i }));

    const modal = within(screen.getByRole('dialog'));
    expect(modal.getByText('Reconciled Financial Document Record')).toBeInTheDocument();
    expect(modal.getByText(/DB ID: inv-db-1 \(ISSUED\)/i)).toBeInTheDocument();
    expect(modal.getByText('accounts@almadinatraders.pk')).toBeInTheDocument();
    expect(modal.getByText('Enterprise Sales')).toBeInTheDocument();
    expect(modal.getByText('Discount: PKR 2,750 (5%) | Net 7')).toBeInTheDocument();
    expect(modal.getByText('PDF vs Database Conflicts Detected')).toBeInTheDocument();
    expect(modal.getByText(/PDF="2026-11-18" vs DB="2026-11-19"/i)).toBeInTheDocument();
  });
});
