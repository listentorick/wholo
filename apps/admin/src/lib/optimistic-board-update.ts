import type { DeliveryCard, DeliveryDayBoard } from '@wholo/types';

function findAndRemove(board: DeliveryDayBoard, orderId: string): { card: DeliveryCard | null; board: DeliveryDayBoard } {
  let card: DeliveryCard | null = null;

  const unassigned = board.unassigned.filter((c) => {
    if (c.orderId === orderId) {
      card = c;
      return false;
    }
    return true;
  });

  const runs = board.runs.map((r) => {
    if (card) return r;
    const cards = r.cards.filter((c) => {
      if (c.orderId === orderId) {
        card = c;
        return false;
      }
      return true;
    });
    return cards.length === r.cards.length ? r : { ...r, cards };
  });

  return { card, board: { ...board, unassigned, runs } };
}

// Optimistic mirror of what the server does on assign/unassign: the card
// leaves wherever it currently lives and is appended to the destination
// (resolveDragEnd's cross-column case always appends, never inserts at a
// position — see resolve-drag-end.ts). Applied synchronously on drop so
// dnd-kit's SortableContext never re-renders against a stale order while
// the mutation is in flight (that gap is what caused the snap-back-then-
// disappear flicker).
export function applyMove(
  board: DeliveryDayBoard,
  orderId: string,
  fromRunId: string | null,
  toRunId: string | null,
): DeliveryDayBoard {
  const { card, board: withoutCard } = findAndRemove(board, orderId);
  if (!card) return board;

  if (toRunId === null) {
    return { ...withoutCard, unassigned: [...withoutCard.unassigned, card] };
  }

  return {
    ...withoutCard,
    runs: withoutCard.runs.map((r) => (r.runId === toRunId ? { ...r, cards: [...r.cards, card as DeliveryCard] } : r)),
  };
}

// Optimistic mirror of a within-run reorder: rebuild the run's cards in the
// given order, reusing the existing card objects.
export function applyReorder(board: DeliveryDayBoard, runId: string, orderedOrderIds: string[]): DeliveryDayBoard {
  return {
    ...board,
    runs: board.runs.map((r) => {
      if (r.runId !== runId) return r;
      const byId = new Map(r.cards.map((c) => [c.orderId, c]));
      const cards = orderedOrderIds.map((id) => byId.get(id)).filter((c): c is DeliveryCard => c != null);
      return { ...r, cards };
    }),
  };
}
