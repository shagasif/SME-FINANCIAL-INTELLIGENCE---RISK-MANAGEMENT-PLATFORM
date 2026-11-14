import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import botImage from '../../assets/finance-assistant-bot.png';
import { useAuth } from '../../context/useAuth';
import { AiAssistantPage } from '../../pages/ai-assistant/AiAssistantPage';
import './FloatingAiAssistant.css';

const HIDDEN_PATHS = new Set(['/', '/login', '/register', '/forgot-password']);

export function FloatingAiAssistant() {
  const { isAuthenticated, isLoading } = useAuth();
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const closeAssistant = () => {
    setIsOpen(false);
    setIsExpanded(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setIsExpanded(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isAuthenticated || isLoading || HIDDEN_PATHS.has(pathname)) return null;

  return (
    <div
      className={
        isExpanded && isOpen
          ? 'fixed inset-0 z-[70]'
          : 'fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 md:bottom-6 md:right-6'
      }
      data-testid="floating-ai-assistant"
    >
      <section
        id="floating-ai-assistant-panel"
        role="dialog"
        aria-label="AI Finance Assistant chat panel"
        aria-modal="false"
        hidden={!isOpen}
        className={`assistant-chat-panel flex flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-2xl ${
          isExpanded ? 'assistant-chat-panel--expanded' : ''
        }`}
      >
        <AiAssistantPage
          compact
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded((expanded) => !expanded)}
          onClose={closeAssistant}
        />
      </section>

      {!isExpanded && (
        <button
          type="button"
          aria-label={`${isOpen ? 'Close' : 'Open'} AI Finance Assistant chat`}
          aria-expanded={isOpen}
          aria-controls="floating-ai-assistant-panel"
          onClick={() => (isOpen ? closeAssistant() : setIsOpen(true))}
          className="assistant-bot-launcher relative flex h-16 w-16 items-center justify-center rounded-full border border-purple-200/70 bg-[var(--accent-primary)] p-2.5 transition-transform duration-200 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-300 sm:h-[4.5rem] sm:w-[4.5rem]"
        >
          <img
            src={botImage}
            alt=""
            className="assistant-bot-launcher-image h-full w-full object-contain"
          />
        </button>
      )}
    </div>
  );
}
