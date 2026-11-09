import { appConfig } from '../../config/env';

export function Footer() {
  return (
    <footer
      style={{
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-muted)',
      }}
      className="mt-16 border-t py-8 text-xs"
    >
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 px-6 sm:flex-row sm:items-center">
        <p>
          AI-Powered SME Financial Intelligence &amp; Risk Management Platform — Modular Monolith
          Foundation (Phase 1)
        </p>
        <p className="font-mono">
          API Target: <span>{appConfig.apiBaseUrl}</span>
        </p>
      </div>
    </footer>
  );
}
