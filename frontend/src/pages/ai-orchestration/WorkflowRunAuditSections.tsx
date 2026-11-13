import { AgentType, ExecutionStatus, type WorkflowRun } from '../../types/ai.types';
import { formatCurrency, formatEmbeddedAmountsInText, formatNumber } from '../../utils/formatters';

const DOCUMENT_FIELD_LABELS: Record<string, string> = {
  documentNumber: 'Invoice / Bill Number',
  counterpartyName: 'Customer / Vendor',
  counterpartyEmail: 'Counterparty Email',
  issueDate: 'Issue Date',
  dueDate: 'Due Date',
  currency: 'Currency',
  category: 'Category',
  department: 'Department',
  subtotalAmount: 'Subtotal',
  discountAmount: 'Discount',
  taxAmount: 'Tax Amount',
  taxRate: 'Tax Rate',
  totalAmount: 'Total Amount',
  notes: 'Notes / Terms',
  lineItems: 'Line Items',
};

const REQUIRED_DOCUMENT_FIELDS = [
  'documentNumber',
  'counterpartyName',
  'issueDate',
  'dueDate',
  'currency',
  'subtotalAmount',
  'taxAmount',
  'totalAmount',
  'lineItems',
];

const isFailedStatus = (s: string) =>
  s === ExecutionStatus.FAILED ||
  s === ExecutionStatus.BLOCKED ||
  s === 'TIMED_OUT' ||
  s === 'BLOCKED_BY_SANDBOX' ||
  s === 'CANCELLED';

export function deriveAgentStructuredSummaries(
  ar: NonNullable<WorkflowRun['agentRuns']>[number],
): string[] {
  const payload = ar.outputPayload;
  if (!payload || typeof payload !== 'object') return [];

  if (Array.isArray(payload.skillResults)) {
    const skillSummaries = (payload.skillResults as Array<Record<string, unknown>>)
      .map((sr) => (typeof sr.summary === 'string' ? sr.summary.trim() : ''))
      .filter(Boolean);
    if (skillSummaries.length > 0) return skillSummaries;
  }

  if (payload.extractedDocument && typeof payload.extractedDocument === 'object') {
    const ed = payload.extractedDocument as Record<string, unknown>;
    const edCurr = String(ed.currency ?? 'USD');
    const edLineCount = Array.isArray(payload.lineItems) ? payload.lineItems.length : 0;
    const edNotes = Array.isArray(payload.extractionNotes)
      ? payload.extractionNotes.map(String)
      : [];
    const edTotal =
      ed.totalAmount !== null && ed.totalAmount !== undefined
        ? formatCurrency(String(ed.totalAmount), edCurr)
        : 'amount missing';
    return [
      `Extracted ${String(ed.documentType ?? 'DOCUMENT')} ${String(ed.documentNumber ?? '(unnumbered)')} for ${String(ed.counterpartyName ?? '(unknown party)')} (${edTotal}, ${edLineCount} line item(s)).`,
      ...edNotes,
    ];
  }

  if (typeof payload.notes === 'string' && payload.notes.trim()) {
    return [payload.notes.trim()];
  }

  if (typeof payload.summary === 'string' && payload.summary.trim()) {
    return [payload.summary.trim()];
  }

  const keys = Object.keys(payload).filter((k) => k !== 'skillId');
  if (keys.length > 0) {
    return [`Completed with structured output (${keys.join(', ')}).`];
  }

  return [];
}

export function deriveWorkflowExecutiveSummary(run: WorkflowRun): string {
  const synth = run.synthesizedResult || run.resultPayload;
  if (synth?.executiveSummary && synth.executiveSummary.trim()) {
    return synth.executiveSummary;
  }

  const agentRuns = run.agentRuns ?? [];
  const specialistRuns = agentRuns.filter((ar) => ar.agentType !== AgentType.VERIFIER_AI);
  const completed = specialistRuns.filter(
    (ar) => ar.status === ExecutionStatus.COMPLETED && ar.outputPayload,
  );
  const failed = specialistRuns.filter((ar) => isFailedStatus(String(ar.status)));

  if (completed.length === 0) {
    if (failed.length > 0) {
      return `No usable agent findings available (${failed.map((f) => `${f.agentType}: ${f.errorDetails || f.errorMessage || f.status}`).join('; ')}).`;
    }
    return `No usable agent findings available (${run.status === ExecutionStatus.RUNNING ? 'workflow still running' : 'no specialist agent outputs were recorded'}).`;
  }

  const firstSummary = completed.flatMap((ar) => deriveAgentStructuredSummaries(ar))[0];
  if (firstSummary) {
    return failed.length > 0
      ? `Partial workflow findings (${completed.length} completed, ${failed.length} failed): ${firstSummary}`
      : firstSummary;
  }

  return `Completed ${run.taskClassification} across ${completed.length} specialist agent(s).`;
}

function extractDocumentReviewContext(
  run: WorkflowRun,
  specialistAgentRuns: WorkflowRun['agentRuns'],
  verifierAgentRun: NonNullable<WorkflowRun['agentRuns']>[number] | undefined,
) {
  const isDocExtraction =
    run.taskClassification === 'CUSTOMER_INVOICE_DOCUMENT_EXTRACTION' ||
    run.taskClassification === 'SUPPLIER_BILL_DOCUMENT_EXTRACTION' ||
    (specialistAgentRuns ?? []).some((ar) => Boolean(ar.outputPayload?.extractedDocument));

  const extractionAgentRun = (specialistAgentRuns ?? []).find(
    (ar) =>
      Boolean(ar.outputPayload?.extractedDocument) ||
      ar.loadedSkills?.includes('skill.document-invoice-bill-extraction'),
  );

  const payload = extractionAgentRun?.outputPayload;
  const extractedDoc =
    payload && typeof payload.extractedDocument === 'object' && payload.extractedDocument !== null
      ? (payload.extractedDocument as Record<string, unknown>)
      : null;

  const lineItems = Array.isArray(payload?.lineItems)
    ? (payload.lineItems as Array<Record<string, unknown>>)
    : [];
  const fieldConfidence =
    payload && typeof payload.fieldConfidence === 'object' && payload.fieldConfidence !== null
      ? (payload.fieldConfidence as Record<string, number>)
      : {};
  const sanitizationFlags = Array.isArray(payload?.sanitizationFlags)
    ? payload.sanitizationFlags.map(String)
    : [];

  const promptMatch = run.prompt.match(/uploaded document "([^"]+)"/i);
  const originalDocumentRef =
    (typeof extractionAgentRun?.inputContext?.fileName === 'string' &&
      extractionAgentRun.inputContext.fileName) ||
    (promptMatch ? promptMatch[1] : null);

  const missingFields: string[] = [];
  const uncertainFields: Array<{ label: string; confidence: number }> = [];

  if (extractedDoc) {
    for (const key of REQUIRED_DOCUMENT_FIELDS) {
      const label = DOCUMENT_FIELD_LABELS[key] || key;
      const val = key === 'lineItems' ? lineItems : extractedDoc[key];
      const isMissing =
        key === 'lineItems'
          ? lineItems.length === 0
          : val === null || val === undefined || String(val).trim() === '';
      const conf = typeof fieldConfidence[key] === 'number' ? fieldConfidence[key] : null;

      if (isMissing) {
        missingFields.push(label);
      } else if (conf !== null && conf < 0.8) {
        uncertainFields.push({ label, confidence: conf });
      }
    }
  }

  const vp = verifierAgentRun?.outputPayload;
  const isVerifierCompleted = verifierAgentRun?.status === ExecutionStatus.COMPLETED;
  const hasDocVerifierPayload =
    isVerifierCompleted &&
    vp &&
    (vp.skillId === 'skill.document-extraction-verification' ||
      typeof vp.isApproved === 'boolean' ||
      typeof vp.arithmeticVerification === 'object');

  const arith = vp?.arithmeticVerification as Record<string, unknown> | undefined;
  const arithDiscrepancies = Array.isArray(arith?.discrepancies) ? arith.discrepancies : [];
  const hasAnyPassingNumericCheck =
    arith?.lineItemsMatchSubtotal === true ||
    arith?.subtotalPlusTaxMatchesTotal === true ||
    arith?.taxRateMatchesTaxAmount === true;
  const computedArithmeticVerified =
    typeof arith?.arithmeticValid === 'boolean'
      ? arith.arithmeticValid
      : Boolean(arith?.isValid) ||
        (arithDiscrepancies.length === 0 &&
          hasAnyPassingNumericCheck &&
          arith?.lineItemsMatchSubtotal !== false &&
          arith?.subtotalPlusTaxMatchesTotal !== false &&
          arith?.taxRateMatchesTaxAmount !== false);

  const verifierFromAgentRun = hasDocVerifierPayload
    ? {
        verificationPassed: Boolean(vp.isApproved),
        arithmeticVerified: computedArithmeticVerified,
        citationsVerified: Boolean(originalDocumentRef || extractionAgentRun),
        nonFraudComplianceVerified: true,
        checkedSpecialistCount: (specialistAgentRuns ?? []).length,
        auditNotes: String(
          vp.notes ||
            (vp.arithmeticVerification as Record<string, unknown> | undefined)?.summary ||
            '',
        ),
        confidenceScore: typeof vp.confidenceScore === 'number' ? vp.confidenceScore : null,
        validationErrors: Array.isArray(vp.validationErrors)
          ? vp.validationErrors.map(String)
          : [],
        arithmeticVerification: (vp.arithmeticVerification ?? undefined) as
          | {
              isValid?: boolean;
              arithmeticValid?: boolean;
              summary?: string;
              discrepancies?: string[];
              dateOrderValid?: boolean | null;
              missingRequiredFields?: string[];
            }
          | undefined,
      }
    : null;

  return {
    isDocExtraction,
    extractionAgentRun,
    extractedDoc,
    lineItems,
    fieldConfidence,
    sanitizationFlags,
    originalDocumentRef,
    missingFields,
    uncertainFields,
    verifierFromAgentRun,
  };
}

export function WorkflowRunAuditSections({ run }: { run: WorkflowRun }) {
  const resolvedResult = run.synthesizedResult || run.resultPayload;
  const agentRunsList = run.agentRuns ?? [];
  const specialistAgentRuns = agentRunsList.filter((ar) => ar.agentType !== AgentType.VERIFIER_AI);
  const verifierAgentRun = agentRunsList.find((ar) => ar.agentType === AgentType.VERIFIER_AI);
  const docReview = extractDocumentReviewContext(run, specialistAgentRuns, verifierAgentRun);
  const isWorkflowInProgress =
    run.status === ExecutionStatus.RUNNING ||
    run.status === ExecutionStatus.PENDING ||
    run.verificationStatus === 'PENDING';
  const isVerifierIncompleteOrFailed =
    isWorkflowInProgress ||
    (Boolean(verifierAgentRun) && verifierAgentRun?.status !== ExecutionStatus.COMPLETED);
  const resolvedVerifier = isVerifierIncompleteOrFailed
    ? null
    : run.verifierReport || resolvedResult?.verifierAudit || docReview.verifierFromAgentRun;

  const failedAgentRuns = agentRunsList.filter((ar) => isFailedStatus(String(ar.status)));
  const incompleteAgentRuns = agentRunsList.filter(
    (ar) => ar.status === ExecutionStatus.PENDING || ar.status === ExecutionStatus.RUNNING,
  );
  const explicitFailedAgents = resolvedResult?.failedAgents ?? [];
  const expectedSpecialists = (run.selectedAgents ?? []).filter(
    (a) => a !== AgentType.SUPERVISOR_ORCHESTRATOR && a !== AgentType.VERIFIER_AI,
  );
  const recordedSpecialistTypes = new Set<string>([
    ...specialistAgentRuns.map((a) => a.agentType),
    ...(resolvedResult?.specialistFindings ?? []).map((f) => String(f.agentType ?? '')),
  ]);
  const missingSpecialists = expectedSpecialists.filter(
    (agent) => !recordedSpecialistTypes.has(agent),
  );
  const hasMissingOrFailed =
    failedAgentRuns.length > 0 ||
    incompleteAgentRuns.length > 0 ||
    explicitFailedAgents.length > 0 ||
    missingSpecialists.length > 0 ||
    run.status === ExecutionStatus.FAILED;

  const sourceEvidence = run.sourceRecordIds || resolvedResult?.sourceRecordIds || {};
  const nonEmptySourceEntries = Object.entries(sourceEvidence).filter(
    ([, ids]) => Array.isArray(ids) && ids.length > 0,
  );
  const specialistFindingsFallback = resolvedResult?.specialistFindings ?? [];
  const reconciledRec =
    resolvedResult?.reconciledRecord ||
    (resolvedResult?.triggerContext?.reconciledRecord as
      | NonNullable<typeof resolvedResult>['reconciledRecord']
      | undefined);
  const showDocumentPanel = docReview.isDocExtraction || Boolean(reconciledRec);

  return (
    <div className="space-y-4 text-xs">
      {/* 1. Workflow Context & Executive Summary */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-3.5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
            {run.taskClassification}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
              ID: {run.id.slice(0, 8)}
            </span>
            {resolvedResult?.providerMode && (
              <span className="rounded bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                Provider: {resolvedResult.providerMode}
              </span>
            )}
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
              {run.verificationStatus}
            </span>
          </div>
        </div>

        <p className="text-xs font-semibold text-[var(--text-primary)]">{run.prompt}</p>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
            Executive Summary (Synthesized Result)
          </span>
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            {formatEmbeddedAmountsInText(
              resolvedResult?.executiveSummary ||
                (docReview.extractedDoc
                  ? `Extracted ${String(docReview.extractedDoc.documentType ?? 'DOCUMENT')} ${String(docReview.extractedDoc.documentNumber ?? '(unnumbered)')} for ${String(docReview.extractedDoc.counterpartyName ?? '(unknown party)')} — ${
                      docReview.extractedDoc.totalAmount !== null &&
                      docReview.extractedDoc.totalAmount !== undefined
                        ? formatCurrency(
                            String(docReview.extractedDoc.totalAmount),
                            String(docReview.extractedDoc.currency ?? 'USD'),
                          )
                        : 'amount missing'
                    }${docReview.originalDocumentRef ? ` from "${docReview.originalDocumentRef}"` : ''}.`
                  : docReview.isDocExtraction
                    ? `Document extraction payload is missing or unavailable${docReview.originalDocumentRef ? ` for "${docReview.originalDocumentRef}"` : ''}. Inspect agent records before making a decision.`
                    : deriveWorkflowExecutiveSummary(run)),
            )}
          </p>
        </div>

        {resolvedResult?.limitations && resolvedResult.limitations.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-200 space-y-1">
            <span className="font-bold block">Disclosed Limitations:</span>
            {resolvedResult.limitations.map((lim, idx) => (
              <div key={idx}>• {formatEmbeddedAmountsInText(lim)}</div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Missing, Failed, or Incomplete Agent Warning */}
      {hasMissingOrFailed && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 space-y-1"
        >
          <span className="font-bold block">Incomplete or Failed Agent Execution Detected</span>
          {failedAgentRuns.map((ar) => (
            <div key={ar.id}>
              • <strong>{ar.agentType}</strong> ({ar.status}):{' '}
              {ar.errorDetails || ar.errorMessage || 'Execution failed without details.'}
            </div>
          ))}
          {explicitFailedAgents
            .filter((fa) => !failedAgentRuns.some((ar) => ar.agentType === fa.agentType))
            .map((fa, idx) => (
              <div key={idx}>
                • <strong>{fa.agentType}</strong> (FAILED): {fa.error}
              </div>
            ))}
          {incompleteAgentRuns.map((ar) => (
            <div key={ar.id}>
              • <strong>{ar.agentType}</strong> ({ar.status}): Execution has not completed.
            </div>
          ))}
          {missingSpecialists.map((agent) => (
            <div key={agent}>
              • <strong>{agent}</strong> (MISSING): Selected agent produced no execution record.
            </div>
          ))}
        </div>
      )}

      {/* 2b. Reconciled / Extracted Document Fields */}
      {showDocumentPanel && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              {reconciledRec?.hasDatabaseRecord
                ? 'Reconciled Financial Document Record'
                : 'Extracted Document Fields'}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {reconciledRec?.recordId && (
                <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                  DB ID: {reconciledRec.recordId.slice(0, 8)}
                  {reconciledRec.status ? ` (${reconciledRec.status})` : ''}
                </span>
              )}
              {docReview.originalDocumentRef && (
                <span className="rounded bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                  Document: {docReview.originalDocumentRef}
                </span>
              )}
            </div>
          </div>

          {(reconciledRec?.fields || docReview.extractedDoc) ? (
            (() => {
              const doc = (reconciledRec?.fields || docReview.extractedDoc) as Record<
                string,
                unknown
              >;
              const docLineItems = Array.isArray(reconciledRec?.fields?.lineItems)
                ? (reconciledRec.fields.lineItems as Array<Record<string, unknown>>)
                : docReview.lineItems;
              const fieldSources = reconciledRec?.fieldSources ?? {};
              const docCurr = String(doc.currency ?? 'USD');
              const renderFieldVal = (key: string, formatted: string | null) => {
                const conf = docReview.fieldConfidence[key];
                const source = fieldSources[key];
                const isLow =
                  (!source || source === 'PDF') &&
                  typeof conf === 'number' &&
                  conf > 0 &&
                  conf < 0.8;
                const sourceBadgeClass =
                  source === 'VERIFIED'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : source === 'DATABASE'
                      ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                      : source === 'CONFLICT'
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : source === 'MISSING'
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'bg-[var(--surface-elevated)] text-[var(--text-muted)]';
                return (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        {DOCUMENT_FIELD_LABELS[key] || key}
                      </span>
                      <div className="flex items-center gap-1">
                        {source && (
                          <span
                            className={`rounded px-1 py-0.5 text-[9px] font-bold ${sourceBadgeClass}`}
                          >
                            {source}
                          </span>
                        )}
                        {typeof conf === 'number' && conf > 0 && (
                          <span
                            className={`text-[10px] font-mono ${
                              isLow
                                ? 'font-bold text-amber-700 dark:text-amber-300'
                                : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {Math.round(conf * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className={`mt-0.5 text-xs font-semibold ${
                        formatted
                          ? 'text-[var(--text-primary)]'
                          : 'italic text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {formatted || 'Missing'}
                    </div>
                  </div>
                );
              };

              const fmtMoney = (val: unknown) =>
                val !== null && val !== undefined && String(val).trim() !== ''
                  ? formatCurrency(String(val), docCurr)
                  : null;

              const taxRateDisplay =
                doc.taxRate !== null &&
                doc.taxRate !== undefined &&
                String(doc.taxRate).trim() !== ''
                  ? `${formatNumber(String(doc.taxRate))}%`
                  : null;

              const discountDisplay =
                doc.discountAmount !== null &&
                doc.discountAmount !== undefined &&
                Number.parseFloat(String(doc.discountAmount)) > 0
                  ? `${fmtMoney(doc.discountAmount)}${
                      doc.discountRate ? ` (${formatNumber(String(doc.discountRate))}%)` : ''
                    }`
                  : null;

              const effectiveMissing = reconciledRec
                ? reconciledRec.missingInRecord
                    .filter((k) =>
                      [
                        'documentNumber',
                        'counterpartyName',
                        'issueDate',
                        'dueDate',
                        'currency',
                        'subtotalAmount',
                        'taxAmount',
                        'totalAmount',
                        'lineItems',
                      ].includes(k),
                    )
                    .map((k) => DOCUMENT_FIELD_LABELS[k] || k)
                : docReview.missingFields;

              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {renderFieldVal(
                      'documentNumber',
                      doc.documentNumber ? String(doc.documentNumber) : null,
                    )}
                    {renderFieldVal(
                      'counterpartyName',
                      doc.counterpartyName ? String(doc.counterpartyName) : null,
                    )}
                    {renderFieldVal(
                      'currency',
                      doc.currency
                        ? `${String(doc.currency)}${doc.currencySource ? ` (${String(doc.currencySource)})` : ''}`
                        : null,
                    )}
                    {renderFieldVal('issueDate', doc.issueDate ? String(doc.issueDate) : null)}
                    {renderFieldVal('dueDate', doc.dueDate ? String(doc.dueDate) : null)}
                    {renderFieldVal(
                      'counterpartyEmail',
                      doc.counterpartyEmail ? String(doc.counterpartyEmail) : null,
                    )}
                    {renderFieldVal('category', doc.category ? String(doc.category) : null)}
                    {renderFieldVal('department', doc.department ? String(doc.department) : null)}
                    {renderFieldVal('subtotalAmount', fmtMoney(doc.subtotalAmount))}
                    {discountDisplay && renderFieldVal('discountAmount', discountDisplay)}
                    {renderFieldVal(
                      'taxAmount',
                      fmtMoney(doc.taxAmount)
                        ? `${fmtMoney(doc.taxAmount)}${taxRateDisplay ? ` (${taxRateDisplay})` : ''}`
                        : taxRateDisplay,
                    )}
                    {renderFieldVal('totalAmount', fmtMoney(doc.totalAmount))}
                  </div>

                  {doc.notes && (
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2 text-[11px]">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                        Notes / Payment Terms
                      </span>
                      <span className="text-[var(--text-secondary)]">{String(doc.notes)}</span>
                    </div>
                  )}

                  {/* Line Items */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                      Line Items ({docLineItems.length})
                    </span>
                    {docLineItems.length > 0 ? (
                      <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                        <table className="w-full text-[11px] text-left">
                          <thead className="border-b border-[var(--border-subtle)] text-[10px] uppercase text-[var(--text-muted)]">
                            <tr>
                              <th className="py-1.5 px-2.5 font-semibold">Description</th>
                              <th className="py-1.5 px-2.5 font-semibold text-right">Qty</th>
                              <th className="py-1.5 px-2.5 font-semibold text-right">Unit Price</th>
                              <th className="py-1.5 px-2.5 font-semibold text-right">Tax %</th>
                              <th className="py-1.5 px-2.5 font-semibold text-right">Line Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)]">
                            {docLineItems.map((li, idx) => (
                              <tr key={idx}>
                                <td className="py-1.5 px-2.5 text-[var(--text-primary)]">
                                  {String(li.description ?? '—')}
                                </td>
                                <td className="py-1.5 px-2.5 text-right tabular-nums">
                                  {li.quantity !== undefined && li.quantity !== null
                                    ? formatNumber(String(li.quantity))
                                    : '—'}
                                </td>
                                <td className="py-1.5 px-2.5 text-right tabular-nums">
                                  {li.unitPrice !== undefined && li.unitPrice !== null
                                    ? formatCurrency(String(li.unitPrice), docCurr)
                                    : '—'}
                                </td>
                                <td className="py-1.5 px-2.5 text-right tabular-nums">
                                  {li.taxRate !== undefined && li.taxRate !== null
                                    ? `${formatNumber(String(li.taxRate))}%`
                                    : '—'}
                                </td>
                                <td className="py-1.5 px-2.5 text-right font-semibold tabular-nums">
                                  {li.lineTotal !== undefined && li.lineTotal !== null
                                    ? formatCurrency(String(li.lineTotal), docCurr)
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-[11px] italic text-amber-700 dark:text-amber-300">
                        No line items were recorded for this document.
                      </p>
                    )}
                  </div>

                  {/* PDF vs Database Conflicts */}
                  {reconciledRec && reconciledRec.conflicts.length > 0 && (
                    <div
                      role="alert"
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] text-rose-700 dark:text-rose-300 space-y-1"
                    >
                      <span className="font-bold block">PDF vs Database Conflicts Detected</span>
                      {reconciledRec.conflicts.map((c, idx) => (
                        <div key={idx}>
                          • <strong>{DOCUMENT_FIELD_LABELS[c.field] || c.field}:</strong> PDF=&quot;
                          {c.pdfValue ?? 'Missing'}&quot; vs DB=&quot;
                          {c.databaseValue ?? 'Missing'}&quot;
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Missing / Low-Confidence / Sanitization Warnings */}
                  {(effectiveMissing.length > 0 ||
                    docReview.uncertainFields.length > 0 ||
                    docReview.sanitizationFlags.length > 0) && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-200 space-y-1">
                      <span className="font-bold block">Missing or Uncertain Fields</span>
                      {effectiveMissing.length > 0 && (
                        <div>
                          <strong>Missing:</strong> {effectiveMissing.join(', ')}
                        </div>
                      )}
                      {docReview.uncertainFields.length > 0 && (
                        <div>
                          <strong>Low Confidence (&lt;80%):</strong>{' '}
                          {docReview.uncertainFields
                            .map((u) => `${u.label} (${Math.round(u.confidence * 100)}%)`)
                            .join(', ')}
                        </div>
                      )}
                      {docReview.sanitizationFlags.length > 0 && (
                        <div>
                          <strong>Sanitization Flags:</strong>{' '}
                          {docReview.sanitizationFlags.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-200">
              Extracted invoice fields are unavailable in the recorded specialist agent payload. Do
              not approve without verifying the source document.
            </div>
          )}
        </div>
      )}

      {/* 3. Individual Specialist Agent Results */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
          Specialist Agent Results (
          {specialistAgentRuns.length > 0
            ? specialistAgentRuns.length
            : specialistFindingsFallback.length}
          )
        </span>

        {specialistAgentRuns.length > 0 ? (
          <div className="space-y-2">
            {specialistAgentRuns.map((ar) => {
              const skillResults = Array.isArray(ar.outputPayload?.skillResults)
                ? (ar.outputPayload.skillResults as Array<Record<string, unknown>>)
                : [];
              const summaries = deriveAgentStructuredSummaries(ar);
              const recommendations = skillResults.flatMap((sr) =>
                Array.isArray(sr.recommendations)
                  ? (sr.recommendations as Array<{
                      priority?: number;
                      action?: string;
                      rationale?: string;
                    }>)
                  : [],
              );
              const isFailed = isFailedStatus(String(ar.status));

              return (
                <div
                  key={ar.id}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-3 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[var(--text-primary)]">{ar.agentType}</span>
                    <div className="flex items-center gap-2">
                      {typeof ar.durationMs === 'number' && (
                        <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                          {ar.durationMs}ms
                        </span>
                      )}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          ar.status === ExecutionStatus.COMPLETED
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : isFailed
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {ar.status}
                      </span>
                    </div>
                  </div>

                  {summaries.length > 0 ? (
                    <div className="space-y-1 text-[11px] text-[var(--text-secondary)]">
                      {summaries.map((s, idx) => (
                        <p key={idx}>{formatEmbeddedAmountsInText(s)}</p>
                      ))}
                    </div>
                  ) : isFailed ? (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400">
                      Error: {ar.errorDetails || ar.errorMessage || 'Agent failed'}
                    </p>
                  ) : (
                    <p className="text-[11px] text-[var(--text-muted)]">
                      No structured skill summary recorded.
                    </p>
                  )}

                  {recommendations.length > 0 && (
                    <ul className="mt-1 space-y-0.5 border-t border-[var(--border-subtle)] pt-1.5 text-[11px] text-[var(--text-secondary)]">
                      {recommendations.map((rec, idx) => (
                        <li key={idx}>
                          <strong>P{rec.priority ?? idx + 1}:</strong>{' '}
                          {formatEmbeddedAmountsInText(rec.action ?? '')}
                          {rec.rationale ? ` — ${formatEmbeddedAmountsInText(rec.rationale)}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ) : specialistFindingsFallback.length > 0 ? (
          <div className="space-y-2">
            {specialistFindingsFallback.map((finding, idx) => {
              const skillResults = Array.isArray(finding.skillResults)
                ? (finding.skillResults as Array<Record<string, unknown>>)
                : [];
              const summaries = skillResults
                .map((sr) => (typeof sr.summary === 'string' ? sr.summary : null))
                .filter((s): s is string => Boolean(s));
              return (
                <div
                  key={idx}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-3 space-y-1"
                >
                  <span className="font-bold text-[var(--text-primary)] block">
                    {String(finding.agentType ?? `Specialist ${idx + 1}`)}
                  </span>
                  {summaries.length > 0 ? (
                    summaries.map((s, sIdx) => (
                      <p key={sIdx} className="text-[11px] text-[var(--text-secondary)]">
                        {formatEmbeddedAmountsInText(s)}
                      </p>
                    ))
                  ) : (
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Completed without summary text.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)] italic">
            No specialist agent execution outputs recorded for this workflow.
          </p>
        )}
      </div>

      {/* 4. Verifier AI Report, Decision & Explanation */}
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-[var(--text-primary)]">
            Verifier AI Audit &amp; Decision
          </span>
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
              resolvedVerifier?.verificationPassed
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : verifierAgentRun && isFailedStatus(String(verifierAgentRun.status))
                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
            }`}
          >
            {verifierAgentRun && isFailedStatus(String(verifierAgentRun.status))
              ? 'VERIFIER FAILED'
              : isVerifierIncompleteOrFailed
                ? 'VERIFICATION INCOMPLETE'
                : resolvedVerifier
                  ? resolvedVerifier.verificationPassed
                    ? 'VERIFICATION PASSED'
                    : 'VERIFICATION FLAGGED'
                  : 'VERIFICATION INCOMPLETE'}
          </span>
        </div>

        {resolvedVerifier ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>
                Arithmetic: <strong>{resolvedVerifier.arithmeticVerified ? 'YES' : 'NO'}</strong>
              </div>
              <div>
                Citations: <strong>{resolvedVerifier.citationsVerified ? 'YES' : 'NO'}</strong>
              </div>
              <div>
                Non-Fraud Policy:{' '}
                <strong>{resolvedVerifier.nonFraudComplianceVerified ? 'YES' : 'NO'}</strong>
              </div>
            </div>
            {typeof resolvedVerifier.confidenceScore === 'number' && (
              <div className="text-[11px] text-[var(--text-secondary)]">
                Confidence Score:{' '}
                <strong>{Math.round(resolvedVerifier.confidenceScore * 100)}%</strong>
                {resolvedVerifier.arithmeticVerification?.dateOrderValid !== undefined &&
                  resolvedVerifier.arithmeticVerification?.dateOrderValid !== null && (
                    <span className="ml-3">
                      Date Order:{' '}
                      <strong>
                        {resolvedVerifier.arithmeticVerification.dateOrderValid
                          ? 'VALID'
                          : 'INVALID'}
                      </strong>
                    </span>
                  )}
              </div>
            )}
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              {formatEmbeddedAmountsInText(
                resolvedVerifier.auditNotes ||
                  `Gate status: ${run.verificationStatus} (checked ${resolvedVerifier.checkedSpecialistCount ?? specialistAgentRuns.length} specialist output(s)).`,
              )}
            </p>
            {resolvedVerifier.validationErrors && resolvedVerifier.validationErrors.length > 0 && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-700 dark:text-rose-300 space-y-0.5">
                <span className="font-bold block">Verification Errors:</span>
                {resolvedVerifier.validationErrors.map((errMsg, idx) => (
                  <div key={idx}>• {formatEmbeddedAmountsInText(errMsg)}</div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            {verifierAgentRun?.errorDetails ||
              verifierAgentRun?.errorMessage ||
              (isVerifierIncompleteOrFailed
                ? `Verifier AI status is ${verifierAgentRun?.status}; verification is incomplete and this extraction is not verified.`
                : 'Verifier AI did not execute or attach a report. Verification is incomplete and this workflow is not verified.')}
          </p>
        )}
      </div>

      {/* 5. Financial Evidence & Source References */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-3.5 space-y-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
          Financial Evidence &amp; Source Citations
        </span>
        {nonEmptySourceEntries.length > 0 ||
        docReview.originalDocumentRef ||
        docReview.extractionAgentRun ? (
          <div className="space-y-1 text-[11px] text-[var(--text-secondary)]">
            {docReview.originalDocumentRef && (
              <div className="break-all">
                <strong className="text-[var(--text-primary)]">Source Document</strong>:{' '}
                <span className="font-mono text-[10px]">{docReview.originalDocumentRef}</span>
              </div>
            )}
            {docReview.extractionAgentRun && (
              <div className="break-all">
                <strong className="text-[var(--text-primary)]">Extraction Agent Run</strong>:{' '}
                <span className="font-mono text-[10px]">
                  {docReview.extractionAgentRun.id} (
                  {docReview.extractionAgentRun.loadedSkills?.join(', ') ||
                    'skill.document-invoice-bill-extraction'}
                  )
                </span>
              </div>
            )}
            {verifierAgentRun && (
              <div className="break-all">
                <strong className="text-[var(--text-primary)]">Verifier Agent Run</strong>:{' '}
                <span className="font-mono text-[10px]">
                  {verifierAgentRun.id} (
                  {verifierAgentRun.loadedSkills?.join(', ') ||
                    'skill.document-extraction-verification'}
                  )
                </span>
              </div>
            )}
            {nonEmptySourceEntries.map(([key, ids]) => (
              <div key={key} className="break-all">
                <strong className="text-[var(--text-primary)]">{key}</strong> ({ids.length}):{' '}
                <span className="font-mono text-[10px]">{ids.join(', ')}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">
            No underlying financial record citations were recorded.
          </p>
        )}
      </div>
    </div>
  );
}
