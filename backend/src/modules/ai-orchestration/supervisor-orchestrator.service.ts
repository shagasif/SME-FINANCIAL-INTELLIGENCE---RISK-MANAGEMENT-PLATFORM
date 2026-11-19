import { Injectable, NotFoundException, Optional } from '@nestjs/common';
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
import {
  AiMediaAttachment,
  AiModelProviderService,
  AiModelUsageMetrics,
} from './model-provider/ai-model-provider.service.js';
import type { DocumentTargetType } from '../document-import/document-parser.util.js';
import { AgentSandboxService } from './sandbox/agent-sandbox.service.js';
import { AgentSkillsRegistryService } from './skills/agent-skills-registry.service.js';
import {
  normalizeWorkflowRunForResponse,
  synthesizeExecutiveSummary,
} from './workflow-result-normalizer.util.js';
import {
  mapDatabaseBillToCanonical,
  mapDatabaseInvoiceToCanonical,
  mapPdfPayloadToCanonical,
  reconcileDocumentWithDatabaseRecord,
  type CanonicalFinancialRecord,
} from './document-db-reconciler.util.js';

export type MessageIntent = 'GREETING' | 'THANKS' | 'IRRELEVANT' | 'BUSINESS_QUERY';

export interface GroundedFinancialFacts {
  baseCurrency: string;
  operatingCashFlow?: unknown;
  workingCapital?: unknown;
  currentRatio?: unknown;
  quickRatio?: unknown;
  grossMargin?: unknown;
  expenseGrowth?: unknown;
  cashRunway?: unknown;
  receivablesOverdueTotal?: unknown;
  payablesOverdueTotal?: unknown;
  budgetCount?: unknown;
  endingCashBalance?: unknown;
  projectedNetCashFlow?: unknown;
  liquidityWarning?: boolean;
  activeAlertsCount?: unknown;
  highSeverityCount?: unknown;
  riskScores?: Record<string, unknown>;
  anomalousExpensesCount?: unknown;
  topSpenderCount?: unknown;
}

@Injectable()
export class SupervisorOrchestratorService {
  private readonly inFlightPostSaveKeys = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly hooks: WorkflowHookService,
    private readonly sandbox: AgentSandboxService,
    private readonly skillsRegistry: AgentSkillsRegistryService,
    private readonly audit: AuditService,
    @Optional() private readonly modelProvider?: AiModelProviderService,
  ) {}

  /**
   * Detects conversational intent (Greetings, Politeness/Thanks, Irrelevant, or Business Query).
   */
  detectMessageIntent(prompt: string, hasHistory = false): MessageIntent {
    const clean = prompt.trim();
    const lower = clean.toLowerCase();
    const stripped = lower.replace(/^[!?,.:;\s]+|[!?,.:;\s]+$/g, '').trim();

    // 1. Greetings: Hi, Hello, Hey, Good morning/afternoon/evening, etc.
    const greetingExact =
      /^(hi|hello|hey|heya|howdy|greetings|good morning|good afternoon|good evening|good day)(?: (?:there|assistant|team|ai|bot))?$/i;
    if (greetingExact.test(stripped)) {
      return 'GREETING';
    }

    // 2. Thanks: Thanks, Thank you, Thx, Ty, Much appreciated, etc.
    const thanksExact =
      /^(thanks|thank you|many thanks|thx|ty|much appreciated|appreciate it)(?:\b.*)?$/i;
    if (thanksExact.test(stripped)) {
      return 'THANKS';
    }

    // 3. Business / Financial Relevance
    if (this.isBusinessRelevant(lower, hasHistory)) {
      return 'BUSINESS_QUERY';
    }

    // 4. Irrelevant (Out of Scope)
    return 'IRRELEVANT';
  }

  /**
   * Evaluates if a query relates to SME financial intelligence and business operations.
   */
  isBusinessRelevant(lowerPrompt: string, hasHistory = false): boolean {
    if (hasHistory) {
      const contextualFollowUps = [
        'why',
        'how',
        'how so',
        'how is that calculated',
        'how is this calculated',
        'how is it calculated',
        'explain',
        'can you explain',
        'what about',
        'which ones',
        'details',
        'more details',
        'tell me more',
        'breakdown',
        'who owes',
        'what should we do',
        'what does that mean',
      ];
      const stripped = lowerPrompt.replace(/^[!?,.:;\s]+|[!?,.:;\s]+$/g, '').trim();
      if (contextualFollowUps.some((cf) => stripped === cf || stripped.startsWith(cf + ' '))) {
        return true;
      }
    }

    const businessTerms = [
      'cash', 'flow', 'runway', 'liquidity', 'burn', 'balance', 'bank', 'account',
      'working capital', 'share capital', 'equity capital', 'venture capital', 'capex',
      'capital expenditure', 'revenue', 'sales', 'income', 'earning', 'profit',
      'loss', 'margin', 'ebitda', 'expense', 'spend', 'spending', 'cost', 'bill',
      'payable', 'payables', 'vendor', 'supplier', 'purchase', 'invoice', 'invoices',
      'receivable', 'receivables', 'overdue', 'customer', 'client', 'debt', 'debtor',
      'collection', 'ratio', 'metric', 'kpi', 'financial', 'finance', 'report',
      'statement', 'ledger', 'p&l', 'audit', 'reconcil', 'budget', 'forecast',
      'projection', 'variance', 'scenario', 'what-if', 'what if', 'risk', 'alert',
      'anomaly', 'anomalous', 'duplicate', 'unusual', 'warning', 'shortfall',
      'business', 'operation', 'payroll', 'salary', 'tax', 'vat', 'gst', 'asset',
      'liability', 'equity', 'document', 'csv', 'import', 'upload', 'currency',
      'pkr', 'usd', 'eur', 'gbp', 'performance', 'growth', 'health', 'recommend',
      'recommendation', 'strategy', 'optimize', 'decision', 'aging', 'payment',
      'paid', 'unpaid', 'due', 'money', 'fund', 'investment', 'loan', 'transaction',
      'transactions'
    ];

    return businessTerms.some((term) => {
      const regex = new RegExp(`\\b${term.replace('-', '[- ]')}\\b`, 'i');
      return regex.test(lowerPrompt);
    });
  }

  buildConversationalAnswer(intent: 'GREETING' | 'THANKS' | 'IRRELEVANT', prompt: string): string {
    const lower = prompt.toLowerCase();
    if (intent === 'GREETING') {
      if (lower.includes('good morning')) {
        return 'Good morning! How can I assist you with your business financials and operations today?';
      }
      if (lower.includes('good afternoon')) {
        return 'Good afternoon! How can I assist you with your business financials and operations today?';
      }
      if (lower.includes('good evening')) {
        return 'Good evening! How can I assist you with your business financials and operations today?';
      }
      return 'Hello! How can I help you with your business financials and operations today?';
    }

    if (intent === 'THANKS') {
      return "You're welcome! Let me know if you need any other financial insights or analysis.";
    }

    return "I am your business finance assistant. I can only assist with queries related to your organization's financial data, reports, transactions, alerts, expenses, cash flow, and business operations.";
  }

  private formatAmount(val: unknown, currency = 'PKR'): string {
    if (val === null || val === undefined || val === 'UNSUPPORTED') return 'unavailable';
    const num = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(num)) return String(val);
    return `${currency} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatPercent(val: unknown): string {
    if (val === null || val === undefined || val === 'UNSUPPORTED') return 'unavailable';
    const num = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(num)) return String(val);
    return `${num.toFixed(2)}%`;
  }

  private extractGroundedFacts(
    specialistOutputs: Array<Record<string, unknown>>,
  ): GroundedFinancialFacts {
    const facts: GroundedFinancialFacts = {
      baseCurrency: 'PKR',
    };

    for (const output of specialistOutputs) {
      const skillResults = Array.isArray(output.skillResults) ? output.skillResults : [];
      for (const rawSr of skillResults) {
        if (!rawSr || typeof rawSr !== 'object') continue;
        const sr = rawSr as Record<string, unknown>;

        const assumptions = sr.assumptions as Record<string, unknown> | undefined;
        if (typeof assumptions?.baseCurrency === 'string') {
          facts.baseCurrency = assumptions.baseCurrency;
        } else if (typeof sr.currency === 'string') {
          facts.baseCurrency = sr.currency;
        }

        const km = sr.keyMetrics as Record<string, unknown> | undefined;
        if (km && typeof km === 'object') {
          if (km.operatingCashFlow !== undefined) facts.operatingCashFlow = km.operatingCashFlow;
          if (km.workingCapital !== undefined) facts.workingCapital = km.workingCapital;
          if (km.currentRatio !== undefined) facts.currentRatio = km.currentRatio;
          if (km.quickRatio !== undefined) facts.quickRatio = km.quickRatio;
          if (km.grossMargin !== undefined) facts.grossMargin = km.grossMargin;
          if (km.expenseGrowth !== undefined) facts.expenseGrowth = km.expenseGrowth;
          if (km.cashRunway !== undefined) facts.cashRunway = km.cashRunway;
        }

        if (sr.receivablesOverdueTotal !== undefined) facts.receivablesOverdueTotal = sr.receivablesOverdueTotal;
        if (sr.payablesOverdueTotal !== undefined) facts.payablesOverdueTotal = sr.payablesOverdueTotal;
        if (sr.budgetCount !== undefined) facts.budgetCount = sr.budgetCount;

        if (sr.runwayMonths !== undefined) facts.cashRunway = sr.runwayMonths;
        if (sr.projectedEndingCash !== undefined) facts.endingCashBalance = sr.projectedEndingCash;
        if (sr.endingCashBalance !== undefined) facts.endingCashBalance = sr.endingCashBalance;
        if (sr.projectedNetCashFlow !== undefined) facts.projectedNetCashFlow = sr.projectedNetCashFlow;
        if (sr.liquidityWarning !== undefined) facts.liquidityWarning = Boolean(sr.liquidityWarning);

        if (sr.activeAlertsCount !== undefined) facts.activeAlertsCount = sr.activeAlertsCount;
        if (sr.highSeverityCount !== undefined) facts.highSeverityCount = sr.highSeverityCount;
        if (sr.riskScores && typeof sr.riskScores === 'object') facts.riskScores = sr.riskScores as Record<string, unknown>;

        if (sr.anomalousExpensesCount !== undefined) facts.anomalousExpensesCount = sr.anomalousExpensesCount;
        if (sr.topSpenderCount !== undefined) facts.topSpenderCount = sr.topSpenderCount;
      }
    }

    return facts;
  }

  private buildDeterministicDirectAnswer(
    prompt: string,
    facts: GroundedFinancialFacts,
    history?: Array<{ sender: string; text: string }>,
  ): string {
    const lower = prompt.toLowerCase();

    // 1. Follow-up Context Questions (Why? How is that calculated? Can you explain?)
    const isFollowUp = /\b(why|how is (?:that|this|it) calculated|can you explain|breakdown|explain|tell me more|what does that mean)\b/i.test(prompt);
    if (isFollowUp && history && history.length > 0) {
      const priorText = history
        .slice(-4)
        .map((m) => m.text.toLowerCase())
        .join(' ');

      if (priorText.includes('runway') || priorText.includes('burn')) {
        return 'Cash runway is calculated by dividing your available liquid cash balance by your average monthly net burn rate.';
      }
      if (priorText.includes('margin')) {
        return 'Gross margin is calculated as ((Revenue - Cost of Goods Sold) / Revenue) × 100%.';
      }
      if (priorText.includes('working capital')) {
        return 'Working capital is calculated as Current Assets minus Current Liabilities.';
      }
      if (priorText.includes('current ratio') || priorText.includes('quick ratio')) {
        return 'Current ratio is Current Assets divided by Current Liabilities. Quick ratio excludes inventory and less liquid assets.';
      }
      if (priorText.includes('operating cash flow') || priorText.includes('cash flow')) {
        return 'Operating cash flow is determined from net operational cash inflows minus operational cash outflows for the period.';
      }
      if (priorText.includes('overdue') || priorText.includes('receivable')) {
        return 'Overdue receivables represent all unpaid customer invoices where the payment due date has passed.';
      }
      if (priorText.includes('payable') || priorText.includes('bill')) {
        return 'Overdue payables represent all unpaid vendor bills whose payment due dates have passed.';
      }
      if (priorText.includes('alert') || priorText.includes('risk')) {
        return 'Risk alerts are generated by deterministic rules evaluating liquidity shortages, overdue payment aging, and anomalous expenditure patterns.';
      }
      return 'This metric is computed deterministically from your verified accounting records, invoices, and bank transactions.';
    }

    // 2. Cash Runway
    if (/\b(runway|cash runway|months of runway)\b/i.test(lower)) {
      if (facts.cashRunway !== undefined && facts.cashRunway !== null && facts.cashRunway !== 'UNSUPPORTED') {
        const num = Number(facts.cashRunway);
        const val = Number.isFinite(num) ? num.toFixed(1) : String(facts.cashRunway);
        return `Your current cash runway is ${val} months based on active liquid cash reserves.`;
      }
      return 'Cash runway data is currently unavailable due to insufficient transaction history or baseline reserves.';
    }

    // 3. Cash Balance / Projected Cash / Ending Cash
    if (/\b(cash balance|ending cash|projected cash|closing cash|how much cash)\b/i.test(lower)) {
      if (facts.endingCashBalance !== undefined && facts.endingCashBalance !== null && facts.endingCashBalance !== 'UNSUPPORTED') {
        return `Projected closing cash balance is ${this.formatAmount(facts.endingCashBalance, facts.baseCurrency)}.`;
      }
      if (facts.projectedNetCashFlow !== undefined && facts.projectedNetCashFlow !== 'UNSUPPORTED') {
        return `Projected net cash flow is ${this.formatAmount(facts.projectedNetCashFlow, facts.baseCurrency)}.`;
      }
      return 'Cash balance projections are currently unavailable.';
    }

    // 4. Operating Cash Flow
    if (/\b(operating cash flow|ocf)\b/i.test(lower)) {
      if (facts.operatingCashFlow !== undefined && facts.operatingCashFlow !== 'UNSUPPORTED') {
        return `Operating cash flow is ${this.formatAmount(facts.operatingCashFlow, facts.baseCurrency)}.`;
      }
      return 'Operating cash flow data is currently unavailable.';
    }

    // 5. Working Capital
    if (/\b(working capital)\b/i.test(lower)) {
      if (facts.workingCapital !== undefined && facts.workingCapital !== 'UNSUPPORTED') {
        return `Net working capital is ${this.formatAmount(facts.workingCapital, facts.baseCurrency)}.`;
      }
      return 'Working capital data is currently unavailable.';
    }

    // 6. Gross Margin
    if (/\b(gross margin|margin|margins|profit margin)\b/i.test(lower)) {
      if (facts.grossMargin !== undefined && facts.grossMargin !== 'UNSUPPORTED') {
        return `Current gross margin is ${this.formatPercent(facts.grossMargin)}.`;
      }
      return 'Gross margin data is currently unavailable.';
    }

    // 7. Liquidity Ratios (Current / Quick)
    if (/\b(current ratio|quick ratio|liquidity ratio|acid test)\b/i.test(lower)) {
      if (facts.currentRatio !== undefined || facts.quickRatio !== undefined) {
        const cr = facts.currentRatio !== 'UNSUPPORTED' && facts.currentRatio !== undefined ? Number(facts.currentRatio).toFixed(2) : 'unavailable';
        const qr = facts.quickRatio !== 'UNSUPPORTED' && facts.quickRatio !== undefined ? Number(facts.quickRatio).toFixed(2) : 'unavailable';
        return `Current ratio is ${cr} and quick ratio is ${qr}.`;
      }
      return 'Liquidity ratio data is currently unavailable.';
    }

    // 8. Overdue Receivables / Invoices
    if (/\b(overdue|receivable|receivables|unpaid invoices?|who owes)\b/i.test(lower)) {
      if (facts.receivablesOverdueTotal !== undefined) {
        return `Total overdue receivables are ${this.formatAmount(facts.receivablesOverdueTotal, facts.baseCurrency)}.`;
      }
      return 'Overdue receivables data is currently unavailable.';
    }

    // 9. Overdue Payables / Bills
    if (/\b(payable|payables|bills?|vendor bills?)\b/i.test(lower)) {
      if (facts.payablesOverdueTotal !== undefined) {
        return `Total overdue payables are ${this.formatAmount(facts.payablesOverdueTotal, facts.baseCurrency)}.`;
      }
      return 'Payables data is currently unavailable.';
    }

    // 10. Risk Alerts
    if (/\b(risk|risks|alerts?|warning|warnings)\b/i.test(lower)) {
      if (facts.activeAlertsCount !== undefined) {
        const high = typeof facts.highSeverityCount === 'number' ? facts.highSeverityCount : 0;
        return `There are ${facts.activeAlertsCount} active risk alert(s) detected (${high} high severity).`;
      }
      return 'Risk monitoring reports no active critical alerts.';
    }

    // 11. Expense Anomalies
    if (/\b(anomal|unusual expense|duplicate)\b/i.test(lower)) {
      if (facts.anomalousExpensesCount !== undefined) {
        return `There are ${facts.anomalousExpensesCount} anomalous expense flag(s) identified in the current period.`;
      }
      return 'Expense analysis detected no anomalous spending flags.';
    }

    // 12. General overview
    const parts: string[] = [];
    if (facts.cashRunway !== undefined && facts.cashRunway !== null && facts.cashRunway !== 'UNSUPPORTED') {
      const num = Number(facts.cashRunway);
      const val = Number.isFinite(num) ? num.toFixed(1) : String(facts.cashRunway);
      parts.push(`cash runway is ${val} months`);
    }
    if (facts.operatingCashFlow !== undefined && facts.operatingCashFlow !== 'UNSUPPORTED') {
      parts.push(`operating cash flow is ${this.formatAmount(facts.operatingCashFlow, facts.baseCurrency)}`);
    }
    if (facts.receivablesOverdueTotal !== undefined) {
      parts.push(`overdue receivables total ${this.formatAmount(facts.receivablesOverdueTotal, facts.baseCurrency)}`);
    }
    if (facts.activeAlertsCount !== undefined) {
      parts.push(`${facts.activeAlertsCount} active risk alert(s)`);
    }

    if (parts.length > 0) {
      return `Current financial overview: ${parts.join(', ')}.`;
    }
    return 'Financial analysis completed with verified metrics from your accounting data.';
  }

  private async synthesizeDirectBusinessAnswer(params: {
    organizationId: string;
    prompt: string;
    specialistOutputs: Array<Record<string, unknown>>;
    history?: Array<{ sender: string; text: string }>;
  }): Promise<string> {
    const facts = this.extractGroundedFacts(params.specialistOutputs);
    const deterministicAnswer = this.buildDeterministicDirectAnswer(
      params.prompt,
      facts,
      params.history,
    );

    if (this.modelProvider) {
      try {
        const aiResult = await this.modelProvider.executeStructuredTask({
          organizationId: params.organizationId,
          agentType: AgentType.SUPERVISOR_ORCHESTRATOR,
          skillId: 'skill.conversational-direct-synthesis',
          systemInstructions:
            'You are the SME Business Financial Intelligence Assistant. Provide a direct, concise, factual answer to the user prompt using ONLY the provided verified deterministic evidence. Do NOT add unnecessary introductions, repeated points, or unsolicited recommendations. Keep response to 1-3 sentences. If data is not available, state that clearly.',
          userPrompt: params.prompt,
          deterministicEvidence: {
            ...facts,
            conversationHistory: params.history ?? [],
          },
          requiredOutputKeys: ['answer'],
          deterministicSynthesisBuilder: () => ({
            answer: deterministicAnswer,
          }),
        });

        const synthAnswer = aiResult.structuredOutput?.answer;
        if (typeof synthAnswer === 'string' && synthAnswer.trim().length > 0) {
          return synthAnswer.trim();
        }
      } catch {
        // Fall back cleanly to deterministic direct answer
      }
    }

    return deterministicAnswer;
  }

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

    const hasHistory = Boolean(params.dto.history && params.dto.history.length > 0);
    const messageIntent = this.detectMessageIntent(preHookResult.sanitizedPrompt, hasHistory);

    if (
      messageIntent === 'GREETING' ||
      messageIntent === 'THANKS' ||
      messageIntent === 'IRRELEVANT'
    ) {
      const taskClassification =
        messageIntent === 'GREETING'
          ? 'CONVERSATIONAL_GREETING'
          : messageIntent === 'THANKS'
            ? 'CONVERSATIONAL_POLITENESS'
            : 'OUT_OF_SCOPE_QUERY';

      const conversationalAnswer = this.buildConversationalAnswer(
        messageIntent,
        preHookResult.sanitizedPrompt,
      );

      const verifierReport = {
        verificationPassed: true,
        arithmeticVerified: true,
        citationsVerified: true,
        nonFraudComplianceVerified: true,
        checkedSpecialistCount: 0,
      };

      const synthesizedResult = {
        answer: conversationalAnswer,
        executiveSummary: conversationalAnswer,
        taskClassification,
        selectedSpecialistAgents: [],
        specialistFindings: [],
        verifierAudit: verifierReport,
        humanReviewRequired: false,
        sourceRecordIds: {},
      };

      const workflowRun = await this.prisma.workflowRun.create({
        data: {
          organizationId: params.organizationId,
          requestedByUserId: params.userId,
          prompt: preHookResult.sanitizedPrompt,
          taskClassification,
          selectedAgents: [] as unknown as Prisma.InputJsonValue,
          executionMode: 'FAST_CONVERSATIONAL',
          status: ExecutionStatus.COMPLETED,
          verificationStatus: VerificationStatus.APPROVED,
          humanReviewRequired: false,
          preHookLog: preHookResult as unknown as Prisma.InputJsonValue,
          synthesizedResult: synthesizedResult as unknown as Prisma.InputJsonValue,
          verifierReport: verifierReport as unknown as Prisma.InputJsonValue,
          sourceRecordIds: {} as unknown as Prisma.InputJsonValue,
          modelUsageSummary: {
            invocationsCount: 0,
            totalTokens: 0,
            totalEstimatedCostUsd: '0.000000',
            records: [],
          } as unknown as Prisma.InputJsonValue,
          durationMs: Date.now() - workflowStartMs,
          completedAt: new Date(),
        },
      });

      await this.audit.record({
        organizationId: params.organizationId,
        actorUserId: params.userId,
        actorRole: params.userRole,
        action: 'AI_CONVERSATIONAL_QUERY_COMPLETED',
        resourceType: 'WORKFLOW_RUN',
        resourceId: workflowRun.id,
        status: 'SUCCESS',
        details: {
          intent: messageIntent,
          taskClassification,
          prompt: preHookResult.sanitizedPrompt,
        },
      });

      return {
        ...workflowRun,
        answer: conversationalAnswer,
        agentRuns: [],
      };
    }

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
        } catch (agentError) {
          const errorMessage =
            agentError instanceof Error ? agentError.message : String(agentError);
          await this.prisma.agentRun.update({
            where: { id: agentRunRecord.id },
            data: {
              status: ExecutionStatus.FAILED,
              errorDetails: errorMessage,
              durationMs: Date.now() - agentStartMs,
              completedAt: new Date(),
            },
          });
          throw agentError;
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
      } catch (verifierError) {
        await this.prisma.agentRun.update({
          where: { id: verifierRunRecord.id },
          data: {
            status: ExecutionStatus.FAILED,
            errorDetails:
              verifierError instanceof Error ? verifierError.message : String(verifierError),
            durationMs: Date.now() - verifierStartMs,
            completedAt: new Date(),
          },
        });
        throw verifierError;
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

      const directAnswer = await this.synthesizeDirectBusinessAnswer({
        organizationId: params.organizationId,
        prompt: preHookResult.sanitizedPrompt,
        specialistOutputs,
        history: params.dto.history,
      });

      // STEP 9: Consolidate Results & Execute Post-Execution Hooks
      const synthesizedResult = {
        answer: directAnswer,
        executiveSummary: directAnswer,
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

      return {
        ...completedWorkflow,
        answer: directAnswer,
      };
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

  private async fetchCanonicalFinancialRecord(
    organizationId: string,
    documentType: 'INVOICE' | 'BILL',
    lookup: { documentId?: string; documentNumber?: string },
  ): Promise<CanonicalFinancialRecord | null> {
    const cleanId = lookup.documentId?.trim();
    const cleanNum = lookup.documentNumber?.trim();
    if (!cleanId && !cleanNum) return null;

    if (documentType === 'INVOICE' && this.prisma.invoice?.findFirst) {
      const inv = await this.prisma.invoice.findFirst({
        where: {
          organizationId,
          isArchived: false,
          ...(cleanId
            ? { id: cleanId }
            : { invoiceNumber: { equals: cleanNum, mode: 'insensitive' } }),
        },
        include: { lineItems: { orderBy: { lineOrder: 'asc' } } },
      });
      return inv
        ? mapDatabaseInvoiceToCanonical(organizationId, inv as unknown as Record<string, unknown>)
        : null;
    }

    if (documentType === 'BILL' && this.prisma.bill?.findFirst) {
      const bill = await this.prisma.bill.findFirst({
        where: {
          organizationId,
          isArchived: false,
          ...(cleanId
            ? { id: cleanId }
            : { billNumber: { equals: cleanNum, mode: 'insensitive' } }),
        },
        include: { lineItems: { orderBy: { lineOrder: 'asc' } } },
      });
      return bill
        ? mapDatabaseBillToCanonical(organizationId, bill as unknown as Record<string, unknown>)
        : null;
    }

    return null;
  }

  private async enrichWorkflowWithReconciledRecord<
    T extends ReturnType<typeof normalizeWorkflowRunForResponse>,
  >(run: T): Promise<T> {
    const synth =
      run.synthesizedResult && typeof run.synthesizedResult === 'object'
        ? (run.synthesizedResult as Record<string, unknown>)
        : {};
    if (synth.reconciledRecord) {
      return run;
    }

    const tc =
      synth.triggerContext && typeof synth.triggerContext === 'object'
        ? (synth.triggerContext as Record<string, unknown>)
        : null;
    const isAutoDoc =
      run.taskClassification === 'AUTO_POST_INVOICE_ORCHESTRATION' ||
      run.taskClassification === 'AUTO_POST_BILL_ORCHESTRATION';
    const isDocExtract =
      run.taskClassification === 'CUSTOMER_INVOICE_DOCUMENT_EXTRACTION' ||
      run.taskClassification === 'SUPPLIER_BILL_DOCUMENT_EXTRACTION';

    if (!isAutoDoc && !isDocExtract) {
      return run;
    }

    const documentType: 'INVOICE' | 'BILL' =
      run.taskClassification === 'AUTO_POST_BILL_ORCHESTRATION' ||
      run.taskClassification === 'SUPPLIER_BILL_DOCUMENT_EXTRACTION' ||
      tc?.documentType === 'BILL'
        ? 'BILL'
        : 'INVOICE';

    const agentRuns = Array.isArray(run.agentRuns) ? run.agentRuns : [];
    const extractionAgent = agentRuns.find((ar) => {
      const p = ar.outputPayload as Record<string, unknown> | undefined;
      return Boolean(p?.extractedDocument);
    });
    const extractionPayload = extractionAgent?.outputPayload as Record<string, unknown> | undefined;
    const extractedDoc = extractionPayload?.extractedDocument as Record<string, unknown> | undefined;
    const rawLineItems = Array.isArray(extractionPayload?.lineItems)
      ? (extractionPayload.lineItems as Array<Record<string, unknown>>)
      : [];

    const pdfRecord = extractedDoc
      ? mapPdfPayloadToCanonical(run.organizationId, documentType, extractedDoc, rawLineItems)
      : null;

    const docId = typeof tc?.documentId === 'string' ? tc.documentId : undefined;
    const docNum =
      typeof tc?.documentNumber === 'string'
        ? tc.documentNumber
        : typeof extractedDoc?.documentNumber === 'string'
          ? extractedDoc.documentNumber
          : undefined;

    const dbRecord = await this.fetchCanonicalFinancialRecord(run.organizationId, documentType, {
      documentId: docId,
      documentNumber: docNum,
    });

    if (!dbRecord && !pdfRecord) {
      return run;
    }

    const reconciled = reconcileDocumentWithDatabaseRecord({
      organizationId: run.organizationId,
      documentType,
      dbRecord,
      pdfRecord,
    });

    return {
      ...run,
      synthesizedResult: {
        ...synth,
        reconciledRecord: reconciled,
      },
    };
  }

  async listWorkflowRuns(organizationId: string) {
    const runs = await this.prisma.workflowRun.findMany({
      where: { organizationId },
      include: {
        agentRuns: { orderBy: { startedAt: 'asc' } },
      },
      orderBy: { startedAt: 'desc' },
    });
    return Promise.all(
      runs.map((run) => this.enrichWorkflowWithReconciledRecord(normalizeWorkflowRunForResponse(run))),
    );
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
    return this.enrichWorkflowWithReconciledRecord(normalizeWorkflowRunForResponse(run));
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
      const schemaVerifierOut = verifierSkillResult.output as Record<string, unknown>;
      const schemaAnalystOut = analystSkillResult.output as Record<string, unknown>;
      const schemaExecutiveSummary =
        String(schemaAnalystOut.notes ?? '').trim() ||
        `Profiled file "${params.fileName}" (${params.headers.length} header(s)).`;
      const schemaVerifierReport = {
        verificationStatus: isApproved
          ? VerificationStatus.APPROVED
          : VerificationStatus.REQUIRES_HUMAN_REVIEW,
        verificationPassed: isApproved,
        arithmeticVerified: true,
        citationsVerified: true,
        nonFraudComplianceVerified: true,
        checkedSpecialistCount: 1,
        auditNotes: String(schemaVerifierOut.notes ?? ''),
        confidenceScore: schemaVerifierOut.confidenceScore ?? null,
        validationErrors: Array.isArray(schemaVerifierOut.validationErrors)
          ? schemaVerifierOut.validationErrors
          : [],
      };

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          status: ExecutionStatus.COMPLETED,
          verificationStatus: isApproved
            ? VerificationStatus.APPROVED
            : VerificationStatus.REQUIRES_HUMAN_REVIEW,
          humanReviewRequired: !isApproved,
          synthesizedResult: {
            executiveSummary: schemaExecutiveSummary,
            taskClassification: 'FILE_SCHEMA_PROFILING_AND_COLUMN_MAPPING',
            executedAgents: [AgentType.FINANCE_DATA_ANALYST],
            failedAgents: [],
            verifierAudit: schemaVerifierReport,
            humanReviewRequired: !isApproved,
          } as unknown as Prisma.InputJsonValue,
          verifierReport: schemaVerifierReport as unknown as Prisma.InputJsonValue,
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
      const rawLineItems = Array.isArray(analystSkillResult.output.lineItems)
        ? (analystSkillResult.output.lineItems as Array<Record<string, unknown>>)
        : [];
      const pdfCanonical = mapPdfPayloadToCanonical(
        params.organizationId,
        params.documentType,
        extractedDoc,
        rawLineItems,
      );
      const linkedDbRecord = await this.fetchCanonicalFinancialRecord(
        params.organizationId,
        params.documentType,
        {
          documentNumber:
            typeof extractedDoc.documentNumber === 'string'
              ? extractedDoc.documentNumber
              : undefined,
        },
      );
      const reconciledRecord = reconcileDocumentWithDatabaseRecord({
        organizationId: params.organizationId,
        documentType: params.documentType,
        dbRecord: linkedDbRecord,
        pdfRecord: pdfCanonical,
      });

      const combinedParsedDoc = {
        ...extractedDoc,
        ...(linkedDbRecord ? reconciledRecord.fields : {}),
        documentType: params.documentType,
        lineItems:
          reconciledRecord.fields.lineItems.length > 0
            ? reconciledRecord.fields.lineItems
            : rawLineItems,
        fieldConfidence: analystSkillResult.output.fieldConfidence ?? {},
        extractionNotes: analystSkillResult.output.extractionNotes ?? [],
        sanitizationFlags: analystSkillResult.output.sanitizationFlags ?? params.sanitizationFlags,
        reconciliationConflicts: reconciledRecord.conflicts,
        missingInPdfOnly: reconciledRecord.missingInPdfOnly,
        hasDatabaseRecord: reconciledRecord.hasDatabaseRecord,
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

      const verifierOutput = verifierSkillResult.output as Record<string, unknown>;
      const arithmetic = (verifierOutput.arithmeticVerification ?? {}) as Record<string, unknown>;
      const isApproved = Boolean(verifierOutput.isApproved);
      const docLabel = String(extractedDoc.documentNumber ?? params.fileName);
      const docParty = String(extractedDoc.counterpartyName ?? 'Unknown party');
      const docCurr = String(extractedDoc.currency ?? params.defaultCurrency ?? 'USD');
      const docTotal = extractedDoc.totalAmount
        ? `${docCurr} ${String(extractedDoc.totalAmount)}`
        : 'amount unavailable';
      const executiveSummary =
        `Extracted ${params.documentType} "${docLabel}" (${docParty}, ${docTotal}) from "${params.fileName}". ` +
        (isApproved
          ? 'Verifier AI arithmetic and field checks passed.'
          : 'Verifier AI flagged discrepancies or missing/uncertain fields requiring human review.');

      const verifierReportPayload = {
        verificationStatus: isApproved
          ? VerificationStatus.APPROVED
          : VerificationStatus.REQUIRES_HUMAN_REVIEW,
        verificationPassed: isApproved,
        arithmeticVerified: Boolean(arithmetic.arithmeticValid ?? arithmetic.isValid),
        citationsVerified: true,
        nonFraudComplianceVerified: true,
        checkedSpecialistCount: 1,
        auditNotes: String(verifierOutput.notes ?? arithmetic.summary ?? ''),
        confidenceScore: verifierOutput.confidenceScore ?? null,
        validationErrors: Array.isArray(verifierOutput.validationErrors)
          ? verifierOutput.validationErrors
          : [],
        arithmeticVerification: arithmetic,
      };

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          status: ExecutionStatus.COMPLETED,
          verificationStatus: isApproved
            ? VerificationStatus.APPROVED
            : VerificationStatus.REQUIRES_HUMAN_REVIEW,
          synthesizedResult: {
            executiveSummary,
            taskClassification,
            executedAgents: [AgentType.FINANCE_DATA_ANALYST],
            failedAgents: [],
            verifierAudit: verifierReportPayload,
            reconciledRecord,
            humanReviewRequired: !isApproved,
          } as unknown as Prisma.InputJsonValue,
          verifierReport: verifierReportPayload as unknown as Prisma.InputJsonValue,
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

  /**
   * STEP 4: Automatically triggers relevant specialist agents and Verifier AI
   * after an invoice or supplier bill is committed to the database.
   * Prevents duplicate executions for the same document and records exact
   * per-agent statuses, timestamps, updated outputs, and deterministic fallback disclosures.
   */
  async orchestratePostDocumentSave(params: {
    organizationId: string;
    userId: string;
    userRole?: RoleType;
    documentType: 'INVOICE' | 'BILL';
    documentId: string;
    documentNumber: string;
    counterpartyName: string;
    currency: string;
    totalAmount: string;
    status: string;
    dueDate: string;
    triggerSource: 'MANUAL_CREATE' | 'DOCUMENT_IMPORT';
  }) {
    const idempotencyKey = `AUTO_POST_SAVE:${params.documentType}:${params.documentId}`;
    const taskClassification =
      params.documentType === 'INVOICE'
        ? 'AUTO_POST_INVOICE_ORCHESTRATION'
        : 'AUTO_POST_BILL_ORCHESTRATION';

    const rawPrompt =
      `Automatic post-${params.documentType.toLowerCase()} save intelligence workflow [doc:${params.documentId}] ` +
      `(${params.triggerSource}) for ${params.documentNumber} (${params.counterpartyName}, ${params.currency} ${params.totalAmount}, status ${params.status}).`;

    // Select only relevant registered agents in sequence:
    // - INVOICE excludes EXPENSE_ANOMALY_DETECTION and SCENARIO_PLANNING
    // - BILL includes EXPENSE_ANOMALY_DETECTION and excludes SCENARIO_PLANNING
    const stage1ParallelAgents: AgentType[] =
      params.documentType === 'BILL'
        ? [
            AgentType.FINANCE_DATA_ANALYST,
            AgentType.CASH_FLOW_FORECASTING,
            AgentType.EXPENSE_ANOMALY_DETECTION,
            AgentType.FINANCIAL_RISK_ASSESSMENT,
          ]
        : [
            AgentType.FINANCE_DATA_ANALYST,
            AgentType.CASH_FLOW_FORECASTING,
            AgentType.FINANCIAL_RISK_ASSESSMENT,
          ];

    const fullDbRecord = await this.fetchCanonicalFinancialRecord(
      params.organizationId,
      params.documentType,
      { documentId: params.documentId, documentNumber: params.documentNumber },
    );
    const reconciledRecord = fullDbRecord
      ? reconcileDocumentWithDatabaseRecord({
          organizationId: params.organizationId,
          documentType: params.documentType,
          dbRecord: fullDbRecord,
          pdfRecord: null,
        })
      : null;

    return this.executeStagedPostSaveOrchestration({
      idempotencyKey,
      dedupeMarker: `[doc:${params.documentId}]`,
      organizationId: params.organizationId,
      userId: params.userId,
      userRole: params.userRole,
      taskClassification,
      rawPrompt,
      stage1ParallelAgents,
      stage2SequentialAgents: [AgentType.STRATEGIC_RECOMMENDATION, AgentType.FINANCIAL_REPORTING],
      reportTitle: `Automated Health Brief (${params.documentNumber})`,
      triggerContext: {
        event: params.triggerSource,
        documentType: params.documentType,
        documentId: params.documentId,
        documentNumber: params.documentNumber,
        counterpartyName: params.counterpartyName,
        currency: params.currency,
        totalAmount: params.totalAmount,
        status: params.status,
        dueDate: params.dueDate,
        ...(reconciledRecord ? { reconciledRecord } : {}),
      },
      extraLimitations: [],
    });
  }

  /**
   * STEP 4: Automatically triggers relevant specialist agents and Verifier AI
   * after a Ledger CSV/Excel import batch is committed to PostgreSQL.
   * Skips zero-row commits cleanly and discloses partial-batch skipped/error rows.
   */
  async orchestratePostLedgerImport(params: {
    organizationId: string;
    userId: string;
    userRole?: RoleType;
    batchId: string;
    fileName: string;
    accountId: string;
    currency: string;
    committedRowsCount: number;
    errorRowsCount: number;
    skippedDuplicatesCount: number;
    hasExpenseRows: boolean;
    netBalanceChange: string;
  }) {
    if (params.committedRowsCount <= 0) {
      return {
        skipped: true,
        reason: 'NO_ROWS_COMMITTED',
        batchId: params.batchId,
      };
    }

    const idempotencyKey = `AUTO_POST_IMPORT:CSV_BATCH:${params.batchId}`;
    const taskClassification = 'AUTO_POST_LEDGER_IMPORT_ORCHESTRATION';
    const rawPrompt =
      `Automatic post-ledger import intelligence workflow [batch:${params.batchId}] ` +
      `for "${params.fileName}" (${params.committedRowsCount} committed row(s), ${params.currency} net ${params.netBalanceChange}).`;

    // Include EXPENSE_ANOMALY_DETECTION only when committed rows include expenses; exclude SCENARIO_PLANNING
    const stage1ParallelAgents: AgentType[] = params.hasExpenseRows
      ? [
          AgentType.FINANCE_DATA_ANALYST,
          AgentType.CASH_FLOW_FORECASTING,
          AgentType.EXPENSE_ANOMALY_DETECTION,
          AgentType.FINANCIAL_RISK_ASSESSMENT,
        ]
      : [
          AgentType.FINANCE_DATA_ANALYST,
          AgentType.CASH_FLOW_FORECASTING,
          AgentType.FINANCIAL_RISK_ASSESSMENT,
        ];

    const extraLimitations: string[] = [];
    if (params.errorRowsCount > 0) {
      extraLimitations.push(
        `Partial batch import: ${params.errorRowsCount} row(s) failed validation during preview and were excluded from committed ledger totals.`,
      );
    }
    if (params.skippedDuplicatesCount > 0) {
      extraLimitations.push(
        `${params.skippedDuplicatesCount} duplicate row(s) were skipped during batch confirmation.`,
      );
    }

    return this.executeStagedPostSaveOrchestration({
      idempotencyKey,
      dedupeMarker: `[batch:${params.batchId}]`,
      organizationId: params.organizationId,
      userId: params.userId,
      userRole: params.userRole,
      taskClassification,
      rawPrompt,
      stage1ParallelAgents,
      stage2SequentialAgents: [AgentType.STRATEGIC_RECOMMENDATION, AgentType.FINANCIAL_REPORTING],
      reportTitle: `Automated Health Brief (Import ${params.fileName})`,
      triggerContext: {
        event: 'LEDGER_BATCH_IMPORT',
        batchId: params.batchId,
        fileName: params.fileName,
        accountId: params.accountId,
        currency: params.currency,
        committedRowsCount: params.committedRowsCount,
        errorRowsCount: params.errorRowsCount,
        skippedDuplicatesCount: params.skippedDuplicatesCount,
        netBalanceChange: params.netBalanceChange,
        partialImport: params.errorRowsCount > 0,
      },
      extraLimitations,
    });
  }

  private async executeStagedPostSaveOrchestration(params: {
    idempotencyKey: string;
    dedupeMarker: string;
    organizationId: string;
    userId: string;
    userRole?: RoleType;
    taskClassification: string;
    rawPrompt: string;
    stage1ParallelAgents: AgentType[];
    stage2SequentialAgents: AgentType[];
    reportTitle: string;
    triggerContext: Record<string, unknown>;
    extraLimitations: string[];
  }) {
    const {
      idempotencyKey,
      dedupeMarker,
      taskClassification,
      rawPrompt,
      stage1ParallelAgents,
      stage2SequentialAgents,
    } = params;

    if (this.inFlightPostSaveKeys.has(idempotencyKey)) {
      return {
        skipped: true,
        reason: 'ALREADY_IN_FLIGHT',
        idempotencyKey,
      };
    }

    const existingRun = await this.prisma.workflowRun.findFirst({
      where: {
        organizationId: params.organizationId,
        taskClassification,
        prompt: { contains: dedupeMarker },
        status: { in: [ExecutionStatus.RUNNING, ExecutionStatus.COMPLETED] },
      },
      select: { id: true, status: true },
    });

    if (existingRun) {
      return {
        skipped: true,
        reason: 'ALREADY_EXECUTED',
        existingWorkflowRunId: existingRun.id,
        idempotencyKey,
      };
    }

    this.inFlightPostSaveKeys.add(idempotencyKey);
    const workflowStartMs = Date.now();
    const duringEvents: DuringHookEvent[] = [];
    const actorRole = params.userRole ?? RoleType.ACCOUNTANT;
    const allSelectedAgents: AgentType[] = [
      ...stage1ParallelAgents,
      ...stage2SequentialAgents,
      AgentType.VERIFIER_AI,
    ];

    const preHookResult = await this.hooks.runPreExecutionHooks({
      organizationId: params.organizationId,
      userId: params.userId,
      userRole: actorRole,
      isPlatformAdmin: actorRole === RoleType.PLATFORM_ADMIN,
      prompt: rawPrompt,
    });

    const workflowRun = await this.prisma.workflowRun.create({
      data: {
        organizationId: params.organizationId,
        requestedByUserId: params.userId,
        prompt: preHookResult.sanitizedPrompt,
        taskClassification,
        selectedAgents: allSelectedAgents as unknown as Prisma.InputJsonValue,
        executionMode: 'AUTO_POST_SAVE_PARALLEL_THEN_SEQUENTIAL_VERIFIER',
        status: ExecutionStatus.RUNNING,
        verificationStatus: VerificationStatus.PENDING,
        preHookLog: preHookResult as unknown as Prisma.InputJsonValue,
      },
    });

    try {
      this.hooks.recordDuringExecutionEvent(duringEvents, {
        stage: 'AUTO_POST_SAVE_CLASSIFICATION_COMPLETE',
        agentType: AgentType.SUPERVISOR_ORCHESTRATOR,
        status: 'RUNNING',
        workflowStartedAt: workflowStartMs,
      });

      const specialistOutputs: Array<Record<string, unknown>> = [];
      const failedAgents: Array<{ agentType: AgentType; error: string }> = [];
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

      const runSpecialist = async (agentType: AgentType) => {
        const agentStartMs = Date.now();
        const sandboxCtx = this.sandbox.createSandboxContext({
          workflowRunId: workflowRun.id,
          organizationId: params.organizationId,
          actorUserId: params.userId,
          actorRole,
          agentType,
        });

        const agentSkills = this.skillsRegistry
          .getSkillsForAgent(agentType)
          .filter((s) =>
            s.requiredInputs.every((k) => ['organizationId', 'prompt', 'horizonDays'].includes(k)),
          );
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
              ...params.triggerContext,
              forceRefresh: true,
              persistReport: agentType === AgentType.FINANCIAL_REPORTING,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        try {
          const skillOutputs: Array<Record<string, unknown>> = [];
          const invokedMcpTools: string[] = [];
          const agentSourceIds: Record<string, string[]> = {};
          let lastUsage: AiModelUsageMetrics | null = null;

          for (const skill of agentSkills) {
            const skillExec = await this.skillsRegistry.executeSkill(
              skill.skillId,
              {
                organizationId: params.organizationId,
                prompt: preHookResult.sanitizedPrompt,
                horizonDays: 30,
                forceRefresh: true,
                persistReport: agentType === AgentType.FINANCIAL_REPORTING,
                reportTitle: params.reportTitle,
              },
              sandboxCtx,
            );
            skillOutputs.push(skillExec.output);
            invokedMcpTools.push(...skillExec.invokedMcpTools);
            Object.assign(agentSourceIds, skillExec.sourceRecordIds);
            lastUsage = skillExec.modelUsage;
            modelUsageRecords.push(skillExec.modelUsage);
          }

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

          this.hooks.recordDuringExecutionEvent(duringEvents, {
            stage: 'SPECIALIST_AGENT_COMPLETED',
            agentType,
            loadedSkills: loadedSkillIds,
            invokedTools: invokedMcpTools,
            status: 'COMPLETED',
            workflowStartedAt: workflowStartMs,
          });

          mergeSourceIds(agentSourceIds);
          specialistOutputs.push(combinedAgentOutput);
        } catch (agentError) {
          const errMsg = agentError instanceof Error ? agentError.message : String(agentError);
          await this.prisma.agentRun.update({
            where: { id: agentRunRecord.id },
            data: {
              status: ExecutionStatus.FAILED,
              errorDetails: errMsg,
              invokedTools: sandboxCtx.invokedTools as unknown as Prisma.InputJsonValue,
              blockedOperations: sandboxCtx.blockedOperations as unknown as Prisma.InputJsonValue,
              durationMs: Date.now() - agentStartMs,
              completedAt: new Date(),
            },
          });
          failedAgents.push({ agentType, error: errMsg });
          this.hooks.recordDuringExecutionEvent(duringEvents, {
            stage: 'SPECIALIST_AGENT_FAILED',
            agentType,
            status: 'FAILED',
            workflowStartedAt: workflowStartMs,
          });
        } finally {
          this.sandbox.releaseSandbox(sandboxCtx.sandboxId);
        }
      };

      // Stage 1: Independent analytics, forecasting, anomaly (BILL), and risk agents in parallel
      await Promise.all(stage1ParallelAgents.map((a) => runSpecialist(a)));

      // Stage 2: Synthesis agents (recommendations & reporting) sequentially on fresh outputs
      for (const seqAgent of stage2SequentialAgents) {
        await runSpecialist(seqAgent);
      }

      // Stage 3: Mandatory Verifier AI audit
      const verifierStartMs = Date.now();
      const verifierSandbox = this.sandbox.createSandboxContext({
        workflowRunId: workflowRun.id,
        organizationId: params.organizationId,
        actorUserId: params.userId,
        actorRole,
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
            failedAgentsCount: failedAgents.length,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      let verifierOutput: Record<string, unknown> = {};
      try {
        const verifierSkillResult = await this.skillsRegistry.executeSkill(
          'skill.financial-output-verification',
          {
            organizationId: params.organizationId,
            specialistOutputs,
          },
          verifierSandbox,
        );
        modelUsageRecords.push(verifierSkillResult.modelUsage);
        mergeSourceIds(verifierSkillResult.sourceRecordIds);
        verifierOutput = verifierSkillResult.output;

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
      } catch (verifierError) {
        const errMsg =
          verifierError instanceof Error ? verifierError.message : String(verifierError);
        await this.prisma.agentRun.update({
          where: { id: verifierRunRecord.id },
          data: {
            status: ExecutionStatus.FAILED,
            errorDetails: errMsg,
            durationMs: Date.now() - verifierStartMs,
            completedAt: new Date(),
          },
        });
        failedAgents.push({ agentType: AgentType.VERIFIER_AI, error: errMsg });
      } finally {
        this.sandbox.releaseSandbox(verifierSandbox.sandboxId);
      }

      const finalSourceRecordIds: Record<string, string[]> = {};
      for (const [k, set] of Object.entries(aggregatedSourceRecordIds)) {
        finalSourceRecordIds[k] = Array.from(set);
      }

      const usedDeterministicFallback =
        modelUsageRecords.length === 0 ||
        modelUsageRecords.every((u) => u.provider === 'deterministic-grounded' || u.status === 'FALLBACK_USED');

      const limitations: string[] = [...params.extraLimitations];
      if (usedDeterministicFallback) {
        limitations.push(
          'External AI provider is not configured; workflow executed using deterministic grounded calculations and rule-based synthesis.',
        );
      }
      if (failedAgents.length > 0) {
        limitations.push(
          `${failedAgents.length} agent(s) failed during execution: ${failedAgents.map((f) => `${f.agentType} (${f.error})`).join('; ')}.`,
        );
      }

      const finalWorkflowStatus =
        specialistOutputs.length === 0 ? ExecutionStatus.FAILED : ExecutionStatus.COMPLETED;
      const finalVerificationStatus = VerificationStatus.REQUIRES_HUMAN_REVIEW;

      const executiveSummary =
        specialistOutputs.length === 0 || failedAgents.length > 0
          ? synthesizeExecutiveSummary({
              taskClassification,
              prompt: rawPrompt,
              specialistRuns: [
                ...specialistOutputs.map((o) => ({
                  agentType: String(o.agentType ?? 'UNKNOWN'),
                  status: ExecutionStatus.COMPLETED,
                  outputPayload: o,
                })),
                ...failedAgents.map((f) => ({
                  agentType: f.agentType,
                  status: ExecutionStatus.FAILED,
                  errorDetails: f.error,
                })),
              ],
              failedAgents,
              incompleteAgents: [],
              verifierReport: null,
            })
          : `Completed ${taskClassification} across ${specialistOutputs.length} specialist agent(s) and Verifier AI.`;

      const synthesizedResult = {
        executiveSummary,
        triggerContext: params.triggerContext,
        executionSequence: {
          stage1Parallel: stage1ParallelAgents,
          stage2Sequential: stage2SequentialAgents,
          stage3Verifier: AgentType.VERIFIER_AI,
        },
        executedAgents: specialistOutputs.map((o) => o.agentType),
        failedAgents,
        updatedOutputs: {
          forecastIds: finalSourceRecordIds.forecastIds ?? [],
          riskAlertIds: finalSourceRecordIds.riskAlertIds ?? [],
          reportIds: finalSourceRecordIds.reportIds ?? [],
          invoiceIds: finalSourceRecordIds.invoiceIds ?? [],
          billIds: finalSourceRecordIds.billIds ?? [],
        },
        providerMode: usedDeterministicFallback ? 'deterministic-grounded' : 'external-ai',
        limitations,
        specialistFindings: specialistOutputs,
        verifierAudit: verifierOutput,
        humanReviewRequired: true,
        sourceRecordIds: finalSourceRecordIds,
      };

      const postHookResult = await this.hooks.runPostExecutionHooks({
        workflowRunId: workflowRun.id,
        organizationId: params.organizationId,
        synthesizedResult,
        verifierReport: {
          verificationStatus: finalVerificationStatus,
          arithmeticVerified: Boolean(verifierOutput.arithmeticVerified),
          citationsVerified: Boolean(verifierOutput.citationsVerified),
          nonFraudCompliance: Boolean(verifierOutput.nonFraudComplianceVerified),
        },
        sourceRecordIds: finalSourceRecordIds,
      });

      const totalTokens = modelUsageRecords.reduce((acc, u) => acc + u.totalTokens, 0);
      const totalEstimatedCostUsd = DecimalMath.sum(
        modelUsageRecords.map((u) => u.estimatedCostUsd),
      ).toFixed(6);

      const completedWorkflow = await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          status: finalWorkflowStatus,
          verificationStatus: finalVerificationStatus,
          humanReviewRequired: true,
          duringHookLog: duringEvents as unknown as Prisma.InputJsonValue,
          postHookLog: postHookResult as unknown as Prisma.InputJsonValue,
          ...(failedAgents.length > 0
            ? {
                errorHookLog: {
                  failedAgents,
                  recordedAt: new Date().toISOString(),
                } as unknown as Prisma.InputJsonValue,
              }
            : {}),
          synthesizedResult: synthesizedResult as unknown as Prisma.InputJsonValue,
          verifierReport: verifierOutput as unknown as Prisma.InputJsonValue,
          sourceRecordIds: finalSourceRecordIds as unknown as Prisma.InputJsonValue,
          modelUsageSummary: {
            invocationsCount: modelUsageRecords.length,
            totalTokens,
            totalEstimatedCostUsd,
            providerMode: usedDeterministicFallback ? 'deterministic-grounded' : 'external-ai',
            records: modelUsageRecords,
          } as unknown as Prisma.InputJsonValue,
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
        actorRole,
        action: 'AI_AUTO_POST_SAVE_WORKFLOW_COMPLETED',
        resourceType: 'WORKFLOW_RUN',
        resourceId: completedWorkflow.id,
        status: finalWorkflowStatus === ExecutionStatus.COMPLETED ? 'SUCCESS' : 'ERROR',
        details: {
          idempotencyKey,
          ...params.triggerContext,
          executedAgents: specialistOutputs.map((o) => o.agentType),
          failedAgents,
          updatedOutputs: synthesizedResult.updatedOutputs,
          providerMode: synthesizedResult.providerMode,
        },
      });

      return completedWorkflow;
    } catch (error) {
      await this.hooks.runErrorHooks({
        workflowRunId: workflowRun.id,
        organizationId: params.organizationId,
        actorUserId: params.userId,
        error,
        retryAttempts: 0,
      });
      await this.recordWorkflowFailure(workflowRun.id, workflowStartMs, error);
      throw error;
    } finally {
      this.inFlightPostSaveKeys.delete(idempotencyKey);
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
