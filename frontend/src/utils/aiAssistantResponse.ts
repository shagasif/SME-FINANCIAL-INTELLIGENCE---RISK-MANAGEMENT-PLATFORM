import { formatUserFacingText } from './formatters';

type JsonRecord = Record<string, unknown>;

export type ExecutionTone = 'success' | 'warning' | 'error' | 'neutral';

export interface AssistantExecutionDetails {
  label: string;
  tone: ExecutionTone;
  workflowId?: string;
  latencyMs?: number;
  formulaVersion?: string;
  details: string[];
}

export interface AssistantResponse {
  answer: string;
  citations: string[];
  execution: AssistantExecutionDetails;
}

const sourceLabels: Record<string, [string, string]> = {
  accountids: ['Account', 'Accounts'],
  alertids: ['Risk alert', 'Risk alerts'],
  billids: ['Bill', 'Bills'],
  budgetids: ['Budget', 'Budgets'],
  finmemorysnapshotids: ['Financial snapshot', 'Financial snapshots'],
  forecastids: ['Forecast', 'Forecasts'],
  futuretransactionids: ['Scheduled transaction', 'Scheduled transactions'],
  invoiceids: ['Invoice', 'Invoices'],
  metrics: ['Financial metric', 'Financial metrics'],
  recurringtransactionids: ['Recurring transaction', 'Recurring transactions'],
  reportids: ['Report', 'Reports'],
  riskalertids: ['Risk alert', 'Risk alerts'],
  scenarioids: ['Scenario simulation', 'Scenario simulations'],
  snapshotids: ['Financial snapshot', 'Financial snapshots'],
  transactionids: ['Transaction', 'Transactions'],
  unpostedpaymentrecordids: ['Unreconciled payment', 'Unreconciled payments'],
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function isOrchestrationLog(value: string): boolean {
  return /^(?:completed\s+[A-Z][A-Z0-9_]*\s+across\s+\d+\s+specialist|classified as\s+[A-Z0-9_]+|analysis verified(?: and executed)?(?: across multi-agent sandboxes)?|no usable agent findings available|partial workflow findings)/i.test(
    value.trim(),
  );
}

function formatFourDecimalAmount(rawAmount: string, currency?: string): string {
  const num = Number(rawAmount);
  if (!Number.isFinite(num)) return rawAmount;
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

function detectBaseCurrency(findings: unknown[]): string | undefined {
  for (const finding of findings) {
    const record = asRecord(finding);
    const skillResults = Array.isArray(record?.skillResults) ? record.skillResults : [];
    for (const item of skillResults) {
      const sr = asRecord(item);
      const assumptions = asRecord(sr?.assumptions);
      const currency = asString(assumptions?.baseCurrency) ?? asString(sr?.currency);
      if (currency) return currency;
      const summary = asString(sr?.summary);
      const match = summary ? /\b(PKR|USD|EUR|GBP|AED|SAR)\b/.exec(summary) : null;
      if (match) return match[1];
    }
  }
  return undefined;
}

function humanizeSkillSummary(summary: string, resultRecord: JsonRecord, fallbackCurrency?: string): string {
  const assumptions = asRecord(resultRecord.assumptions);
  const currency =
    asString(assumptions?.baseCurrency) ?? asString(resultRecord.currency) ?? fallbackCurrency;

  let text = summary
    .replace(/^Deterministic financial analysis completed across/i, 'Financial analysis across')
    .replace(/\(OPTIMISTIC\)/g, '(Optimistic)')
    .replace(/\(PESSIMISTIC\)/g, '(Conservative)')
    .replace(/\(BASELINE\)/g, '(Baseline)')
    .replace(/\b(\d+)\s+([a-zA-Z-]+)\(s\)/g, (_m, countStr: string, word: string) => {
      const count = Number(countStr);
      return `${countStr} ${count === 1 ? word : `${word}s`}`;
    })
    .replace(/liquidity warning:\s*false/gi, 'no liquidity warning')
    .replace(/liquidity warning:\s*true/gi, 'liquidity warning active')
    .replace(/:\s*UNSUPPORTED\b/gi, ': unavailable')
    .replace(
      /\b([A-Z]{3}\s+)?(-?\d+\.\d{4})\b/g,
      (_m, existingCurr: string | undefined, amount: string) => {
        const prefix = existingCurr ? existingCurr.trim() : currency;
        return formatFourDecimalAmount(amount, prefix);
      },
    );

  const recommendations = Array.isArray(resultRecord.recommendations)
    ? resultRecord.recommendations
        .map((rec) => asString(asRecord(rec)?.action))
        .filter((action): action is string => Boolean(action))
    : [];

  if (recommendations.length > 0) {
    text = `${text}\n${recommendations.map((action) => `• ${action}`).join('\n')}`;
  }

  return text;
}

function extractSpecialistSummaries(synthesized: JsonRecord, payload: JsonRecord): string[] {
  const findings = Array.isArray(synthesized.specialistFindings)
    ? synthesized.specialistFindings
    : Array.isArray(payload.agentRuns)
      ? payload.agentRuns.map((run) => asRecord(run)?.outputPayload)
      : [];

  const detectedCurrency = detectBaseCurrency(findings);

  const summaries = findings.flatMap((finding) => {
    const record = asRecord(finding);
    if (!record) return [];
    const skillResults = Array.isArray(record.skillResults) ? record.skillResults : [];
    return skillResults.flatMap((result) => {
      const resultRecord = asRecord(result);
      const rawSummary = asString(resultRecord?.summary);
      if (!rawSummary || isOrchestrationLog(rawSummary)) return [];
      return [humanizeSkillSummary(rawSummary, resultRecord ?? {}, detectedCurrency)];
    });
  });

  return uniqueText(summaries);
}

function uniqueText(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeSourceKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function sourceLabel(key: string, count: number): string {
  const normalized = normalizeSourceKey(key);
  const known = sourceLabels[normalized];
  if (known) return count === 1 ? known[0] : known[1];

  const readable = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(?:record\s+)?ids?\b/gi, '')
    .replace(/\brecords?\b/gi, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return count === 1 ? `${readable || 'Source'} record` : `${readable || 'Source'} records`;
}

function formatSourceRecordCitations(sourceRecordIds: JsonRecord | null): string[] {
  if (!sourceRecordIds) return [];

  return Object.entries(sourceRecordIds).flatMap(([key, value]) => {
    const ids = Array.isArray(value) ? value.map(String).filter((id) => id.trim().length > 0) : [];
    if (ids.length === 0) return [];
    const label = sourceLabel(key, ids.length);
    const referenceLabel = ids.length === 1 ? 'Reference' : 'References';
    return [`${ids.length} ${label} · ${referenceLabel}: ${ids.join(', ')}`];
  });
}

function formatRawCitation(citation: string): string {
  const countOnly = /^([a-zA-Z][\w-]*):\s*(\d+)\s+records?$/i.exec(citation);
  if (countOnly) {
    const count = Number(countOnly[2]);
    return `${count} ${sourceLabel(countOnly[1], count)}`;
  }
  return citation;
}

function specialistNames(synthesized: JsonRecord, payload: JsonRecord): string[] {
  const candidates =
    asStringArray(synthesized.selectedSpecialistAgents).length > 0
      ? asStringArray(synthesized.selectedSpecialistAgents)
      : asStringArray(synthesized.executedAgents).length > 0
        ? asStringArray(synthesized.executedAgents)
        : Array.isArray(synthesized.specialistFindings)
          ? synthesized.specialistFindings
              .map((finding) => asString(asRecord(finding)?.agentType))
              .filter((name): name is string => Boolean(name))
          : asStringArray(payload.selectedAgents);

  return uniqueText(
    candidates.filter((name) => name !== 'VERIFIER_AI' && name !== 'SUPERVISOR_ORCHESTRATOR'),
  );
}

function executionStatus(
  payload: JsonRecord,
  synthesized: JsonRecord,
  specialistCount: number,
  failedCount: number,
  verifier: JsonRecord,
): Pick<AssistantExecutionDetails, 'label' | 'tone' | 'details'> {
  const status = String(payload.status ?? '').toUpperCase();
  const verificationStatus = String(payload.verificationStatus ?? verifier.verificationStatus ?? '')
    .replace(/-/g, '_')
    .toUpperCase();
  const verificationPassed = verifier.verificationPassed === true;
  const humanReviewRequired =
    payload.humanReviewRequired === true || synthesized.humanReviewRequired === true;
  const details: string[] = [];

  if (verifier.arithmeticVerified === true) details.push('Arithmetic checks passed');
  if (verifier.citationsVerified === true) details.push('Source references checked');
  if (humanReviewRequired) details.push('Human review required');
  if (failedCount > 0) details.push(`${failedCount} specialist checks did not complete`);

  if (status === 'FAILED' || status === 'ERROR') {
    return { label: 'Execution failed', tone: 'error', details };
  }
  if (failedCount > 0) {
    return {
      label: `Partial results · ${failedCount} specialist checks failed`,
      tone: 'warning',
      details,
    };
  }
  if (verificationPassed && verificationStatus === 'APPROVED') {
    const agentText =
      specialistCount === 1 ? '1 specialist agent' : `${specialistCount} specialist agents`;
    return {
      label: humanReviewRequired
        ? `Verified across ${agentText} · review required`
        : specialistCount > 0
          ? `Verified across ${agentText}`
          : 'Verified',
      tone: humanReviewRequired ? 'warning' : 'success',
      details,
    };
  }
  if (
    (typeof verifier.verificationPassed === 'boolean' && !verificationPassed) ||
    humanReviewRequired ||
    verificationStatus === 'REQUIRES_HUMAN_REVIEW'
  ) {
    details.push('Verification was not approved');
    return { label: 'Review required · verification not approved', tone: 'warning', details };
  }
  if (status === 'COMPLETED') {
    return {
      label: 'Completed · verification not confirmed',
      tone: 'neutral',
      details: [...details, 'No approved verification result was returned'],
    };
  }
  return {
    label: 'Response received · verification not confirmed',
    tone: 'neutral',
    details: [...details, 'No approved verification result was returned'],
  };
}

export function formatAssistantResponse(response: unknown): AssistantResponse {
  const envelope = asRecord(response) ?? {};
  const payload = asRecord(envelope.data) ?? envelope;
  const nestedData = asRecord(payload.data);
  const synthesized =
    asRecord(payload.synthesizedResult) ?? asRecord(envelope.synthesizedResult) ?? {};
  const verifier =
    asRecord(synthesized.verifierAudit) ??
    asRecord(payload.verifierReport) ??
    asRecord(envelope.verifierReport) ??
    {};

  const directAnswers = [
    asString(payload.answer),
    asString(nestedData?.answer),
    asString(envelope.answer),
  ].filter((answer): answer is string => typeof answer === 'string' && !isOrchestrationLog(answer));
  const specialistSummaries = extractSpecialistSummaries(synthesized, payload);
  const executiveSummary = asString(synthesized.executiveSummary);
  const answerCandidates = uniqueText([
    ...directAnswers,
    ...specialistSummaries,
    ...(executiveSummary && !isOrchestrationLog(executiveSummary) ? [executiveSummary] : []),
  ]);

  const sourceRecordIds =
    asRecord(synthesized.sourceRecordIds) ??
    asRecord(payload.sourceRecordIds) ??
    asRecord(envelope.sourceRecordIds);
  const citations = formatSourceRecordCitations(sourceRecordIds);
  const rawCitations = [
    ...asStringArray(payload.citations),
    ...asStringArray(nestedData?.citations),
    ...asStringArray(envelope.citations),
  ]
    .filter((citation) => !/^agents?:/i.test(citation))
    .map(formatRawCitation);
  const knownIds = new Set(
    Object.values(sourceRecordIds ?? {}).flatMap((ids) =>
      Array.isArray(ids) ? ids.map(String) : [],
    ),
  );
  const remainingCitations = rawCitations.filter(
    (citation) => !knownIds.has(citation) && !citations.includes(citation),
  );
  const countCitations = remainingCitations.filter((citation) => /^\d+\s/.test(citation));
  const directReferences = remainingCitations.filter((citation) => !/^\d+\s/.test(citation));
  const workflowStatus = executionStatus(
    payload,
    synthesized,
    specialistNames(synthesized, payload).length,
    Array.isArray(synthesized.failedAgents) ? synthesized.failedAgents.length : 0,
    verifier,
  );
  const workflowId = asString(payload.id) ?? asString(envelope.id);
  const latency = payload.durationMs ?? payload.latencyMs ?? nestedData?.latencyMs;
  const formulaVersion =
    asString(payload.formulaVersion) ??
    asString(nestedData?.formulaVersion) ??
    asString(envelope.formulaVersion);

  const rawAnswer =
    answerCandidates.join('\n\n') ||
    (String(payload.status ?? '').toUpperCase() === 'FAILED'
      ? 'The analysis did not complete. Review the execution status below.'
      : 'The workflow completed but did not return a financial summary.');

  return {
    answer: formatUserFacingText(rawAnswer),
    citations: uniqueText([
      ...citations,
      ...countCitations,
      ...(directReferences.length > 0 ? [`Source references: ${directReferences.join(', ')}`] : []),
    ]),
    execution: {
      ...workflowStatus,
      workflowId,
      latencyMs: typeof latency === 'number' && Number.isFinite(latency) ? latency : undefined,
      formulaVersion,
    },
  };
}
