import { describe, expect, it } from 'vitest';
import { formatAssistantResponse } from './aiAssistantResponse';

describe('formatAssistantResponse', () => {
  it('uses specialist financial findings instead of orchestration logs and preserves audit IDs', () => {
    const result = formatAssistantResponse({
      success: true,
      data: {
        id: 'workflow-123',
        status: 'COMPLETED',
        verificationStatus: 'APPROVED',
        durationMs: 742,
        synthesizedResult: {
          executiveSummary:
            'Completed CASH_FLOW_FORECASTING across 2 specialist agent(s) and Verifier AI Agent.',
          selectedSpecialistAgents: ['FINANCE_DATA_ANALYST', 'CASH_FLOW_FORECASTING'],
          specialistFindings: [
            {
              agentType: 'FINANCE_DATA_ANALYST',
              skillResults: [
                {
                  summary: 'Cash runway is 8.4 months; working capital is PKR 385,000.00.',
                },
              ],
            },
          ],
          verifierAudit: {
            verificationPassed: true,
            arithmeticVerified: true,
            citationsVerified: true,
            checkedSpecialistCount: 2,
          },
          sourceRecordIds: {
            accountIds: ['acc-1', 'acc-2'],
            transactionIds: ['tx-1', 'tx-2'],
          },
        },
      },
    });

    expect(result.answer).toBe('Cash runway is 8.4 months; working capital is PKR 385,000.00.');
    expect(result.answer).not.toContain('CASH_FLOW_FORECASTING');
    expect(result.execution.label).toBe('Verified across 2 specialist agents');
    expect(result.execution.workflowId).toBe('workflow-123');
    expect(result.citations).toEqual([
      '2 Accounts · References: acc-1, acc-2',
      '2 Transactions · References: tx-1, tx-2',
    ]);
  });

  it('does not claim verification when a legacy response has no verification result', () => {
    const result = formatAssistantResponse({
      success: true,
      data: {
        answer: 'Cash runway is 8.0 months.',
        citations: ['tx-100', 'tx-101'],
        formulaVersion: 'decimal-v2',
      },
    });

    expect(result.answer).toBe('Cash runway is 8.0 months.');
    expect(result.execution.label).toBe('Response received · verification not confirmed');
    expect(result.execution.tone).toBe('neutral');
    expect(result.execution.formulaVersion).toBe('decimal-v2');
    expect(result.citations).toEqual(['Source references: tx-100, tx-101']);
  });

  it('humanizes count-only technical citations and reports failed execution', () => {
    const result = formatAssistantResponse({
      status: 'FAILED',
      citations: ['invoiceIds: 4 records'],
    });

    expect(result.answer).toBe('The analysis did not complete. Review the execution status below.');
    expect(result.execution.label).toBe('Execution failed');
    expect(result.execution.tone).toBe('error');
    expect(result.citations).toEqual(['4 Invoices']);
  });

  it('does not display a classification log when no financial summary is returned', () => {
    const result = formatAssistantResponse({
      status: 'COMPLETED',
      synthesizedResult: {
        executiveSummary: 'Completed RISK_ANALYSIS across 1 specialist agent(s).',
      },
    });

    expect(result.answer).toBe('The workflow completed but did not return a financial summary.');
    expect(result.execution.label).toBe('Completed · verification not confirmed');
    expect(result.execution.label).not.toContain('Verified');
  });

  it('humanizes raw 4-decimal deterministic skill outputs, unsupported flags, recommendations, and payment citations', () => {
    const result = formatAssistantResponse({
      status: 'COMPLETED',
      verificationStatus: 'APPROVED',
      synthesizedResult: {
        executiveSummary:
          'Completed COMPREHENSIVE_FINANCIAL_INTELLIGENCE_WORKFLOW across 2 specialist agent(s) and Verifier AI Agent.',
        selectedSpecialistAgents: ['CASH_FLOW_FORECASTING', 'FINANCE_DATA_ANALYST'],
        specialistFindings: [
          {
            agentType: 'CASH_FLOW_FORECASTING',
            skillResults: [
              {
                summary:
                  '30-day (OPTIMISTIC) forecast projects closing cash of 2615829.9600 from an opening balance of 2615499.9600 (minimum cash: 2615499.9600; liquidity warning: false).',
                assumptions: { baseCurrency: 'PKR' },
              },
            ],
          },
          {
            agentType: 'FINANCE_DATA_ANALYST',
            skillResults: [
              {
                summary:
                  'Deterministic financial analysis completed across 2 account(s) and 51 transaction(s). Operating cash flow: 612200.0000, Working capital: 2615400.0000, Current ratio: UNSUPPORTED.',
                recommendations: [{ action: 'Review active risk alerts in Risk Center' }],
              },
            ],
          },
        ],
        verifierAudit: {
          verificationPassed: true,
          arithmeticVerified: true,
          citationsVerified: true,
        },
        sourceRecordIds: {
          unpostedPaymentRecordIds: ['pay-1'],
        },
      },
    });

    expect(result.answer).toContain(
      '30-day (Optimistic) forecast projects closing cash of PKR 2,615,829.96 from an opening balance of PKR 2,615,499.96 (minimum cash: PKR 2,615,499.96; no liquidity warning).',
    );
    expect(result.answer).toContain(
      'Financial analysis across 2 accounts and 51 transactions. Operating cash flow: PKR 612,200.00, Working capital: PKR 2,615,400.00, Current ratio: unavailable.',
    );
    expect(result.answer).toContain('• Review active risk alerts in Risk Center');
    expect(result.citations).toEqual(['1 Unreconciled payment · Reference: pay-1']);
  });

  it('translates raw risk type codes in answers into business-friendly English', () => {
    const result = formatAssistantResponse({
      success: true,
      data: {
        answer: 'Risk identified: DUPLICATE_CANDIDATE detected alongside OVERDUE_RECEIVABLE.',
      },
    });

    expect(result.answer).toBe(
      'Risk identified: Possible Duplicate Charge detected alongside Overdue Customer Invoice.',
    );
  });
});
