import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentType } from '../../../generated/prisma/client.js';
import { AuditService } from '../../audit/audit.service.js';
import { SandboxContext } from '../sandbox/agent-sandbox.service.js';
import { ToolRegistryService } from './tool-registry.service.js';

export interface McpServerConnection {
  serverId: string;
  name: string;
  transport: 'INTERNAL_IN_PROCESS' | 'HTTP_JSON_RPC';
  endpointUrl: string | null;
  status: 'CONNECTED' | 'UNAVAILABLE' | 'DEGRADED';
  approved: boolean;
  lastCheckedAt: string;
  capabilities: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
  };
}

export interface McpToolCallRecord {
  serverId: string;
  toolName: string;
  agentType: AgentType;
  organizationId: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'TIMEOUT';
  durationMs: number;
  timestamp: string;
  errorMessage?: string;
}

/**
 * MCP (Model Context Protocol) Client & Integration Service (Section 20)
 *
 * Manages MCP server connections, tool discovery, approved tool invocation,
 * external MCP response validation, timeout/failure handling, and audit logging.
 */
@Injectable()
export class McpIntegrationService {
  private readonly servers = new Map<string, McpServerConnection>();
  private readonly callHistory: McpToolCallRecord[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly audit: AuditService,
  ) {
    this.initializeServers();
  }

  private initializeServers(): void {
    // Primary built-in MCP server providing controlled access to approved financial domain tools
    this.servers.set('sme-financial-mcp-core', {
      serverId: 'sme-financial-mcp-core',
      name: 'SME Financial Intelligence Core MCP Server',
      transport: 'INTERNAL_IN_PROCESS',
      endpointUrl: null,
      status: 'CONNECTED',
      approved: true,
      lastCheckedAt: new Date().toISOString(),
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
      },
    });

    // Optional external MCP server from environment configuration
    const externalUrl = this.config.get<string>('MCP_EXTERNAL_SERVER_URL');
    if (externalUrl) {
      this.servers.set('external-approved-mcp', {
        serverId: 'external-approved-mcp',
        name: 'External Approved Financial Context MCP Server',
        transport: 'HTTP_JSON_RPC',
        endpointUrl: externalUrl,
        status: 'CONNECTED',
        approved: true,
        lastCheckedAt: new Date().toISOString(),
        capabilities: {
          tools: true,
          resources: true,
          prompts: false,
        },
      });
    }
  }

  listServers(): McpServerConnection[] {
    return Array.from(this.servers.values());
  }

  async checkServerHealth(serverId: string): Promise<McpServerConnection> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new BadRequestException(`MCP server "${serverId}" is not registered`);
    }

    if (!server.approved) {
      throw new ForbiddenException(`MCP server "${serverId}" is not approved for platform use`);
    }

    if (server.transport === 'INTERNAL_IN_PROCESS') {
      server.status = 'CONNECTED';
      server.lastCheckedAt = new Date().toISOString();
      return { ...server };
    }

    if (server.endpointUrl) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(server.endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
          signal: controller.signal,
        });
        server.status = res.ok ? 'CONNECTED' : 'UNAVAILABLE';
      } catch {
        server.status = 'UNAVAILABLE';
      } finally {
        clearTimeout(timer);
      }
    }

    server.lastCheckedAt = new Date().toISOString();
    return { ...server };
  }

  discoverTools(agentType?: AgentType) {
    const tools = this.toolRegistry.listRegisteredTools(agentType);
    return {
      protocolVersion: '2025-03-26',
      connectedServers: this.listServers().filter((s) => s.status === 'CONNECTED'),
      tools,
    };
  }

  /**
   * Invokes an approved MCP tool through the Tool Registry & Sandbox.
   * Logs every call, result, failure, or blocked attempt.
   */
  async invokeTool(
    toolName: string,
    input: Record<string, unknown>,
    context: SandboxContext,
  ): Promise<{
    serverId: string;
    toolName: string;
    output: Record<string, unknown>;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const serverId = 'sme-financial-mcp-core';
    const server = this.servers.get(serverId);

    if (!server || !server.approved || server.status === 'UNAVAILABLE') {
      const record: McpToolCallRecord = {
        serverId,
        toolName,
        agentType: context.agentType,
        organizationId: context.organizationId,
        status: 'FAILED',
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        errorMessage: `MCP server "${serverId}" is unavailable`,
      };
      this.callHistory.push(record);

      throw new ServiceUnavailableException(`MCP server "${serverId}" is currently unavailable`);
    }

    try {
      const output = await this.toolRegistry.invokeRegisteredTool(toolName, input, context);
      const durationMs = Date.now() - startTime;

      const record: McpToolCallRecord = {
        serverId,
        toolName,
        agentType: context.agentType,
        organizationId: context.organizationId,
        status: 'SUCCESS',
        durationMs,
        timestamp: new Date().toISOString(),
      };
      this.callHistory.push(record);

      await this.audit.record({
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        actorRole: context.actorRole,
        action: `MCP_TOOL_INVOKED:${toolName}`,
        resourceType: 'MCP_TOOL',
        resourceId: toolName,
        status: 'SUCCESS',
        details: {
          workflowRunId: context.workflowRunId,
          sandboxId: context.sandboxId,
          agentType: context.agentType,
          serverId,
          durationMs,
        },
      });

      return {
        serverId,
        toolName,
        output,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : 'MCP tool execution failed';
      const isBlocked = error instanceof ForbiddenException;

      this.callHistory.push({
        serverId,
        toolName,
        agentType: context.agentType,
        organizationId: context.organizationId,
        status: isBlocked ? 'BLOCKED' : 'FAILED',
        durationMs,
        timestamp: new Date().toISOString(),
        errorMessage: errMsg,
      });

      throw error;
    }
  }

  /**
   * Validates any external MCP JSON-RPC response before using it in financial workflows.
   */
  validateExternalMcpResponse(responsePayload: unknown): Record<string, unknown> {
    if (!responsePayload || typeof responsePayload !== 'object') {
      throw new BadRequestException('External MCP response must be a non-null JSON object');
    }

    const body = responsePayload as Record<string, unknown>;
    if (body.error) {
      throw new ServiceUnavailableException(
        `External MCP server returned an error: ${JSON.stringify(body.error)}`,
      );
    }

    const result = body.result;
    if (!result || typeof result !== 'object') {
      throw new BadRequestException(
        'External MCP response is missing a structured "result" object',
      );
    }

    return result as Record<string, unknown>;
  }

  getRecentToolCalls(organizationId: string, limit = 50): McpToolCallRecord[] {
    return this.callHistory
      .filter((c) => c.organizationId === organizationId)
      .slice(-limit)
      .reverse();
  }

  setServerStatusForTesting(
    serverId: string,
    status: 'CONNECTED' | 'UNAVAILABLE' | 'DEGRADED',
  ): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.status = status;
    }
  }
}
