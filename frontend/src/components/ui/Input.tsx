import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export const FORM_LABEL_CLASS = 'block text-xs font-semibold text-[var(--text-secondary)]';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  hasWarning?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helperText, error, hasWarning, leftIcon, rightIcon, id, className = '', type, ...rest },
  ref,
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const hasNativeRightControl = type === 'date' || type === 'number';
  const borderClass = error
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
    : hasWarning
      ? 'border-amber-500 focus:border-amber-500 focus:ring-amber-500'
      : 'border-[var(--border-subtle)] focus:border-[var(--accent-teal)] focus:ring-[var(--accent-teal)]';

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className={FORM_LABEL_CLASS}>
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
          type={type}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
          }
          className={`w-full rounded-lg border bg-[var(--surface-card)] text-[var(--text-primary)] px-3.5 py-2 text-sm transition-colors placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 disabled:opacity-50 disabled:bg-[var(--surface-elevated)] ${
            leftIcon ? 'pl-10' : ''
          } ${rightIcon ? (hasNativeRightControl ? 'pr-14' : 'pr-10') : ''} ${borderClass} ${className}`}
          {...rest}
        />
        {rightIcon && (
          <div
            className={`absolute ${
              hasNativeRightControl ? 'right-8' : 'right-3'
            } text-[var(--text-muted)] flex items-center`}
          >
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
