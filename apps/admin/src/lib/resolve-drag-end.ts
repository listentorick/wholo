import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import type { DeliveryDayBoard } from '@wholo/types';

export type DragResult =
  | { type: 'move'; orderId: string; fromRunId: string | null; toRunId: string | null }
  | { type: 'reorder'; runId: string; orderedOrderIds: string[] }
  | null;

function columnIdToRunId(columnId: string): string | null {
  return columnId === 'unassigned' ? null : columnId.slice('run:'.length);
}

// Pure decision logic, deliberately separated from DndContext's onDragEnd —
// dnd-kit's pointer gestures don't simulate reliably in jsdom, so this is
// what gets unit-tested; the real gesture is verified in a browser.
//
// A cross-column drag always appends (same as MoveToMenu — one shared
// mutation path, not a position-aware variant). Only a within-run drag
// reorders; Unassigned has no ordering concept.
export function resolveDragEnd(event: DragEndEvent, board: DeliveryDayBoard): DragResult {
  const { active, over } = event;
  if (!over) return null;

  const activeColumnId = active.data.current?.columnId as string | undefined;
  const overColumnId = (over.data.current?.type === 'column'
    ? over.id
    : over.data.current?.columnId) as string | undefined;
  if (!activeColumnId || !overColumnId) return null;

  if (activeColumnId !== overColumnId) {
    return {
      type: 'move',
      orderId: active.id as string,
      fromRunId: columnIdToRunId(activeColumnId),
      toRunId: columnIdToRunId(overColumnId),
    };
  }

  if (active.id === over.id) return null;

  const runId = columnIdToRunId(activeColumnId);
  if (runId === null) return null; // Unassigned: no ordering to reorder

  const run = board.runs.find((r) => r.runId === runId);
  if (!run) return null;

  const orderIds = run.cards.map((c) => c.orderId);
  const oldIndex = orderIds.indexOf(active.id as string);
  const newIndex = orderIds.indexOf(over.id as string);
  if (oldIndex === -1 || newIndex === -1) return null;

  return { type: 'reorder', runId, orderedOrderIds: arrayMove(orderIds, oldIndex, newIndex) };
}
