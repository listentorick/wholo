'use client';

import { Modal } from '@/components/Modal';

interface Props {
  runName: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Confirmation interstitial before a hard lock — mark-ready locks
// membership, sequence, and driver until an explicit Reopen, so it needs
// confirmation rather than firing straight off the button. Same Modal +
// button conventions as TaxTypeUnmappedWarningModal.
export function MarkReadyDialog({
  runName, submitting, onCancel, onConfirm,
}: Props) {
  return (
    <Modal onClose={onCancel} labelledBy="mark-ready-title" closable={!submitting}>
      <h3 id="mark-ready-title" className="text-base font-semibold text-text">
        Mark {runName} ready?
      </h3>
      <p className="mt-2 text-sm text-text">
        This locks the run&rsquo;s deliveries, order, and driver — no one can change them until it&rsquo;s reopened.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          data-modal-cancel
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Marking ready…' : 'Mark ready'}
        </button>
      </div>
    </Modal>
  );
}
