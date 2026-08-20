import { arrayMove } from '@dnd-kit/sortable';
import type { DeliveryRunColumn } from '@wholo/types';
import { StatusBadge } from '@/components/list/StatusBadge';
import { DeliveryCard } from './DeliveryCard';
import { READY_BADGE, OPEN_BADGE, totalsCopy } from './attention';

interface RunColumnProps {
  run: DeliveryRunColumn;
  allRuns: DeliveryRunColumn[];
  pendingOrderId: string | null;
  onMove: (orderId: string, fromRunId: string | null, toRunId: string | null) => void;
  onReorder: (runId: string, orderedOrderIds: string[]) => void;
}

export function RunColumn({
  run, allRuns, pendingOrderId, onMove, onReorder,
}: RunColumnProps) {
  const isReady = run.status === 'READY';
  const badge = isReady ? READY_BADGE : OPEN_BADGE;

  function handleMoveUpDown(orderId: string, direction: 'up' | 'down') {
    const orderIds = run.cards.map((c) => c.orderId);
    const index = orderIds.indexOf(orderId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || targetIndex < 0 || targetIndex >= orderIds.length) return;
    onReorder(run.runId, arrayMove(orderIds, index, targetIndex));
  }

  return (
    <div
      className={`flex h-full w-[300px] shrink-0 min-h-0 flex-col rounded-lg border ${
        isReady ? 'border-green-200 bg-green-50/40' : 'border-border bg-white'
      }`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border p-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text">{run.name}</h3>
          <p className="truncate text-xs text-muted">{run.driverName ?? 'No driver assigned'}</p>
        </div>
        <StatusBadge label={badge.label} tone={badge.tone} />
      </header>
      <div className="flex-1 overflow-y-auto p-2">
        {run.cards.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted">No deliveries yet</p>
        ) : (
          <div className="space-y-2">
            {run.cards.map((card, index) => (
              <DeliveryCard
                key={card.orderId}
                card={card}
                currentRunId={run.runId}
                runs={allRuns}
                isFirst={index === 0}
                isLast={index === run.cards.length - 1}
                pending={pendingOrderId === card.orderId}
                locked={isReady}
                onMove={(targetRunId) => onMove(card.orderId, run.runId, targetRunId)}
                onMoveUpDown={(direction) => handleMoveUpDown(card.orderId, direction)}
              />
            ))}
          </div>
        )}
      </div>
      <footer className="border-t border-border px-3 py-2 text-xs text-muted">
        {totalsCopy(run.stopCount, run.itemCount)}
      </footer>
    </div>
  );
}
