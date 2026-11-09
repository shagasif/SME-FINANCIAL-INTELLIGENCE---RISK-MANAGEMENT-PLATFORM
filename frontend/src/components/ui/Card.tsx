import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'article' | 'div';
  children: ReactNode;
}

export function Card({ as: Component = 'div', className = '', children, ...rest }: CardProps) {
  return (
    <Component
      style={{
        backgroundColor: 'var(--surface-card)',
        borderColor: 'var(--border-subtle)',
      }}
      className={`rounded-xl border p-6 shadow-xs transition-colors ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
}
