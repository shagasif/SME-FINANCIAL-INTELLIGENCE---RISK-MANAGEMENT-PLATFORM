import { useEffect, type ReactNode } from 'react';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerBadge?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

const WIDTH_CLASSES = {
  md: 'max-w-md',
  lg: 'max-w-xl',
  xl: 'max-w-3xl',
};

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  headerBadge,
  headerActions,
  children,
  footer,
  width = 'lg',
}: DrawerProps) {
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
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-250"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 flex pl-4 sm:pl-10 max-w-full pointer-events-none">
        <div
          className={`w-screen ${WIDTH_CLASSES[width]} pointer-events-auto border-l border-[var(--border-subtle)]/80 bg-[var(--surface-card)]/95 backdrop-blur-md text-[var(--text-primary)] shadow-2xl flex flex-col justify-between transition-all duration-250`}
        >
          <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div className="min-w-0 flex-1 space-y-1">
              {headerBadge && (
                <div className="flex flex-wrap items-center gap-2">{headerBadge}</div>
              )}
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)] leading-snug">
                {title}
              </h2>
              {subtitle && <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>}
            </div>
            <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:shrink-0 sm:justify-start">
              {headerActions}
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                aria-label="Close drawer"
                title="Close"
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

          <div className="flex-1 overflow-y-auto px-6 py-6 text-sm">{children}</div>

          {footer && (
            <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)]/50 px-6 py-4 flex items-center justify-end gap-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
