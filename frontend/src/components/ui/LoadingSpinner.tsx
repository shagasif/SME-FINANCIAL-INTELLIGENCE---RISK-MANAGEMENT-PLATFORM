export function LoadingSpinner({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-10 h-10 border-3',
  };

  return (
    <div
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full animate-spin border-[var(--border-subtle)] border-t-[var(--accent-teal)] ${sizeClasses[size]} ${className}`}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-[var(--surface-elevated)] rounded-md ${className}`}
      aria-hidden="true"
    />
  );
}
