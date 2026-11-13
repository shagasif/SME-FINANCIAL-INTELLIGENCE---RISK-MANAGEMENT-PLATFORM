import { Module, type OnModuleInit } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module.js';
import { CashFlowForecastingModule } from '../cash-flow-forecasting/cash-flow-forecasting.module.js';
import { FinancialAnalyticsModule } from '../financial-analytics/financial-analytics.module.js';
import { FinancialTransactionsModule } from '../financial-transactions/financial-transactions.module.js';
import { FinMemoryModule } from '../finmemory/finmemory.module.js';
import { InvoicesPayablesModule } from '../invoices-payables/invoices-payables.module.js';
import { InvoicesPayablesService } from '../invoices-payables/invoices-payables.service.js';
import { ReportsModule } from '../reports/reports.module.js';
import { RiskMonitoringModule } from '../risk-monitoring/risk-monitoring.module.js';
import { ScenarioPlanningModule } from '../scenario-planning/scenario-planning.module.js';
import { AiOrchestrationController } from './ai-orchestration.controller.js';
import { WorkflowHookService } from './hooks/workflow-hooks.service.js';
import { McpIntegrationService } from './mcp/mcp-integration.service.js';
import { ToolRegistryService } from './mcp/tool-registry.service.js';
import { AiModelProviderService } from './model-provider/ai-model-provider.service.js';
import { AgentSandboxService } from './sandbox/agent-sandbox.service.js';
import { AgentSkillsRegistryService } from './skills/agent-skills-registry.service.js';
import { SupervisorOrchestratorService } from './supervisor-orchestrator.service.js';

@Module({
  imports: [
    FinancialAnalyticsModule,
    FinancialTransactionsModule,
    CashFlowForecastingModule,
    RiskMonitoringModule,
    InvoicesPayablesModule,
    BudgetsModule,
    ScenarioPlanningModule,
    FinMemoryModule,
    ReportsModule,
  ],
  controllers: [AiOrchestrationController],
  providers: [
    AgentSandboxService,
    WorkflowHookService,
    ToolRegistryService,
    McpIntegrationService,
    AiModelProviderService,
    AgentSkillsRegistryService,
    SupervisorOrchestratorService,
    {
      provide: 'POST_SAVE_ORCHESTRATOR',
      useExisting: SupervisorOrchestratorService,
    },
  ],
  exports: [
    AgentSandboxService,
    WorkflowHookService,
    ToolRegistryService,
    McpIntegrationService,
    AiModelProviderService,
    AgentSkillsRegistryService,
    SupervisorOrchestratorService,
    'POST_SAVE_ORCHESTRATOR',
  ],
})
export class AiOrchestrationModule implements OnModuleInit {
  constructor(
    private readonly invoicesPayablesService: InvoicesPayablesService,
    private readonly supervisorOrchestrator: SupervisorOrchestratorService,
  ) {}

  onModuleInit(): void {
    this.invoicesPayablesService.registerPostSaveOrchestrator(this.supervisorOrchestrator);
  }
}
