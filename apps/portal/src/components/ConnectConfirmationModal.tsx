'use client';

import { useState } from 'react';

interface ConnectConfirmationModalProps {
  distributorName: string;
  onConfirm: (recentContact: boolean) => Promise<void>;
  onClose: () => void;
}

/**
 * Confirms a customer-initiated "connect" request before it's sent. The
 * question's answer is informational for the distributor reviewing the
 * request — either answer submits the same request, and dismissing without
 * answering sends nothing at all.
 */
export function ConnectConfirmationModal({ distributorName, onConfirm, onClose }: ConnectConfirmationModalProps) {
  const [pending, setPending] = useState<'yes' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnswer(recentContact: boolean) {
    if (pending) return;
    setPending(recentContact ? 'yes' : 'no');
    setError(null);
    try {
      await onConfirm(recentContact);
    } catch {
      setError('Failed to send your request. Please try again.');
      setPending(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-surface p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-confirmation-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <p id="connect-confirmation-title" className="text-base font-semibold text-foreground">
            Have you spoken with or ordered from {distributorName} in the last 90 days?
          </p>
          <button
            type="button"
            aria-label="Close"
            className="text-muted hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            className="w-full bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            disabled={pending !== null}
            onClick={() => handleAnswer(true)}
          >
            {pending === 'yes' && (
              <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent align-[-2px]" />
            )}
            Yes, we&apos;re already in touch
          </button>
          <button
            type="button"
            className="w-full border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-highlight disabled:opacity-60"
            disabled={pending !== null}
            onClick={() => handleAnswer(false)}
          >
            {pending === 'no' && (
              <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-foreground border-t-transparent align-[-2px]" />
            )}
            No, this is a first introduction
          </button>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: '#DC2626', textAlign: 'center', padding: '6px 0 2px' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
