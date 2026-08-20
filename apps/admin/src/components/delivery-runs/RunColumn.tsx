import { useDroppable } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { DeliveryRunColumn } from '@wholo/types';
import { SortableDeliveryCard } from './SortableDeliveryCard';
import { RunHeaderControls } from './RunHeaderControls';
import { totalsCopy } from './attention';

interface RunColumnProps {
  run: DeliveryRunColumn;
  allRuns: DeliveryRunColumn[];
  pendingOrderId: string | null;
  pendingRunId: string | null;
  onMove: (orderId: string, fromRunId: string | null, toRunId: string | null) => void;
  onReorder: (runId: string, orderedOrderIds: string[]) => void;
  onMarkReady: (runId: string) => Promise<void>;
  onReopen: (runId: string) => Promise<void>;
  onSetDriver: (runId: string, driverName: string | null) => void;
  onChangeDate: (orderId: string) => void;
}

export function RunColumn({
  run, allRuns, pendingOrderId, pendingRunId, onMove, onReorder, onMarkReady, onReopen, onSetDriver, onChangeDate,
}: RunColumnProps) {
  const isReady = run.status === 'READY';
  const columnId = `run:${run.runId}`;
  const { setNodeRef } = useDroppable({ id: columnId, data: { type: 'column', columnId } });

  function handleMoveUpDown(orderId: string, direction: 'up' | 'down') {
    const orderIds = run.cards.map((c) => c.orderId);
    const index = orderIds.indexOf(orderId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || targetIndex < 0 || targetIndex >= orderIds.length) return;
    onReorder(run.runId, arrayMove(orderIds, index, targetIndex));
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex h-full w-[300px] shrink-0 min-h-0 flex-col rounded-lg border ${
        isReady ? 'border-green-200 bg-green-50/40' : 'border-border bg-white'
      }`}
    >
      <header className="border-b border-border p-3">
        <RunHeaderControls
          run={run}
          pending={pendingRunId === run.runId}
          onMarkReady={onMarkReady}
          onReopen={onReopen}
          onSetDriver={onSetDriver}
        />
      </header>
      <div className="flex-1 overflow-y-auto p-2">
        {run.cards.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted">No deliveries yet</p>
        ) : (
          <SortableContext items={run.cards.map((c) => c.orderId)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {run.cards.map((card, index) => (
                <SortableDeliveryCard
                  key={card.orderId}
                  card={card}
                  columnId={columnId}
                  currentRunId={run.runId}
                  runs={allRuns}
                  isFirst={index === 0}
                  isLast={index === run.cards.length - 1}
                  pending={pendingOrderId === card.orderId}
                  locked={isReady}
                  onMove={(targetRunId) => onMove(card.orderId, run.runId, targetRunId)}
                  onMoveUpDown={(direction) => handleMoveUpDown(card.orderId, direction)}
                  onChangeDate={() => onChangeDate(card.orderId)}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
      <footer className="border-t border-border px-3 py-2 text-xs text-muted">
        {totalsCopy(run.stopCount, run.itemCount)}
      </footer>
    </div>
  );
}
