'use client';

import { Modal } from '@/components/Modal';

interface Props {
  runName: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Reopen is the audited undo of MarkReadyDialog's lock — confirmed the same
// way, since it re-exposes membership/sequence/driver to further changes.
export function ReopenConfirm({
  runName, submitting, onCancel, onConfirm,
}: Props) {
  return (
    <Modal onClose={onCancel} labelledBy="reopen-run-title" closable={!submitting}>
      <h3 id="reopen-run-title" className="text-base font-semibold text-text">
        Reopen {runName}?
      </h3>
      <p className="mt-2 text-sm text-text">
        This unlocks the run so deliveries, order, and driver can be changed again.
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
          {submitting ? 'Reopening…' : 'Reopen'}
        </button>
      </div>
    </Modal>
  );
}
