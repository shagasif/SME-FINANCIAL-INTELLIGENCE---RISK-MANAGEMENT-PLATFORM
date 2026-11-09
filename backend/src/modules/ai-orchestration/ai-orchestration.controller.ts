import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentType, RoleType } from '../../generated/prisma/client.js';
import {
  AuthenticatedPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import {
  ExecuteAgentSkillRequestDto,
  ExecuteAiWorkflowDto,
  InvokeMcpToolRequestDto,
} from './dto/ai-orchestration.dto.js';
import { McpIntegrationService } from './mcp/mcp-integration.service.js';
import { AiModelProviderService } from './model-provider/ai-model-provider.service.js';
import { AgentSandboxService } from './sandbox/agent-sandbox.service.js';
import { AgentSkillsRegistryService } from './skills/agent-skills-registry.service.js';
import { SupervisorOrchestratorService } from './supervisor-orchestrator.service.js';

@ApiTags('Multi-Agent Orchestrator, MCP, Agent Skills & AI Model Provider')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgRbacGuard, RateLimitGuard)
@Controller({ path: 'organizations/:orgId/ai', version: '1' })
export class AiOrchestrationController {
  constructor(
    private readonly supervisor: SupervisorOrchestratorService,
    private readonly mcp: McpIntegrationService,
    private readonly skillsRegistry: AgentSkillsRegistryService,
    private readonly modelProvider: AiModelProviderService,
    private readonly sandbox: AgentSandboxService,
  ) {}

  @Post('workflows/execute')
  @RateLimit({ windowMs: 60_000, maxRequests: 25 })
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({
    summary:
      'Execute a 10-step Multi-Agent AI workflow (Supervisor + Specialist Agents + Skills + MCP Tools + AI Model + Verifier + Hooks)',
  })
  async executeWorkflow(
    @Param('orgId') orgId: string,
    @Body() dto: ExecuteAiWorkflowDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.supervisor.executeWorkflow({
      organizationId: orgId,
      userId: user.userId,
      userRole: user.organizationRole ?? RoleType.FINANCIAL_ANALYST,
      isPlatformAdmin: user.isPlatformAdmin,
      dto,
    });
  }

  @Get('workflows')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({
    summary: 'List multi-agent workflow runs and specialist/verifier execution logs',
  })
  async listWorkflows(@Param('orgId') orgId: string) {
    return this.supervisor.listWorkflowRuns(orgId);
  }

  @Get('workflows/:workflowId')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({
    summary: 'Get workflow run details including hook logs, agent runs, and Verifier report',
  })
  async getWorkflow(@Param('orgId') orgId: string, @Param('workflowId') workflowId: string) {
    return this.supervisor.getWorkflowRunById(orgId, workflowId);
  }

  @Get('mcp/discovery')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({
    summary: 'Discover connected MCP servers and approved MCP tools mapped to specialist agents',
  })
  async discoverMcp(@Query('agentType') agentType?: AgentType) {
    return this.mcp.discoverTools(agentType);
  }

  @Post('mcp/invoke')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({
    summary: 'Invoke an approved MCP tool inside an isolated, permission-checked agent sandbox',
  })
  async invokeMcpTool(
    @Param('orgId') orgId: string,
    @Body() dto: InvokeMcpToolRequestDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const sandboxCtx = this.sandbox.createSandboxContext({
      workflowRunId: 'direct_mcp_invocation',
      organizationId: orgId,
      actorUserId: user.userId,
      actorRole: user.organizationRole ?? RoleType.FINANCIAL_ANALYST,
      agentType: dto.agentType,
    });

    try {
      const mergedInput = {
        organizationId: orgId,
        ...(dto.input ?? {}),
      };
      return await this.mcp.invokeTool(dto.toolName, mergedInput, sandboxCtx);
    } finally {
      this.sandbox.releaseSandbox(sandboxCtx.sandboxId);
    }
  }

  @Get('skills')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.ACCOUNTANT,
    RoleType.OPERATIONS_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({
    summary:
      'List registered reusable AI Agent Skills and their instructions, schemas, and permitted tools',
  })
  async listSkills(@Query('agentType') agentType?: AgentType) {
    return this.skillsRegistry.listSkills(agentType);
  }

  @Post('skills/execute')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.FINANCIAL_ANALYST,
  )
  @ApiOperation({
    summary: 'Execute a registered Agent Skill within the responsible agent sandbox',
  })
  async executeSkill(
    @Param('orgId') orgId: string,
    @Body() dto: ExecuteAgentSkillRequestDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const sandboxCtx = this.sandbox.createSandboxContext({
      workflowRunId: 'direct_skill_execution',
      organizationId: orgId,
      actorUserId: user.userId,
      actorRole: user.organizationRole ?? RoleType.FINANCIAL_ANALYST,
      agentType: dto.agentType,
    });

    try {
      return await this.skillsRegistry.executeSkill(
        dto.skillId,
        {
          organizationId: orgId,
          prompt: dto.prompt ?? 'Execute domain skill analysis.',
        },
        sandboxCtx,
      );
    } finally {
      this.sandbox.releaseSandbox(sandboxCtx.sandboxId);
    }
  }

  @Get('model-provider/status')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({
    summary:
      'Get AI Model Provider configuration summary (never exposes API keys) and organization token/cost telemetry',
  })
  async getModelProviderStatus(@Param('orgId') orgId: string) {
    return {
      configuration: this.modelProvider.getProviderConfigurationSummary(),
      usage: this.modelProvider.getOrganizationUsageSummary(orgId),
    };
  }

  @Get('sandbox/boundaries')
  @Roles(
    RoleType.PLATFORM_ADMIN,
    RoleType.BUSINESS_OWNER,
    RoleType.FINANCE_MANAGER,
    RoleType.FINANCIAL_ANALYST,
    RoleType.AUDITOR,
  )
  @ApiOperation({
    summary: 'Get documented AI Sandbox security boundaries and per-agent tool allowlists',
  })
  async getSandboxBoundaries() {
    return this.sandbox.getSecurityBoundaryDocumentation();
  }
}
