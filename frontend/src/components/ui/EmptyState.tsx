import type { ReactNode } from 'react';
import { Card } from './Card';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <Card className={`flex flex-col items-center justify-center text-center p-12 ${className}`}>
      {icon && (
        <div className="p-4 rounded-2xl bg-[var(--surface-elevated)] text-[var(--accent-teal)] mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <div className="mt-5">
          <Button variant="primary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </Card>
  );
}
