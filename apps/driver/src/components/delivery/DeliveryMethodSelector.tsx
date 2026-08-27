'use client';

import { useState } from 'react';
import { User, MapPin } from 'lucide-react';
import { DeliveryDropMethod } from '@/types/delivery';
import { StepActions } from './StepActions';

interface DeliveryMethodSelectorProps {
  onContinue: (method: Extract<DeliveryDropMethod, 'HANDED_TO_PERSON'>) => void;
  onBack: () => void;
}

// Screen 1 of the Deliver flow (screenshots/delivery_2.png). Select a method,
// then Continue — not tap-to-advance. "Left in a safe location" is a real,
// near-term part of the product but its capture flow (photos, "where left")
// isn't built yet, so it's shown disabled rather than accepting a dead tap.
export function DeliveryMethodSelector({ onContinue, onBack }: DeliveryMethodSelectorProps) {
  const [selected, setSelected] = useState<'HANDED_TO_PERSON' | null>(null);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-lg font-semibold text-foreground">How was the order delivered?</h2>

      <div className="flex flex-col gap-3" role="radiogroup" aria-label="Delivery method">
        <button
          type="button"
          role="radio"
          aria-checked={selected === 'HANDED_TO_PERSON'}
          onClick={() => setSelected('HANDED_TO_PERSON')}
          className={`flex items-center gap-4 border px-5 py-5 text-left transition ${
            selected === 'HANDED_TO_PERSON'
              ? 'border-accent bg-accent-light'
              : 'border-border bg-white hover:border-accent'
          }`}
        >
          <User className="h-8 w-8 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <div className="text-base font-semibold text-foreground">Handed to a person</div>
            <div className="text-sm text-foreground-secondary">The recipient will be asked to sign</div>
          </div>
        </button>

        <div
          className="flex items-center gap-4 border border-border bg-white px-5 py-5 text-left opacity-40"
          aria-disabled="true"
        >
          <MapPin className="h-8 w-8 shrink-0 text-muted" aria-hidden="true" />
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-base font-semibold text-foreground">Left in a safe location</span>
              <span className="whitespace-nowrap bg-amber-light px-2 py-0.5 text-[11px] font-medium text-amber-fg">
                Coming soon
              </span>
            </div>
            <div className="text-sm text-foreground-secondary">Record where it was left</div>
          </div>
        </div>
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
            type="button"
            onClick={() => selected && onContinue(selected)}
            disabled={!selected}
            className="flex-1 bg-accent px-4 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      </StepActions>
    </div>
  );
}
