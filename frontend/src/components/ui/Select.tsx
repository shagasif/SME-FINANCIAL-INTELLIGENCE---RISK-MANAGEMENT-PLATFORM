import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  options?: SelectOption[];
  children?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, helperText, error, options, children, id, className = '', ...rest },
  ref,
) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase"
        >
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
          className={`w-full rounded-lg border bg-[var(--surface-card)] text-[var(--text-primary)] px-3.5 py-2 text-sm transition-colors focus:outline-none focus:border-[var(--accent-teal)] focus:ring-1 focus:ring-[var(--accent-teal)] disabled:opacity-50 disabled:bg-[var(--surface-elevated)] appearance-none cursor-pointer ${
            error
              ? 'border-[var(--status-err-text)] focus:border-[var(--status-err-text)] focus:ring-[var(--status-err-text)]'
              : 'border-[var(--border-subtle)]'
          } ${className}`}
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
