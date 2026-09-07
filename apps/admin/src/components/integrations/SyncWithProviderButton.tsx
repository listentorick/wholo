'use client';

import { useState } from 'react';

interface Props {
  onClick: () => Promise<void>;
  // The parent already knows a sync is running (from the shared context) —
  // render the disabled "Syncing…" state.
  disabled?: boolean;
  label: string;
  variant?: 'primary' | 'secondary';
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function SyncWithProviderButton({ onClick, disabled = false, label, variant = 'secondary' }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDisabled = disabled || busy;

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await onClick();
    } catch {
      setError('Could not start the sync. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const className =
    variant === 'primary'
      ? 'inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
      : 'inline-flex items-center justify-center gap-2 rounded-md border border-primary bg-white px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={handleClick} disabled={isDisabled} className={className}>
        {(busy || disabled) && <Spinner />}
        {disabled ? 'Syncing…' : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
