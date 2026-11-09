import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentType } from '../../../generated/prisma/client.js';
import { DecimalMath } from '../../../common/utils/decimal-math.js';
import { SecurityUtil } from '../../../common/utils/security.util.js';

export type SupportedAiProvider = 'openai' | 'gemini' | 'anthropic' | 'deterministic-grounded';

export interface AiModelTaskRequest {
  organizationId: string;
  agentType: AgentType;
  skillId: string;
  systemInstructions: string;
  userPrompt: string;
  deterministicEvidence: Record<string, unknown>;
  requiredOutputKeys: string[];
  deterministicSynthesisBuilder: () => Record<string, unknown>;
}

export interface AiModelUsageMetrics {
  provider: SupportedAiProvider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: string;
  latencyMs: number;
  status: 'SUCCESS' | 'FALLBACK_USED' | 'ERROR';
  attempts: number;
  timestamp: string;
}

export interface AiModelTaskResponse {
  structuredOutput: Record<string, unknown>;
  usage: AiModelUsageMetrics;
}

/**
 * Centralized AI Model Provider & Integration Service (Section 22)
 *
 * Manages provider selection, environment-based API credentials, per-agent model
 * configuration, structured JSON validation, timeouts, bounded retries, rate limiting,
 * and token/cost telemetry while strictly preserving deterministic backend arithmetic.
 */
@Injectable()
export class AiModelProviderService {
  private readonly logger = new Logger(AiModelProviderService.name);
  private readonly rateBuckets = new Map<string, { count: number; resetAt: number }>();
  private readonly usageLogs: Array<
    AiModelUsageMetrics & { organizationId: string; agentType: AgentType }
  > = [];

  constructor(private readonly config: ConfigService) {}

  getProviderConfigurationSummary() {
    const provider = this.resolveProvider();
    const apiKeyPresent = Boolean(this.getApiKey(provider));
    return {
      activeProvider: provider,
      externalCredentialsConfigured: apiKeyPresent,
      secretsExposed: false,
      timeoutMs: Number(this.config.get<string>('AI_TIMEOUT_MS') ?? 10_000),
      maxRetries: Number(this.config.get<string>('AI_MAX_RETRIES') ?? 2),
      rateLimitPerMinute: Number(this.config.get<string>('AI_RATE_LIMIT_PER_MIN') ?? 60),
      modelMapping: {
        [AgentType.SUPERVISOR_ORCHESTRATOR]: this.getModelForAgent(
          AgentType.SUPERVISOR_ORCHESTRATOR,
        ),
        [AgentType.FINANCE_DATA_ANALYST]: this.getModelForAgent(AgentType.FINANCE_DATA_ANALYST),
        [AgentType.CASH_FLOW_FORECASTING]: this.getModelForAgent(AgentType.CASH_FLOW_FORECASTING),
        [AgentType.EXPENSE_ANOMALY_DETECTION]: this.getModelForAgent(
          AgentType.EXPENSE_ANOMALY_DETECTION,
        ),
        [AgentType.FINANCIAL_RISK_ASSESSMENT]: this.getModelForAgent(
          AgentType.FINANCIAL_RISK_ASSESSMENT,
        ),
        [AgentType.SCENARIO_PLANNING]: this.getModelForAgent(AgentType.SCENARIO_PLANNING),
        [AgentType.STRATEGIC_RECOMMENDATION]: this.getModelForAgent(
          AgentType.STRATEGIC_RECOMMENDATION,
        ),
        [AgentType.FINANCIAL_REPORTING]: this.getModelForAgent(AgentType.FINANCIAL_REPORTING),
        [AgentType.VERIFIER_AI]: this.getModelForAgent(AgentType.VERIFIER_AI),
      },
    };
  }

  getModelForAgent(agentType: AgentType): string {
    const provider = this.resolveProvider();
    if (agentType === AgentType.SUPERVISOR_ORCHESTRATOR) {
      return (
        this.config.get<string>('AI_MODEL_SUPERVISOR') ??
        this.defaultModelForProvider(provider, 'reasoning')
      );
    }
    if (agentType === AgentType.VERIFIER_AI) {
      return (
        this.config.get<string>('AI_MODEL_VERIFIER') ??
        this.defaultModelForProvider(provider, 'verifier')
      );
    }
    return (
      this.config.get<string>('AI_MODEL_SPECIALIST') ??
      this.defaultModelForProvider(provider, 'specialist')
    );
  }

  async executeStructuredTask(request: AiModelTaskRequest): Promise<AiModelTaskResponse> {
    this.enforceRateLimit(request.organizationId);

    const startTime = Date.now();
    const provider = this.resolveProvider();
    const model = this.getModelForAgent(request.agentType);
    const apiKey = this.getApiKey(provider);
    const maxRetries = Math.max(0, Number(this.config.get<string>('AI_MAX_RETRIES') ?? 2));
    const timeoutMs = Math.max(500, Number(this.config.get<string>('AI_TIMEOUT_MS') ?? 10_000));

    // Sanitize user prompt before sending to any model
    const sanitizedPrompt = SecurityUtil.sanitizeImportedText(request.userPrompt).sanitized;

    let attempts = 0;
    let structuredOutput: Record<string, unknown> | null = null;
    let status: AiModelUsageMetrics['status'] = 'SUCCESS';

    if (provider !== 'deterministic-grounded' && apiKey) {
      while (attempts <= maxRetries) {
        attempts += 1;
        try {
          structuredOutput = await this.callExternalProviderWithTimeout({
            provider,
            apiKey,
            model,
            timeoutMs,
            systemInstructions: request.systemInstructions,
            userPrompt: sanitizedPrompt,
            deterministicEvidence: request.deterministicEvidence,
          });
          this.validateStructuredOutput(structuredOutput, request.requiredOutputKeys);
          break;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`External AI provider call attempt ${attempts} failed: ${errMsg}`);
          if (attempts > maxRetries) {
            this.logger.warn(
              `External AI provider (${provider}/${model}) failed after ${attempts} attempt(s); activating grounded deterministic synthesis fallback.`,
            );
            structuredOutput = null;
            status = 'FALLBACK_USED';
          } else {
            // Exponential backoff to handle temporary provider demand spikes (e.g. HTTP 503)
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
          }
        }
      }
    } else {
      attempts = 1;
      status = provider === 'deterministic-grounded' ? 'SUCCESS' : 'FALLBACK_USED';
    }

    if (!structuredOutput) {
      structuredOutput = request.deterministicSynthesisBuilder();
    }

    // Validate structured output against required schema keys
    this.validateStructuredOutput(structuredOutput, request.requiredOutputKeys);

    const promptChars =
      request.systemInstructions.length +
      sanitizedPrompt.length +
      JSON.stringify(request.deterministicEvidence).length;
    const completionChars = JSON.stringify(structuredOutput).length;
    const promptTokens = Math.max(10, Math.ceil(promptChars / 4));
    const completionTokens = Math.max(10, Math.ceil(completionChars / 4));
    const totalTokens = promptTokens + completionTokens;

    // Estimate cost in USD using DecimalMath ($0.0025 per 1k tokens baseline)
    const estimatedCost = DecimalMath.of(totalTokens).mul('0.0000025').toFixed(6);

    const usage: AiModelUsageMetrics = {
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: estimatedCost,
      latencyMs: Math.max(1, Date.now() - startTime),
      status,
      attempts,
      timestamp: new Date().toISOString(),
    };

    this.usageLogs.push({
      ...usage,
      organizationId: request.organizationId,
      agentType: request.agentType,
    });

    return {
      structuredOutput,
      usage,
    };
  }

  validateStructuredOutput(
    output: unknown,
    requiredKeys: string[],
  ): asserts output is Record<string, unknown> {
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      throw new BadRequestException('AI model response must be a valid JSON object');
    }
    const obj = output as Record<string, unknown>;
    for (const key of requiredKeys) {
      if (!(key in obj) || obj[key] === undefined) {
        throw new BadRequestException(
          `AI model structured output validation failed: missing required field "${key}"`,
        );
      }
    }
  }

  getOrganizationUsageSummary(organizationId: string) {
    const orgLogs = this.usageLogs.filter((l) => l.organizationId === organizationId);
    const totalTokens = orgLogs.reduce((acc, l) => acc + l.totalTokens, 0);
    const totalCost = DecimalMath.sum(orgLogs.map((l) => l.estimatedCostUsd));
    return {
      organizationId,
      totalInvocations: orgLogs.length,
      totalTokens,
      totalEstimatedCostUsd: totalCost.toFixed(6),
      recentInvocations: orgLogs.slice(-25).reverse(),
    };
  }

  private resolveProvider(): SupportedAiProvider {
    const raw = (this.config.get<string>('AI_PROVIDER') ?? 'deterministic-grounded').toLowerCase();
    if (raw === 'openai' || raw === 'gemini' || raw === 'anthropic') {
      return raw;
    }
    return 'deterministic-grounded';
  }

  private getApiKey(provider: SupportedAiProvider): string | null {
    if (provider === 'openai') {
      return (
        this.config.get<string>('AI_OPENAI_API_KEY') ??
        this.config.get<string>('AI_API_KEY') ??
        null
      );
    }
    if (provider === 'gemini') {
      return (
        this.config.get<string>('AI_GEMINI_API_KEY') ??
        this.config.get<string>('AI_API_KEY') ??
        null
      );
    }
    if (provider === 'anthropic') {
      return (
        this.config.get<string>('AI_ANTHROPIC_API_KEY') ??
        this.config.get<string>('AI_API_KEY') ??
        null
      );
    }
    return null;
  }

  private defaultModelForProvider(
    provider: SupportedAiProvider,
    tier: 'reasoning' | 'specialist' | 'verifier',
  ): string {
    if (provider === 'openai') {
      return tier === 'specialist' ? 'gpt-4o-mini' : 'gpt-4o';
    }
    if (provider === 'gemini') {
      return 'gemini-3.8-flash';
    }
    if (provider === 'anthropic') {
      return 'claude-sonnet-4-20250514';
    }
    return `sme-grounded-${tier}-v1`;
  }

  private async callExternalProviderWithTimeout(params: {
    provider: SupportedAiProvider;
    apiKey: string;
    model: string;
    timeoutMs: number;
    systemInstructions: string;
    userPrompt: string;
    deterministicEvidence: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const baseUrl =
        this.config.get<string>('AI_BASE_URL') ?? 'https://api.openai.com/v1/chat/completions';

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.apiKey}`,
        },
        body: JSON.stringify({
          model: params.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: params.systemInstructions },
            {
              role: 'user',
              content: JSON.stringify({
                prompt: params.userPrompt,
                authoritativeDeterministicEvidence: params.deterministicEvidence,
              }),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Provider HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawText = payload.choices?.[0]?.message?.content ?? '{}';
      return JSON.parse(rawText) as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  }

  private enforceRateLimit(organizationId: string): void {
    const maxPerMinute = Math.max(
      1,
      Number(this.config.get<string>('AI_RATE_LIMIT_PER_MIN') ?? 60),
    );
    const now = Date.now();
    const bucket = this.rateBuckets.get(organizationId);
    if (!bucket || bucket.resetAt <= now) {
      this.rateBuckets.set(organizationId, { count: 1, resetAt: now + 60_000 });
      return;
    }
    if (bucket.count >= maxPerMinute) {
      throw new HttpException(
        `AI Model Provider rate limit exceeded (${maxPerMinute} requests/min)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    bucket.count += 1;
  }
}
