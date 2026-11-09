import type { ReactNode } from 'react';

export type BadgeVariant = 'ok' | 'teal' | 'amber' | 'error' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
}

const VARIANT_STYLES: Record<BadgeVariant, { backgroundColor: string; color: string }> = {
  ok: {
    backgroundColor: 'var(--status-ok-bg)',
    color: 'var(--status-ok-text)',
  },
  teal: {
    backgroundColor: 'var(--surface-elevated)',
    color: 'var(--accent-teal)',
  },
  amber: {
    backgroundColor: 'var(--status-warn-bg)',
    color: 'var(--status-warn-text)',
  },
  error: {
    backgroundColor: 'var(--status-err-bg)',
    color: 'var(--status-err-text)',
  },
  neutral: {
    backgroundColor: 'var(--surface-elevated)',
    color: 'var(--text-secondary)',
  },
};

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  const styles = VARIANT_STYLES[variant];
  return (
    <span
      style={styles}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide"
    >
      {children}
    </span>
  );
}
