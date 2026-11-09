import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module.js';
import { RiskMonitoringController } from './risk-monitoring.controller.js';
import { RiskMonitoringService } from './risk-monitoring.service.js';

@Module({
  imports: [BudgetsModule],
  controllers: [RiskMonitoringController],
  providers: [RiskMonitoringService],
  exports: [RiskMonitoringService],
})
export class RiskMonitoringModule {}
