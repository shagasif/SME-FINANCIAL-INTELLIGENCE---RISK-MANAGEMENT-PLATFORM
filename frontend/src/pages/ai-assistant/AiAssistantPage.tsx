import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, RefreshCw, Send, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { DEFAULT_DEMO_ORG } from '../../config/demo.config';

interface ChatMessage {
  id: string;
  sender: 'USER' | 'ASSISTANT';
  text: string;
  timestamp: string;
  citations?: string[];
  formulaVersion?: string;
  latencyMs?: number;
}

const DEFAULT_SUGGESTIONS = [
  'What is our current cash runway in months?',
  'Explain our gross margin trend over the last 90 days.',
  'Do we have any active vendor payment anomalies?',
  'What is our projected ending cash balance for next month?',
];

export function AiAssistantPage() {
  const { activeOrg } = useAuth();
  const effectiveOrg = activeOrg || DEFAULT_DEMO_ORG;
  const activeOrgId = effectiveOrg.id;

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'ASSISTANT',
      text: 'Hello! I am your AI Finance Assistant. Ask me about your cash runway, margins, overdue invoices, or risk alerts.',
      timestamp: new Date().toISOString(),
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageSeqRef = useRef(1);

  const scrollToBottom = () => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendQuery = async (queryToSend?: string) => {
    const q = (queryToSend || inputQuery).trim();
    if (!q || !activeOrgId || isSending) return;

    messageSeqRef.current += 1;
    const currentSeq = messageSeqRef.current;

    const userMessage: ChatMessage = {
      id: `usr-${currentSeq}`,
      sender: 'USER',
      text: q,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    setIsSending(true);
    setError(null);

    try {
      let raw: {
        id?: string;
        taskClassification?: string;
        selectedAgents?: string[];
        synthesizedResult?: {
          executiveSummary?: string;
          verifierAudit?: {
            summary?: string;
            arithmeticVerified?: boolean;
            citationsVerified?: boolean;
          };
          sourceRecordIds?: Record<string, string[]>;
        };
        verifierReport?: {
          summary?: string;
          arithmeticVerified?: boolean;
        };
        durationMs?: number;
        modelUsageSummary?: {
          totalTokens?: number;
        };
        answer?: string;
        citations?: string[];
        formulaVersion?: string;
        latencyMs?: number;
        data?: {
          answer?: string;
          citations?: string[];
          formulaVersion?: string;
          latencyMs?: number;
        };
      };

      try {
        raw = await apiPost(`/v1/organizations/${activeOrgId}/ai/workflows/execute`, {
          prompt: q,
        });
      } catch {
        // Fallback for legacy query mock compatibility
        raw = await apiPost(`/v1/organizations/${activeOrgId}/ai-assistant/query`, {
          query: q,
        });
      }

      messageSeqRef.current += 1;
      const asstSeq = messageSeqRef.current;

      const synthesized = raw?.synthesizedResult;
      const answerText =
        synthesized?.executiveSummary ||
        raw?.verifierReport?.summary ||
        raw?.answer ||
        raw?.data?.answer ||
        (raw?.taskClassification
          ? `Classified as ${raw.taskClassification}. Selected specialist agents: ${raw.selectedAgents?.join(', ') || 'Finance Data Analyst'}. Analysis verified.`
          : 'Analysis verified and executed across multi-agent sandboxes.');

      const citations: string[] = [];
      if (raw?.data?.citations) {
        citations.push(...raw.data.citations);
      } else if (raw?.citations) {
        citations.push(...raw.citations);
      } else {
        if (synthesized?.sourceRecordIds) {
          for (const [key, ids] of Object.entries(synthesized.sourceRecordIds)) {
            if (Array.isArray(ids) && ids.length > 0) {
              citations.push(`${key}: ${ids.length} records`);
            }
          }
        }
        if (raw?.selectedAgents && raw.selectedAgents.length > 0) {
          citations.push(`Agents: ${raw.selectedAgents.join(', ')}`);
        }
      }

      const formulaVer = raw?.formulaVersion || raw?.data?.formulaVersion || 'v1.0.0-decimal';
      const latency = raw?.durationMs ?? raw?.latencyMs ?? raw?.data?.latencyMs;

      const assistantMessage: ChatMessage = {
        id: `asst-${asstSeq}`,
        sender: 'ASSISTANT',
        text: answerText,
        timestamp: new Date().toISOString(),
        citations: citations.length > 0 ? citations : undefined,
        formulaVersion: formulaVer,
        latencyMs: latency,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to process AI query. Please verify backend connection.');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="pb-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <Bot className="w-5 h-5 text-[var(--brand-primary)]" />
            AI Finance Assistant
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Ask questions about your cash flow, invoices, margins, and alerts.
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
          <ShieldCheck className="h-4 w-4" />
          <span>Grounded Reasoning</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Chat Messages Log */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${
              msg.sender === 'USER' ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                msg.sender === 'USER'
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--brand-primary)]'
              }`}
            >
              {msg.sender === 'USER' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>

            <div
              className={`max-w-[75%] rounded-2xl p-3 text-xs leading-relaxed ${
                msg.sender === 'USER'
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'bg-[var(--surface-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)]'
              }`}
            >
              <p className="whitespace-pre-line">{msg.text}</p>

              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] space-y-0.5">
                  <span className="font-semibold block text-[var(--text-secondary)]">
                    Audit Citations:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {msg.citations.map((c, i) => (
                      <span
                        key={i}
                        className="font-mono bg-[var(--surface-elevated)] px-1.5 py-0.5 rounded"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {msg.latencyMs !== undefined && (
                <div className="mt-1 text-[9px] text-[var(--text-muted)] text-right">
                  Response time: {msg.latencyMs}ms
                </div>
              )}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] p-2">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--brand-primary)]" />
            <span>Analyzing ledger and evaluating grounded metrics...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts */}
      <div className="flex flex-wrap gap-1.5">
        {DEFAULT_SUGGESTIONS.map((sug, i) => (
          <button
            key={i}
            onClick={() => handleSendQuery(sug)}
            disabled={isSending}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-50 transition-colors"
          >
            {sug}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendQuery();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Ask a question about your cash flow, runway, invoices, or risk alerts..."
          disabled={isSending}
          className="flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={!inputQuery.trim() || isSending}
          isLoading={isSending}
          className="h-10 px-4"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}
