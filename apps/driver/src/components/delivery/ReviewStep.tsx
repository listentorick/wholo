'use client';

import { useState } from 'react';
import { SubmitOutcomeRequest, UNABLE_TO_DELIVER_REASONS } from '@/types/delivery';

interface ReviewStepProps {
  outcome: SubmitOutcomeRequest;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}

const OUTCOME_LABELS: Record<SubmitOutcomeRequest['outcome'], string> = {
  DELIVERED: 'Delivered',
  UNABLE_TO_DELIVER: 'Unable to deliver',
};

// PRD §12 / PRODUCT.md's accessibility requirement: irreversible submission
// requires an explicit confirmation control, not just informational text —
// the checkbox below is real, engaged state, not decoration; Submit stays
// disabled until it's checked.
export function ReviewStep({ outcome, onConfirm, onBack, submitting, error }: ReviewStepProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const reasonLabel = UNABLE_TO_DELIVER_REASONS.find((r) => r.value === outcome.unableReason)?.label;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">Review before submitting</h2>

      <div className="border border-border bg-white p-4 text-sm text-foreground">
        <dl className="flex flex-col gap-2">
          <div className="flex justify-between gap-4">
            <dt className="text-foreground-secondary">Outcome</dt>
            <dd className="font-medium">{OUTCOME_LABELS[outcome.outcome]}</dd>
          </div>
          {reasonLabel && (
            <div className="flex justify-between gap-4">
              <dt className="text-foreground-secondary">Reason</dt>
              <dd className="font-medium">{reasonLabel}</dd>
            </div>
          )}
          {outcome.unableReasonNote && (
            <div className="flex justify-between gap-4">
              <dt className="text-foreground-secondary">Note</dt>
              <dd className="text-right font-medium">{outcome.unableReasonNote}</dd>
            </div>
          )}
          {outcome.recipientName && (
            <div className="flex justify-between gap-4">
              <dt className="text-foreground-secondary">Recipient</dt>
              <dd className="font-medium">{outcome.recipientName}</dd>
            </div>
          )}
          {outcome.notes && (
            <div className="flex justify-between gap-4">
              <dt className="text-foreground-secondary">Notes</dt>
              <dd className="text-right font-medium">{outcome.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <label className="flex items-start gap-3 border border-border bg-white p-4 text-sm text-foreground">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0"
        />
        This delivery result cannot be changed once submitted. I confirm the details above are correct.
      </label>

      {error && (
        <div className="border border-error bg-white p-4 text-sm text-error" role="alert">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="border border-border bg-white px-4 py-3 text-base font-medium text-foreground disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!acknowledged || submitting}
          className="flex-1 bg-accent px-4 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
