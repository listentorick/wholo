'use client';

import { useEffect, useState } from 'react';
import { StepActions } from './StepActions';
import { DeliveryPhotos, PhotoItem } from './DeliveryPhotos';

interface ProofOfDeliveryFormProps {
  photos: PhotoItem[];
  onAddPhoto: (file: File) => void;
  onRemovePhoto: (clientId: string) => void;
  onRetryPhoto: (clientId: string) => void;
  onEnter: () => void;
  onContinue: (recipientName: string) => void;
  onBack: () => void;
}

// Screen 2 of the handed-to-a-person flow (screenshots/delivery_2.png):
// recipient name + optional delivery photos. Device location is captured once
// on entry (via onEnter) and held by the page, not gathered here.
export function ProofOfDeliveryForm({
  photos,
  onAddPhoto,
  onRemovePhoto,
  onRetryPhoto,
  onEnter,
  onContinue,
  onBack,
}: ProofOfDeliveryFormProps) {
  const [recipientName, setRecipientName] = useState('');
  const trimmed = recipientName.trim();
  const uploading = photos.some((p) => p.status === 'uploading');

  useEffect(() => {
    onEnter();
  }, [onEnter]);

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

      <DeliveryPhotos
        photos={photos}
        onAdd={onAddPhoto}
        onRemove={onRemovePhoto}
        onRetry={onRetryPhoto}
      />

      <StepActions>
        {uploading && (
          <p className="text-center text-xs text-foreground-tertiary">A photo is still uploading…</p>
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
