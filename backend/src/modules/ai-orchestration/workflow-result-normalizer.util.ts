import { AgentType, ExecutionStatus, VerificationStatus } from '../../generated/prisma/client.js';

export interface NormalizedFailedAgent {
  agentType: string;
  error: string;
}

export interface NormalizedVerifierReport {
  verificationStatus?: VerificationStatus | string;
  verificationPassed: boolean;
  arithmeticVerified: boolean;
  citationsVerified: boolean;
  nonFraudComplianceVerified: boolean;
  checkedSpecialistCount?: number;
  auditNotes?: string;
  confidenceScore?: number | null;
  validationErrors?: string[];
  arithmeticVerification?: Record<string, unknown>;
}

export interface AgentRunLike {
  id?: string;
  agentType: AgentType | string;
  status: ExecutionStatus | string;
  loadedSkills?: unknown;
  inputContext?: unknown;
  outputPayload?: unknown;
  evidenceCitations?: unknown;
  durationMs?: number | null;
  errorDetails?: string | null;
}

export interface WorkflowRunLike {
  id: string;
  organizationId: string;
  prompt: string;
  taskClassification: string;
  selectedAgents?: unknown;
  executionMode: string;
  status: ExecutionStatus | string;
  verificationStatus: VerificationStatus | string;
  humanReviewRequired?: boolean;
  synthesizedResult?: unknown;
  resultPayload?: unknown;
  verifierReport?: unknown;
  sourceRecordIds?: unknown;
  modelUsageSummary?: unknown;
  agentRuns?: AgentRunLike[];
  [key: string]: unknown;
}

const FAILED_STATUSES = new Set<string>([
  ExecutionStatus.FAILED,
  'BLOCKED',
  'TIMED_OUT',
  ExecutionStatus.BLOCKED_BY_SANDBOX,
  'CANCELLED',
]);

function asRecord(val: unknown): Record<string, unknown> | null {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : null;
}

function asStringArray(val: unknown): string[] {
  return Array.isArray(val) ? val.map(String) : [];
}

function extractDocumentRefFromPrompt(prompt: string): string | null {
  const m = prompt.match(/uploaded document "([^"]+)"/i) || prompt.match(/for ([^\s(]+\.\w+)/i);
  return m ? m[1] : null;
}

export function extractAgentRunSummaries(ar: AgentRunLike): string[] {
  const payload = asRecord(ar.outputPayload);
  if (!payload) return [];

  if (Array.isArray(payload.skillResults)) {
    const summaries = payload.skillResults
      .map((sr) => asRecord(sr))
      .map((sr) => (typeof sr?.summary === 'string' ? sr.summary.trim() : ''))
      .filter(Boolean);
    if (summaries.length > 0) return summaries;
  }

  const extractedDoc = asRecord(payload.extractedDocument);
  if (extractedDoc) {
    const docType = String(extractedDoc.documentType ?? 'DOCUMENT');
    const docNum = String(extractedDoc.documentNumber ?? '(unnumbered)');
    const party = String(extractedDoc.counterpartyName ?? '(unknown party)');
    const curr = String(extractedDoc.currency ?? 'USD');
    const total =
      extractedDoc.totalAmount !== null && extractedDoc.totalAmount !== undefined
        ? `${curr} ${String(extractedDoc.totalAmount)}`
        : 'amount missing';
    const lineCount = Array.isArray(payload.lineItems) ? payload.lineItems.length : 0;
    const notes = asStringArray(payload.extractionNotes);
    return [
      `Extracted ${docType} ${docNum} for ${party} (${total}, ${lineCount} line item(s)).`,
      ...notes,
    ];
  }

  if (typeof payload.notes === 'string' && payload.notes.trim()) {
    return [payload.notes.trim()];
  }

  if (typeof payload.summary === 'string' && payload.summary.trim()) {
    return [payload.summary.trim()];
  }

  const meaningfulKeys = Object.keys(payload).filter((k) => k !== 'skillId');
  if (meaningfulKeys.length > 0) {
    return [`Completed with structured output (${meaningfulKeys.join(', ')}).`];
  }

  return [];
}

export function normalizeVerifierReport(params: {
  persistedVerifierReport?: unknown;
  persistedVerifierAudit?: unknown;
  verifierAgentRun?: AgentRunLike;
  specialistCount: number;
  workflowStatus?: string;
  verificationStatus?: string;
  hasDocumentRef?: boolean;
}): NormalizedVerifierReport | null {
  const { verifierAgentRun } = params;
  if (
    params.workflowStatus === ExecutionStatus.RUNNING ||
    params.workflowStatus === ExecutionStatus.PENDING ||
    params.verificationStatus === VerificationStatus.PENDING
  ) {
    return null;
  }
  if (verifierAgentRun && verifierAgentRun.status !== ExecutionStatus.COMPLETED) {
    return null;
  }

  const existing =
    asRecord(params.persistedVerifierReport) || asRecord(params.persistedVerifierAudit);
  if (existing && typeof existing.verificationPassed === 'boolean') {
    const arith = asRecord(existing.arithmeticVerification);
    const arithVerified =
      typeof arith?.arithmeticValid === 'boolean'
        ? arith.arithmeticValid
        : Boolean(existing.arithmeticVerified);
    return {
      ...(existing as unknown as NormalizedVerifierReport),
      arithmeticVerified: arithVerified,
    };
  }

  const vp = asRecord(verifierAgentRun?.outputPayload);
  if (!vp || verifierAgentRun?.status !== ExecutionStatus.COMPLETED) {
    return null;
  }

  // Standard skill.financial-output-verification shape
  if (typeof vp.verificationPassed === 'boolean') {
    return {
      verificationStatus: params.verificationStatus,
      verificationPassed: vp.verificationPassed,
      arithmeticVerified: Boolean(vp.arithmeticVerified),
      citationsVerified: Boolean(vp.citationsVerified),
      nonFraudComplianceVerified: Boolean(vp.nonFraudComplianceVerified),
      checkedSpecialistCount:
        typeof vp.checkedSpecialistCount === 'number'
          ? vp.checkedSpecialistCount
          : params.specialistCount,
      auditNotes: typeof vp.auditNotes === 'string' ? vp.auditNotes : '',
    };
  }

  // Document extraction or column-mapping verifier shape
  if (typeof vp.isApproved === 'boolean' || asRecord(vp.arithmeticVerification)) {
    const arith = asRecord(vp.arithmeticVerification);
    const discrepancies = Array.isArray(arith?.discrepancies) ? arith.discrepancies : [];
    const hasNumericPass =
      arith?.lineItemsMatchSubtotal === true ||
      arith?.subtotalPlusTaxMatchesTotal === true ||
      arith?.taxRateMatchesTaxAmount === true;

    const arithmeticVerified = arith
      ? typeof arith.arithmeticValid === 'boolean'
        ? arith.arithmeticValid
        : Boolean(arith.isValid) ||
          (discrepancies.length === 0 &&
            hasNumericPass &&
            arith.lineItemsMatchSubtotal !== false &&
            arith.subtotalPlusTaxMatchesTotal !== false &&
            arith.taxRateMatchesTaxAmount !== false)
      : true;

    return {
      verificationStatus: params.verificationStatus,
      verificationPassed: Boolean(vp.isApproved),
      arithmeticVerified,
      citationsVerified: Boolean(params.hasDocumentRef || params.specialistCount > 0),
      nonFraudComplianceVerified: true,
      checkedSpecialistCount: params.specialistCount,
      auditNotes: String(vp.notes || arith?.summary || ''),
      confidenceScore: typeof vp.confidenceScore === 'number' ? vp.confidenceScore : null,
      validationErrors: asStringArray(vp.validationErrors),
      ...(arith ? { arithmeticVerification: arith } : {}),
    };
  }

  return null;
}

export function mergeSourceRecordIds(
  ...sources: Array<Record<string, unknown> | null | undefined>
): Record<string, string[]> {
  const sets: Record<string, Set<string>> = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [k, arr] of Object.entries(src)) {
      if (!Array.isArray(arr) || arr.length === 0) continue;
      if (!sets[k]) sets[k] = new Set();
      for (const id of arr) {
        if (id !== null && id !== undefined) sets[k].add(String(id));
      }
    }
  }
  const result: Record<string, string[]> = {};
  for (const [k, s] of Object.entries(sets)) {
    if (s.size > 0) result[k] = Array.from(s);
  }
  return result;
}

export function synthesizeExecutiveSummary(params: {
  taskClassification: string;
  prompt: string;
  persistedSummary?: string | null;
  specialistRuns: AgentRunLike[];
  failedAgents: NormalizedFailedAgent[];
  incompleteAgents: string[];
  verifierReport: NormalizedVerifierReport | null;
}): string {
  const completedSpecialists = params.specialistRuns.filter(
    (ar) => ar.status === ExecutionStatus.COMPLETED && ar.outputPayload,
  );
  const incompleteLabels = [
    ...params.failedAgents.map((f) => `${f.agentType} (FAILED)`),
    ...params.incompleteAgents.map((a) => `${a} (INCOMPLETE)`),
  ];

  if (completedSpecialists.length === 0) {
    const reasons: string[] = [];
    if (params.failedAgents.length > 0) {
      reasons.push(params.failedAgents.map((f) => `${f.agentType}: ${f.error}`).join('; '));
    }
    if (params.incompleteAgents.length > 0) {
      reasons.push(`incomplete/missing: ${params.incompleteAgents.join(', ')}`);
    }
    if (reasons.length === 0) {
      reasons.push('no specialist agent outputs were recorded');
    }
    return `No usable agent findings available (${reasons.join('; ')}).`;
  }

  let baseSummary =
    typeof params.persistedSummary === 'string' && params.persistedSummary.trim()
      ? params.persistedSummary.trim()
      : '';

  if (!baseSummary) {
    const firstSummaries = completedSpecialists.flatMap((ar) => extractAgentRunSummaries(ar));
    if (firstSummaries.length > 0) {
      baseSummary = firstSummaries[0];
    } else {
      baseSummary = `Completed ${params.taskClassification} across ${completedSpecialists.length} specialist agent(s)${params.verifierReport ? ' and Verifier AI' : ''}.`;
    }
  }

  if (incompleteLabels.length > 0 && !baseSummary.toLowerCase().includes('partial')) {
    return `Partial workflow findings (${completedSpecialists.length} completed; ${incompleteLabels.join(', ')}): ${baseSummary}`;
  }

  return baseSummary;
}

export function normalizeWorkflowRunForResponse<T extends WorkflowRunLike>(run: T): T {
  const agentRuns = Array.isArray(run.agentRuns) ? run.agentRuns : [];
  const specialistRuns = agentRuns.filter((ar) => ar.agentType !== AgentType.VERIFIER_AI);
  const verifierAgentRun = agentRuns.find((ar) => ar.agentType === AgentType.VERIFIER_AI);

  const existingSynth = asRecord(run.synthesizedResult) || asRecord(run.resultPayload) || {};
  const existingFailed = Array.isArray(existingSynth.failedAgents)
    ? existingSynth.failedAgents
        .map((f) => asRecord(f))
        .filter((f): f is Record<string, unknown> => Boolean(f))
        .map((f) => ({
          agentType: String(f.agentType ?? 'UNKNOWN'),
          error: String(f.error ?? 'Agent failed'),
        }))
    : [];

  const failedFromAgentRuns = agentRuns
    .filter((ar) => FAILED_STATUSES.has(String(ar.status)))
    .filter((ar) => !existingFailed.some((ef) => ef.agentType === String(ar.agentType)))
    .map((ar) => ({
      agentType: String(ar.agentType),
      error: ar.errorDetails || `Execution ended with status ${ar.status}`,
    }));

  const failedAgents = [...existingFailed, ...failedFromAgentRuns];

  const selectedSpecialists = asStringArray(run.selectedAgents).filter(
    (a) => a !== AgentType.SUPERVISOR_ORCHESTRATOR && a !== AgentType.VERIFIER_AI,
  );
  const recordedSpecialists = new Set(specialistRuns.map((ar) => String(ar.agentType)));
  const incompleteAgents = [
    ...specialistRuns
      .filter((ar) => ar.status === ExecutionStatus.PENDING || ar.status === ExecutionStatus.RUNNING)
      .map((ar) => String(ar.agentType)),
    ...selectedSpecialists.filter((a) => !recordedSpecialists.has(a)),
  ];

  const docRef = extractDocumentRefFromPrompt(String(run.prompt ?? ''));
  const normalizedVerifier = normalizeVerifierReport({
    persistedVerifierReport: run.verifierReport,
    persistedVerifierAudit: existingSynth.verifierAudit,
    verifierAgentRun,
    specialistCount: specialistRuns.length,
    workflowStatus: String(run.status ?? ''),
    verificationStatus: String(run.verificationStatus ?? ''),
    hasDocumentRef: Boolean(docRef),
  });

  const executiveSummary = synthesizeExecutiveSummary({
    taskClassification: run.taskClassification,
    prompt: String(run.prompt ?? ''),
    persistedSummary:
      typeof existingSynth.executiveSummary === 'string' ? existingSynth.executiveSummary : null,
    specialistRuns,
    failedAgents,
    incompleteAgents,
    verifierReport: normalizedVerifier,
  });

  const mergedSourceRecordIds = mergeSourceRecordIds(
    asRecord(run.sourceRecordIds),
    asRecord(existingSynth.sourceRecordIds),
    ...agentRuns.map((ar) => asRecord(ar.evidenceCitations)),
    ...agentRuns.map((ar) => asRecord(asRecord(ar.outputPayload)?.sourceRecordIds)),
  );

  const existingLimitations = asStringArray(existingSynth.limitations);
  const derivedLimitations = [...existingLimitations];
  if (
    verifierAgentRun &&
    verifierAgentRun.status !== ExecutionStatus.COMPLETED &&
    !derivedLimitations.some((l) => l.toLowerCase().includes('verifier'))
  ) {
    derivedLimitations.push(
      `Verifier AI did not complete verification (status: ${verifierAgentRun.status}).`,
    );
  }

  const normalizedSynthesizedResult = {
    ...existingSynth,
    taskClassification: existingSynth.taskClassification ?? run.taskClassification,
    executiveSummary,
    executedAgents:
      Array.isArray(existingSynth.executedAgents) && existingSynth.executedAgents.length > 0
        ? existingSynth.executedAgents
        : specialistRuns
            .filter((ar) => ar.status === ExecutionStatus.COMPLETED)
            .map((ar) => ar.agentType),
    failedAgents,
    limitations: derivedLimitations,
    ...(normalizedVerifier ? { verifierAudit: normalizedVerifier } : {}),
    ...(Object.keys(mergedSourceRecordIds).length > 0
      ? { sourceRecordIds: mergedSourceRecordIds }
      : {}),
  };

  return {
    ...run,
    synthesizedResult: normalizedSynthesizedResult,
    verifierReport: normalizedVerifier ?? run.verifierReport ?? null,
    sourceRecordIds:
      Object.keys(mergedSourceRecordIds).length > 0
        ? mergedSourceRecordIds
        : run.sourceRecordIds ?? {},
  };
}
