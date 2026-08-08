'use client';

import { Modal } from '@/components/Modal';

interface Props {
  detail: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Shown when accepting an order 409s with problem.title ===
// 'TAX_TYPE_UNMAPPED' — one or more of the order's tax types has no
// confirmed mapping to the connected accounting system, so the exported
// invoice will fall back to the accounting system's default tax rate for
// those lines. See AdminOrdersService.assertTaxTypesMappedOrConfirmed
// (apps/api). Same Modal + button conventions as TaxTypeConflictModal
// (apps/admin/src/components/integrations/products).
export function TaxTypeUnmappedWarningModal({ detail, submitting, onCancel, onConfirm }: Props) {
  return (
    <Modal onClose={onCancel} labelledBy="tax-type-unmapped-title" closable={!submitting}>
      <h3 id="tax-type-unmapped-title" className="text-base font-semibold text-text">
        Unmapped tax type
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
          {submitting ? 'Accepting…' : 'Accept anyway'}
        </button>
      </div>
    </Modal>
  );
}
