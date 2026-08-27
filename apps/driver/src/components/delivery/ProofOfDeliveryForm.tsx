'use client';

import { useState } from 'react';
import { StepActions } from './StepActions';

interface ProofOfDeliveryFormProps {
  onContinue: (recipientName: string) => void;
  onBack: () => void;
}

// Screen 2 of the handed-to-a-person flow (screenshots/delivery_2.png).
// Recipient name only for now — the mock's "Delivery photos" section is a
// later increment (no camera capture surface in this app yet), so it is
// omitted rather than shown as a disabled stub.
export function ProofOfDeliveryForm({ onContinue, onBack }: ProofOfDeliveryFormProps) {
  const [recipientName, setRecipientName] = useState('');
  const trimmed = recipientName.trim();

  return (
    <form
      className="flex flex-1 flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onContinue(trimmed);
      }}
    >
      <h2 className="text-lg font-semibold text-foreground">Proof of delivery</h2>

      <div>
        <label htmlFor="recipientName" className="mb-1 block text-sm font-medium text-foreground">
          Recipient name
        </label>
        <input
          id="recipientName"
          type="text"
          autoComplete="name"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          className="w-full border border-border bg-white px-4 py-3 text-base text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <StepActions>
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
            disabled={!trimmed}
            className="flex-1 bg-accent px-4 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      </StepActions>
    </form>
  );
}
