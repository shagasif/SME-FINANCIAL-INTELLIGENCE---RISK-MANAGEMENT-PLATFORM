import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helperText, error, leftIcon, rightIcon, id, className = '', ...rest },
  ref,
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center w-full">
        {leftIcon && (
          <div className="absolute left-3 text-[var(--text-muted)] pointer-events-none flex items-center">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
          }
          className={`w-full rounded-lg border bg-[var(--surface-card)] text-[var(--text-primary)] px-3.5 py-2 text-sm transition-colors placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-teal)] focus:ring-1 focus:ring-[var(--accent-teal)] disabled:opacity-50 disabled:bg-[var(--surface-elevated)] ${
            leftIcon ? 'pl-10' : ''
          } ${rightIcon ? 'pr-10' : ''} ${
            error
              ? 'border-[var(--status-err-text)] focus:border-[var(--status-err-text)] focus:ring-[var(--status-err-text)]'
              : 'border-[var(--border-subtle)]'
          } ${className}`}
          {...rest}
        />
        {rightIcon && (
          <div className="absolute right-3 text-[var(--text-muted)] flex items-center">
            {rightIcon}
          </div>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="text-xs font-medium text-[var(--status-err-text)]">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={`${inputId}-helper`} className="text-xs text-[var(--text-muted)]">
          {helperText}
        </p>
      )}
    </div>
  );
});
