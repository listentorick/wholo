'use client';

import { useState } from 'react';
import {
  DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { DeliveryCard as DeliveryCardType, DeliveryDayBoard } from '@wholo/types';
import { resolveDragEnd } from '@/lib/resolve-drag-end';
import { RunColumn } from './RunColumn';
import { UnassignedColumn } from './UnassignedColumn';
import { DeliveryCard } from './DeliveryCard';

interface DeliveryRunBoardProps {
  board: DeliveryDayBoard;
  pendingOrderId: string | null;
  pendingRunId: string | null;
  onMove: (orderId: string, fromRunId: string | null, toRunId: string | null) => void;
  onReorder: (runId: string, orderedOrderIds: string[]) => void;
  onMarkReady: (runId: string) => Promise<void>;
  onReopen: (runId: string) => Promise<void>;
  onSetDriver: (runId: string, driverName: string | null) => void;
  onChangeDate: (orderId: string) => void;
}

function findCard(board: DeliveryDayBoard, orderId: string): DeliveryCardType | null {
  return board.unassigned.find((c) => c.orderId === orderId)
    ?? board.runs.flatMap((r) => r.cards).find((c) => c.orderId === orderId)
    ?? null;
}

// Horizontal scroll is fully self-contained here: AdminLayout's <main> is
// overflow-x-hidden and globals.css locks html/body overflow, so the board
// owns its own scroller. Every flex ancestor down to each column needs
// min-w-0 — without it, the scroller silently grows to content width and
// <main> clips it with no scrollbar, which reads like a dnd bug and isn't
// one (see delivery-planning-pbi-plan.md §3.6).
//
// One DndContext wraps every column so cross-column drags are possible —
// per-column contexts would make that impossible. The decision logic (which
// column, which position) lives in resolveDragEnd, unit-tested separately
// since dnd-kit's pointer gestures don't simulate reliably in jsdom.
export function DeliveryRunBoard({
  board, pendingOrderId, pendingRunId, onMove, onReorder, onMarkReady, onReopen, onSetDriver, onChangeDate,
}: DeliveryRunBoardProps) {
  const [activeCard, setActiveCard] = useState<DeliveryCardType | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveCard(findCard(board, event.active.id as string));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const result = resolveDragEnd(event, board);
    if (!result) return;
    if (result.type === 'move') onMove(result.orderId, result.fromRunId, result.toRunId);
    else onReorder(result.runId, result.orderedOrderIds);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveCard(null)}
    >
      <div className="-mr-6 min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden pr-6">
        <div className="flex h-full min-w-0 gap-4">
          <UnassignedColumn
            cards={board.unassigned}
            allRuns={board.runs}
            pendingOrderId={pendingOrderId}
            onMove={onMove}
            onChangeDate={onChangeDate}
          />
          {board.runs.map((run) => (
            <RunColumn
              key={run.runId}
              run={run}
              allRuns={board.runs}
              pendingOrderId={pendingOrderId}
              pendingRunId={pendingRunId}
              onMove={onMove}
              onReorder={onReorder}
              onMarkReady={onMarkReady}
              onReopen={onReopen}
              onSetDriver={onSetDriver}
              onChangeDate={onChangeDate}
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {activeCard && (
          <DeliveryCard card={activeCard} currentRunId={null} runs={[]} onMove={() => {}} />
        )}
      </DragOverlay>
    </DndContext>
  );
}
