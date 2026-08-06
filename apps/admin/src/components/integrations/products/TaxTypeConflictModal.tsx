'use client';

import { Modal } from '@/components/Modal';

interface Props {
  detail: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Shown when a match/confirm-suggestion 409s with problem.title ===
// 'TAX_TYPE_CONFLICT' — the resolved tax type would silently overwrite a
// different one already set on the target product. Same Modal + button
// conventions as DetailActionsPanel's internal ConfirmModal, standalone here
// since this needs to drop into Drawer-based dialogs and row actions rather
// than DetailActionsPanel's own ActionItem/trigger() flow.
export function TaxTypeConflictModal({ detail, submitting, onCancel, onConfirm }: Props) {
  return (
    <Modal onClose={onCancel} labelledBy="tax-type-conflict-title" closable={!submitting}>
      <h3 id="tax-type-conflict-title" className="text-base font-semibold text-text">
        Tax type conflict
      </h3>
      <p className="mt-2 text-sm text-text">{detail}</p>
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
          {submitting ? 'Overwriting…' : 'Confirm & overwrite'}
        </button>
      </div>
    </Modal>
  );
}
