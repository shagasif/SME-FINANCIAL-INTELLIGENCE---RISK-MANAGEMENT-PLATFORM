import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module.js';
import { InvoicesPayablesModule } from '../invoices-payables/invoices-payables.module.js';
import { FinancialAnalyticsController } from './financial-analytics.controller.js';
import { FinancialAnalyticsService } from './financial-analytics.service.js';

@Module({
  imports: [InvoicesPayablesModule, BudgetsModule],
  controllers: [FinancialAnalyticsController],
  providers: [FinancialAnalyticsService],
  exports: [FinancialAnalyticsService],
})
export class FinancialAnalyticsModule {}
