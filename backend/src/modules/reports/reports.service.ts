import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  AccountType,
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
import {
  buildExecutiveBrief,
  type BriefBudgetVarianceInput,
  type BriefForecastInput,
} from './report-brief.builder.js';

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

    // Resolve liquid cash balance & actual alerts/record counts in parallel for strict grounding
    const [liquidAccounts, alerts] = await Promise.all([
      this.prisma.financialAccount.findMany({
        where: {
          organizationId,
          isArchived: false,
          isLiquid: true,
          type: { in: [AccountType.BANK, AccountType.CASH, AccountType.ASSET] },
        },
      }),
      this.riskMonitoring.listAlerts(organizationId, {}),
    ]);

    let liquidCashBalance: string | null =
      m.cashRunway.components?.liquidCashBalance ?? null;
    if (liquidCashBalance === null && liquidAccounts.length > 0) {
      const preloadedRates = this.currencyService
        ? await this.currencyService.loadRatesForOrganization(organizationId)
        : [];
      let sum = DecimalMath.ZERO;
      let complete = true;
      for (const acc of liquidAccounts) {
        const fromCurr = (acc.currency || metricsBundle.currency).trim().toUpperCase();
        if (fromCurr === metricsBundle.currency) {
          sum = DecimalMath.add(sum, acc.currentBalance);
        } else if (this.currencyService) {
          const conv = this.currencyService.convertAmountSync({
            rates: preloadedRates,
            organizationId,
            amount: acc.currentBalance,
            fromCurrency: fromCurr,
            toCurrency: metricsBundle.currency,
            asOfDate: periodEnd,
          });
          if (conv.isConverted && conv.convertedAmount !== null) {
            sum = DecimalMath.add(sum, conv.convertedAmount);
          } else {
            complete = false;
            break;
          }
        } else {
          complete = false;
          break;
        }
      }
      if (complete) {
        liquidCashBalance = DecimalMath.toFixed4(sum);
      }
    } else if (liquidCashBalance === null && liquidAccounts.length === 0) {
      liquidCashBalance = null;
    }

    let forecastForBrief: BriefForecastInput | null = null;
    let expensesByCategoryForBrief: Record<string, string> | undefined;
    let expenseCountForBrief: number | undefined;
    let totalExpensesForBrief: string | null | undefined;
    let expenseMissingCurrenciesForBrief: string[] | undefined;
    let budgetVariancesForBrief: BriefBudgetVarianceInput[] | undefined;

    if (dto.type === ReportType.BUSINESS_HEALTH) {
      summaryMetrics = {
        cashBalance: liquidCashBalance,
        operatingCashFlow: m.operatingCashFlow.value,
        cashRunwayMonths: m.cashRunway.value,
        currentRatio: m.currentRatio.value,
        quickRatio: m.quickRatio.value,
        grossMarginPct: m.grossMargin.value,
        workingCapital: m.workingCapital.value,
        openReceivablesTotal: m.receivableAging.value?.totalOutstanding ?? '0.0000',
        overdueReceivablesTotal: m.receivableAging.value?.totalOverdue ?? '0.0000',
        openPayablesTotal: m.payableAging.value?.totalOutstanding ?? '0.0000',
        overduePayablesTotal: m.payableAging.value?.totalOverdue ?? '0.0000',
      };
      narrativeBody = {
        headline: `Business Health Brief (${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)})`,
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
      const detailedForecast =
        'items' in latestForecast && Array.isArray(latestForecast.items)
          ? latestForecast
          : await this.forecasting.getForecastById(organizationId, latestForecast.id);
      const ptsRaw = (detailedForecast.items ?? []).map((item) => ({
        date: item.projectionDate,
        projectedInflows: DecimalMath.toFixed4(
          DecimalMath.add(item.expectedInflow, item.recurringInflow),
        ),
        projectedOutflows: DecimalMath.toFixed4(
          DecimalMath.add(item.expectedOutflow, item.recurringOutflow),
        ),
        projectedBalance: item.cumulativeBalance,
      }));
      forecastForBrief = {
        id: latestForecast.id,
        openingCashBalance: latestForecast.openingCashBalance,
        projectedClosingCash: latestForecast.projectedClosingCash,
        minimumProjectedCash: latestForecast.minimumProjectedCash,
        hasLiquidityWarning: latestForecast.hasLiquidityWarning,
        forecastPoints: ptsRaw,
      };
      summaryMetrics = {
        operatingCashFlow: m.operatingCashFlow.value,
        openingCashBalance: latestForecast.openingCashBalance,
        projectedClosingCash30d: latestForecast.projectedClosingCash,
        minimumProjectedCash30d: latestForecast.minimumProjectedCash,
        hasLiquidityWarning: latestForecast.hasLiquidityWarning,
      };
      narrativeBody = {
        headline: 'Cash-Flow & Liquidity Horizon Brief',
        forecastId: latestForecast.id,
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
      let computedExpTotal = DecimalMath.ZERO;
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
          computedExpTotal = DecimalMath.add(computedExpTotal, convertedAmt);
          byCategory[tx.category] = DecimalMath.toFixed4(
            DecimalMath.add(byCategory[tx.category] ?? '0.0000', convertedAmt),
          );
        }
      }
      const missingList = Array.from(missingCurrencies).sort();
      const totalExpStr =
        missingList.length === 0 ? DecimalMath.toFixed4(computedExpTotal) : null;
      expensesByCategoryForBrief = byCategory;
      expenseCountForBrief = expenses.length;
      totalExpensesForBrief = totalExpStr;
      expenseMissingCurrenciesForBrief = missingList;

      summaryMetrics = {
        currency: metricsBundle.currency,
        isComplete: missingList.length === 0,
        missingCurrencies: missingList,
        totalExpenses: totalExpStr,
        expenseGrowthPct: m.expenseGrowth.value,
        expenseCount: expenses.length,
        expensesByCategory: byCategory,
      };
      narrativeBody = {
        headline: 'Operating Expense & Category Audit Brief',
        categoriesCount: Object.keys(byCategory).length,
      };
      sourceRecordIds.transactionIds = expenses.map((e) => e.id);
    } else if (dto.type === ReportType.BUDGET) {
      const budgetList = await this.budgets.listBudgets(organizationId);
      const variances: BriefBudgetVarianceInput[] = [];
      for (const b of budgetList.slice(0, 5)) {
        const v = await this.budgets.calculateBudgetVariance(organizationId, b.id);
        variances.push({
          budgetName: b.name,
          totalAllocated: v.totalAllocated,
          totalActualSpent: v.totalActualSpent,
          totalVarianceAmount: v.totalVarianceAmount,
          totalUtilizationPct: v.totalUtilizationPct,
          missingCurrencies:
            'missingCurrencies' in v && Array.isArray(v.missingCurrencies)
              ? (v.missingCurrencies as string[])
              : undefined,
          isComplete: 'isComplete' in v ? Boolean(v.isComplete) : true,
          lines: Array.isArray(v.lines) ? v.lines : undefined,
        });
      }
      budgetVariancesForBrief = variances;
      summaryMetrics = {
        activeBudgetsCount: budgetList.length,
        budgetVariancePct: m.budgetVariance.value,
        varianceSummaries: variances,
      };
      narrativeBody = {
        headline: 'Budget Allocation vs Actual Performance Brief',
      };
      sourceRecordIds.budgetIds = budgetList.map((b) => b.id);
    } else if (dto.type === ReportType.RISK) {
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
        headline: 'Financial Risk & Anomaly Surveillance Brief',
        nonFraudPolicy:
          'All anomaly signals require human review and are never classified as confirmed fraud.',
      };
      sourceRecordIds.riskAlertIds = alerts.map((a) => a.id);
    }

    const executiveBrief = buildExecutiveBrief({
      reportType: dto.type,
      periodStart,
      periodEnd,
      metricsBundle,
      liquidCashBalance,
      liquidAccountsCount: liquidAccounts.length,
      recordCounts: {
        accounts: Math.max(liquidAccounts.length, (sourceRecordIds.accountIds ?? []).length),
        transactions: (sourceRecordIds.transactionIds ?? []).length,
        invoices: (sourceRecordIds.invoiceIds ?? []).length,
        bills: (sourceRecordIds.billIds ?? []).length,
        budgets: (sourceRecordIds.budgetIds ?? []).length,
        riskAlerts: alerts.length,
        forecasts: (sourceRecordIds.forecastIds ?? []).length,
      },
      alerts,
      forecast: forecastForBrief,
      expensesByCategory: expensesByCategoryForBrief,
      expenseCount: expenseCountForBrief,
      totalExpenses: totalExpensesForBrief,
      expenseMissingCurrencies: expenseMissingCurrenciesForBrief,
      budgetVariances: budgetVariancesForBrief,
    });
    narrativeBody.executiveBrief = executiveBrief;

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
    const narrativeObj = (report.narrativeBody as Record<string, unknown>) ?? {};
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
        executiveBrief: narrativeObj.executiveBrief ?? null,
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
