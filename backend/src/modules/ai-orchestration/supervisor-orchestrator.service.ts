import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AgentType,
  ExecutionStatus,
  Prisma,
  RoleType,
  VerificationStatus,
} from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ExecuteAiWorkflowDto } from './dto/ai-orchestration.dto.js';
import { DuringHookEvent, WorkflowHookService } from './hooks/workflow-hooks.service.js';
import { AiMediaAttachment, AiModelUsageMetrics } from './model-provider/ai-model-provider.service.js';
import type { DocumentTargetType } from '../document-import/document-parser.util.js';
import { AgentSandboxService } from './sandbox/agent-sandbox.service.js';
import { AgentSkillsRegistryService } from './skills/agent-skills-registry.service.js';

@Injectable()
export class SupervisorOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hooks: WorkflowHookService,
    private readonly sandbox: AgentSandboxService,
    private readonly skillsRegistry: AgentSkillsRegistryService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Classifies a user request and selects the appropriate specialist agents.
   */
  classifyTaskAndSelectAgents(
    prompt: string,
    explicitAgents?: AgentType[],
  ): {
    taskClassification: string;
    selectedSpecialistAgents: AgentType[];
  } {
    if (explicitAgents && explicitAgents.length > 0) {
      const filtered = explicitAgents.filter(
        (a) => a !== AgentType.SUPERVISOR_ORCHESTRATOR && a !== AgentType.VERIFIER_AI,
      );
      return {
        taskClassification: 'EXPLICIT_MULTI_AGENT_DELEGATION',
        selectedSpecialistAgents: filtered.length > 0 ? filtered : [AgentType.FINANCE_DATA_ANALYST],
      };
    }

    const lower = prompt.toLowerCase();
    const selected = new Set<AgentType>();

    if (
      lower.includes('ratio') ||
      lower.includes('data') ||
      lower.includes('margin') ||
      lower.includes('working capital') ||
      lower.includes('health') ||
      lower.includes('analyze')
    ) {
      selected.add(AgentType.FINANCE_DATA_ANALYST);
    }

    if (
      lower.includes('forecast') ||
      lower.includes('cash flow') ||
      lower.includes('cash-flow') ||
      lower.includes('runway') ||
      lower.includes('liquidity') ||
      lower.includes('30') ||
      lower.includes('60') ||
      lower.includes('90')
    ) {
      selected.add(AgentType.CASH_FLOW_FORECASTING);
    }

    if (
      lower.includes('anomaly') ||
      lower.includes('anomalous') ||
      lower.includes('unusual') ||
      lower.includes('duplicate') ||
      lower.includes('expense')
    ) {
      selected.add(AgentType.EXPENSE_ANOMALY_DETECTION);
    }

    if (
      lower.includes('risk') ||
      lower.includes('overdue') ||
      lower.includes('shortfall') ||
      lower.includes('alert') ||
      lower.includes('receivable')
    ) {
      selected.add(AgentType.FINANCIAL_RISK_ASSESSMENT);
    }

    if (
      lower.includes('scenario') ||
      lower.includes('what-if') ||
      lower.includes('what if') ||
      lower.includes('delay') ||
      lower.includes('stress')
    ) {
      selected.add(AgentType.SCENARIO_PLANNING);
    }

    if (
      lower.includes('recommend') ||
      lower.includes('action') ||
      lower.includes('strategy') ||
      lower.includes('optimize') ||
      lower.includes('decision')
    ) {
      selected.add(AgentType.STRATEGIC_RECOMMENDATION);
    }

    if (
      lower.includes('report') ||
      lower.includes('summary') ||
      lower.includes('executive') ||
      lower.includes('brief')
    ) {
      selected.add(AgentType.FINANCIAL_REPORTING);
    }

    if (selected.size === 0) {
      selected.add(AgentType.FINANCE_DATA_ANALYST);
      selected.add(AgentType.CASH_FLOW_FORECASTING);
      selected.add(AgentType.FINANCIAL_RISK_ASSESSMENT);
      selected.add(AgentType.STRATEGIC_RECOMMENDATION);
    }

    const classification =
      selected.size >= 3
        ? 'COMPREHENSIVE_FINANCIAL_INTELLIGENCE_WORKFLOW'
        : Array.from(selected).join('_AND_');

    return {
      taskClassification: classification,
      selectedSpecialistAgents: Array.from(selected),
    };
  }

  /**
   * Executes the full 10-step MCP + Agent Skills + AI Model Provider + Verifier
   * workflow with mandatory Pre, During, Post, and Error lifecycle hooks.
   */
  async executeWorkflow(params: {
    organizationId: string;
    userId: string;
    userRole: RoleType;
    isPlatformAdmin: boolean;
    dto: ExecuteAiWorkflowDto;
  }) {
    const workflowStartMs = Date.now();
    const duringEvents: DuringHookEvent[] = [];

    // STEP 1 & 2: Pre-Execution Hooks + Task Classification
    const preHookResult = await this.hooks.runPreExecutionHooks({
      organizationId: params.organizationId,
      userId: params.userId,
      userRole: params.userRole,
      isPlatformAdmin: params.isPlatformAdmin,
      prompt: params.dto.prompt,
    });

    const { taskClassification, selectedSpecialistAgents } = this.classifyTaskAndSelectAgents(
      preHookResult.sanitizedPrompt,
      params.dto.requestedAgents,
    );

    // Always include VERIFIER_AI as final verification stage
    const allWorkflowAgents = [...selectedSpecialistAgents, AgentType.VERIFIER_AI];

    const workflowRun = await this.prisma.workflowRun.create({
      data: {
        organizationId: params.organizationId,
        requestedByUserId: params.userId,
        prompt: preHookResult.sanitizedPrompt,
        taskClassification,
        selectedAgents: allWorkflowAgents as unknown as Prisma.InputJsonValue,
        executionMode: 'PARALLEL_SPECIALISTS_THEN_SEQUENTIAL_VERIFIER',
        status: ExecutionStatus.RUNNING,
        verificationStatus: VerificationStatus.PENDING,
        preHookLog: preHookResult as unknown as Prisma.InputJsonValue,
      },
    });

    try {
      this.hooks.recordDuringExecutionEvent(duringEvents, {
        stage: 'SUPERVISOR_TASK_CLASSIFIED',
        agentType: AgentType.SUPERVISOR_ORCHESTRATOR,
        status: 'RUNNING',
        workflowStartedAt: workflowStartMs,
      });

      // STEP 3, 4, 5, 6, 7: Execute Specialist Agents in isolated sandboxes
      // Independent data/forecast/risk agents run in parallel; synthesis agents follow
      const independentAgents = selectedSpecialistAgents.filter(
        (a) => a !== AgentType.STRATEGIC_RECOMMENDATION && a !== AgentType.FINANCIAL_REPORTING,
      );
      const dependentAgents = selectedSpecialistAgents.filter(
        (a) => a === AgentType.STRATEGIC_RECOMMENDATION || a === AgentType.FINANCIAL_REPORTING,
      );

      const specialistOutputs: Array<Record<string, unknown>> = [];
      const aggregatedSourceRecordIds: Record<string, Set<string>> = {};
      const modelUsageRecords: AiModelUsageMetrics[] = [];

      const mergeSourceIds = (ids: Record<string, string[]>) => {
        for (const [k, arr] of Object.entries(ids)) {
          if (!aggregatedSourceRecordIds[k]) {
            aggregatedSourceRecordIds[k] = new Set();
          }
          for (const item of arr ?? []) {
            aggregatedSourceRecordIds[k].add(item);
          }
        }
      };

      const executeSingleSpecialistAgent = async (agentType: AgentType) => {
        const agentStartMs = Date.now();
        const sandboxCtx = this.sandbox.createSandboxContext({
          workflowRunId: workflowRun.id,
          organizationId: params.organizationId,
          actorUserId: params.userId,
          actorRole: params.userRole,
          agentType,
        });

        const agentSkills = this.skillsRegistry.getSkillsForAgent(agentType);
        const loadedSkillIds = agentSkills.map((s) => s.skillId);

        const agentRunRecord = await this.prisma.agentRun.create({
          data: {
            workflowRunId: workflowRun.id,
            organizationId: params.organizationId,
            agentType,
            sandboxId: sandboxCtx.sandboxId,
            loadedSkills: loadedSkillIds as unknown as Prisma.InputJsonValue,
            allowedTools: sandboxCtx.allowedTools as unknown as Prisma.InputJsonValue,
            invokedTools: [] as unknown as Prisma.InputJsonValue,
            status: ExecutionStatus.RUNNING,
            inputContext: {
              prompt: preHookResult.sanitizedPrompt,
              horizonDays: params.dto.horizonDays ?? 30,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        try {
          const skillOutputs: Array<Record<string, unknown>> = [];
          const invokedMcpTools: string[] = [];
          const agentSourceIds: Record<string, string[]> = {};
          let lastUsage: AiModelUsageMetrics | null = null;

          for (const skill of agentSkills) {
            const isApplicable = skill.requiredInputs.every((k) =>
              ['organizationId', 'prompt', 'horizonDays'].includes(k),
            );
            if (!isApplicable) {
              continue;
            }
            const skillExec = await this.skillsRegistry.executeSkill(
              skill.skillId,
              {
                organizationId: params.organizationId,
                prompt: preHookResult.sanitizedPrompt,
                horizonDays: params.dto.horizonDays ?? 30,
              },
              sandboxCtx,
            );
            skillOutputs.push(skillExec.output);
            invokedMcpTools.push(...skillExec.invokedMcpTools);
            Object.assign(agentSourceIds, skillExec.sourceRecordIds);
            lastUsage = skillExec.modelUsage;
            modelUsageRecords.push(skillExec.modelUsage);
          }

          this.hooks.recordDuringExecutionEvent(duringEvents, {
            stage: 'SPECIALIST_AGENT_COMPLETED',
            agentType,
            loadedSkills: loadedSkillIds,
            invokedTools: invokedMcpTools,
            status: 'COMPLETED',
            workflowStartedAt: workflowStartMs,
          });

          const combinedAgentOutput = {
            agentType,
            loadedSkills: loadedSkillIds,
            skillResults: skillOutputs,
            sourceRecordIds: agentSourceIds,
          };

          await this.prisma.agentRun.update({
            where: { id: agentRunRecord.id },
            data: {
              status: ExecutionStatus.COMPLETED,
              invokedTools: sandboxCtx.invokedTools as unknown as Prisma.InputJsonValue,
              mcpToolCalls: invokedMcpTools as unknown as Prisma.InputJsonValue,
              blockedOperations: sandboxCtx.blockedOperations as unknown as Prisma.InputJsonValue,
              modelUsage: (lastUsage ?? {}) as unknown as Prisma.InputJsonValue,
              outputPayload: combinedAgentOutput as unknown as Prisma.InputJsonValue,
              evidenceCitations: agentSourceIds as unknown as Prisma.InputJsonValue,
              durationMs: Date.now() - agentStartMs,
              completedAt: new Date(),
            },
          });

          mergeSourceIds(agentSourceIds);
          specialistOutputs.push(combinedAgentOutput);
          return combinedAgentOutput;
        } finally {
          this.sandbox.releaseSandbox(sandboxCtx.sandboxId);
        }
      };

      // Execute independent specialist agents in parallel
      if (independentAgents.length > 0) {
        await Promise.all(independentAgents.map((a) => executeSingleSpecialistAgent(a)));
      }

      // Execute synthesis/recommendation specialist agents sequentially
      for (const depAgent of dependentAgents) {
        await executeSingleSpecialistAgent(depAgent);
      }

      // STEP 8: Execute Verifier AI Agent
      const verifierStartMs = Date.now();
      const verifierSandbox = this.sandbox.createSandboxContext({
        workflowRunId: workflowRun.id,
        organizationId: params.organizationId,
        actorUserId: params.userId,
        actorRole: params.userRole,
        agentType: AgentType.VERIFIER_AI,
      });

      const verifierRunRecord = await this.prisma.agentRun.create({
        data: {
          workflowRunId: workflowRun.id,
          organizationId: params.organizationId,
          agentType: AgentType.VERIFIER_AI,
          sandboxId: verifierSandbox.sandboxId,
          loadedSkills: ['skill.financial-output-verification'] as unknown as Prisma.InputJsonValue,
          allowedTools: verifierSandbox.allowedTools as unknown as Prisma.InputJsonValue,
          invokedTools: [] as unknown as Prisma.InputJsonValue,
          status: ExecutionStatus.RUNNING,
          inputContext: {
            specialistAgentCount: specialistOutputs.length,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      let verifierSkillResult;
      try {
        verifierSkillResult = await this.skillsRegistry.executeSkill(
          'skill.financial-output-verification',
          {
            organizationId: params.organizationId,
            specialistOutputs,
          },
          verifierSandbox,
        );
        modelUsageRecords.push(verifierSkillResult.modelUsage);
        mergeSourceIds(verifierSkillResult.sourceRecordIds);

        await this.prisma.agentRun.update({
          where: { id: verifierRunRecord.id },
          data: {
            status: ExecutionStatus.COMPLETED,
            invokedTools: verifierSandbox.invokedTools as unknown as Prisma.InputJsonValue,
            mcpToolCalls: verifierSkillResult.invokedMcpTools as unknown as Prisma.InputJsonValue,
            blockedOperations:
              verifierSandbox.blockedOperations as unknown as Prisma.InputJsonValue,
            modelUsage: verifierSkillResult.modelUsage as unknown as Prisma.InputJsonValue,
            outputPayload: verifierSkillResult.output as unknown as Prisma.InputJsonValue,
            evidenceCitations:
              verifierSkillResult.sourceRecordIds as unknown as Prisma.InputJsonValue,
            durationMs: Date.now() - verifierStartMs,
            completedAt: new Date(),
          },
        });
      } finally {
        this.sandbox.releaseSandbox(verifierSandbox.sandboxId);
      }

      const verificationPassed = Boolean(verifierSkillResult.output.verificationPassed);
      const hasStrategicRecommendations = selectedSpecialistAgents.includes(
        AgentType.STRATEGIC_RECOMMENDATION,
      );
      const humanReviewRequired = !verificationPassed || hasStrategicRecommendations;
      const finalVerificationStatus = verificationPassed
        ? VerificationStatus.APPROVED
        : VerificationStatus.REQUIRES_HUMAN_REVIEW;

      const finalSourceRecordIds: Record<string, string[]> = {};
      for (const [k, set] of Object.entries(aggregatedSourceRecordIds)) {
        finalSourceRecordIds[k] = Array.from(set);
      }

      // STEP 9: Consolidate Results & Execute Post-Execution Hooks
      const synthesizedResult = {
        executiveSummary: `Completed ${taskClassification} across ${selectedSpecialistAgents.length} specialist agent(s) and Verifier AI Agent.`,
        taskClassification,
        selectedSpecialistAgents,
        specialistFindings: specialistOutputs,
        verifierAudit: verifierSkillResult.output,
        humanReviewRequired,
        nonFraudPolicy:
          'All anomaly and risk findings represent statistical or rule-based signals for human review, never determinations of confirmed fraud.',
        sourceRecordIds: finalSourceRecordIds,
      };

      const postHookResult = await this.hooks.runPostExecutionHooks({
        workflowRunId: workflowRun.id,
        organizationId: params.organizationId,
        synthesizedResult,
        verifierReport: {
          verificationStatus: finalVerificationStatus,
          arithmeticVerified: Boolean(verifierSkillResult.output.arithmeticVerified),
          citationsVerified: Boolean(verifierSkillResult.output.citationsVerified),
          nonFraudCompliance: Boolean(verifierSkillResult.output.nonFraudComplianceVerified),
        },
        sourceRecordIds: finalSourceRecordIds,
      });

      const totalTokens = modelUsageRecords.reduce((acc, u) => acc + u.totalTokens, 0);
      const totalEstimatedCostUsd = DecimalMath.sum(
        modelUsageRecords.map((u) => u.estimatedCostUsd),
      ).toFixed(6);

      const modelUsageSummary = {
        invocationsCount: modelUsageRecords.length,
        totalTokens,
        totalEstimatedCostUsd,
        records: modelUsageRecords,
      };

      // STEP 10: Persist Final Result, Supporting Evidence & Execution History
      const completedWorkflow = await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          status: ExecutionStatus.COMPLETED,
          verificationStatus: finalVerificationStatus,
          humanReviewRequired,
          duringHookLog: duringEvents as unknown as Prisma.InputJsonValue,
          postHookLog: postHookResult as unknown as Prisma.InputJsonValue,
          synthesizedResult: synthesizedResult as unknown as Prisma.InputJsonValue,
          verifierReport: verifierSkillResult.output as unknown as Prisma.InputJsonValue,
          sourceRecordIds: finalSourceRecordIds as unknown as Prisma.InputJsonValue,
          modelUsageSummary: modelUsageSummary as unknown as Prisma.InputJsonValue,
          durationMs: Date.now() - workflowStartMs,
          completedAt: new Date(),
        },
        include: {
          agentRuns: { orderBy: { startedAt: 'asc' } },
        },
      });

      await this.audit.record({
        organizationId: params.organizationId,
        actorUserId: params.userId,
        actorRole: params.userRole,
        action: 'AI_MULTI_AGENT_WORKFLOW_COMPLETED',
        resourceType: 'WORKFLOW_RUN',
        resourceId: completedWorkflow.id,
        status: 'SUCCESS',
        details: {
          taskClassification,
          selectedSpecialistAgents,
          verificationStatus: finalVerificationStatus,
          humanReviewRequired,
          totalTokens,
          durationMs: completedWorkflow.durationMs,
        },
      });

      return completedWorkflow;
    } catch (error) {
      await this.hooks.runErrorHooks({
        workflowRunId: workflowRun.id,
        organizationId: params.organizationId,
        actorUserId: params.userId,
        error,
        retryAttempts: 1,
      });
      throw error;
    }
  }

  async listWorkflowRuns(organizationId: string) {
    return this.prisma.workflowRun.findMany({
      where: { organizationId },
      include: {
        agentRuns: { orderBy: { startedAt: 'asc' } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getWorkflowRunById(organizationId: string, workflowRunId: string) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: workflowRunId, organizationId },
      include: {
        agentRuns: { orderBy: { startedAt: 'asc' } },
      },
    });
    if (!run) {
      throw new NotFoundException('Workflow run not found in organization');
    }
    return run;
  }

  /**
   * Orchestrates secure file schema profiling and automatic column mapping
   * using Finance Data Analyst Agent and Verifier AI Agent within isolated sandboxes.
   */
  async orchestrateFileSchemaMapping(params: {
    organizationId: string;
    userId: string;
    userRole: RoleType;
    isPlatformAdmin: boolean;
    fileName: string;
    headers: string[];
    sampleRows: unknown[];
  }) {
    const workflowStartMs = Date.now();

    const workflowRun = await this.prisma.workflowRun.create({
      data: {
        organizationId: params.organizationId,
        requestedByUserId: params.userId,
        prompt: `File schema profiling and auto-mapping for ${params.fileName} (${params.headers.length} headers)`,
        taskClassification: 'FILE_SCHEMA_PROFILING_AND_COLUMN_MAPPING',
        selectedAgents: [
          AgentType.SUPERVISOR_ORCHESTRATOR,
          AgentType.FINANCE_DATA_ANALYST,
          AgentType.VERIFIER_AI,
        ] as unknown as Prisma.InputJsonValue,
        executionMode: 'SPECIALIST_ANALYST_THEN_SEQUENTIAL_VERIFIER',
        status: ExecutionStatus.RUNNING,
        verificationStatus: VerificationStatus.PENDING,
      },
    });

    try {
      // 1. Finance Data Analyst Sandbox & Skill Execution
      const analystStartMs = Date.now();
      const analystSandbox = this.sandbox.createSandboxContext({
        workflowRunId: workflowRun.id,
        organizationId: params.organizationId,
        actorUserId: params.userId,
        actorRole: params.userRole,
        agentType: AgentType.FINANCE_DATA_ANALYST,
      });

      const analystRunRecord = await this.prisma.agentRun.create({
        data: {
          workflowRunId: workflowRun.id,
          organizationId: params.organizationId,
          agentType: AgentType.FINANCE_DATA_ANALYST,
          sandboxId: analystSandbox.sandboxId,
          loadedSkills: [
            'skill.file-schema-profiling-and-column-mapping',
          ] as unknown as Prisma.InputJsonValue,
          allowedTools: analystSandbox.allowedTools as unknown as Prisma.InputJsonValue,
          invokedTools: [] as unknown as Prisma.InputJsonValue,
          status: ExecutionStatus.RUNNING,
          inputContext: {
            fileName: params.fileName,
            headerCount: params.headers.length,
            sampleRowsCount: params.sampleRows.length,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      let analystSkillResult;
      try {
        analystSkillResult = await this.skillsRegistry.executeSkill(
          'skill.file-schema-profiling-and-column-mapping',
          {
            organizationId: params.organizationId,
            fileName: params.fileName,
            headers: params.headers,
            sampleRows: params.sampleRows,
          },
          analystSandbox,
        );

        await this.prisma.agentRun.update({
          where: { id: analystRunRecord.id },
          data: {
            status: ExecutionStatus.COMPLETED,
            invokedTools: analystSandbox.invokedTools as unknown as Prisma.InputJsonValue,
            mcpToolCalls: analystSkillResult.invokedMcpTools as unknown as Prisma.InputJsonValue,
            blockedOperations:
              analystSandbox.blockedOperations as unknown as Prisma.InputJsonValue,
            modelUsage: analystSkillResult.modelUsage as unknown as Prisma.InputJsonValue,
            outputPayload: analystSkillResult.output as unknown as Prisma.InputJsonValue,
            durationMs: Date.now() - analystStartMs,
            completedAt: new Date(),
          },
        });
      } finally {
        this.sandbox.releaseSandbox(analystSandbox.sandboxId);
      }

      // 2. Verifier AI Sandbox & Verification Skill Execution
      const verifierStartMs = Date.now();
      const verifierSandbox = this.sandbox.createSandboxContext({
        workflowRunId: workflowRun.id,
        organizationId: params.organizationId,
        actorUserId: params.userId,
        actorRole: params.userRole,
        agentType: AgentType.VERIFIER_AI,
      });

      const verifierRunRecord = await this.prisma.agentRun.create({
        data: {
          workflowRunId: workflowRun.id,
          organizationId: params.organizationId,
          agentType: AgentType.VERIFIER_AI,
          sandboxId: verifierSandbox.sandboxId,
          loadedSkills: [
            'skill.column-mapping-verification',
          ] as unknown as Prisma.InputJsonValue,
          allowedTools: verifierSandbox.allowedTools as unknown as Prisma.InputJsonValue,
          invokedTools: [] as unknown as Prisma.InputJsonValue,
          status: ExecutionStatus.RUNNING,
          inputContext: {
            detectedMappings: analystSkillResult.output.detectedMappings,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      let verifierSkillResult;
      try {
        verifierSkillResult = await this.skillsRegistry.executeSkill(
          'skill.column-mapping-verification',
          {
            organizationId: params.organizationId,
            detectedMappings: analystSkillResult.output.detectedMappings,
            confidenceScores: analystSkillResult.output.confidenceScores,
            headers: params.headers,
            sampleRows: params.sampleRows,
          },
          verifierSandbox,
        );

        await this.prisma.agentRun.update({
          where: { id: verifierRunRecord.id },
          data: {
            status: ExecutionStatus.COMPLETED,
            invokedTools: verifierSandbox.invokedTools as unknown as Prisma.InputJsonValue,
            mcpToolCalls: verifierSkillResult.invokedMcpTools as unknown as Prisma.InputJsonValue,
            blockedOperations:
              verifierSandbox.blockedOperations as unknown as Prisma.InputJsonValue,
            modelUsage: verifierSkillResult.modelUsage as unknown as Prisma.InputJsonValue,
            outputPayload: verifierSkillResult.output as unknown as Prisma.InputJsonValue,
            durationMs: Date.now() - verifierStartMs,
            completedAt: new Date(),
          },
        });
      } finally {
        this.sandbox.releaseSandbox(verifierSandbox.sandboxId);
      }

      const isApproved = Boolean(verifierSkillResult.output.isApproved);

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          status: ExecutionStatus.COMPLETED,
          verificationStatus: isApproved
            ? VerificationStatus.APPROVED
            : VerificationStatus.REQUIRES_HUMAN_REVIEW,
          durationMs: Date.now() - workflowStartMs,
          completedAt: new Date(),
        },
      });

      await this.audit.record({
        organizationId: params.organizationId,
        actorUserId: params.userId,
        actorRole: params.userRole,
        action: 'AI_ORCHESTRATION:FILE_SCHEMA_PROFILED_AND_VERIFIED',
        resourceType: 'WORKFLOW_RUN',
        resourceId: workflowRun.id,
        status: isApproved ? 'SUCCESS' : 'ERROR',
        details: {
          fileName: params.fileName,
          isApproved,
          confidenceScore: verifierSkillResult.output.confidenceScore,
        },
      });

      return {
        workflowRunId: workflowRun.id,
        taskClassification: 'FILE_SCHEMA_PROFILING_AND_COLUMN_MAPPING',
        analystResult: analystSkillResult.output,
        verifierResult: verifierSkillResult.output,
        durationMs: Date.now() - workflowStartMs,
      };
    } catch (err: unknown) {
      await this.recordWorkflowFailure(workflowRun.id, workflowStartMs, err);
      throw err;
    }
  }

  /**
   * Orchestrates Finance Data Analyst & Verifier AI agents in isolated sandboxes
   * to extract and verify structured Invoice or Supplier Bill fields from PDF/image documents.
   */
  async orchestrateDocumentExtraction(params: {
    organizationId: string;
    userId: string;
    userRole: RoleType;
    documentType: DocumentTargetType;
    fileName: string;
    defaultCurrency: string;
    sanitizedText: string;
    sanitizationFlags: string[];
    attachments?: AiMediaAttachment[];
  }) {
    const workflowStartMs = Date.now();
    const taskClassification =
      params.documentType === 'INVOICE'
        ? 'CUSTOMER_INVOICE_DOCUMENT_EXTRACTION'
        : 'SUPPLIER_BILL_DOCUMENT_EXTRACTION';

    const workflowRun = await this.prisma.workflowRun.create({
      data: {
        organizationId: params.organizationId,
        requestedByUserId: params.userId,
        prompt: `Extract and verify ${params.documentType} fields from uploaded document "${params.fileName}"`,
        taskClassification,
        selectedAgents: [
          AgentType.SUPERVISOR_ORCHESTRATOR,
          AgentType.FINANCE_DATA_ANALYST,
          AgentType.VERIFIER_AI,
        ] as unknown as Prisma.InputJsonValue,
        executionMode: 'SPECIALIST_ANALYST_THEN_SEQUENTIAL_VERIFIER',
        status: ExecutionStatus.RUNNING,
        verificationStatus: VerificationStatus.PENDING,
      },
    });

    try {
      // 1. Finance Data Analyst extraction
      const analystSkillResult = await this.executeSandboxedSkill({
        workflowRunId: workflowRun.id,
        organizationId: params.organizationId,
        userId: params.userId,
        userRole: params.userRole,
        agentType: AgentType.FINANCE_DATA_ANALYST,
        skillId: 'skill.document-invoice-bill-extraction',
        inputContext: {
          fileName: params.fileName,
          documentType: params.documentType,
          textLength: params.sanitizedText.length,
          attachmentCount: params.attachments?.length ?? 0,
        },
        skillInput: {
          organizationId: params.organizationId,
          fileName: params.fileName,
          documentType: params.documentType,
          defaultCurrency: params.defaultCurrency,
          sanitizedText: params.sanitizedText,
          sanitizationFlags: params.sanitizationFlags,
          attachments: params.attachments,
        },
      });

      const extractedDoc = (analystSkillResult.output.extractedDocument ?? {}) as Record<
        string,
        unknown
      >;
      const combinedParsedDoc = {
        ...extractedDoc,
        documentType: params.documentType,
        lineItems: analystSkillResult.output.lineItems ?? [],
        fieldConfidence: analystSkillResult.output.fieldConfidence ?? {},
        extractionNotes: analystSkillResult.output.extractionNotes ?? [],
        sanitizationFlags: analystSkillResult.output.sanitizationFlags ?? params.sanitizationFlags,
      };

      // 2. Verifier AI arithmetic, date & completeness audit
      const verifierSkillResult = await this.executeSandboxedSkill({
        workflowRunId: workflowRun.id,
        organizationId: params.organizationId,
        userId: params.userId,
        userRole: params.userRole,
        agentType: AgentType.VERIFIER_AI,
        skillId: 'skill.document-extraction-verification',
        inputContext: {
          documentType: params.documentType,
          documentNumber: extractedDoc.documentNumber ?? null,
          totalAmount: extractedDoc.totalAmount ?? null,
        },
        skillInput: {
          organizationId: params.organizationId,
          parsedDocument: combinedParsedDoc,
        },
      });

      const isApproved = Boolean(verifierSkillResult.output.isApproved);
      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          status: ExecutionStatus.COMPLETED,
          verificationStatus: isApproved
            ? VerificationStatus.APPROVED
            : VerificationStatus.REQUIRES_HUMAN_REVIEW,
          durationMs: Date.now() - workflowStartMs,
          completedAt: new Date(),
        },
      });

      await this.audit.record({
        organizationId: params.organizationId,
        actorUserId: params.userId,
        actorRole: params.userRole,
        action: 'AI_ORCHESTRATION:DOCUMENT_EXTRACTED_AND_VERIFIED',
        resourceType: 'WORKFLOW_RUN',
        resourceId: workflowRun.id,
        status: 'SUCCESS',
        details: {
          fileName: params.fileName,
          documentType: params.documentType,
          isApproved,
          confidenceScore: verifierSkillResult.output.confidenceScore,
        },
      });

      return {
        workflowRunId: workflowRun.id,
        taskClassification,
        analystResult: analystSkillResult.output,
        verifierResult: verifierSkillResult.output,
        durationMs: Date.now() - workflowStartMs,
      };
    } catch (err: unknown) {
      await this.recordWorkflowFailure(workflowRun.id, workflowStartMs, err);
      throw err;
    }
  }

  private async executeSandboxedSkill(params: {
    workflowRunId: string;
    organizationId: string;
    userId: string;
    userRole: RoleType;
    agentType: AgentType;
    skillId: string;
    inputContext: Record<string, unknown>;
    skillInput: Record<string, unknown>;
  }) {
    const startMs = Date.now();
    const sandboxCtx = this.sandbox.createSandboxContext({
      workflowRunId: params.workflowRunId,
      organizationId: params.organizationId,
      actorUserId: params.userId,
      actorRole: params.userRole,
      agentType: params.agentType,
    });

    const runRecord = await this.prisma.agentRun.create({
      data: {
        workflowRunId: params.workflowRunId,
        organizationId: params.organizationId,
        agentType: params.agentType,
        sandboxId: sandboxCtx.sandboxId,
        loadedSkills: [params.skillId] as unknown as Prisma.InputJsonValue,
        allowedTools: sandboxCtx.allowedTools as unknown as Prisma.InputJsonValue,
        invokedTools: [] as unknown as Prisma.InputJsonValue,
        status: ExecutionStatus.RUNNING,
        inputContext: params.inputContext as unknown as Prisma.InputJsonValue,
      },
    });

    try {
      const skillResult = await this.skillsRegistry.executeSkill(
        params.skillId,
        params.skillInput,
        sandboxCtx,
      );

      await this.prisma.agentRun.update({
        where: { id: runRecord.id },
        data: {
          status: ExecutionStatus.COMPLETED,
          invokedTools: sandboxCtx.invokedTools as unknown as Prisma.InputJsonValue,
          mcpToolCalls: skillResult.invokedMcpTools as unknown as Prisma.InputJsonValue,
          blockedOperations: sandboxCtx.blockedOperations as unknown as Prisma.InputJsonValue,
          modelUsage: skillResult.modelUsage as unknown as Prisma.InputJsonValue,
          outputPayload: skillResult.output as unknown as Prisma.InputJsonValue,
          durationMs: Date.now() - startMs,
          completedAt: new Date(),
        },
      });

      return skillResult;
    } finally {
      this.sandbox.releaseSandbox(sandboxCtx.sandboxId);
    }
  }

  private async recordWorkflowFailure(workflowRunId: string, startMs: number, err: unknown) {
    try {
      await this.prisma.workflowRun.update({
        where: { id: workflowRunId },
        data: {
          status: ExecutionStatus.FAILED,
          verificationStatus: VerificationStatus.REJECTED,
          durationMs: Date.now() - startMs,
          errorHookLog: {
            errorMessage: err instanceof Error ? err.message : String(err),
            errorStack: err instanceof Error ? err.stack : undefined,
            failedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
    } catch (dbError: unknown) {
      // Prevent secondary Prisma error from hiding the original exception
      console.error(
        'Failed to record workflow failure status in database:',
        dbError instanceof Error ? dbError.message : String(dbError),
      );
    }
  }
}
