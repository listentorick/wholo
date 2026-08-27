import { CheckCircle2 } from 'lucide-react';
import { DeliveryLinkOrder } from '@/types/delivery';

interface DeliveryConfirmationProps {
  order: DeliveryLinkOrder;
}

const OUTCOME_LABELS = {
  DELIVERED: 'Delivered',
  UNABLE_TO_DELIVER: 'Unable to deliver',
} as const;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// Read-only, deliberately minimal (PRD §13): order number, outcome,
// date/time, driver — nothing else. No address, contact, product detail,
// signature, photo, or location, even though the driver themselves is
// looking at it — the public confirmation view has no notion of "who's
// asking", so it can never show more than a stranger could see.
export function DeliveryConfirmation({ order }: DeliveryConfirmationProps) {
  const outcome = order.outcome;
  if (!outcome) return null;

  return (
    <div className="flex flex-col items-center gap-4 border border-border bg-white p-8 text-center">
      <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
      <div>
        <div className="text-xs font-medium uppercase tracking-widest text-foreground-tertiary">
          Order {order.orderNumber}
        </div>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{OUTCOME_LABELS[outcome.outcome]}</h1>
      </div>
      <dl className="flex flex-col gap-1 text-sm text-foreground-secondary">
        <div>{formatDateTime(outcome.recordedAt)}</div>
        {outcome.driverName && <div>Driver: {outcome.driverName}</div>}
      </dl>
      <p className="text-sm text-foreground-tertiary">This delivery result has been recorded and cannot be changed.</p>
    </div>
  );
}
