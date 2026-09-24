'use client';

// The dashboards' refresh control: an icon button that spins while a refresh is in flight.
export function RefreshButton({ onClick, isRefreshing }: { onClick: () => void; isRefreshing: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isRefreshing}
      aria-label="Refresh"
      className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-muted hover:bg-canvas disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true">
        <polyline points="23 4 23 10 17 10" /><path d="M20.5 15a9 9 0 11-2.1-9.4L23 10" />
      </svg>
    </button>
  );
}
