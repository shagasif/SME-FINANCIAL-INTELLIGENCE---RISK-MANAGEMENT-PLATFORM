interface StatusIndicatorProps {
  tone: 'ok' | 'warning' | 'error' | 'loading';
  label: string;
}

const DOT_COLORS: Record<StatusIndicatorProps['tone'], string> = {
  ok: '#1f7a4d',
  warning: '#b8732a',
  error: '#b03a2e',
  loading: '#1f6e6c',
};

export function StatusIndicator({ tone, label }: StatusIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium">
      <span
        aria-hidden="true"
        style={{ backgroundColor: DOT_COLORS[tone] }}
        className={`h-2.5 w-2.5 rounded-full ${tone === 'loading' ? 'animate-pulse' : ''}`}
      />
      <span>{label}</span>
    </span>
  );
}
