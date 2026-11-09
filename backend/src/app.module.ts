import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './database/prisma.module.js';
import { HealthModule } from './health/health.module.js';

/**
 * Root Application Module (Modular Monolithic Architecture)
 *
 * Phase 1 registers Core Configuration, Prisma Database Infrastructure, and
 * Health Monitoring.
 *
 * Future phases will register bounded domain modules here:
 * - Auth & OrganizationRBACModule
 * - FinancialRecordsModule (Accounts, Transactions, CSV Imports)
 * - InvoicesAndPayablesModule
 * - BudgetManagementModule
 * - CashFlowForecastingModule
 * - FinancialAnalyticsModule
 * - RiskMonitoringModule
 * - ScenarioPlanningModule
 * - FinMemoryModule
 * - ReportingAndAuditModule
 * - AiOrchestrationModule (Supervisor + Specialized Agents + Verifier Agent)
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
