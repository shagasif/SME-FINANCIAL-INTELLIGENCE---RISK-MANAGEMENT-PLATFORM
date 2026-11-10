import type { ReactNode } from 'react';
import { Card } from './Card';
import { Badge } from './Badge';

export interface StatCardProps {
  title: string;
  value: string | number | null;
  unit?: string;
  change?: {
    value: string;
    isPositive?: boolean;
    isNeutral?: boolean;
  };
  subtitle?: string;
  icon?: ReactNode;
  statusBadge?: {
    label: string;
    variant: 'ok' | 'teal' | 'amber' | 'error' | 'neutral';
  };
  dataLimitation?: string;
  className?: string;
  onClick?: () => void;
}

export function StatCard({
  title,
  value,
  unit,
  change,
  subtitle,
  icon,
  statusBadge,
  dataLimitation,
  className = '',
  onClick,
}: StatCardProps) {
  const isInteractive = Boolean(onClick);

  return (
    <Card
      onClick={onClick}
      className={`relative overflow-hidden flex flex-col justify-between ${
        isInteractive ? 'cursor-pointer hover:border-[var(--accent-teal)] hover:shadow-md' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">
            {title}
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl lg:text-3xl font-bold tracking-tight text-[var(--text-primary)] font-mono">
              {value !== null && value !== undefined ? value : '—'}
            </span>
            {unit && <span className="text-xs font-medium text-[var(--text-muted)]">{unit}</span>}
          </div>
        </div>
        {icon && (
          <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] text-[var(--accent-teal)] shrink-0">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-2">
          {change && (
            <span
              className={`font-semibold font-mono ${
                change.isNeutral
                  ? 'text-[var(--text-muted)]'
                  : change.isPositive
                    ? 'text-[var(--status-ok-text)]'
                    : 'text-[var(--status-err-text)]'
              }`}
            >
              {change.value}
            </span>
          )}
          {subtitle && <span>{subtitle}</span>}
        </div>
        {statusBadge && <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>}
      </div>

      {dataLimitation && (
        <div
          className="mt-2 text-[10px] text-[var(--text-muted)] italic truncate"
          title={dataLimitation}
        >
          Note: {dataLimitation}
        </div>
      )}
    </Card>
  );
}
