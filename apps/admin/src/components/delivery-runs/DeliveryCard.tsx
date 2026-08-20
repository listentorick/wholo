import type { DeliveryCard as DeliveryCardType, DeliveryRunColumn } from '@wholo/types';
import { StatusBadge } from '@/components/list/StatusBadge';
import { UNASSIGNED_BADGE, unallocatedReasonCopy, lineItemsCopy } from './attention';
import { MoveToMenu } from './MoveToMenu';

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
  onMove: (targetRunId: string | null) => void;
  onMoveUpDown?: (direction: 'up' | 'down') => void;
}

export function DeliveryCard({
  card, currentRunId, runs, isFirst, isLast, pending, locked, onMove, onMoveUpDown,
}: DeliveryCardProps) {
  return (
    <div className={`rounded-md border border-border bg-white p-2.5 shadow-sm ${pending ? 'opacity-50' : ''}`}>
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

      <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
        <MoveToMenu
          currentRunId={currentRunId}
          runs={runs}
          suggestedRunId={card.suggestedRunId}
          disabled={pending || locked}
          onSelect={onMove}
        />
        {onMoveUpDown && (
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onMoveUpDown('up')}
              disabled={pending || locked || isFirst}
              aria-label="Move up"
              className="rounded p-1 text-muted hover:bg-canvas hover:text-text disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-muted"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onMoveUpDown('down')}
              disabled={pending || locked || isLast}
              aria-label="Move down"
              className="rounded p-1 text-muted hover:bg-canvas hover:text-text disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-muted"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
