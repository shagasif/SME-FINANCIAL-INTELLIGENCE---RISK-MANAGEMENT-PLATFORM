import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react';
import { FORM_LABEL_CLASS } from './Input';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  hasWarning?: boolean;
  options?: SelectOption[];
  rightIcon?: ReactNode;
  children?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    helperText,
    error,
    hasWarning,
    options,
    rightIcon,
    children,
    id,
    className = '',
    ...rest
  },
  ref,
) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const borderClass = error
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
    : hasWarning
      ? 'border-amber-500 focus:border-amber-500 focus:ring-amber-500'
      : 'border-[var(--border-subtle)] focus:border-[var(--accent-teal)] focus:ring-[var(--accent-teal)]';

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className={FORM_LABEL_CLASS}>
          {label}
        </label>
      )}
      <div className="relative flex items-center w-full">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined
          }
          className={`w-full rounded-lg border bg-[var(--surface-card)] text-[var(--text-primary)] px-3.5 py-2 ${
            rightIcon ? 'pr-14' : 'pr-9'
          } text-sm transition-colors focus:outline-none focus:ring-1 disabled:opacity-50 disabled:bg-[var(--surface-elevated)] appearance-none cursor-pointer ${borderClass} ${className}`}
          {...rest}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        {rightIcon && (
          <div className="absolute right-8 flex items-center">{rightIcon}</div>
        )}
        <div className="pointer-events-none absolute right-3 text-[var(--text-muted)] flex items-center">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {error && (
        <p id={`${selectId}-error`} className="text-xs font-medium text-[var(--status-err-text)]">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={`${selectId}-helper`} className="text-xs text-[var(--text-muted)]">
          {helperText}
        </p>
      )}
    </div>
  );
});
