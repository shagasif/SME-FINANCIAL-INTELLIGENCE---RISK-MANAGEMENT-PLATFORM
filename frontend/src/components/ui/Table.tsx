import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  emptyMessage?: string;
  isLoading?: boolean;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No records found.',
  isLoading = false,
  onRowClick,
  className = '',
}: TableProps<T>) {
  return (
    <div
      className={`w-full overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] ${className}`}
    >
      <table className="w-full text-left text-sm text-[var(--text-primary)] border-collapse">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`py-3.5 px-4 ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                } ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-[var(--text-muted)]">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 border-2 border-[var(--accent-teal)] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-medium">Loading records...</span>
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-12 text-center text-sm text-[var(--text-muted)]"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, index) => {
              const isClickable = Boolean(onRowClick);
              return (
                <tr
                  key={keyExtractor(item, index)}
                  onClick={() => onRowClick?.(item)}
                  className={`transition-colors ${
                    isClickable
                      ? 'cursor-pointer hover:bg-[var(--surface-elevated)]'
                      : 'hover:bg-[var(--surface-elevated)]/50'
                  }`}
                >
                  {columns.map((col) => {
                    const value = (item as Record<string, unknown>)[col.key];
                    return (
                      <td
                        key={col.key}
                        className={`py-3.5 px-4 text-sm ${
                          col.align === 'right'
                            ? 'text-right font-mono'
                            : col.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                        } ${col.className ?? ''}`}
                      >
                        {col.render ? col.render(item, index) : String(value ?? '—')}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
