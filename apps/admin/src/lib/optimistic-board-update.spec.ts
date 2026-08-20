import { describe, it, expect } from 'vitest';
import type { DeliveryDayBoard } from '@wholo/types';
import { applyMove, applyReorder, applyRunUpdate } from './optimistic-board-update';

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
    requestedDeliveryDate: '2026-08-20',
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

describe('applyMove', () => {
  it('moves a card from Unassigned into a run', () => {
    const result = applyMove(makeBoard(), 'c', null, 'run-1');

    expect(result.unassigned.map((c) => c.orderId)).toEqual([]);
    expect(result.runs.find((r) => r.runId === 'run-1')?.cards.map((c) => c.orderId)).toEqual(['a', 'b', 'c']);
  });

  it('moves a card from a run back to Unassigned', () => {
    const result = applyMove(makeBoard(), 'a', 'run-1', null);

    expect(result.runs.find((r) => r.runId === 'run-1')?.cards.map((c) => c.orderId)).toEqual(['b']);
    expect(result.unassigned.map((c) => c.orderId)).toEqual(['c', 'a']);
  });

  it('moves a card from one run to another', () => {
    const result = applyMove(makeBoard(), 'a', 'run-1', 'run-2');

    expect(result.runs.find((r) => r.runId === 'run-1')?.cards.map((c) => c.orderId)).toEqual(['b']);
    expect(result.runs.find((r) => r.runId === 'run-2')?.cards.map((c) => c.orderId)).toEqual(['a']);
  });

  it('leaves the run version fields untouched', () => {
    const result = applyMove(makeBoard(), 'c', null, 'run-1');

    expect(result.runs.find((r) => r.runId === 'run-1')?.version).toBe(0);
  });

  it('returns the board unchanged if the card cannot be found', () => {
    const board = makeBoard();

    expect(applyMove(board, 'missing', null, 'run-1')).toBe(board);
  });
});

describe('applyReorder', () => {
  it('reorders cards within a run', () => {
    const result = applyReorder(makeBoard(), 'run-1', ['b', 'a']);

    expect(result.runs.find((r) => r.runId === 'run-1')?.cards.map((c) => c.orderId)).toEqual(['b', 'a']);
  });

  it('leaves other runs and Unassigned untouched', () => {
    const board = makeBoard();
    const result = applyReorder(board, 'run-1', ['b', 'a']);

    expect(result.runs.find((r) => r.runId === 'run-2')).toBe(board.runs[1]);
    expect(result.unassigned).toBe(board.unassigned);
  });
});

describe('applyRunUpdate', () => {
  it('sets the run status', () => {
    const result = applyRunUpdate(makeBoard(), 'run-1', { status: 'READY' });

    expect(result.runs.find((r) => r.runId === 'run-1')?.status).toBe('READY');
  });

  it('sets the driver name', () => {
    const result = applyRunUpdate(makeBoard(), 'run-1', { driverName: 'Sam' });

    expect(result.runs.find((r) => r.runId === 'run-1')?.driverName).toBe('Sam');
  });

  it('clears the driver name back to null', () => {
    const board = makeBoard();
    board.runs[0].driverName = 'Sam';
    const result = applyRunUpdate(board, 'run-1', { driverName: null });

    expect(result.runs.find((r) => r.runId === 'run-1')?.driverName).toBeNull();
  });

  it('leaves other runs, Unassigned, and unrelated fields untouched', () => {
    const board = makeBoard();
    const result = applyRunUpdate(board, 'run-1', { status: 'READY' });

    expect(result.runs.find((r) => r.runId === 'run-2')).toBe(board.runs[1]);
    expect(result.unassigned).toBe(board.unassigned);
    expect(result.runs.find((r) => r.runId === 'run-1')?.cards).toBe(board.runs[0].cards);
    expect(result.runs.find((r) => r.runId === 'run-1')?.version).toBe(0);
  });
});
