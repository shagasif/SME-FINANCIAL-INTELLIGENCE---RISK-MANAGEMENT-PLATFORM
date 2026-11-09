import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module.js';
import { CashFlowForecastingModule } from '../cash-flow-forecasting/cash-flow-forecasting.module.js';
import { FinancialAnalyticsModule } from '../financial-analytics/financial-analytics.module.js';
import { RiskMonitoringModule } from '../risk-monitoring/risk-monitoring.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [
    FinancialAnalyticsModule,
    CashFlowForecastingModule,
    BudgetsModule,
    RiskMonitoringModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
