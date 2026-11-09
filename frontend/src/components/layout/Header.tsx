import type { ThemeMode } from '../../hooks/useTheme';

interface HeaderProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export function Header({ theme, onToggleTheme }: HeaderProps) {
  return (
    <header
      style={{
        backgroundColor: 'var(--surface-header)',
        color: 'var(--surface-header-text)',
        borderColor: 'var(--border-subtle)',
      }}
      className="border-b"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/10 font-mono text-sm font-bold"
          >
            FM
          </div>
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase opacity-80">
              FinMemory Foundation
            </p>
            <p className="text-sm font-medium opacity-95">
              SME Financial Intelligence &amp; Risk Management
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium sm:inline-block">
            Phase 1: Architectural Foundation
          </span>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            className="cursor-pointer rounded-lg border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold transition hover:bg-white/20"
          >
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
        </div>
      </div>
    </header>
  );
}
