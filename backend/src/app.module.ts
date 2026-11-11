import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './database/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AiOrchestrationModule } from './modules/ai-orchestration/ai-orchestration.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BudgetsModule } from './modules/budgets/budgets.module.js';
import { CashFlowForecastingModule } from './modules/cash-flow-forecasting/cash-flow-forecasting.module.js';
import { CsvImportModule } from './modules/csv-import/csv-import.module.js';
import { CurrencyModule } from './modules/currency/currency.module.js';
import { FinancialAnalyticsModule } from './modules/financial-analytics/financial-analytics.module.js';
import { FinancialTransactionsModule } from './modules/financial-transactions/financial-transactions.module.js';
import { FinMemoryModule } from './modules/finmemory/finmemory.module.js';
import { InvoicesPayablesModule } from './modules/invoices-payables/invoices-payables.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { RiskMonitoringModule } from './modules/risk-monitoring/risk-monitoring.module.js';
import { ScenarioPlanningModule } from './modules/scenario-planning/scenario-planning.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuditModule,
    CurrencyModule,
    AuthModule,
    OrganizationsModule,
    FinancialTransactionsModule,
    CsvImportModule,
    InvoicesPayablesModule,
    BudgetsModule,
    FinancialAnalyticsModule,
    CashFlowForecastingModule,
    FinMemoryModule,
    RiskMonitoringModule,
    ScenarioPlanningModule,
    AiOrchestrationModule,
    ReportsModule,
  ],
})
export class AppModule {}
