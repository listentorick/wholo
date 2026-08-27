'use client';

import { useRef, useState } from 'react';
import { DeliveryLinkOrder, SignatureStrokeData } from '@/types/delivery';
import { SignaturePad, SignaturePadHandle } from './SignaturePad';
import { StepActions } from './StepActions';

interface ConfirmDeliverySignatureProps {
  order: DeliveryLinkOrder;
  onAccept: (signature: SignatureStrokeData, capturedAt: string) => void;
  submitting: boolean;
  error: string | null;
}

// Screen 3 of the handed-to-a-person flow (screenshots/delivery_2.png). The
// recipient reads the summary, signs, and taps "Accept delivery". There is no
// separate driver review screen for this path — this screen is the review, and
// the caption below the button carries the irreversibility warning (PRD §12).
export function ConfirmDeliverySignature({ order, onAccept, submitting, error }: ConfirmDeliverySignatureProps) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [empty, setEmpty] = useState(true);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-widest text-foreground-tertiary">
          Order {order.orderNumber}
        </div>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Confirm delivery</h1>
      </div>

      <p className="text-sm text-foreground-secondary">
        By signing below, I confirm that I have received this order for {order.customerName}.
      </p>

      <SignaturePad ref={padRef} onChange={setEmpty} ariaLabel="Signature" />

      <button
        type="button"
        onClick={() => {
          padRef.current?.clear();
          setEmpty(true);
        }}
        className="self-start text-sm font-medium text-accent"
      >
        Clear signature
      </button>

      <StepActions>
        {error && (
          <div className="border border-error bg-white p-4 text-sm text-error" role="alert">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            const signature = padRef.current?.getData();
            if (signature) onAccept(signature, new Date().toISOString());
          }}
          disabled={empty || submitting}
          className="w-full bg-accent px-4 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Submitting…' : 'Accept delivery'}
        </button>
        <p className="text-center text-xs text-foreground-tertiary">
          This delivery result can&apos;t be changed once accepted.
        </p>
      </StepActions>
    </div>
  );
}
