import { useEffect, type ReactNode } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  headerAction?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  headerAction,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`relative w-full ${SIZE_CLASSES[size]} rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden z-10 transition-all`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-6 py-4.5 bg-[var(--surface-elevated)]/40">
          <div className="min-w-0">
            <h2
              id="modal-title"
              className="text-lg font-bold tracking-tight text-[var(--text-primary)] truncate"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerAction}
            <button
              onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm">{children}</div>

        {footer && (
          <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)]/40 px-6 py-3.5 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
