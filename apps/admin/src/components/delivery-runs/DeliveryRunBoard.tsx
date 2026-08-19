import type { DeliveryDayBoard } from '@wholo/types';
import { RunColumn } from './RunColumn';
import { UnassignedColumn } from './UnassignedColumn';

interface DeliveryRunBoardProps {
  board: DeliveryDayBoard;
}

// Horizontal scroll is fully self-contained here: AdminLayout's <main> is
// overflow-x-hidden and globals.css locks html/body overflow, so the board
// owns its own scroller. Every flex ancestor down to each column needs
// min-w-0 — without it, the scroller silently grows to content width and
// <main> clips it with no scrollbar, which reads like a dnd bug and isn't
// one (see delivery-planning-pbi-plan.md §3.6).
export function DeliveryRunBoard({ board }: DeliveryRunBoardProps) {
  return (
    <div className="-mr-6 min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden pr-6">
      <div className="flex h-full min-w-0 gap-4">
        <UnassignedColumn cards={board.unassigned} />
        {board.runs.map((run) => (
          <RunColumn key={run.runId} run={run} />
        ))}
      </div>
    </div>
  );
}
