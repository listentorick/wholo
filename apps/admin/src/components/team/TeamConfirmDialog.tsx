'use client';

import type { ReactNode } from 'react';
import { Modal } from '@/components/Modal';

interface TeamConfirmDialogProps {
  title: string;
  description: string;
  /** Optional plain-language reassurance under the description. */
  note?: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

// Remove-from-team and Revoke-invitation share one shape: say what happens in
// plain terms, then a danger-outlined confirm. Same Modal + footer as
// MarkReadyDialog / CreateRunDialog.
export function TeamConfirmDialog({
  title, description, note, confirmLabel, busyLabel, submitting, error, onCancel, onConfirm,
}: TeamConfirmDialogProps) {
  return (
    <Modal onClose={onCancel} labelledBy="team-confirm-title" closable={!submitting}>
      <h3 id="team-confirm-title" className="text-base font-semibold text-text">{title}</h3>
      <p className="mt-1 text-sm text-muted">{description}</p>
      {note && (
        <p className="mt-4 rounded-md border border-border bg-[#f2f4f7] px-3 py-2.5 text-xs leading-relaxed text-muted">{note}</p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
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
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? busyLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
