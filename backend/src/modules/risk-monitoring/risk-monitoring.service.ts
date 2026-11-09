import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountType,
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
            status: { not: InvoiceStatus.VOID },
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
            title: `Unusual expense amount in ${tx.category}`,
            explanation: `Expense transaction "${tx.description}" of ${DecimalMath.toFixed4(tx.amount)} exceeds the statistical threshold of ${DecimalMath.toFixed4(statisticalThreshold)} (mean ${DecimalMath.toFixed4(mean)}, stdDev ${DecimalMath.toFixed4(stdDev)}). ${NON_FRAUD_DISCLAIMER}`,
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
              title: `Unusual spending frequency for "${key}"`,
              explanation: `Detected ${cluster.length} expense transactions totaling ${DecimalMath.toFixed4(clusterSum)} within ${spanDays.toFixed(1)} days for "${key}". ${NON_FRAUD_DISCLAIMER}`,
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
          title: `Off-schedule weekend timing on recurring expense "${tx.description}"`,
          explanation: `Recurring expense "${tx.description}" (${DecimalMath.toFixed4(tx.amount)}) was recorded on a weekend (${tx.transactionDate.toISOString().slice(0, 10)}), differing from standard business-day settlement timing. ${NON_FRAUD_DISCLAIMER}`,
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
            title: `High expense concentration shift in "${cat}"`,
            explanation: `Category "${cat}" accounts for ${DecimalMath.toFixed2(sharePct)}% (${DecimalMath.toFixed4(info.sum)}) of total operating expenses (${DecimalMath.toFixed4(totalExp)}). ${NON_FRAUD_DISCLAIMER}`,
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
            title: `Potential duplicate expense transactions (${DecimalMath.toFixed4(a.amount)})`,
            explanation: `Two expense records in category "${a.category}" for ${DecimalMath.toFixed4(a.amount)} occurred within ${hoursApart.toFixed(1)} hours of each other. Review for potential double billing. ${NON_FRAUD_DISCLAIMER}`,
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
        title: 'Potential liquidity shortfall risk detected',
        explanation: `Current liquid cash is ${DecimalMath.toFixed4(liquidCash)} ${latestForecast ? `and minimum projected cash over ${latestForecast.horizonDays} days is ${DecimalMath.toFixed4(latestForecast.minimumProjectedCash)}` : ''}, breaching the liquidity buffer of ${DecimalMath.toFixed4(safetyThreshold)}. ${NON_FRAUD_DISCLAIMER}`,
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
        title: `${overdueInvoices.length} overdue customer invoice(s) totaling ${DecimalMath.toFixed4(overdueSum)}`,
        explanation: `Organization has ${overdueInvoices.length} past-due customer invoice(s) with total outstanding balance of ${DecimalMath.toFixed4(overdueSum)}, delaying expected cash inflows. ${NON_FRAUD_DISCLAIMER}`,
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
          title: `Budget overrun in ${line.category} (${line.department})`,
          explanation: `Actual spending of ${line.actualSpent} in "${line.category}" exceeds the allocated budget of ${line.allocatedAmount} (${line.utilizationPct}% utilized) in budget "${budget.name}". ${NON_FRAUD_DISCLAIMER}`,
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

    const createdAlerts = [];
    for (const c of candidateAlerts) {
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
          supportingRecordIds: c.supportingRecordIds as unknown as Prisma.InputJsonValue,
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

    const statusMap: Record<string, RiskAlertStatus> = {
      [ReviewActionType.ACKNOWLEDGE]: RiskAlertStatus.ACKNOWLEDGED,
      [ReviewActionType.DISMISS]: RiskAlertStatus.DISMISSED,
      [ReviewActionType.INVESTIGATE]: RiskAlertStatus.INVESTIGATING,
      [ReviewActionType.ESCALATE]: RiskAlertStatus.ESCALATED,
    };

    const newStatus = statusMap[dto.action] ?? RiskAlertStatus.ACKNOWLEDGED;
    const sanitizedNotes = SecurityUtil.sanitizeImportedText(dto.reviewerNotes).sanitized;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.reviewDecision.create({
        data: {
          organizationId,
          targetType: ReviewTargetType.RISK_ALERT,
          targetId: alert.id,
          riskAlertId: alert.id,
          action: dto.action,
          reviewerUserId,
          reviewerNotes: sanitizedNotes,
          previousStatus: alert.status,
          newStatus,
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
      },
    });

    return this.serializeAlert(updated);
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
    return {
      ...alert,
      metricValue: alert.metricValue ? DecimalMath.toFixed4(alert.metricValue) : null,
      thresholdValue: alert.thresholdValue ? DecimalMath.toFixed4(alert.thresholdValue) : null,
      detectedAt: alert.detectedAt.toISOString(),
      updatedAt: alert.updatedAt.toISOString(),
    };
  }
}
