import { AgentType, ExecutionStatus, VerificationStatus } from '../../generated/prisma/client.js';
import {
  normalizeWorkflowRunForResponse,
  type WorkflowRunLike,
} from './workflow-result-normalizer.util.js';

describe('WorkflowResultNormalizer (System-Wide Synthesis & Historical Compatibility)', () => {
  it('preserves complete AUTO_POST_INVOICE_ORCHESTRATION / LEDGER_IMPORT synthesizedResult and verifierReport', () => {
    const run: WorkflowRunLike = {
      id: 'wf-auto-1',
      organizationId: 'org-1',
      prompt: 'Automatic post-invoice save intelligence workflow',
      taskClassification: 'AUTO_POST_INVOICE_ORCHESTRATION',
      selectedAgents: [
        AgentType.FINANCE_DATA_ANALYST,
        AgentType.CASH_FLOW_FORECASTING,
        AgentType.STRATEGIC_RECOMMENDATION,
        AgentType.VERIFIER_AI,
      ],
      executionMode: 'AUTO_POST_SAVE_PARALLEL_THEN_SEQUENTIAL_VERIFIER',
      status: ExecutionStatus.COMPLETED,
      verificationStatus: VerificationStatus.REQUIRES_HUMAN_REVIEW,
      synthesizedResult: {
        executiveSummary: 'Completed AUTO_POST_INVOICE_ORCHESTRATION across 3 specialist agent(s) and Verifier AI.',
        executedAgents: [AgentType.FINANCE_DATA_ANALYST, AgentType.CASH_FLOW_FORECASTING],
        failedAgents: [],
      },
      verifierReport: {
        verificationPassed: true,
        arithmeticVerified: true,
        citationsVerified: true,
        nonFraudComplianceVerified: true,
        auditNotes: 'All 3 specialist outputs verified.',
      },
      sourceRecordIds: { invoiceIds: ['inv-1'] },
      agentRuns: [
        {
          id: 'ar-1',
          agentType: AgentType.FINANCE_DATA_ANALYST,
          status: ExecutionStatus.COMPLETED,
          outputPayload: {
            skillResults: [{ skillId: 'skill.financial-data-analysis', summary: 'OCF is PKR 85,000.' }],
          },
        },
        {
          id: 'ar-2',
          agentType: AgentType.CASH_FLOW_FORECASTING,
          status: ExecutionStatus.COMPLETED,
          outputPayload: {
            skillResults: [{ skillId: 'skill.cash-flow-forecasting', summary: '30-day closing cash PKR 120,000.' }],
          },
        },
        {
          id: 'ar-3',
          agentType: AgentType.STRATEGIC_RECOMMENDATION,
          status: ExecutionStatus.COMPLETED,
          outputPayload: {
            skillResults: [{ skillId: 'skill.strategic-financial-recommendations', summary: 'Track open AR.' }],
          },
        },
        {
          id: 'ar-v',
          agentType: AgentType.VERIFIER_AI,
          status: ExecutionStatus.COMPLETED,
          outputPayload: { verificationPassed: true },
        },
      ],
    };

    const normalized = normalizeWorkflowRunForResponse(run);
    expect((normalized.synthesizedResult as Record<string, unknown>).executiveSummary).toBe(
      'Completed AUTO_POST_INVOICE_ORCHESTRATION across 3 specialist agent(s) and Verifier AI.',
    );
    expect((normalized.verifierReport as Record<string, unknown>).verificationPassed).toBe(true);
    expect(normalized.sourceRecordIds).toEqual({ invoiceIds: ['inv-1'] });
  });

  it('normalizes historical AgentRun-only CUSTOMER_INVOICE_DOCUMENT_EXTRACTION with missing metadata and arithmeticValid=true', () => {
    const historicalRun: WorkflowRunLike = {
      id: 'wf-doc-hist',
      organizationId: 'org-1',
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
          id: 'ar-doc',
          agentType: AgentType.FINANCE_DATA_ANALYST,
          status: ExecutionStatus.COMPLETED,
          outputPayload: {
            extractedDocument: {
              documentType: 'INVOICE',
              documentNumber: null,
              counterpartyName: 'Walk-in Customer (Bilal Ahmed)',
              currency: 'PKR',
              totalAmount: '9400.0000',
            },
            lineItems: [{ description: 'Item 1' }, { description: 'Item 2' }, { description: 'Item 3' }],
          },
        },
        {
          id: 'ar-doc-v',
          agentType: AgentType.VERIFIER_AI,
          status: ExecutionStatus.COMPLETED,
          outputPayload: {
            isApproved: false,
            confidenceScore: 0.36,
            validationErrors: ['Missing required field: invoiceNumber'],
            notes: 'Arithmetic checks passed (0 discrepancies); manual review required.',
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
    };

    const normalized = normalizeWorkflowRunForResponse(historicalRun);
    const synth = normalized.synthesizedResult as Record<string, unknown>;
    const verifier = normalized.verifierReport as Record<string, unknown>;

    expect(String(synth.executiveSummary)).toContain('Extracted INVOICE (unnumbered) for Walk-in Customer (Bilal Ahmed)');
    expect(verifier.verificationPassed).toBe(false);
    expect(verifier.arithmeticVerified).toBe(true);
    expect(verifier.confidenceScore).toBe(0.36);
  });

  it('normalizes historical AgentRun-only FILE_SCHEMA_PROFILING_AND_COLUMN_MAPPING runs', () => {
    const schemaRun: WorkflowRunLike = {
      id: 'wf-schema-hist',
      organizationId: 'org-1',
      prompt: 'File schema profiling and auto-mapping for november_ledger.csv (6 headers)',
      taskClassification: 'FILE_SCHEMA_PROFILING_AND_COLUMN_MAPPING',
      selectedAgents: [AgentType.SUPERVISOR_ORCHESTRATOR, AgentType.FINANCE_DATA_ANALYST, AgentType.VERIFIER_AI],
      executionMode: 'SPECIALIST_ANALYST_THEN_SEQUENTIAL_VERIFIER',
      status: ExecutionStatus.COMPLETED,
      verificationStatus: VerificationStatus.REQUIRES_HUMAN_REVIEW,
      synthesizedResult: null,
      verifierReport: null,
      agentRuns: [
        {
          id: 'ar-schema',
          agentType: AgentType.FINANCE_DATA_ANALYST,
          status: ExecutionStatus.COMPLETED,
          outputPayload: {
            notes: 'Finance Data Analyst profiled 6 headers across 1 sample row(s): mapped 6 canonical fields (0 unmapped).',
          },
        },
        {
          id: 'ar-schema-v',
          agentType: AgentType.VERIFIER_AI,
          status: ExecutionStatus.COMPLETED,
          outputPayload: {
            isApproved: false,
            confidenceScore: 0.65,
            validationErrors: [],
            notes: 'Verifier AI flagged proposed mappings: 0 error(s) found. Manual user confirmation required.',
          },
        },
      ],
    };

    const normalized = normalizeWorkflowRunForResponse(schemaRun);
    const synth = normalized.synthesizedResult as Record<string, unknown>;
    const verifier = normalized.verifierReport as Record<string, unknown>;

    expect(synth.executiveSummary).toBe(
      'Finance Data Analyst profiled 6 headers across 1 sample row(s): mapped 6 canonical fields (0 unmapped).',
    );
    expect(verifier.verificationPassed).toBe(false);
    expect(verifier.confidenceScore).toBe(0.65);
  });

  it('produces partial executive summary and discloses failed/incomplete agents when some specialists fail', () => {
    const partialRun: WorkflowRunLike = {
      id: 'wf-partial-1',
      organizationId: 'org-1',
      prompt: 'Comprehensive financial intelligence run',
      taskClassification: 'COMPREHENSIVE_FINANCIAL_INTELLIGENCE_WORKFLOW',
      selectedAgents: [AgentType.FINANCE_DATA_ANALYST, AgentType.CASH_FLOW_FORECASTING, AgentType.VERIFIER_AI],
      executionMode: 'PARALLEL',
      status: ExecutionStatus.COMPLETED,
      verificationStatus: VerificationStatus.REQUIRES_HUMAN_REVIEW,
      synthesizedResult: null,
      verifierReport: null,
      agentRuns: [
        {
          id: 'ar-ok',
          agentType: AgentType.FINANCE_DATA_ANALYST,
          status: ExecutionStatus.COMPLETED,
          outputPayload: {
            skillResults: [{ summary: 'Working capital is PKR 120,000.' }],
          },
        },
        {
          id: 'ar-fail',
          agentType: AgentType.CASH_FLOW_FORECASTING,
          status: ExecutionStatus.FAILED,
          errorDetails: 'Insufficient forecast horizon data',
        },
        {
          id: 'ar-v-pend',
          agentType: AgentType.VERIFIER_AI,
          status: ExecutionStatus.PENDING,
        },
      ],
    };

    const normalized = normalizeWorkflowRunForResponse(partialRun);
    const synth = normalized.synthesizedResult as Record<string, unknown>;

    expect(String(synth.executiveSummary)).toContain('Partial workflow findings');
    expect(String(synth.executiveSummary)).toContain('CASH_FLOW_FORECASTING (FAILED)');
    expect(String(synth.executiveSummary)).toContain('Working capital is PKR 120,000.');
    expect(normalized.verifierReport).toBeNull();
    expect((synth.limitations as string[]).some((l) => l.includes('Verifier AI did not complete'))).toBe(true);
  });

  it('returns explicit "No usable agent findings available" when zero specialists succeed', () => {
    const emptyRun: WorkflowRunLike = {
      id: 'wf-empty-1',
      organizationId: 'org-1',
      prompt: 'Broken workflow',
      taskClassification: 'AUTO_POST_LEDGER_IMPORT_ORCHESTRATION',
      selectedAgents: [AgentType.FINANCE_DATA_ANALYST, AgentType.VERIFIER_AI],
      executionMode: 'AUTO_POST_SAVE_PARALLEL_THEN_SEQUENTIAL_VERIFIER',
      status: ExecutionStatus.FAILED,
      verificationStatus: VerificationStatus.PENDING,
      synthesizedResult: null,
      verifierReport: null,
      agentRuns: [
        {
          id: 'ar-fail-only',
          agentType: AgentType.FINANCE_DATA_ANALYST,
          status: ExecutionStatus.FAILED,
          errorDetails: 'Database timeout',
        },
      ],
    };

    const normalized = normalizeWorkflowRunForResponse(emptyRun);
    const synth = normalized.synthesizedResult as Record<string, unknown>;

    expect(String(synth.executiveSummary)).toContain('No usable agent findings available');
    expect(String(synth.executiveSummary)).toContain('Database timeout');
    expect(normalized.verifierReport).toBeNull();
  });
});
