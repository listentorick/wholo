import type { DeliveryDayBoard } from '@wholo/types';
import { RunColumn } from './RunColumn';
import { UnassignedColumn } from './UnassignedColumn';

interface DeliveryRunBoardProps {
  board: DeliveryDayBoard;
  pendingOrderId: string | null;
  onMove: (orderId: string, fromRunId: string | null, toRunId: string | null) => void;
  onReorder: (runId: string, orderedOrderIds: string[]) => void;
}

// Horizontal scroll is fully self-contained here: AdminLayout's <main> is
// overflow-x-hidden and globals.css locks html/body overflow, so the board
// owns its own scroller. Every flex ancestor down to each column needs
// min-w-0 — without it, the scroller silently grows to content width and
// <main> clips it with no scrollbar, which reads like a dnd bug and isn't
// one (see delivery-planning-pbi-plan.md §3.6).
export function DeliveryRunBoard({
  board, pendingOrderId, onMove, onReorder,
}: DeliveryRunBoardProps) {
  return (
    <div className="-mr-6 min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden pr-6">
      <div className="flex h-full min-w-0 gap-4">
        <UnassignedColumn
          cards={board.unassigned}
          allRuns={board.runs}
          pendingOrderId={pendingOrderId}
          onMove={onMove}
        />
        {board.runs.map((run) => (
          <RunColumn
            key={run.runId}
            run={run}
            allRuns={board.runs}
            pendingOrderId={pendingOrderId}
            onMove={onMove}
            onReorder={onReorder}
          />
        ))}
      </div>
    </div>
  );
}
