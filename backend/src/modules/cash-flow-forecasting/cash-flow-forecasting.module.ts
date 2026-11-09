import { Module } from '@nestjs/common';
import { CashFlowForecastingController } from './cash-flow-forecasting.controller.js';
import { CashFlowForecastingService } from './cash-flow-forecasting.service.js';

@Module({
  controllers: [CashFlowForecastingController],
  providers: [CashFlowForecastingService],
  exports: [CashFlowForecastingService],
})
export class CashFlowForecastingModule {}
