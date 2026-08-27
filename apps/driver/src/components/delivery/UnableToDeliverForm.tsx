'use client';

import { useState } from 'react';
import { UNABLE_TO_DELIVER_REASONS, UnableToDeliverReason } from '@/types/delivery';

interface UnableToDeliverFormProps {
  onContinue: (values: { unableReason: UnableToDeliverReason; unableReasonNote: string }) => void;
  onBack: () => void;
}

// Mirrors apps/api's SubmitOutcomeDto validation: a reason is always
// required for this outcome, and a note is additionally required when the
// reason is "Other".
export function UnableToDeliverForm({ onContinue, onBack }: UnableToDeliverFormProps) {
  const [reason, setReason] = useState<UnableToDeliverReason | ''>('');
  const [note, setNote] = useState('');

  const noteRequired = reason === 'OTHER';
  const canContinue = reason !== '' && (!noteRequired || note.trim() !== '');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason || (noteRequired && note.trim() === '')) return;
        onContinue({ unableReason: reason, unableReasonNote: note });
      }}
    >
      <div>
        <label htmlFor="unableReason" className="mb-1 block text-sm font-medium text-foreground">
          Reason
        </label>
        <select
          id="unableReason"
          value={reason}
          onChange={(e) => setReason(e.target.value as UnableToDeliverReason)}
          required
          className="w-full border border-border bg-white px-4 py-3 text-base text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="" disabled>
            Select a reason
          </option>
          {UNABLE_TO_DELIVER_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {noteRequired && (
        <div>
          <label htmlFor="unableReasonNote" className="mb-1 block text-sm font-medium text-foreground">
            Note <span className="font-normal text-foreground-tertiary">(required)</span>
          </label>
          <textarea
            id="unableReasonNote"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            className="w-full border border-border bg-white px-4 py-3 text-base text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="border border-border bg-white px-4 py-3 text-base font-medium text-foreground"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!canContinue}
          className="flex-1 bg-accent px-4 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Review
        </button>
      </div>
    </form>
  );
}
