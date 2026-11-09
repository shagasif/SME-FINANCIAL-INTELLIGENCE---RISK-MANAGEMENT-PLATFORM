import { Module } from '@nestjs/common';
import { CashFlowForecastingModule } from '../cash-flow-forecasting/cash-flow-forecasting.module.js';
import { FinancialAnalyticsModule } from '../financial-analytics/financial-analytics.module.js';
import { FinMemoryController } from './finmemory.controller.js';
import { FinMemoryService } from './finmemory.service.js';

@Module({
  imports: [FinancialAnalyticsModule, CashFlowForecastingModule],
  controllers: [FinMemoryController],
  providers: [FinMemoryService],
  exports: [FinMemoryService],
})
export class FinMemoryModule {}
