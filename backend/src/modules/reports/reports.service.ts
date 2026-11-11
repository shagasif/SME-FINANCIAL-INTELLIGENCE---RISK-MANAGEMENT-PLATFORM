import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  ForecastScenarioType,
  Prisma,
  ReportType,
  TaskStatus,
  TransactionType,
} from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BudgetsService } from '../budgets/budgets.service.js';
import { CashFlowForecastingService } from '../cash-flow-forecasting/cash-flow-forecasting.service.js';
import { CurrencyConversionService } from '../currency/currency.service.js';
import { FinancialAnalyticsService } from '../financial-analytics/financial-analytics.service.js';
import { RiskMonitoringService } from '../risk-monitoring/risk-monitoring.service.js';
import {
  CreateFollowUpTaskDto,
  GenerateReportDto,
  UpdateFollowUpTaskStatusDto,
} from './dto/reports.dto.js';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: FinancialAnalyticsService,
    private readonly forecasting: CashFlowForecastingService,
    private readonly budgets: BudgetsService,
    private readonly riskMonitoring: RiskMonitoringService,
    private readonly audit: AuditService,
    @Optional() private readonly currencyService?: CurrencyConversionService,
  ) {}

  async generateReport(organizationId: string, dto: GenerateReportDto, actorUserId: string) {
    const periodEnd = dto.periodEnd ? new Date(dto.periodEnd) : new Date();
    const periodStart = dto.periodStart
      ? new Date(dto.periodStart)
      : new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

    const metricsBundle = await this.analytics.computeAllMetrics(organizationId, {
      startDate: periodStart,
      endDate: periodEnd,
    });
    const m = metricsBundle.metrics;

    let summaryMetrics: Record<string, unknown> = {};
    let narrativeBody: Record<string, unknown> = {};
    const sourceRecordIds: Record<string, string[]> = {
      accountIds: m.workingCapital.sourceRecordIds.accountIds ?? [],
      transactionIds: m.operatingCashFlow.sourceRecordIds.transactionIds ?? [],
      invoiceIds: m.receivableAging.sourceRecordIds.invoiceIds ?? [],
      billIds: m.payableAging.sourceRecordIds.billIds ?? [],
      budgetIds: m.budgetVariance.sourceRecordIds.budgetIds ?? [],
    };

    if (dto.type === ReportType.BUSINESS_HEALTH) {
      summaryMetrics = {
        operatingCashFlow: m.operatingCashFlow.value,
        cashRunwayMonths: m.cashRunway.value,
        currentRatio: m.currentRatio.value,
        quickRatio: m.quickRatio.value,
        grossMarginPct: m.grossMargin.value,
        workingCapital: m.workingCapital.value,
      };
      narrativeBody = {
        headline: `Business Health Diagnostic (${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)})`,
        liquidityAssessment: `Operating Cash Flow: ${String(m.operatingCashFlow.value ?? 'N/A')} ${metricsBundle.currency}; Working Capital: ${String(m.workingCapital.value ?? 'N/A')} ${metricsBundle.currency}.`,
        solvencyRatios: `Current Ratio: ${String(m.currentRatio.value ?? 'N/A')}; Quick Ratio: ${String(m.quickRatio.value ?? 'N/A')}.`,
      };
    } else if (dto.type === ReportType.CASH_FLOW) {
      const forecasts = await this.forecasting.listForecasts(organizationId, 30);
      const latestForecast =
        forecasts.length > 0
          ? forecasts[0]
          : await this.forecasting.generateForecast(
              organizationId,
              { horizonDays: 30, scenarioType: ForecastScenarioType.BASE },
              actorUserId,
            );
      summaryMetrics = {
        operatingCashFlow: m.operatingCashFlow.value,
        openingCashBalance: latestForecast.openingCashBalance,
        projectedClosingCash30d: latestForecast.projectedClosingCash,
        minimumProjectedCash30d: latestForecast.minimumProjectedCash,
        hasLiquidityWarning: latestForecast.hasLiquidityWarning,
      };
      narrativeBody = {
        headline: 'Cash-Flow & Liquidity Horizon Report',
        forecastId: latestForecast.id,
        assumptions: latestForecast.assumptions,
      };
      sourceRecordIds.forecastIds = [latestForecast.id];
    } else if (dto.type === ReportType.EXPENSE) {
      const expenses = await this.prisma.financialTransaction.findMany({
        where: {
          organizationId,
          isArchived: false,
          type: TransactionType.EXPENSE,
          transactionDate: { gte: periodStart, lte: periodEnd },
        },
      });
      const preloadedRates = this.currencyService
        ? await this.currencyService.loadRatesForOrganization(organizationId)
        : [];
      const missingCurrencies = new Set<string>();
      const byCategory: Record<string, string> = {};
      for (const tx of expenses) {
        const txCurr = (tx.currency || metricsBundle.currency).trim().toUpperCase();
        let convertedAmt: Prisma.Decimal | null = null;
        if (txCurr === metricsBundle.currency) {
          convertedAmt = tx.amount;
        } else if (this.currencyService) {
          const conv = this.currencyService.convertAmountSync({
            rates: preloadedRates,
            organizationId,
            amount: tx.amount,
            fromCurrency: txCurr,
            toCurrency: metricsBundle.currency,
            asOfDate: tx.transactionDate,
          });
          if (conv.isConverted && conv.convertedAmount !== null) {
            convertedAmt = conv.convertedAmount;
          } else {
            missingCurrencies.add(txCurr);
          }
        } else {
          missingCurrencies.add(txCurr);
        }

        if (convertedAmt !== null) {
          byCategory[tx.category] = DecimalMath.toFixed4(
            DecimalMath.add(byCategory[tx.category] ?? '0.0000', convertedAmt),
          );
        }
      }
      const missingList = Array.from(missingCurrencies).sort();
      summaryMetrics = {
        currency: metricsBundle.currency,
        isComplete: missingList.length === 0,
        missingCurrencies: missingList,
        totalExpenses:
          missingList.length === 0 ? (m.operatingCashFlow.components?.cashOutflows ?? '0.0000') : null,
        expenseGrowthPct: m.expenseGrowth.value,
        expenseCount: expenses.length,
        expensesByCategory: byCategory,
      };
      narrativeBody = {
        headline: 'Operating Expense & Category Breakdown Report',
        categoriesCount: Object.keys(byCategory).length,
        conversionContext: metricsBundle.conversionContext,
      };
      sourceRecordIds.transactionIds = expenses.map((e) => e.id);
    } else if (dto.type === ReportType.BUDGET) {
      const budgetList = await this.budgets.listBudgets(organizationId);
      const variances = [];
      for (const b of budgetList.slice(0, 3)) {
        variances.push(await this.budgets.calculateBudgetVariance(organizationId, b.id));
      }
      summaryMetrics = {
        activeBudgetsCount: budgetList.length,
        budgetVariancePct: m.budgetVariance.value,
        varianceSummaries: variances,
      };
      narrativeBody = {
        headline: 'Budget Allocation vs Actual Performance Report',
      };
    } else if (dto.type === ReportType.RISK) {
      const alerts = await this.riskMonitoring.listAlerts(organizationId, {});
      summaryMetrics = {
        totalAlertsCount: alerts.length,
        overdueReceivables: m.receivableAging.value?.totalOverdue ?? '0.0000',
        overduePayables: m.payableAging.value?.totalOverdue ?? '0.0000',
        alertsBySeverity: {
          CRITICAL: alerts.filter((a) => a.severity === 'CRITICAL').length,
          HIGH: alerts.filter((a) => a.severity === 'HIGH').length,
          MEDIUM: alerts.filter((a) => a.severity === 'MEDIUM').length,
          LOW: alerts.filter((a) => a.severity === 'LOW').length,
        },
      };
      narrativeBody = {
        headline: 'Financial Risk & Anomaly Surveillance Report',
        nonFraudPolicy:
          'All anomaly signals require human review and are never classified as confirmed fraud.',
      };
      sourceRecordIds.riskAlertIds = alerts.map((a) => a.id);
    }

    const title =
      dto.title?.trim() ??
      `${dto.type.replace(/_/g, ' ')} Report (${periodStart.toISOString().slice(0, 10)})`;

    const report = await this.prisma.reportRecord.create({
      data: {
        organizationId,
        type: dto.type,
        title,
        periodStart,
        periodEnd,
        currency: metricsBundle.currency,
        summaryMetrics: summaryMetrics as unknown as Prisma.InputJsonValue,
        narrativeBody: narrativeBody as unknown as Prisma.InputJsonValue,
        sourceRecordIds: sourceRecordIds as unknown as Prisma.InputJsonValue,
        exportFormats: ['JSON', 'CSV', 'PDF'] as unknown as Prisma.InputJsonValue,
        generatedById: actorUserId,
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'REPORT_GENERATED',
      resourceType: 'REPORT_RECORD',
      resourceId: report.id,
      details: { type: report.type, title: report.title },
    });

    return report;
  }

  async listReports(organizationId: string, type?: ReportType) {
    return this.prisma.reportRecord.findMany({
      where: {
        organizationId,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async exportReport(
    organizationId: string,
    reportId: string,
    format: 'CSV' | 'PDF',
    actorUserId: string,
    actorRole: string,
  ) {
    const report = await this.prisma.reportRecord.findFirst({
      where: { id: reportId, organizationId },
    });
    if (!report) {
      throw new NotFoundException('Report record not found in organization');
    }

    const metricsObj = (report.summaryMetrics as Record<string, unknown>) ?? {};

    await this.audit.record({
      organizationId,
      actorUserId,
      actorRole,
      action: `REPORT_EXPORTED_${format}`,
      resourceType: 'REPORT_RECORD',
      resourceId: report.id,
      status: 'SUCCESS',
      details: {
        reportType: report.type,
        format,
      },
    });

    if (format === 'CSV') {
      const rows = [
        ['Report ID', 'Report Type', 'Title', 'Currency', 'Metric Key', 'Metric Value'],
      ];
      for (const [key, val] of Object.entries(metricsObj)) {
        const serializedVal =
          typeof val === 'object' ? JSON.stringify(val).replace(/"/g, '""') : String(val ?? '');
        rows.push([
          report.id,
          report.type,
          `"${report.title.replace(/"/g, '""')}"`,
          report.currency,
          key,
          `"${serializedVal}"`,
        ]);
      }

      const csvContent = rows.map((r) => r.join(',')).join('\n');
      return {
        reportId: report.id,
        format: 'CSV',
        mimeType: 'text/csv',
        fileName: `${report.type.toLowerCase()}_${report.id.slice(0, 8)}.csv`,
        content: csvContent,
        exportedAt: new Date().toISOString(),
      };
    }

    // PDF-ready structured document representation
    return {
      reportId: report.id,
      format: 'PDF',
      mimeType: 'application/pdf+json',
      fileName: `${report.type.toLowerCase()}_${report.id.slice(0, 8)}.pdf`,
      documentStructure: {
        header: {
          title: report.title,
          type: report.type,
          currency: report.currency,
          periodStart: report.periodStart.toISOString(),
          periodEnd: report.periodEnd.toISOString(),
        },
        summaryMetrics: report.summaryMetrics,
        narrativeBody: report.narrativeBody,
        sourceRecordIds: report.sourceRecordIds,
      },
      exportedAt: new Date().toISOString(),
    };
  }

  async listNotifications(organizationId: string, userId?: string) {
    return this.prisma.notification.findMany({
      where: {
        organizationId,
        ...(userId ? { OR: [{ userId }, { userId: null }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markNotificationRead(organizationId: string, notificationId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async createFollowUpTask(
    organizationId: string,
    dto: CreateFollowUpTaskDto,
    creatorUserId: string,
  ) {
    const task = await this.prisma.followUpTask.create({
      data: {
        organizationId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assignedToId: dto.assignedToId ?? null,
        createdById: creatorUserId,
        relatedEntityId: dto.relatedEntityId ?? null,
        relatedType: dto.relatedType ?? null,
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId: creatorUserId,
      action: 'FOLLOW_UP_TASK_CREATED',
      resourceType: 'FOLLOW_UP_TASK',
      resourceId: task.id,
      details: { title: task.title, priority: task.priority },
    });

    return task;
  }

  async listFollowUpTasks(organizationId: string, status?: TaskStatus) {
    return this.prisma.followUpTask.findMany({
      where: {
        organizationId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateFollowUpTaskStatus(
    organizationId: string,
    taskId: string,
    dto: UpdateFollowUpTaskStatusDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.followUpTask.findFirst({
      where: { id: taskId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Follow-up task not found');
    }

    const updated = await this.prisma.followUpTask.update({
      where: { id: taskId },
      data: {
        status: dto.status,
        completedAt: dto.status === TaskStatus.COMPLETED ? new Date() : null,
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'FOLLOW_UP_TASK_STATUS_UPDATED',
      resourceType: 'FOLLOW_UP_TASK',
      resourceId: taskId,
      details: { status: dto.status },
    });

    return updated;
  }

  async listReviewDecisions(organizationId: string) {
    return this.prisma.reviewDecision.findMany({
      where: { organizationId },
      include: {
        reviewer: { select: { id: true, email: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
