import { OrderStatus } from '@prisma/client';
import { QueueOrderRow, RunRow, buildQueue, summariseProgress, summariseRuns } from './delivery-overview.logic';

const at = (iso: string) => new Date(iso);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const orderRow = (over: Partial<QueueOrderRow> = {}): QueueOrderRow => ({
  id: 'o1',
  orderNumber: 'ORD-1',
  submittedAt: at('2026-09-18T08:00:00.000Z'),
  scheduledDeliveryDate: null,
  requestedDeliveryDate: day('2026-09-18'),
  customer: { name: 'The Anchor Bar' },
  deliveryOutcome: null,
  deliveryRunOrders: [],
  ...over,
});

const runOrder = (status: OrderStatus, recordedAt?: string) => ({
  order: { status, deliveryOutcome: recordedAt ? { recordedAt: at(recordedAt) } : null },
});
const run = (over: Partial<RunRow> = {}): RunRow => ({ id: 'r1', name: 'R1 North', driverName: 'Dan', status: 'OPEN', orders: [], ...over });

describe('summariseRuns', () => {
  it('reports stops, attempted stops (delivered or failed) and the latest drop time', () => {
    const [summary] = summariseRuns([
      run({
        status: 'READY',
        orders: [
          runOrder('DELIVERED', '2026-09-18T09:10:00.000Z'),
          runOrder('DELIVERY_FAILED', '2026-09-18T11:40:00.000Z'),
          runOrder('DELIVERED', '2026-09-18T10:00:00.000Z'),
          runOrder('ACCEPTED'),
        ],
      }),
    ]);

    expect(summary).toEqual({
      runId: 'r1', name: 'R1 North', driverName: 'Dan', status: 'READY',
      stopCount: 4, attemptedCount: 3, lastDropAt: '2026-09-18T11:40:00.000Z',
    });
  });

  it('has no last drop for a run nothing has left', () => {
    const [summary] = summariseRuns([run({ orders: [runOrder('ACCEPTED'), runOrder('ACCEPTED')] })]);
    expect(summary).toMatchObject({ stopCount: 2, attemptedCount: 0, lastDropAt: null });
  });

  it('handles an empty run and no runs at all', () => {
    expect(summariseRuns([run()])[0]).toMatchObject({ stopCount: 0, attemptedCount: 0, lastDropAt: null });
    expect(summariseRuns([])).toEqual([]);
  });
});

describe('summariseProgress', () => {
  it('adds up: planned = delivered + failed + remaining', () => {
    const progress = summariseProgress(
      [run({ orders: [runOrder('DELIVERED'), runOrder('DELIVERED'), runOrder('DELIVERY_FAILED'), runOrder('ACCEPTED')] }), run({ id: 'r2', orders: [runOrder('ACCEPTED')] })],
      0,
    );
    expect(progress).toEqual({ planned: 5, delivered: 2, failed: 1, remaining: 2 });
  });

  it('counts an accepted order no run has picked up yet as still to deliver', () => {
    const progress = summariseProgress([run({ orders: [runOrder('DELIVERED')] })], 3);
    expect(progress).toEqual({ planned: 4, delivered: 1, failed: 0, remaining: 3 });
  });

  it('ignores orders on a run that are neither accepted nor attempted (e.g. cancelled after allocation)', () => {
    const progress = summariseProgress([run({ orders: [runOrder('CANCELLED'), runOrder('REJECTED'), runOrder('ACCEPTED')] })], 0);
    expect(progress).toEqual({ planned: 1, delivered: 0, failed: 0, remaining: 1 });
  });

  it('is all zeros on a day with nothing planned', () => {
    expect(summariseProgress([], 0)).toEqual({ planned: 0, delivered: 0, failed: 0, remaining: 0 });
  });
});

describe('buildQueue', () => {
  const empty = { FAILED: [], OVERDUE: [], TO_ACCEPT: [], NOT_ON_RUN: [] };

  it('lists failed first, then overdue, to accept, not on a run — each list keeping its own order', () => {
    const queue = buildQueue({
      FAILED: [orderRow({ id: 'f1' }), orderRow({ id: 'f2' })],
      OVERDUE: [orderRow({ id: 'v1' })],
      TO_ACCEPT: [orderRow({ id: 't1' }), orderRow({ id: 't2' })],
      NOT_ON_RUN: [orderRow({ id: 'n1' })],
    });

    expect(queue.map((i) => `${i.kind}:${i.orderId}`)).toEqual(['FAILED:f1', 'FAILED:f2', 'OVERDUE:v1', 'TO_ACCEPT:t1', 'TO_ACCEPT:t2', 'NOT_ON_RUN:n1']);
  });

  it('is empty when nothing needs doing', () => {
    expect(buildQueue(empty)).toEqual([]);
  });

  it('describes a failed delivery by when it failed and why, and where it was going', () => {
    const [item] = buildQueue({
      ...empty,
      FAILED: [orderRow({
        deliveryOutcome: { recordedAt: at('2026-09-18T09:52:00.000Z'), unableReason: 'CUSTOMER_CLOSED' },
        deliveryRunOrders: [{ run: { name: 'R2 Central' } }],
      })],
    });

    expect(item).toMatchObject({ kind: 'FAILED', since: '2026-09-18T09:52:00.000Z', reason: 'CUSTOMER_CLOSED', runName: 'R2 Central', customerName: 'The Anchor Bar', orderNumber: 'ORD-1' });
  });

  it('describes an order waiting to be accepted by when it was submitted, with no reason', () => {
    const [item] = buildQueue({ ...empty, TO_ACCEPT: [orderRow()] });
    expect(item).toMatchObject({ kind: 'TO_ACCEPT', since: '2026-09-18T08:00:00.000Z', reason: null, runName: null });
  });

  it('describes date-driven items by their due date only, preferring the scheduled date over the requested one', () => {
    const [overdue, notOnRun] = buildQueue({
      ...empty,
      OVERDUE: [orderRow({ scheduledDeliveryDate: day('2026-09-16'), requestedDeliveryDate: day('2026-09-15') })],
      NOT_ON_RUN: [orderRow({ scheduledDeliveryDate: null, requestedDeliveryDate: day('2026-09-18') })],
    });

    expect(overdue).toMatchObject({ kind: 'OVERDUE', since: null, dueDate: '2026-09-16', reason: null });
    expect(notOnRun).toMatchObject({ kind: 'NOT_ON_RUN', since: null, dueDate: '2026-09-18' });
  });

  it('copes with an order missing its optional facts rather than throwing', () => {
    const [item] = buildQueue({ ...empty, FAILED: [orderRow({ deliveryOutcome: null, scheduledDeliveryDate: null, requestedDeliveryDate: null })] });
    expect(item).toMatchObject({ since: null, reason: null, dueDate: null });
  });
});
