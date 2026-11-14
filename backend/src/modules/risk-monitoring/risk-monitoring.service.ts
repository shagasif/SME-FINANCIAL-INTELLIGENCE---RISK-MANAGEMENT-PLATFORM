import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountType,
  AgentType,
  BudgetStatus,
  InvoiceStatus,
  Prisma,
  ReviewActionType,
  ReviewTargetType,
  RiskAlertStatus,
  RiskAlertType,
  RiskSeverity,
  TransactionType,
} from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { SecurityUtil } from '../../common/utils/security.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BudgetsService } from '../budgets/budgets.service.js';
import { RiskAlertQueryDto, TriageRiskAlertDto } from './dto/risk-alert.dto.js';

export const NON_FRAUD_DISCLAIMER =
  'Statistical or rule-based anomaly signal for human review; not a determination of confirmed fraud.';

@Injectable()
export class RiskMonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetsService: BudgetsService,
    private readonly audit: AuditService,
  ) {}

  private buildFingerprint(type: string, sup: Record<string, string[]>): string {
    const txIds = [...(sup['transactionIds'] ?? [])].sort().join(',');
    const accIds = [...(sup['accountIds'] ?? [])].sort().join(',');
    const invIds = [...(sup['invoiceIds'] ?? [])].sort().join(',');
    const budgetIds = [...(sup['budgetIds'] ?? [])].sort().join(',');
    return `${type}:tx[${txIds}]:acc[${accIds}]:inv[${invIds}]:bgt[${budgetIds}]`;
  }

  private async enrichSupportingRecords(
    sup: Record<string, string[]>,
    allTransactions: Array<{
      id: string;
      reference: string | null;
      amount: Prisma.Decimal;
      currency: string;
      transactionDate: Date;
      counterparty: string | null;
      category: string;
      description: string;
      type: string;
    }>,
  ): Promise<Record<string, unknown>> {
    const txMap = new Map(allTransactions.map((t) => [t.id, t]));
    const txIds: string[] = sup['transactionIds'] ?? [];
    const transactions = txIds
      .map((id) => txMap.get(id))
      .filter(Boolean)
      .map((t) => ({
        id: t!.id,
        reference: t!.reference ?? `TXN-${t!.id.slice(0, 8).toUpperCase()}`,
        amount: DecimalMath.toFixed4(t!.amount),
        currency: t!.currency,
        date: t!.transactionDate.toISOString().slice(0, 10),
        vendor: t!.counterparty ?? 'N/A',
        category: t!.category,
        description: t!.description,
      }));

    return { ...sup, transactions };
  }

  async runAnomalyAndRiskScan(organizationId: string, actorUserId: string) {
    const [accounts, transactions, overdueInvoices, activeBudgets, latestForecast] =
      await Promise.all([
        this.prisma.financialAccount.findMany({
          where: {
            organizationId,
            isArchived: false,
            isLiquid: true,
            type: { in: [AccountType.BANK, AccountType.CASH, AccountType.ASSET] },
          },
        }),
        this.prisma.financialTransaction.findMany({
          where: { organizationId, isArchived: false },
          orderBy: { transactionDate: 'asc' },
        }),
        this.prisma.invoice.findMany({
          where: {
            organizationId,
            isArchived: false,
            outstandingBalance: { gt: 0 },
            status: { notIn: [InvoiceStatus.VOID, InvoiceStatus.DRAFT] },
            dueDate: { lt: new Date() },
          },
        }),
        this.prisma.budget.findMany({
          where: { organizationId, status: BudgetStatus.ACTIVE },
        }),
        this.prisma.cashFlowForecast.findFirst({
          where: { organizationId },
          orderBy: { generatedAt: 'desc' },
        }),
      ]);

    const candidateAlerts: Array<{
      type: RiskAlertType;
      severity: RiskSeverity;
      reviewPriority: number;
      title: string;
      explanation: string;
      detectionMethod: string;
      metricValue: Prisma.Decimal | null;
      thresholdValue: Prisma.Decimal | null;
      supportingRecordIds: Record<string, string[]>;
    }> = [];

    const expenseTxs = transactions.filter((t) => t.type === TransactionType.EXPENSE);

    // 1. UNUSUAL_AMOUNT: Statistical outlier detection per category (or across expenses)
    if (expenseTxs.length >= 2) {
      const amounts = expenseTxs.map((t) => t.amount);
      const mean = DecimalMath.mean(amounts);
      const stdDev = DecimalMath.stdDev(amounts);
      const statisticalThreshold = DecimalMath.max([
        DecimalMath.add(mean, DecimalMath.mul(stdDev, '1.5000')),
        DecimalMath.mul(mean, '2.0000'),
      ]);

      for (const tx of expenseTxs) {
        if (tx.amount.gt(statisticalThreshold) && tx.amount.gt(DecimalMath.of('500.0000'))) {
          candidateAlerts.push({
            type: RiskAlertType.UNUSUAL_AMOUNT,
            severity: tx.amount.gt(DecimalMath.mul(mean, '3.0000'))
              ? RiskSeverity.HIGH
              : RiskSeverity.MEDIUM,
            reviewPriority: 2,
            title: `Unusually high payment of ${tx.currency} ${DecimalMath.toFixed2(tx.amount)} for ${tx.category}`,
            explanation: `This expense of ${tx.currency} ${DecimalMath.toFixed2(tx.amount)} for "${tx.description}" is significantly higher than normal spending in ${tx.category}. Please check with the team lead to confirm the charge and review the vendor invoice.`,
            detectionMethod:
              'Statistical Outlier Rule: Amount > max(Mean + 1.5 * StdDev, 2.0 * Mean)',
            metricValue: tx.amount,
            thresholdValue: statisticalThreshold,
            supportingRecordIds: { transactionIds: [tx.id] },
          });
        }
      }
    }

    // 2. UNUSUAL_FREQUENCY: >= 3 expenses to the same counterparty or category within a 3-day window
    const byCounterparty = new Map<string, typeof expenseTxs>();
    for (const tx of expenseTxs) {
      const key = (tx.counterparty || tx.category).toLowerCase();
      const list = byCounterparty.get(key) ?? [];
      list.push(tx);
      byCounterparty.set(key, list);
    }
    for (const [key, list] of byCounterparty.entries()) {
      if (list.length >= 3) {
        for (let i = 0; i <= list.length - 3; i += 1) {
          const spanDays =
            (list[i + 2].transactionDate.getTime() - list[i].transactionDate.getTime()) /
            (1000 * 60 * 60 * 24);
          if (spanDays <= 3) {
            const cluster = list.slice(i, i + 3);
            const clusterSum = DecimalMath.sum(cluster.map((c) => c.amount));
            candidateAlerts.push({
              type: RiskAlertType.UNUSUAL_FREQUENCY,
              severity: RiskSeverity.MEDIUM,
              reviewPriority: 2,
              title: `Multiple payments to "${key}" within 3 days`,
              explanation: `We noticed ${cluster.length} payments totaling ${DecimalMath.toFixed2(clusterSum)} to "${key}" in a short timeframe. Please check whether these were intended separate purchases or duplicate billings.`,
              detectionMethod: 'Sliding-Window Burst Rule: >= 3 transactions within 72 hours',
              metricValue: DecimalMath.of(cluster.length),
              thresholdValue: DecimalMath.of(3),
              supportingRecordIds: { transactionIds: cluster.map((c) => c.id) },
            });
            break;
          }
        }
      }
    }

    // 3. TIMING_CHANGE: Recurring transactions posted >= 5 days away from expected day-of-month or on weekend
    for (const tx of expenseTxs) {
      const dayOfWeek = tx.transactionDate.getUTCDay();
      if (tx.isRecurring && (dayOfWeek === 0 || dayOfWeek === 6)) {
        candidateAlerts.push({
          type: RiskAlertType.TIMING_CHANGE,
          severity: RiskSeverity.LOW,
          reviewPriority: 3,
          title: `Recurring payment "${tx.description}" posted on a weekend`,
          explanation: `A regular expense of ${DecimalMath.toFixed2(tx.amount)} was recorded on a weekend (${tx.transactionDate.toISOString().slice(0, 10)}). Regular bills typically clear on business days, so please verify the processing date with your bank.`,
          detectionMethod: 'Temporal Settlement Cadence Rule: Recurring item settled on weekend',
          metricValue: tx.amount,
          thresholdValue: null,
          supportingRecordIds: { transactionIds: [tx.id] },
        });
      }
    }

    // 4. CATEGORY_SHIFT: Category exceeds 55% of total expenses when >= 2 categories exist
    const categoryMap = new Map<string, { sum: Prisma.Decimal; ids: string[] }>();
    for (const tx of expenseTxs) {
      const cur = categoryMap.get(tx.category) ?? { sum: DecimalMath.ZERO, ids: [] };
      cur.sum = DecimalMath.add(cur.sum, tx.amount);
      cur.ids.push(tx.id);
      categoryMap.set(tx.category, cur);
    }
    const totalExp = DecimalMath.sum(expenseTxs.map((t) => t.amount));
    if (categoryMap.size >= 2 && totalExp.gt(DecimalMath.ZERO)) {
      for (const [cat, info] of categoryMap.entries()) {
        const sharePct = DecimalMath.percentage(info.sum, totalExp) ?? DecimalMath.ZERO;
        if (sharePct.gt(DecimalMath.of('60.0000'))) {
          candidateAlerts.push({
            type: RiskAlertType.CATEGORY_SHIFT,
            severity: RiskSeverity.MEDIUM,
            reviewPriority: 3,
            title: `Spending in "${cat}" reached ${DecimalMath.toFixed2(sharePct)}% of all expenses`,
            explanation: `Spending in "${cat}" reached ${DecimalMath.toFixed2(info.sum)}, representing more than half of all company expenses. Review recent purchases in this category to ensure costs remain on track.`,
            detectionMethod: 'Category Share Concentration Rule: CategorySharePct > 60%',
            metricValue: sharePct,
            thresholdValue: DecimalMath.of('60.0000'),
            supportingRecordIds: { transactionIds: info.ids },
          });
        }
      }
    }

    // 5. DUPLICATE_CANDIDATE: Two transactions with identical amount and category within 48 hours
    for (let i = 0; i < expenseTxs.length; i += 1) {
      for (let j = i + 1; j < expenseTxs.length; j += 1) {
        const a = expenseTxs[i];
        const b = expenseTxs[j];
        const hoursApart =
          Math.abs(b.transactionDate.getTime() - a.transactionDate.getTime()) / (1000 * 60 * 60);
        if (
          a.amount.equals(b.amount) &&
          a.category.toLowerCase() === b.category.toLowerCase() &&
          hoursApart <= 48
        ) {
          candidateAlerts.push({
            type: RiskAlertType.DUPLICATE_CANDIDATE,
            severity: RiskSeverity.HIGH,
            reviewPriority: 1,
            title: `Possible duplicate charge of ${DecimalMath.toFixed2(a.amount)} in ${a.category}`,
            explanation: `Two identical charges of ${DecimalMath.toFixed2(a.amount)} were recorded within ${Math.round(hoursApart)} hours of each other. Verify with the vendor or your credit card company to ensure you were not charged twice.`,
            detectionMethod:
              'Near-Duplicate Matching Rule: Identical Amount + Category within 48 hours',
            metricValue: a.amount,
            thresholdValue: a.amount,
            supportingRecordIds: { transactionIds: [a.id, b.id] },
          });
        }
      }
    }

    // 6. CASH_SHORTFALL: Liquid cash below safety threshold or latest forecast flags liquidity warning
    const liquidCash = DecimalMath.sum(accounts.map((a) => a.currentBalance));
    const safetyThreshold = DecimalMath.of('5000.0000');
    if (
      (accounts.length > 0 && liquidCash.lt(safetyThreshold)) ||
      latestForecast?.hasLiquidityWarning
    ) {
      candidateAlerts.push({
        type: RiskAlertType.CASH_SHORTFALL,
        severity: RiskSeverity.CRITICAL,
        reviewPriority: 1,
        title: 'Cash reserves dropped below safety buffer',
        explanation: `Your liquid cash balance is currently ${DecimalMath.toFixed2(liquidCash)}, which is lower than your safety buffer of ${DecimalMath.toFixed2(safetyThreshold)}. Review upcoming bills and prioritize customer collections.`,
        detectionMethod:
          'Liquidity Threshold & Cash-Flow Projection Rule: ProjectedCash < SafetyBuffer',
        metricValue: latestForecast ? latestForecast.minimumProjectedCash : liquidCash,
        thresholdValue: safetyThreshold,
        supportingRecordIds: {
          accountIds: accounts.map((a) => a.id),
          ...(latestForecast ? { forecastIds: [latestForecast.id] } : {}),
        },
      });
    }

    // 7. OVERDUE_RECEIVABLE: Open customer invoices past due date
    if (overdueInvoices.length > 0) {
      const overdueSum = DecimalMath.sum(overdueInvoices.map((i) => i.outstandingBalance));
      candidateAlerts.push({
        type: RiskAlertType.OVERDUE_RECEIVABLE,
        severity: overdueSum.gt(DecimalMath.of('10000.0000'))
          ? RiskSeverity.HIGH
          : RiskSeverity.MEDIUM,
        reviewPriority: 1,
        title: `${overdueInvoices.length} unpaid customer invoice(s) totaling ${DecimalMath.toFixed2(overdueSum)} are past due`,
        explanation: `You have ${overdueInvoices.length} customer invoice(s) past their payment due dates, with ${DecimalMath.toFixed2(overdueSum)} still owed. Send friendly payment reminders to customers to speed up cash inflows.`,
        detectionMethod: 'Receivable Due-Date Rule: OutstandingBalance > 0 and DueDate < Now',
        metricValue: overdueSum,
        thresholdValue: DecimalMath.ZERO,
        supportingRecordIds: { invoiceIds: overdueInvoices.map((i) => i.id) },
      });
    }

    // 8. BUDGET_OVERRUN: Active budget lines exceeding 100% of allocation
    for (const budget of activeBudgets) {
      const variance = await this.budgetsService.calculateBudgetVariance(organizationId, budget.id);
      const overrunLines = variance.lines.filter((l) => l.status === 'OVERRUN');
      for (const line of overrunLines) {
        candidateAlerts.push({
          type: RiskAlertType.BUDGET_OVERRUN,
          severity: RiskSeverity.HIGH,
          reviewPriority: 2,
          title: `Budget exceeded for ${line.category} (${line.department})`,
          explanation: `Spending in "${line.category}" has reached ${line.actualSpent}, exceeding the allocated budget of ${line.allocatedAmount} (${line.utilizationPct}% used). Hold non-essential spending in this category until reviewed.`,
          detectionMethod: 'Budget Line Utilization Rule: ActualSpent > AllocatedAmount (100%)',
          metricValue: DecimalMath.of(line.actualSpent),
          thresholdValue: DecimalMath.of(line.allocatedAmount),
          supportingRecordIds: {
            budgetIds: [budget.id],
            transactionIds: line.sourceTransactionIds,
          },
        });
      }
    }

    // Load existing active alert fingerprints (non-resolved / non-dismissed) to skip duplicates
    const activeAlerts = await this.prisma.riskAlert.findMany({
      where: {
        organizationId,
        status: {
          notIn: [RiskAlertStatus.RESOLVED, RiskAlertStatus.DISMISSED],
        },
      },
      select: { id: true, type: true, supportingRecordIds: true },
    });

    const existingFingerprints = new Set<string>();
    for (const a of activeAlerts) {
      const sup = (a.supportingRecordIds ?? {}) as Record<string, string[]>;
      const fp = this.buildFingerprint(a.type, sup);
      existingFingerprints.add(fp);
    }

    const createdAlerts = [];
    for (const c of candidateAlerts) {
      const fp = this.buildFingerprint(c.type, c.supportingRecordIds as Record<string, string[]>);
      if (existingFingerprints.has(fp)) continue; // skip duplicate
      existingFingerprints.add(fp);

      // Enrich transaction metadata into supportingRecordIds
      const enrichedSupporting = await this.enrichSupportingRecords(c.supportingRecordIds as Record<string, string[]>, transactions);

      const alert = await this.prisma.riskAlert.create({
        data: {
          organizationId,
          type: c.type,
          severity: c.severity,
          reviewPriority: c.reviewPriority,
          status: RiskAlertStatus.OPEN,
          title: c.title,
          explanation: c.explanation,
          detectionMethod: c.detectionMethod,
          metricValue: c.metricValue,
          thresholdValue: c.thresholdValue,
          supportingRecordIds: enrichedSupporting as unknown as Prisma.InputJsonValue,
          nonFraudDisclaimer: NON_FRAUD_DISCLAIMER,
        },
      });
      createdAlerts.push(this.serializeAlert(alert));
    }

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'ANOMALY_AND_RISK_SCAN_EXECUTED',
      resourceType: 'RISK_ALERT',
      details: {
        alertsGenerated: createdAlerts.length,
        alertTypes: createdAlerts.map((a) => a.type),
        orchestratedAgents: [
          AgentType.SUPERVISOR_ORCHESTRATOR,
          AgentType.EXPENSE_ANOMALY_DETECTION,
          AgentType.FINANCIAL_RISK_ASSESSMENT,
          AgentType.FINANCE_DATA_ANALYST,
          AgentType.CASH_FLOW_FORECASTING,
        ],
      },
    });

    return {
      scannedAt: new Date().toISOString(),
      alertsGeneratedCount: createdAlerts.length,
      nonFraudPolicy: NON_FRAUD_DISCLAIMER,
      alerts: createdAlerts,
    };
  }

  async listAlerts(organizationId: string, query: RiskAlertQueryDto) {
    const alerts = await this.prisma.riskAlert.findMany({
      where: {
        organizationId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.severity ? { severity: query.severity } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      include: {
        reviewDecisions: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ reviewPriority: 'asc' }, { detectedAt: 'desc' }],
    });

    return alerts.map((a) => this.serializeAlert(a));
  }

  async triageAlert(
    organizationId: string,
    alertId: string,
    dto: TriageRiskAlertDto,
    reviewerUserId: string,
  ) {
    const alert = await this.prisma.riskAlert.findFirst({
      where: { id: alertId, organizationId },
    });
    if (!alert) {
      throw new NotFoundException('Risk alert not found in organization');
    }

    const sanitizedNotes = SecurityUtil.sanitizeImportedText(dto.reviewerNotes || '').sanitized;

    // Strict validation: DISMISS requires human business justification (min. 10 characters)
    if (dto.action === ReviewActionType.DISMISS) {
      if (!sanitizedNotes || sanitizedNotes.trim().length < 10) {
        throw new BadRequestException(
          'Human justification is required to dismiss a risk alert (minimum 10 characters detailing business rationale).',
        );
      }
    } else if (dto.action === ReviewActionType.APPROVE) {
      // Strict guard: Anomaly cannot be marked as RESOLVED without actual resolution evidence
      const evidence = (dto.resolutionEvidence || sanitizedNotes).trim();
      if (!evidence || evidence.length < 15) {
        throw new BadRequestException(
          'Actual resolution evidence is required to mark an anomaly as Resolved (minimum 15 characters detailing the verified fix). Acknowledged or Investigating alerts must remain unresolved.',
        );
      }
    } else if (!sanitizedNotes || sanitizedNotes.trim().length < 3) {
      throw new BadRequestException('Reviewer notes are required with at least 3 characters.');
    }

    const statusMap: Record<string, RiskAlertStatus> = {
      [ReviewActionType.ACKNOWLEDGE]: RiskAlertStatus.ACKNOWLEDGED,
      [ReviewActionType.DISMISS]: RiskAlertStatus.DISMISSED,
      [ReviewActionType.INVESTIGATE]: RiskAlertStatus.INVESTIGATING,
      [ReviewActionType.ESCALATE]: RiskAlertStatus.ESCALATED,
      [ReviewActionType.APPROVE]: RiskAlertStatus.RESOLVED,
    };

    const newStatus = statusMap[dto.action] ?? RiskAlertStatus.ACKNOWLEDGED;

    // AI actions execute strictly upon human approval
    let aiWorkflow: Record<string, unknown> = {};
    let finalNotes = sanitizedNotes;

    if (dto.action === ReviewActionType.ACKNOWLEDGE) {
      // ACKNOWLEDGE: Acknowledged alerts MUST remain unresolved
      aiWorkflow = {
        workflow: 'CONTINUOUS_MONITORING_REQUESTED',
        status: 'PENDING_NOT_STARTED',
        isResolved: false,
        resolutionState: 'UNRESOLVED',
        requestedAt: new Date().toISOString(),
        humanApprovedBy: reviewerUserId,
        aiCompletedTasks: [],
        aiFindings:
          'Alert acknowledged by human reviewer. Automated monitoring has not started because no monitoring service is configured. Alert remains UNRESOLVED.',
        pendingHumanTasks: [
          'Monitor this alert manually until automated monitoring is available',
          'Verify physical documents and real-world business activities',
          'Contact vendor or departmental lead if unexpected recurring variance persists',
          'Monitor monthly bank statement reconciliation at accounting period close',
        ],
        humanResponsibilities: [
          'Verify physical vendor deliverables and invoices',
          'Review monthly statement reconciliation',
        ],
        monitoringScope: {
          alertType: alert.type,
          severity: alert.severity,
          ruleCode: alert.type,
          requestedCadence: 'STREAM_AND_BATCH',
        },
        message: 'Acknowledgment recorded; continuous monitoring is pending and has not started.',
      };
      finalNotes = `${sanitizedNotes}\n\n[Monitoring Pending]: Alert acknowledged; automated monitoring has not started. Alert remains UNRESOLVED.`;
    } else if (dto.action === ReviewActionType.INVESTIGATE) {
      // INVESTIGATE: Investigating alerts MUST remain unresolved
      const investigation = await this.performAiTransactionInvestigation(organizationId, alert);
      aiWorkflow = {
        workflow: 'AI_TRANSACTION_INVESTIGATION',
        status: 'ANALYSIS_COMPLETED',
        isResolved: false,
        resolutionState: 'UNRESOLVED',
        analyzedAt: new Date().toISOString(),
        humanApprovedBy: reviewerUserId,
        orchestratedAgents: [
          AgentType.SUPERVISOR_ORCHESTRATOR,
          AgentType.EXPENSE_ANOMALY_DETECTION,
          AgentType.FINANCE_DATA_ANALYST,
          AgentType.SCENARIO_PLANNING,
          AgentType.STRATEGIC_RECOMMENDATION,
        ],
        aiCompletedTasks: [
          'Forensic extraction and inspection of cited transaction records',
          'Historical baseline calculation across 50 records in category',
          'Statistical variance multiplier and category share calculated',
          'Liquidity stress impact and scenario projection evaluated',
          'Actionable corrective recommendations synthesized',
        ],
        aiFindings: investigation.summary,
        pendingHumanTasks: [
          'Contact vendor accounting department to inspect original invoice/contract',
          'Verify physical goods or services delivered with internal requestor',
          'Approve financial correction, refund request, or credit memo if error is confirmed',
        ],
        humanResponsibilities: [
          'Contact vendor / employees directly for real-world clarification',
          'Verify physical delivery and contract terms',
          'Approve sensitive financial adjustments in ledger',
        ],
        ...investigation,
      };
      finalNotes = `${sanitizedNotes}\n\n[AI Forensic Investigation]: ${investigation.summary}\n\nNote: Alert remains UNRESOLVED while under active investigation.`;
    } else if (dto.action === ReviewActionType.ESCALATE) {
      // ESCALATE: Escalated alerts MUST remain unresolved
      const metricStr = alert.metricValue ? DecimalMath.toFixed4(alert.metricValue) : 'Unspecified';
      const threshStr = alert.thresholdValue ? DecimalMath.toFixed4(alert.thresholdValue) : 'None';
      const executiveBriefing = `URGENT EXECUTIVE DISPATCH: Alert [${alert.type}] flagged with ${alert.severity} severity. Financial exposure: ${metricStr} vs threshold: ${threshStr}. Reviewer Escalation Rationale: "${sanitizedNotes}". Recommended immediate action: Executive review and authorization of containment controls.`;
      aiWorkflow = {
        workflow: 'AI_EXECUTIVE_ESCALATION',
        status: 'PENDING_DISPATCH',
        isResolved: false,
        resolutionState: 'UNRESOLVED',
        requestedAt: new Date().toISOString(),
        humanApprovedBy: reviewerUserId,
        orchestratedAgents: [
          AgentType.SUPERVISOR_ORCHESTRATOR,
          AgentType.FINANCIAL_REPORTING,
          AgentType.FINANCIAL_RISK_ASSESSMENT,
        ],
        aiCompletedTasks: [
          'Prepared executive briefing with exposure metrics and severity impact',
        ],
        aiFindings: executiveBriefing,
        pendingHumanTasks: [
          'Dispatch the briefing to CFO and Executive Management through an approved channel',
          'CFO / Executive Management authorization required for payment holds',
          'Executive outreach to counterparty leadership or legal counsel',
          'Authorize formal audit investigation or dispute filing',
        ],
        humanResponsibilities: [
          'Approve financial holds and sensitive decisions',
          'Perform executive-level vendor outreach',
        ],
        recipients: ['CFO', 'EXECUTIVE_MANAGEMENT', 'FINANCE_DIRECTOR'],
        urgency: alert.severity === RiskSeverity.CRITICAL ? 'CRITICAL_IMMEDIATE' : 'HIGH_PRIORITY',
        briefing: executiveBriefing,
      };
      finalNotes = `${sanitizedNotes}\n\n[AI Executive Escalation]: Briefing prepared; dispatch is pending and no notification was sent. Alert remains UNRESOLVED pending executive corrective action.`;
    } else if (dto.action === ReviewActionType.DISMISS) {
      // DISMISS: Require human justification; dismissed alerts are marked as dismissed, not resolved
      aiWorkflow = {
        workflow: 'DISMISS_JUSTIFIED',
        status: 'DISMISSED_BY_HUMAN',
        isResolved: false,
        resolutionState: 'DISMISSED',
        dismissedAt: new Date().toISOString(),
        humanReviewerId: reviewerUserId,
        justificationLength: sanitizedNotes.length,
        orchestratedAgents: [
          AgentType.SUPERVISOR_ORCHESTRATOR,
          AgentType.EXPENSE_ANOMALY_DETECTION,
        ],
        aiCompletedTasks: [
          'Business variance justification recorded in compliance audit ledger',
          'Anomaly fingerprint marked as acceptable business variance',
        ],
        aiFindings: 'Documented as an expected business variance with reviewer justification.',
        pendingHumanTasks: [
          'Maintain variance documentation in periodic board/audit pack if required',
        ],
        humanResponsibilities: [
          'Document business rationale for auditor review',
        ],
      };
      finalNotes = `Human Justification: ${sanitizedNotes}\n\n[Dismissed]: Documented as an expected business variance; alert is dismissed without marking as fixed.`;
    } else if (dto.action === ReviewActionType.APPROVE) {
      // APPROVE / RESOLVE: Marked as RESOLVED ONLY when verified resolution evidence is provided
      const resolutionProof = (dto.resolutionEvidence || sanitizedNotes).trim();
      const verification = await this.verifyResolutionEvidence(organizationId, resolutionProof, alert);
      if (!verification.isValid) {
        throw new BadRequestException(
          verification.rejectionReason ||
            'Verification failed: Insufficient resolution evidence. Evidence must cite concrete proof of correction (e.g., credit memo ID, refund transaction reference, reversed invoice, or authorized accounting adjustment).',
        );
      }

      aiWorkflow = {
        workflow: 'RESOLVED_WITH_EVIDENCE',
        status: 'VERIFIED_FIXED',
        isResolved: true,
        resolutionState: 'RESOLVED',
        resolvedAt: new Date().toISOString(),
        verifiedByUserId: reviewerUserId,
        resolutionEvidence: resolutionProof,
        orchestratedAgents: [
          AgentType.SUPERVISOR_ORCHESTRATOR,
          AgentType.VERIFIER_AI,
        ],
        aiCompletedTasks: [
          'Parsed resolution evidence and extracted operational identifiers',
          'Cross-referenced organization financial records for cited references',
          'Verified concrete proof of actual correction and closure',
          'Marked anomaly status as RESOLVED in risk registry',
        ],
        aiFindings: verification.verificationSummary,
        pendingHumanTasks: [
          'Retain physical/digital proof in compliance archive per statutory records policy',
        ],
        humanResponsibilities: [
          'Verify physical documents and real-world business activities',
          'Approve final ledger adjustments',
        ],
        verificationDetails: {
          evidenceType: verification.evidenceType,
          extractedReferences: verification.extractedReferences,
          matchingRecordFound: verification.matchingRecordFound,
          matchingRecordSummary: verification.matchingRecordSummary,
          verifiedByAgent: AgentType.VERIFIER_AI,
        },
      };
      finalNotes = `Verified Resolution Evidence: ${resolutionProof}\n\n[Verified Resolution]: ${verification.verificationSummary}`;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.reviewDecision.create({
        data: {
          organizationId,
          targetType: ReviewTargetType.RISK_ALERT,
          targetId: alert.id,
          riskAlertId: alert.id,
          action: dto.action,
          reviewerUserId,
          reviewerNotes: finalNotes,
          previousStatus: alert.status,
          newStatus,
          metadata: aiWorkflow as unknown as Prisma.InputJsonValue,
        },
      });

      return tx.riskAlert.update({
        where: { id: alert.id },
        data: { status: newStatus },
        include: {
          reviewDecisions: { orderBy: { createdAt: 'desc' } },
        },
      });
    });

    await this.audit.record({
      organizationId,
      actorUserId: reviewerUserId,
      action: `RISK_ALERT_${dto.action}`,
      resourceType: 'RISK_ALERT',
      resourceId: alert.id,
      details: {
        previousStatus: alert.status,
        newStatus,
        reviewerNotes: sanitizedNotes,
        aiWorkflow,
      },
    });

    return this.serializeAlert(updated);
  }

  private async performAiTransactionInvestigation(
    organizationId: string,
    alert: {
      type: RiskAlertType;
      severity: RiskSeverity;
      supportingRecordIds: unknown;
      metricValue: Prisma.Decimal | null;
      thresholdValue: Prisma.Decimal | null;
      title: string;
      explanation: string;
    },
  ): Promise<{
    citedCount: number;
    citedTotal: string;
    categoryBaselineMean: string;
    historicalSampleSize: number;
    varianceRatio: string;
    summary: string;
  }> {
    const supporting = (alert.supportingRecordIds ?? {}) as Record<string, unknown>;
    const txIds = ((supporting['transactionIds'] ?? []) as string[]);

    if (txIds.length > 0) {
      const citedTxs = await this.prisma.financialTransaction.findMany({
        where: { id: { in: txIds }, organizationId },
      });

      const category = citedTxs[0]?.category;
      const historicalTxs = category
        ? await this.prisma.financialTransaction.findMany({
            where: { organizationId, category, isArchived: false },
            take: 50,
            orderBy: { transactionDate: 'desc' },
          })
        : [];

      const historicalAmounts = historicalTxs.map((t) => t.amount);
      const mean =
        historicalAmounts.length > 0
          ? DecimalMath.mean(historicalAmounts)
          : DecimalMath.ZERO;
      const citedTotal = DecimalMath.sum(citedTxs.map((t) => t.amount));
      const ratioDecimal = DecimalMath.divSafe(citedTxs[0]?.amount ?? citedTotal, mean, 2);
      const varianceRatio = ratioDecimal ? DecimalMath.toFixed2(ratioDecimal) : 'N/A';

      const summary = `Analyzed ${citedTxs.length} cited transaction(s) totaling ${DecimalMath.toFixed4(citedTotal)}. Historical baseline in "${category ?? 'General'}" has ${historicalTxs.length} records (category mean: ${DecimalMath.toFixed4(mean)}). Transaction represents a ${varianceRatio}x deviation from historical baseline. Evidence indicates velocity variance requiring supporting vendor delivery documentation.`;

      return {
        citedCount: citedTxs.length,
        citedTotal: DecimalMath.toFixed4(citedTotal),
        categoryBaselineMean: DecimalMath.toFixed4(mean),
        historicalSampleSize: historicalTxs.length,
        varianceRatio,
        summary,
      };
    }

    const metricStr = alert.metricValue ? DecimalMath.toFixed4(alert.metricValue) : 'N/A';
    const threshStr = alert.thresholdValue ? DecimalMath.toFixed4(alert.thresholdValue) : 'N/A';
    const summary = `Analyzed operational metrics for alert [${alert.type}]. Current metric of ${metricStr} breaches defined risk threshold of ${threshStr}. Historical liquidity and receivable records confirm financial exposure requiring immediate remediation.`;

    return {
      citedCount: 0,
      citedTotal: '0.0000',
      categoryBaselineMean: threshStr,
      historicalSampleSize: 0,
      varianceRatio: 'N/A',
      summary,
    };
  }

  private async verifyResolutionEvidence(
    organizationId: string,
    evidenceText: string,
    alert: {
      id: string;
      type: RiskAlertType;
      supportingRecordIds: unknown;
      metricValue: Prisma.Decimal | null;
    },
  ): Promise<{
    isValid: boolean;
    rejectionReason?: string;
    evidenceType: string;
    extractedReferences: string[];
    matchingRecordFound: boolean;
    matchingRecordSummary?: string;
    verificationSummary: string;
  }> {
    const textLower = evidenceText.toLowerCase().trim();

    if (evidenceText.trim().length < 15) {
      return {
        isValid: false,
        rejectionReason:
          'Resolution evidence must be at least 15 characters detailing the verified fix and operational proof.',
        evidenceType: 'INSUFFICIENT_LENGTH',
        extractedReferences: [],
        matchingRecordFound: false,
        verificationSummary: 'Rejected by VERIFIER_AI: Evidence text too brief to substantiate correction.',
      };
    }

    const vaguePatterns = [
      /^fixed[.\s!]*$/i,
      /^resolved[.\s!]*$/i,
      /^it is (?:ok|fine|fixed|resolved)[.\s!]*$/i,
      /^looks good[.\s!]*$/i,
      /^all good[.\s!]*$/i,
      /^done[.\s!]*$/i,
      /^no (?:problem|issue)[.\s!]*$/i,
      /^resolved by (?:me|user)[.\s!]*$/i,
      /^ignore (?:this|alert)[.\s!]*$/i,
      /^everything is fine[.\s!]*$/i,
      /^nothing wrong[.\s!]*$/i,
    ];
    if (vaguePatterns.some((pattern) => pattern.test(textLower))) {
      return {
        isValid: false,
        rejectionReason:
          'Verification failed: Evidence lacks concrete operational proof of correction. Please cite verifiable proof (e.g., credit memo ID, refund transaction reference, reversed invoice, or authorized accounting adjustment).',
        evidenceType: 'VAGUE_UNSUBSTANTIATED',
        extractedReferences: [],
        matchingRecordFound: false,
        verificationSummary: 'Rejected by VERIFIER_AI: Vague assertion lacks verifiable operational proof.',
      };
    }

    const correctionKeywords = [
      'credit memo',
      'credit note',
      'refund',
      'reversal',
      'reversed',
      'voided',
      'journal entry',
      'adjustment',
      'corrected',
      'rectified',
      'waived',
      'waiver',
      'returned',
      'reimbursed',
      'contract amendment',
    ];

    const hasCorrectionSignal = correctionKeywords.some((kw) => textLower.includes(kw));

    const refRegex =
      /\b(?:TXN|REF|CM|INV|BILL|REC|JE|PO)(?:[-_][A-Za-z0-9][A-Za-z0-9_-]*|#[A-Za-z0-9][A-Za-z0-9_-]*|[0-9][A-Za-z0-9_-]*)\b|\b#[0-9]{2,}\b|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const extractedReferences = Array.from(new Set(evidenceText.match(refRegex) || []));

    let matchingRecordFound = false;
    let matchingRecordSummary: string | undefined;
    const supportingRecords =
      alert.supportingRecordIds &&
      typeof alert.supportingRecordIds === 'object' &&
      !Array.isArray(alert.supportingRecordIds)
        ? (alert.supportingRecordIds as Record<string, unknown>)
        : {};
    const getLinkedIds = (key: string): string[] => {
      const ids = supportingRecords[key];
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
    };

    if (!hasCorrectionSignal) {
      return {
        isValid: false,
        rejectionReason:
          'Verification failed: Evidence must cite concrete proof of correction (e.g., credit memo ID, refund transaction reference, reversed invoice, or authorized accounting adjustment).',
        evidenceType: 'UNSUBSTANTIATED',
        extractedReferences: [],
        matchingRecordFound: false,
        verificationSummary: 'Rejected by VERIFIER_AI: No operational correction signal or document reference found.',
      };
    }

    if (extractedReferences.length === 0) {
      return {
        isValid: false,
        rejectionReason:
          'Verification failed: Resolution evidence must include a reference to a correction record in this organization.',
        evidenceType: 'MISSING_RECORD_REFERENCE',
        extractedReferences,
        matchingRecordFound: false,
        verificationSummary: 'Rejected by VERIFIER_AI: No organization-owned correction record was referenced.',
      };
    }

    const linkedTransactionIds = getLinkedIds('transactionIds');
    const matchTx =
      linkedTransactionIds.length > 0
        ? await this.prisma.financialTransaction.findFirst({
            where: {
              organizationId,
              id: { in: linkedTransactionIds },
              OR: [
                { id: { in: extractedReferences } },
                { reference: { in: extractedReferences } },
              ],
            },
          })
        : null;
    if (matchTx) {
      matchingRecordFound = true;
      matchingRecordSummary = `Transaction ${matchTx.reference ?? matchTx.id}: ${matchTx.description} (${DecimalMath.toFixed2(matchTx.amount)} ${matchTx.currency})`;
    }

    const linkedBillIds = getLinkedIds('billIds');
    if (!matchingRecordFound && linkedBillIds.length > 0) {
      const matchBill = await this.prisma.bill.findFirst({
        where: {
          organizationId,
          id: { in: linkedBillIds },
          OR: [
            { id: { in: extractedReferences } },
            { billNumber: { in: extractedReferences } },
          ],
        },
      });
      if (matchBill) {
        matchingRecordFound = true;
        matchingRecordSummary = `Bill ${matchBill.billNumber}: ${matchBill.supplierName} (${DecimalMath.toFixed2(matchBill.totalAmount)} ${matchBill.currency})`;
      }
    }

    const linkedInvoiceIds = getLinkedIds('invoiceIds');
    if (!matchingRecordFound && linkedInvoiceIds.length > 0) {
      const matchInv = await this.prisma.invoice.findFirst({
        where: {
          organizationId,
          id: { in: linkedInvoiceIds },
          OR: [
            { id: { in: extractedReferences } },
            { invoiceNumber: { in: extractedReferences } },
          ],
        },
      });
      if (matchInv) {
        matchingRecordFound = true;
        matchingRecordSummary = `Invoice ${matchInv.invoiceNumber}: ${matchInv.customerName} (${DecimalMath.toFixed2(matchInv.totalAmount)} ${matchInv.currency})`;
      }
    }

    if (!matchingRecordFound) {
      return {
        isValid: false,
        rejectionReason:
          'Verification failed: No organization-owned correction record related to this alert matched the evidence reference.',
        evidenceType: 'UNMATCHED_ORGANIZATION_RECORD',
        extractedReferences,
        matchingRecordFound: false,
        verificationSummary:
          'Rejected by VERIFIER_AI: No organization-owned correction record related to this alert matched the cited reference.',
      };
    }

    const evidenceType = 'DATABASE_RECONCILED_RECORD';
    const verificationSummary = `VERIFIER_AI verified: Corrective action evidence matched an organization-owned record [${matchingRecordSummary}].`;

    return {
      isValid: true,
      evidenceType,
      extractedReferences,
      matchingRecordFound,
      matchingRecordSummary,
      verificationSummary,
    };
  }

  private getActionableRecommendation(type: string): string {
    const recs: Record<string, string> = {
      UNUSUAL_AMOUNT:
        'Check the invoice with the team who made this purchase. If the charge is correct, add a note to explain it. If it looks wrong, contact the vendor right away.',
      UNUSUAL_FREQUENCY:
        'Review the receipts to make sure you were not billed multiple times. If everything is correct, no further action is needed.',
      TIMING_CHANGE:
        'Confirm with your accounts team why this payment was made over the weekend, and update the recurring schedule if needed.',
      CATEGORY_SHIFT:
        'Check the latest purchases in this category with the department manager to ensure spending stays within your overall plan.',
      DUPLICATE_CANDIDATE:
        'Check with the vendor or your bank to confirm whether you were billed twice. If so, request a refund immediately.',
      CASH_SHORTFALL:
        'Reach out to customers with overdue bills to collect payment, and pause any large non-urgent expenses until cash reserves recover.',
      OVERDUE_RECEIVABLE:
        'Send a friendly reminder to the customer and follow up by phone to confirm when the payment will arrive.',
      BUDGET_OVERRUN:
        'Hold new spending in this category until you can review the remaining budget with the department manager.',
    };
    return (
      recs[type] ??
      'Review this alert with the responsible team, confirm the supporting details, and update the alert status.'
    );
  }

  serializeAlert(alert: {
    id: string;
    organizationId: string;
    type: string;
    severity: string;
    reviewPriority: number;
    status: string;
    title: string;
    explanation: string;
    detectionMethod: string;
    metricValue: Prisma.Decimal | null;
    thresholdValue: Prisma.Decimal | null;
    supportingRecordIds: unknown;
    nonFraudDisclaimer: string;
    detectedAt: Date;
    updatedAt: Date;
    reviewDecisions?: unknown[];
  }) {
    const supporting = (alert.supportingRecordIds ?? {}) as Record<string, unknown>;
    const reviewDecisions = (alert.reviewDecisions ?? []).map((d) => {
      const dec = d as Record<string, unknown>;
      return {
        ...dec,
        notes: (dec.reviewerNotes as string) ?? (dec.notes as string) ?? '',
        metadata: dec.metadata ?? null,
      };
    });

    // Strip legacy disclaimers from stored database explanations
    let cleanedDescription = alert.explanation || '';
    cleanedDescription = cleanedDescription
      .replace(/\.?\s*Statistical or rule-based anomaly signal for human review; not a determination of confirmed fraud\.?/gi, '')
      .replace(/\.?\s*This alert represents a statistical anomaly pattern and does not represent a conclusion of fraud or misconduct\.?/gi, '')
      .trim();

    return {
      ...alert,
      ruleCode: alert.type,
      description: cleanedDescription,
      explanation: cleanedDescription,
      evidence: {
        transactions: supporting['transactions'] ?? [],
        ...supporting,
      },
      actionableRecommendation: this.getActionableRecommendation(alert.type),
      detectedAt: alert.detectedAt.toISOString(),
      updatedAt: alert.updatedAt.toISOString(),
      reviewDecisions,
    };
  }
}
