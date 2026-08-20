import { describe, it, expect } from 'vitest';
import type { DragEndEvent } from '@dnd-kit/core';
import type { DeliveryDayBoard } from '@wholo/types';
import { resolveDragEnd } from './resolve-drag-end';

function makeCard(orderId: string) {
  return {
    orderId,
    orderNumber: `ORD-${orderId}`,
    traderCustomerId: 'cust-1',
    customerName: 'Blackbird Kitchen',
    deliveryAddress: null,
    stopNumber: 1,
    lineCount: 1,
    itemCount: 1,
    attention: 'NONE' as const,
    unallocatedReason: null,
    suggestedRunId: null,
    suggestedRouteName: null,
    scheduledDeliveryDate: '2026-08-20',
    allocationSource: 'DEFAULT_ROUTE' as const,
  };
}

function makeBoard(): DeliveryDayBoard {
  return {
    distributorId: 'dist-1',
    date: '2026-08-20',
    runs: [
      {
        runId: 'run-1',
        routeId: 'route-1',
        name: 'Yorkshire',
        driverName: null,
        status: 'OPEN',
        version: 0,
        cards: [makeCard('a'), makeCard('b')],
        stopCount: 2,
        itemCount: 2,
      },
      {
        runId: 'run-2',
        routeId: null,
        name: 'Overflow',
        driverName: null,
        status: 'OPEN',
        version: 0,
        cards: [],
        stopCount: 0,
        itemCount: 0,
      },
    ],
    unassigned: [makeCard('c')],
  };
}

// Minimal fakes for the parts of DragEndEvent resolveDragEnd actually reads.
function makeEvent(
  activeId: string,
  activeColumnId: string | undefined,
  over: { id: string; type: 'card' | 'column'; columnId?: string } | null,
): DragEndEvent {
  return {
    active: { id: activeId, data: { current: activeColumnId ? { type: 'card', columnId: activeColumnId } : undefined } },
    over: over
      ? { id: over.id, data: { current: { type: over.type, columnId: over.columnId } } }
      : null,
  } as unknown as DragEndEvent;
}

describe('resolveDragEnd', () => {
  it('resolves a cross-column drag onto a card as a move', () => {
    const board = makeBoard();
    const event = makeEvent('c', 'unassigned', { id: 'a', type: 'card', columnId: 'run:run-1' });

    expect(resolveDragEnd(event, board)).toEqual({
      type: 'move', orderId: 'c', fromRunId: null, toRunId: 'run-1',
    });
  });

  it('resolves a cross-column drag onto empty column space as the same move result', () => {
    const board = makeBoard();
    const event = makeEvent('c', 'unassigned', { id: 'run:run-2', type: 'column' });

    expect(resolveDragEnd(event, board)).toEqual({
      type: 'move', orderId: 'c', fromRunId: null, toRunId: 'run-2',
    });
  });

  it('resolves a run-to-run drag as a move with both run ids set', () => {
    const board = makeBoard();
    const event = makeEvent('a', 'run:run-1', { id: 'run:run-2', type: 'column' });

    expect(resolveDragEnd(event, board)).toEqual({
      type: 'move', orderId: 'a', fromRunId: 'run-1', toRunId: 'run-2',
    });
  });

  it('resolves a drag onto Unassigned as a move to null', () => {
    const board = makeBoard();
    const event = makeEvent('a', 'run:run-1', { id: 'unassigned', type: 'column' });

    expect(resolveDragEnd(event, board)).toEqual({
      type: 'move', orderId: 'a', fromRunId: 'run-1', toRunId: null,
    });
  });

  it('resolves a within-run drag as a reorder with the arrayMove result', () => {
    const board = makeBoard();
    const event = makeEvent('b', 'run:run-1', { id: 'a', type: 'card', columnId: 'run:run-1' });

    expect(resolveDragEnd(event, board)).toEqual({
      type: 'reorder', runId: 'run-1', orderedOrderIds: ['b', 'a'],
    });
  });

  it('returns null for a drag within Unassigned (no ordering concept there)', () => {
    const board = makeBoard();
    const event = makeEvent('c', 'unassigned', { id: 'unassigned', type: 'column' });

    expect(resolveDragEnd(event, board)).toBeNull();
  });

  it('returns null when dropped onto itself', () => {
    const board = makeBoard();
    const event = makeEvent('a', 'run:run-1', { id: 'a', type: 'card', columnId: 'run:run-1' });

    expect(resolveDragEnd(event, board)).toBeNull();
  });

  it('returns null when dropped outside any droppable', () => {
    const board = makeBoard();
    const event = makeEvent('a', 'run:run-1', null);

    expect(resolveDragEnd(event, board)).toBeNull();
  });
});
