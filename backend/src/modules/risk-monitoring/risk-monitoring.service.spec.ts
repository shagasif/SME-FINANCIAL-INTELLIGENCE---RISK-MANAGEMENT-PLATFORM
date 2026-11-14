import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ReviewActionType,
  ReviewTargetType,
  RiskAlertStatus,
  RiskAlertType,
  RiskSeverity,
} from '../../generated/prisma/client.js';
import { RiskMonitoringService } from './risk-monitoring.service.js';

function dec(val: string | number) {
  return new Prisma.Decimal(val);
}

describe('RiskMonitoringService Triage Workflows', () => {
  const orgId = 'org-test-1';
  const reviewerUserId = 'usr-auditor-1';

  const baseAlert = {
    id: 'alert-123',
    organizationId: orgId,
    type: RiskAlertType.UNUSUAL_AMOUNT,
    severity: RiskSeverity.HIGH,
    reviewPriority: 2,
    status: RiskAlertStatus.OPEN,
    title: 'Unusual expense amount in Software',
    explanation: 'Expense transaction exceeds threshold.',
    detectionMethod: 'Statistical Outlier Rule',
    metricValue: dec('45000.0000'),
    thresholdValue: dec('15000.0000'),
    supportingRecordIds: {
      transactionIds: ['tx-1'],
    },
    nonFraudDisclaimer: 'Statistical signal for human review.',
    detectedAt: new Date('2026-11-10T10:00:00.000Z'),
    updatedAt: new Date('2026-11-10T10:00:00.000Z'),
  };

  const citedTx = {
    id: 'tx-1',
    organizationId: orgId,
    reference: 'TXN-99881',
    amount: dec('45000.0000'),
    currency: 'USD',
    category: 'Software',
    counterparty: 'Acme Cloud',
    description: 'Annual license fee',
    transactionDate: new Date('2026-11-09T10:00:00.000Z'),
    type: 'EXPENSE',
    isArchived: false,
  };

  const correctionTx = {
    id: 'tx-refund-1',
    organizationId: orgId,
    reference: 'TXN-REFUND-99881',
    amount: dec('45000.0000'),
    currency: 'USD',
    description: 'Vendor refund for corrected invoice',
  };

  const historicalTxs = [
    {
      id: 'tx-hist-1',
      organizationId: orgId,
      amount: dec('12000.0000'),
      category: 'Software',
      counterparty: 'Acme Cloud',
      transactionDate: new Date('2026-10-01T10:00:00.000Z'),
      isArchived: false,
    },
    {
      id: 'tx-hist-2',
      organizationId: orgId,
      amount: dec('10000.0000'),
      category: 'Software',
      counterparty: 'Acme Cloud',
      transactionDate: new Date('2026-09-01T10:00:00.000Z'),
      isArchived: false,
    },
  ];

  function createMockPrisma(alertOverride = {}) {
    const currentAlert = { ...baseAlert, ...alertOverride };
    const reviewDecisions: any[] = [];

    const mockTx = {
      reviewDecision: {
        create: jest.fn(async ({ data }: any) => {
          const record = { id: `dec-${reviewDecisions.length + 1}`, createdAt: new Date(), ...data };
          reviewDecisions.unshift(record);
          return record;
        }),
      },
      riskAlert: {
        update: jest.fn(async ({ data }: any) => {
          currentAlert.status = data.status;
          return {
            ...currentAlert,
            reviewDecisions,
          };
        }),
      },
    };

    const prisma = {
      riskAlert: {
        findFirst: jest.fn(async () => currentAlert),
      },
      financialTransaction: {
        findFirst: jest.fn(async ({ where }: any) => {
          const references = (where.OR ?? []).flatMap((condition: any) => [
            ...(condition.id?.in ?? []),
            ...(condition.reference?.in ?? []),
          ]);
          return where.organizationId === orgId &&
            where.id?.in?.includes(correctionTx.id) &&
            references.includes(correctionTx.reference)
            ? correctionTx
            : null;
        }),
        findMany: jest.fn(async ({ where }: any) => {
          if (where.id?.in) {
            return [citedTx];
          }
          if (where.category) {
            return historicalTxs;
          }
          return [];
        }),
      },
      bill: {
        findFirst: jest.fn(async () => null),
      },
      invoice: {
        findFirst: jest.fn(async () => null),
      },
      $transaction: jest.fn(async (cb: any) => cb(mockTx)),
    };

    const audit = {
      record: jest.fn(async () => {}),
    };

    const budgetsService = {
      calculateBudgetVariance: jest.fn(),
    };

    return { prisma, audit, budgetsService, mockTx, reviewDecisions };
  }

  it('ACKNOWLEDGE: records monitoring as pending without claiming it started', async () => {
    const { prisma, audit, budgetsService, mockTx } = createMockPrisma();
    const service = new RiskMonitoringService(prisma as any, budgetsService as any, audit as any);

    const result = await service.triageAlert(
      orgId,
      'alert-123',
      {
        action: ReviewActionType.ACKNOWLEDGE,
        reviewerNotes: 'Verified with departmental lead. Initiating surveillance.',
      },
      reviewerUserId,
    );

    expect(result.status).toBe(RiskAlertStatus.ACKNOWLEDGED);
    expect(mockTx.reviewDecision.create).toHaveBeenCalledTimes(1);

    const callArgs = (mockTx.reviewDecision.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.data.action).toBe(ReviewActionType.ACKNOWLEDGE);
    expect(callArgs.data.targetType).toBe(ReviewTargetType.RISK_ALERT);
    expect(callArgs.data.reviewerUserId).toBe(reviewerUserId);
    expect(callArgs.data.newStatus).toBe(RiskAlertStatus.ACKNOWLEDGED);
    expect(callArgs.data.metadata.workflow).toBe('CONTINUOUS_MONITORING_REQUESTED');
    expect(callArgs.data.metadata.status).toBe('PENDING_NOT_STARTED');
    expect(callArgs.data.metadata.activatedAt).toBeUndefined();
    expect(callArgs.data.metadata.aiCompletedTasks).toEqual([]);
    expect(callArgs.data.metadata.pendingHumanTasks).toContain(
      'Monitor this alert manually until automated monitoring is available',
    );
    expect(callArgs.data.metadata.isResolved).toBe(false);
    expect(callArgs.data.metadata.resolutionState).toBe('UNRESOLVED');
    expect(callArgs.data.metadata.aiFindings).toContain('has not started');
    expect(callArgs.data.reviewerNotes).toContain('[Monitoring Pending]');
    expect(callArgs.data.reviewerNotes).not.toContain('Telemetry sentinel engaged');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RISK_ALERT_ACKNOWLEDGE',
        resourceType: 'RISK_ALERT',
        actorUserId: reviewerUserId,
      }),
    );
  });

  it('INVESTIGATE: after human approval, AI analyzes transaction history and supporting evidence', async () => {
    const { prisma, audit, budgetsService, mockTx } = createMockPrisma();
    const service = new RiskMonitoringService(prisma as any, budgetsService as any, audit as any);

    const result = await service.triageAlert(
      orgId,
      'alert-123',
      {
        action: ReviewActionType.INVESTIGATE,
        reviewerNotes: 'Approved investigation of software subscription spike.',
      },
      reviewerUserId,
    );

    expect(result.status).toBe(RiskAlertStatus.INVESTIGATING);
    expect(prisma.financialTransaction.findMany).toHaveBeenCalled();

    const callArgs = (mockTx.reviewDecision.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.data.action).toBe(ReviewActionType.INVESTIGATE);
    expect(callArgs.data.newStatus).toBe(RiskAlertStatus.INVESTIGATING);
    expect(callArgs.data.metadata.workflow).toBe('AI_TRANSACTION_INVESTIGATION');
    expect(callArgs.data.metadata.status).toBe('ANALYSIS_COMPLETED');
    expect(callArgs.data.metadata.citedCount).toBe(1);
    expect(callArgs.data.metadata.summary).toContain('Analyzed 1 cited transaction');
    expect(callArgs.data.metadata.isResolved).toBe(false);
    expect(callArgs.data.metadata.resolutionState).toBe('UNRESOLVED');
    expect(callArgs.data.reviewerNotes).toContain('[AI Forensic Investigation]');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RISK_ALERT_INVESTIGATE',
        resourceType: 'RISK_ALERT',
        actorUserId: reviewerUserId,
      }),
    );
  });

  it('ESCALATE: records dispatch as pending without claiming notification was sent', async () => {
    const { prisma, audit, budgetsService, mockTx } = createMockPrisma();
    const service = new RiskMonitoringService(prisma as any, budgetsService as any, audit as any);

    const result = await service.triageAlert(
      orgId,
      'alert-123',
      {
        action: ReviewActionType.ESCALATE,
        reviewerNotes: 'Critical liquidity and vendor concern. Requires CFO immediate intervention.',
      },
      reviewerUserId,
    );

    expect(result.status).toBe(RiskAlertStatus.ESCALATED);
    const callArgs = (mockTx.reviewDecision.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.data.action).toBe(ReviewActionType.ESCALATE);
    expect(callArgs.data.newStatus).toBe(RiskAlertStatus.ESCALATED);
    expect(callArgs.data.metadata.workflow).toBe('AI_EXECUTIVE_ESCALATION');
    expect(callArgs.data.metadata.status).toBe('PENDING_DISPATCH');
    expect(callArgs.data.metadata.dispatchedAt).toBeUndefined();
    expect(callArgs.data.metadata.recipients).toContain('CFO');
    expect(callArgs.data.metadata.briefing).toContain('URGENT EXECUTIVE DISPATCH');
    expect(callArgs.data.metadata.aiCompletedTasks).toEqual([
      'Prepared executive briefing with exposure metrics and severity impact',
    ]);
    expect(callArgs.data.metadata.pendingHumanTasks).toContain(
      'Dispatch the briefing to CFO and Executive Management through an approved channel',
    );
    expect(callArgs.data.metadata.isResolved).toBe(false);
    expect(callArgs.data.metadata.resolutionState).toBe('UNRESOLVED');
    expect(callArgs.data.reviewerNotes).toContain('dispatch is pending and no notification was sent');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RISK_ALERT_ESCALATE',
        resourceType: 'RISK_ALERT',
        actorUserId: reviewerUserId,
      }),
    );
  });

  it('DISMISS: strictly requires human justification and rejects insufficient rationale', async () => {
    const { prisma, audit, budgetsService } = createMockPrisma();
    const service = new RiskMonitoringService(prisma as any, budgetsService as any, audit as any);

    await expect(
      service.triageAlert(
        orgId,
        'alert-123',
        {
          action: ReviewActionType.DISMISS,
          reviewerNotes: 'Dismissed', // < 10 characters
        },
        reviewerUserId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('DISMISS: successfully dismisses alert when comprehensive human justification is provided', async () => {
    const { prisma, audit, budgetsService, mockTx } = createMockPrisma();
    const service = new RiskMonitoringService(prisma as any, budgetsService as any, audit as any);

    const result = await service.triageAlert(
      orgId,
      'alert-123',
      {
        action: ReviewActionType.DISMISS,
        reviewerNotes: 'Confirmed pre-approved quarterly prepayment per board resolution #841.',
      },
      reviewerUserId,
    );

    expect(result.status).toBe(RiskAlertStatus.DISMISSED);
    const callArgs = (mockTx.reviewDecision.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.data.action).toBe(ReviewActionType.DISMISS);
    expect(callArgs.data.newStatus).toBe(RiskAlertStatus.DISMISSED);
    expect(callArgs.data.metadata.workflow).toBe('DISMISS_JUSTIFIED');
    expect(callArgs.data.reviewerNotes).toContain('Human Justification: Confirmed pre-approved');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RISK_ALERT_DISMISS',
        resourceType: 'RISK_ALERT',
        actorUserId: reviewerUserId,
      }),
    );
  });

  it('APPROVE: rejects resolution when evidence is fewer than 15 characters', async () => {
    const { prisma, audit, budgetsService } = createMockPrisma();
    const service = new RiskMonitoringService(prisma as any, budgetsService as any, audit as any);

    await expect(
      service.triageAlert(
        orgId,
        'alert-123',
        {
          action: ReviewActionType.APPROVE,
          reviewerNotes: 'Fixed.', // < 15 chars — should be rejected
        },
        reviewerUserId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('APPROVE: rejects resolution when resolutionEvidence is fewer than 15 characters', async () => {
    const { prisma, audit, budgetsService } = createMockPrisma();
    const service = new RiskMonitoringService(prisma as any, budgetsService as any, audit as any);

    await expect(
      service.triageAlert(
        orgId,
        'alert-123',
        {
          action: ReviewActionType.APPROVE,
          reviewerNotes: 'Short note',
          resolutionEvidence: 'Too short', // < 15 chars — should be rejected
        },
        reviewerUserId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('APPROVE: successfully marks alert RESOLVED with verified resolution evidence', async () => {
    const { prisma, audit, budgetsService, mockTx } = createMockPrisma({
      supportingRecordIds: { transactionIds: ['tx-1', correctionTx.id] },
    });
    const service = new RiskMonitoringService(prisma as any, budgetsService as any, audit as any);

    const evidence =
      'Refund transaction TXN-REFUND-99881 posted; corrected invoice amount reconciled by Finance.';
    const result = await service.triageAlert(
      orgId,
      'alert-123',
      {
        action: ReviewActionType.APPROVE,
        reviewerNotes: evidence,
        resolutionEvidence: evidence,
      },
      reviewerUserId,
    );

    expect(result.status).toBe(RiskAlertStatus.RESOLVED);
    const callArgs = (mockTx.reviewDecision.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.data.action).toBe(ReviewActionType.APPROVE);
    expect(callArgs.data.newStatus).toBe(RiskAlertStatus.RESOLVED);
    expect(callArgs.data.metadata.isResolved).toBe(true);
    expect(callArgs.data.metadata.resolutionState).toBe('RESOLVED');
    expect(callArgs.data.metadata.resolutionEvidence).toBe(evidence);
    expect(callArgs.data.metadata.verificationDetails.matchingRecordFound).toBe(true);
    expect(callArgs.data.metadata.verificationDetails.evidenceType).toBe(
      'DATABASE_RECONCILED_RECORD',
    );
    expect(callArgs.data.metadata.verificationDetails.matchingRecordSummary).toContain(
      'TXN-REFUND-99881',
    );
    expect(callArgs.data.metadata.orchestratedAgents).toContain('SUPERVISOR_ORCHESTRATOR');
    expect(callArgs.data.metadata.orchestratedAgents).toContain('VERIFIER_AI');
    expect(callArgs.data.metadata.aiCompletedTasks.length).toBeGreaterThan(0);
    expect(callArgs.data.metadata.pendingHumanTasks.length).toBeGreaterThan(0);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RISK_ALERT_APPROVE',
        resourceType: 'RISK_ALERT',
        actorUserId: reviewerUserId,
      }),
    );
    expect(prisma.financialTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: orgId,
          id: { in: ['tx-1', correctionTx.id] },
        }),
      }),
    );
  });

  it('APPROVE: rejects an organization-owned correction record unrelated to the alert', async () => {
    const { prisma, audit, budgetsService, mockTx } = createMockPrisma();
    const service = new RiskMonitoringService(prisma as any, budgetsService as any, audit as any);

    await expect(
      service.triageAlert(
        orgId,
        'alert-123',
        {
          action: ReviewActionType.APPROVE,
          reviewerNotes:
            'Refund transaction TXN-REFUND-99881 posted; corrected invoice amount reconciled.',
        },
        reviewerUserId,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.financialTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: orgId,
          id: { in: ['tx-1'] },
        }),
      }),
    );
    expect(mockTx.reviewDecision.create).not.toHaveBeenCalled();
    expect(mockTx.riskAlert.update).not.toHaveBeenCalled();
  });

  it('APPROVE: rejects keyword-only evidence without an organization-owned record reference', async () => {
    const { prisma, audit, budgetsService, mockTx } = createMockPrisma();
    const service = new RiskMonitoringService(prisma as any, budgetsService as any, audit as any);

    await expect(
      service.triageAlert(
        orgId,
        'alert-123',
        {
          action: ReviewActionType.APPROVE,
          reviewerNotes: 'Vendor invoice corrected and verified by Finance team yesterday.',
        },
        reviewerUserId,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.financialTransaction.findFirst).not.toHaveBeenCalled();
    expect(mockTx.reviewDecision.create).not.toHaveBeenCalled();
    expect(mockTx.riskAlert.update).not.toHaveBeenCalled();
  });

  it('APPROVE: rejects correction evidence when its reference does not match an organization record', async () => {
    const { prisma, audit, budgetsService, mockTx } = createMockPrisma();
    const service = new RiskMonitoringService(prisma as any, budgetsService as any, audit as any);

    await expect(
      service.triageAlert(
        orgId,
        'alert-123',
        {
          action: ReviewActionType.APPROVE,
          reviewerNotes:
            'Refund transaction TXN-REFUND-40404 posted; corrected invoice amount reconciled.',
        },
        reviewerUserId,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.financialTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: orgId }),
      }),
    );
    expect(mockTx.reviewDecision.create).not.toHaveBeenCalled();
    expect(mockTx.riskAlert.update).not.toHaveBeenCalled();
  });

  it('orchestrates specialist AI agents across INVESTIGATE and delineates human responsibilities', async () => {
    const { prisma, audit, budgetsService, mockTx } = createMockPrisma();
    const service = new RiskMonitoringService(prisma as any, budgetsService as any, audit as any);

    await service.triageAlert(
      orgId,
      'alert-123',
      {
        action: ReviewActionType.INVESTIGATE,
        reviewerNotes: 'Approved investigation of software subscription spike.',
      },
      reviewerUserId,
    );

    const callArgs = (mockTx.reviewDecision.create as jest.Mock).mock.calls[0][0];
    const meta = callArgs.data.metadata;

    // Verify orchestrated specialist agents
    expect(meta.orchestratedAgents).toEqual(
      expect.arrayContaining([
        'SUPERVISOR_ORCHESTRATOR',
        'EXPENSE_ANOMALY_DETECTION',
        'FINANCE_DATA_ANALYST',
        'SCENARIO_PLANNING',
        'STRATEGIC_RECOMMENDATION',
      ]),
    );

    // Verify safe AI completed tasks
    expect(meta.aiCompletedTasks).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Forensic extraction'),
        expect.stringContaining('Historical baseline calculation'),
      ]),
    );

    // Verify clearly delineated human responsibilities
    expect(meta.pendingHumanTasks).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Contact vendor'),
        expect.stringContaining('Verify physical goods'),
        expect.stringContaining('Approve financial correction'),
      ]),
    );
  });
});
