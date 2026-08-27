'use client';

import { CheckCircle2, PackageX, PackageSearch } from 'lucide-react';
import { DeliveryOutcomeType } from '@/types/delivery';

interface OutcomeSelectorProps {
  onSelect: (outcome: DeliveryOutcomeType) => void;
}

// Three large, one-handed touch targets — the primary action of the whole
// app. Partially delivered is visibly present (it's a real, near-term part
// of the product) but disabled: its data model doesn't exist yet this round,
// so it must not claim to accept a tap it can't act on.
export function OutcomeSelector({ onSelect }: OutcomeSelectorProps) {
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Delivery outcome">
      <button
        type="button"
        onClick={() => onSelect('DELIVERED')}
        aria-label="Deliver"
        className="flex items-center gap-4 border border-border bg-white px-5 py-5 text-left transition hover:border-accent hover:shadow-md"
      >
        <CheckCircle2 className="h-8 w-8 shrink-0 text-success" aria-hidden="true" />
        <div>
          <div className="text-base font-semibold text-foreground">Deliver</div>
          <div className="text-sm text-foreground-secondary">Record a completed delivery</div>
        </div>
      </button>

      <div
        className="flex items-center gap-4 border border-border bg-white px-5 py-5 text-left opacity-40"
        aria-disabled="true"
      >
        <PackageSearch className="h-8 w-8 shrink-0 text-muted" aria-hidden="true" />
        <div className="flex-1">
          <div className="text-base font-semibold text-foreground">Partially delivered</div>
          <div className="text-sm text-foreground-secondary">Some products were rejected, damaged or missing</div>
        </div>
        <span className="whitespace-nowrap bg-amber-light px-2.5 py-1 text-xs font-medium text-amber-fg">
          Coming soon
        </span>
      </div>

      <button
        type="button"
        onClick={() => onSelect('UNABLE_TO_DELIVER')}
        aria-label="Unable to deliver"
        className="flex items-center gap-4 border border-border bg-white px-5 py-5 text-left transition hover:border-accent hover:shadow-md"
      >
        <PackageX className="h-8 w-8 shrink-0 text-error" aria-hidden="true" />
        <div>
          <div className="text-base font-semibold text-foreground">Unable to deliver</div>
          <div className="text-sm text-foreground-secondary">None of the order could be delivered</div>
        </div>
      </button>
    </div>
  );
}
