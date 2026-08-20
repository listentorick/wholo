import type { DeliveryCard as DeliveryCardType, DeliveryRunColumn } from '@wholo/types';
import { unallocatedReasonCopy, lineItemsCopy } from './attention';
import { DeliveryCardActions } from './DeliveryCardActions';

interface DeliveryCardProps {
  card: DeliveryCardType;
  currentRunId: string | null;
  runs: DeliveryRunColumn[];
  isFirst?: boolean;
  isLast?: boolean;
  pending?: boolean;
  // True when the containing run is READY — its membership is locked until
  // an explicit Reopen (M4), so every move/reorder control is disabled.
  locked?: boolean;
  // Injected by SortableDeliveryCard (dnd-kit's grip handle) — kept as a
  // plain slot here so this component never imports dnd-kit itself; that
  // lets DragOverlay render this same component as a plain, non-sortable
  // floating copy.
  dragHandle?: React.ReactNode;
  onMove: (targetRunId: string | null) => void;
  onMoveUpDown?: (direction: 'up' | 'down') => void;
}

export function DeliveryCard({
  card, currentRunId, runs, isFirst, isLast, pending, locked, dragHandle, onMove, onMoveUpDown,
}: DeliveryCardProps) {
  return (
    <div className={`rounded-md border border-border bg-white p-2.5 shadow-sm ${pending ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          {dragHandle}
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
        </div>
      </div>
      {card.unallocatedReason != null && (
        <p className="mt-1.5 text-xs text-blue-700">{unallocatedReasonCopy(card.unallocatedReason)}</p>
      )}
      <p className="mt-1.5 text-xs text-muted">{lineItemsCopy(card.lineCount, card.itemCount)}</p>

      <div className="mt-2 border-t border-border pt-2">
        <DeliveryCardActions
          currentRunId={currentRunId}
          runs={runs}
          suggestedRunId={card.suggestedRunId}
          disabled={pending || locked}
          isFirst={isFirst}
          isLast={isLast}
          onMove={onMove}
          onMoveUpDown={onMoveUpDown}
        />
      </div>
    </div>
  );
}
