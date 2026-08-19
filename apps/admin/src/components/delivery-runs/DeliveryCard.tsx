import type { DeliveryCard as DeliveryCardType } from '@wholo/types';
import { StatusBadge } from '@/components/list/StatusBadge';
import { UNASSIGNED_BADGE, unallocatedReasonCopy, lineItemsCopy } from './attention';

interface DeliveryCardProps {
  card: DeliveryCardType;
}

export function DeliveryCard({ card }: DeliveryCardProps) {
  return (
    <div className="rounded-md border border-border bg-white p-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium text-text">
            {card.stopNumber != null && (
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {card.stopNumber}
              </span>
            )}
            <span className="truncate">{card.customerName}</span>
          </div>
          <p className="truncate text-xs text-muted">{card.orderNumber}</p>
        </div>
        {card.attention === 'UNASSIGNED' && (
          <StatusBadge label={UNASSIGNED_BADGE.label} tone={UNASSIGNED_BADGE.tone} />
        )}
      </div>
      {card.attention === 'UNASSIGNED' && (
        <p className="mt-1.5 text-xs text-blue-700">{unallocatedReasonCopy(card.unallocatedReason)}</p>
      )}
      <p className="mt-1.5 text-xs text-muted">{lineItemsCopy(card.lineCount, card.itemCount)}</p>
    </div>
  );
}
