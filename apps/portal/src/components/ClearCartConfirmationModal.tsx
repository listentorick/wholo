'use client';

import { useState } from 'react';

interface ClearCartConfirmationModalProps {
  itemCount: number;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function ClearCartConfirmationModal({ itemCount, onConfirm, onClose }: ClearCartConfirmationModalProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch {
      setError('Failed to clear your cart. Please try again.');
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-cart-confirmation-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <p id="clear-cart-confirmation-title" className="text-base font-semibold text-foreground">
            Clear {itemCount} {itemCount === 1 ? 'item' : 'items'} from your cart?
          </p>
          <button
            type="button"
            aria-label="Close"
            className="text-muted hover:text-foreground"
            onClick={onClose}
            disabled={pending}
          >
            ✕
          </button>
        </div>

        <p className="mt-2 text-sm text-muted">This cannot be undone.</p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            className="w-full bg-error px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            disabled={pending}
            onClick={handleConfirm}
          >
            {pending && (
              <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent align-[-2px]" />
            )}
            {pending ? 'Clearing…' : 'Clear Cart'}
          </button>
          <button
            type="button"
            className="w-full border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-highlight disabled:opacity-60"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>

        {error && (
          <p className="mt-2 text-center text-xs text-error">{error}</p>
        )}
      </div>
    </div>
  );
}
