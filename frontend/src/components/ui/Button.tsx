import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent-primary)] text-[var(--surface-header-text)] hover:bg-[var(--accent-primary-hover)] border border-transparent shadow-xs',
  secondary:
    'bg-[var(--surface-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)]',
  outline:
    'bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] border border-[var(--border-strong)]',
  danger:
    'bg-[var(--status-err-bg)] text-[var(--status-err-text)] hover:opacity-90 border border-[var(--status-err-text)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] border border-transparent',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs gap-1.5 rounded-md font-medium',
  md: 'px-4 py-2 text-sm gap-2 rounded-lg font-semibold',
  lg: 'px-5 py-2.5 text-base gap-2.5 rounded-lg font-semibold',
};

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const variantClass = VARIANT_CLASSES[variant];
  const sizeClass = SIZE_CLASSES[size];
  const isDisabled = disabled || isLoading;

  return (
    <button
      disabled={isDisabled}
      className={`inline-flex items-center justify-center transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 select-none focus-visible:outline-2 focus-visible:outline-[var(--accent-teal)] ${variantClass} ${sizeClass} ${className}`}
      {...rest}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  );
}
