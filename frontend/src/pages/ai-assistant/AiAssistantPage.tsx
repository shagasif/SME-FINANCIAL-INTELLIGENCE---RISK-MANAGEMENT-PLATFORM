import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Send,
  User,
  X,
} from '../../components/ui/MaterialSymbol';
import { useAuth } from '../../context/useAuth';
import { apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { DEFAULT_DEMO_ORG } from '../../config/demo.config';
import {
  formatAssistantResponse,
  type AssistantExecutionDetails,
} from '../../utils/aiAssistantResponse';

interface ChatMessage {
  id: string;
  sender: 'USER' | 'ASSISTANT';
  text: string;
  timestamp: string;
  citations?: string[];
  execution?: AssistantExecutionDetails;
}

const DEFAULT_SUGGESTIONS = [
  'What is our current cash runway in months?',
  'Explain our gross margin trend over the last 90 days.',
  'Do we have any active vendor payment anomalies?',
  'What is our projected ending cash balance for next month?',
];

export interface AiAssistantPageProps {
  compact?: boolean;
  onClose?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function AiAssistantPage({
  compact = false,
  onClose,
  isExpanded = false,
  onToggleExpand,
}: AiAssistantPageProps) {
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

  const startNewConversation = () => {
    if (isSending) return;
    setMessages([
      {
        id: 'welcome',
        sender: 'ASSISTANT',
        text: 'Hello! I am your AI Finance Assistant. Ask me about your cash runway, margins, overdue invoices, or risk alerts.',
        timestamp: new Date().toISOString(),
      },
    ]);
    setInputQuery('');
    setError(null);
    messageSeqRef.current = 1;
  };

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
      let raw: unknown;

      const recentHistory = messages.slice(-6).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      try {
        raw = await apiPost<unknown>(`/v1/organizations/${activeOrgId}/ai/workflows/execute`, {
          prompt: q,
          history: recentHistory,
        });
      } catch (workflowError) {
        if (
          !(workflowError instanceof ApiClientError) ||
          (workflowError.statusCode !== 404 && workflowError.statusCode !== 405)
        ) {
          throw workflowError;
        }
        raw = await apiPost<unknown>(`/v1/organizations/${activeOrgId}/ai-assistant/query`, {
          query: q,
        });
      }

      messageSeqRef.current += 1;
      const asstSeq = messageSeqRef.current;

      const assistantReply = formatAssistantResponse(raw);

      const assistantMessage: ChatMessage = {
        id: `asst-${asstSeq}`,
        sender: 'ASSISTANT',
        text: assistantReply.answer,
        timestamp: new Date().toISOString(),
        citations: assistantReply.citations,
        execution: assistantReply.execution,
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
    <div
      className={
        compact
          ? 'flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4'
          : 'space-y-4 max-w-4xl mx-auto flex flex-col h-[calc(100vh-140px)]'
      }
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
        <div>
          <h1
            id="ai-assistant-title"
            className={`flex items-center gap-2 font-bold tracking-tight text-[var(--text-primary)] ${
              compact ? 'text-base' : 'text-xl'
            }`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
              <span
                data-testid="assistant-heading-dot"
                className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--brand-primary)] shadow-[0_0_10px_var(--brand-primary)]"
              />
            </span>
            AI Finance Assistant
          </h1>
          <p
            className={`mt-0.5 text-xs text-[var(--text-muted)] ${compact ? 'hidden sm:block' : ''}`}
          >
            Ask questions about your cash flow, invoices, margins, and alerts.
          </p>
        </div>

        {(compact || onToggleExpand || onClose) && (
          <div className="flex shrink-0 items-center gap-1">
            {compact && (
              <button
                type="button"
                onClick={startNewConversation}
                disabled={isSending}
                className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                aria-label="New conversation"
                title="New conversation"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                aria-label={isExpanded ? 'Restore chat size' : 'Expand chat to full screen'}
                title={isExpanded ? 'Restore chat size' : 'Expand chat to full screen'}
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                aria-label="Close AI Finance Assistant"
                title="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Chat Messages Log */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            data-testid="chat-message"
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
              className={`max-w-[75%] overflow-hidden break-words [overflow-wrap:anywhere] rounded-2xl p-3 text-xs leading-relaxed ${
                msg.sender === 'USER'
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'bg-[var(--surface-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)]'
              }`}
            >
              <p className="whitespace-pre-line break-words [overflow-wrap:anywhere]">{msg.text}</p>

              {msg.execution && (
                <details className="mt-2 border-t border-[var(--border-subtle)] pt-2">
                  <summary
                    className={`inline-flex max-w-full cursor-pointer list-none rounded-full border px-2 py-1 text-[10px] font-medium ${
                      msg.execution.tone === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : msg.execution.tone === 'warning'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : msg.execution.tone === 'error'
                            ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                            : 'border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <span className="truncate">{msg.execution.label}</span>
                  </summary>
                  <div className="mt-2 space-y-1 text-[10px] text-[var(--text-muted)]">
                    {msg.execution.workflowId && (
                      <p className="break-all">
                        Workflow reference:{' '}
                        <span className="font-mono">{msg.execution.workflowId}</span>
                      </p>
                    )}
                    {msg.execution.details.map((detail) => (
                      <p key={detail}>{detail}</p>
                    ))}
                    {msg.execution.latencyMs !== undefined && (
                      <p>Response time: {msg.execution.latencyMs} ms</p>
                    )}
                    {msg.execution.formulaVersion && (
                      <p>Calculation version: {msg.execution.formulaVersion}</p>
                    )}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="border-t border-[var(--border-subtle)] pt-1.5">
                        <span className="font-semibold text-[var(--text-secondary)]">
                          Audit references
                        </span>
                        {msg.citations.map((citation) => (
                          <p key={citation} className="break-words [overflow-wrap:anywhere]">
                            {citation}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
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
      <div
        className={`flex gap-1.5 pb-1 ${
          compact ? 'shrink-0 flex-nowrap overflow-x-auto' : 'flex-wrap'
        }`}
      >
        {DEFAULT_SUGGESTIONS.map((sug, i) => (
          <button
            key={i}
            onClick={() => handleSendQuery(sug)}
            disabled={isSending}
            className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50 ${
              compact ? 'max-w-[18rem] shrink-0 truncate' : ''
            }`}
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
