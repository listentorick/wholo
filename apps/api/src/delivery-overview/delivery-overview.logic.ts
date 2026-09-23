import { OrderStatus, Prisma } from '@prisma/client';
import type { DeliveryOverview, DeliveryOverviewQueueItem, DeliveryOverviewQueueKind, DeliveryOverviewRun } from '@wholo/types';

// Kept free of I/O so the definitions below can be tested as behaviour. The
// where-builders are the single definition of each bucket, used for both the
// count and the list, so a tile can never disagree with the queue behind it.
//
// The four order buckets are disjoint by construction — they differ in status
// (SUBMITTED / ACCEPTED / DELIVERY_FAILED) or, for the two ACCEPTED ones, in
// whether the delivery date is before today or today — so nothing is counted
// twice. Undated ACCEPTED orders belong to the Delivery Runs page.

export const QUEUE_CAP = 10;
export const QUEUE_ORDER: DeliveryOverviewQueueKind[] = ['FAILED', 'OVERDUE', 'TO_ACCEPT', 'NOT_ON_RUN'];

/** Scheduled date wins over the requested one (the same rule as the Delivery Runs board). */
const dateIs = (day: Date): Prisma.OrderWhereInput[] => [
  { scheduledDeliveryDate: day },
  { scheduledDeliveryDate: null, requestedDeliveryDate: day },
];
const dateBefore = (day: Date): Prisma.OrderWhereInput[] => [
  { scheduledDeliveryDate: { lt: day } },
  { scheduledDeliveryDate: null, requestedDeliveryDate: { lt: day } },
];

export function bucketWhere(kind: DeliveryOverviewQueueKind, distributorId: string, day: Date, failedSince: Date): Prisma.OrderWhereInput {
  switch (kind) {
    case 'FAILED':
      return { distributorId, status: OrderStatus.DELIVERY_FAILED, deliveryOutcome: { is: { recordedAt: { gt: failedSince } } } };
    case 'TO_ACCEPT':
      return { distributorId, status: OrderStatus.SUBMITTED };
    case 'OVERDUE':
      return { distributorId, status: OrderStatus.ACCEPTED, OR: dateBefore(day) };
    case 'NOT_ON_RUN':
      return { distributorId, status: OrderStatus.ACCEPTED, OR: dateIs(day), deliveryRunOrders: { none: { removedAt: null } } };
  }
}

/** Failed: newest first (most recent is most actionable). The rest: longest-waiting first. */
export const bucketOrderBy: Record<DeliveryOverviewQueueKind, Prisma.OrderOrderByWithRelationInput[]> = {
  FAILED: [{ deliveryOutcome: { recordedAt: 'desc' } }],
  OVERDUE: [{ scheduledDeliveryDate: { sort: 'asc', nulls: 'last' } }, { requestedDeliveryDate: 'asc' }],
  TO_ACCEPT: [{ submittedAt: 'asc' }],
  NOT_ON_RUN: [{ acceptedAt: 'asc' }],
};

export const queueOrderSelect = {
  id: true,
  orderNumber: true,
  submittedAt: true,
  scheduledDeliveryDate: true,
  requestedDeliveryDate: true,
  customer: { select: { name: true } },
  deliveryOutcome: { select: { recordedAt: true, unableReason: true } },
  deliveryRunOrders: { where: { removedAt: null }, take: 1, select: { run: { select: { name: true } } } },
} satisfies Prisma.OrderSelect;

export type QueueOrderRow = Prisma.OrderGetPayload<{ select: typeof queueOrderSelect }>;

export const runSelect = {
  id: true,
  name: true,
  driverName: true,
  status: true,
  orders: {
    where: { removedAt: null },
    select: { order: { select: { status: true, deliveryOutcome: { select: { recordedAt: true } } } } },
  },
} satisfies Prisma.DeliveryRunSelect;

export type RunRow = Prisma.DeliveryRunGetPayload<{ select: typeof runSelect }>;

export const isoDate = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function toQueueItem(kind: DeliveryOverviewQueueKind, order: QueueOrderRow): DeliveryOverviewQueueItem {
  const outcome = order.deliveryOutcome;
  return {
    kind,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customer.name,
    since: kind === 'FAILED' ? (outcome?.recordedAt.toISOString() ?? null) : kind === 'TO_ACCEPT' ? (order.submittedAt?.toISOString() ?? null) : null,
    dueDate: isoDate(order.scheduledDeliveryDate ?? order.requestedDeliveryDate),
    // The Prisma and shared-types enums are the same string values.
    reason: kind === 'FAILED' ? ((outcome?.unableReason ?? null) as DeliveryOverviewQueueItem['reason']) : null,
    runName: order.deliveryRunOrders[0]?.run.name ?? null,
  };
}

/** Failed first, then overdue, to accept, not on a run; each list keeps its own order. */
export function buildQueue(lists: Record<DeliveryOverviewQueueKind, QueueOrderRow[]>): DeliveryOverviewQueueItem[] {
  return QUEUE_ORDER.flatMap((kind) => lists[kind].map((order) => toQueueItem(kind, order)));
}

const attempted = (status: OrderStatus) => status === OrderStatus.DELIVERED || status === OrderStatus.DELIVERY_FAILED;

export function summariseRuns(runs: RunRow[]): DeliveryOverviewRun[] {
  return runs.map((run) => {
    const orders = run.orders.map((ro) => ro.order);
    const done = orders.filter((o) => attempted(o.status));
    const times = done.map((o) => o.deliveryOutcome?.recordedAt.getTime()).filter((t): t is number => t != null);
    return {
      runId: run.id,
      name: run.name,
      driverName: run.driverName,
      status: run.status,
      stopCount: orders.length,
      attemptedCount: done.length,
      lastDropAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    };
  });
}

/**
 * Today's delivery progress. Everything on today's runs counts as planned; so
 * does an order accepted for today that no run has picked up yet (it still
 * has to be delivered), which is why the not-on-a-run count joins `remaining`.
 * Orders on a run that are neither accepted nor attempted (e.g. cancelled after
 * allocation) are not planned work.
 */
export function summariseProgress(runs: RunRow[], notOnRunCount: number): DeliveryOverview['progress'] {
  const orders = runs.flatMap((run) => run.orders.map((ro) => ro.order));
  const delivered = orders.filter((o) => o.status === OrderStatus.DELIVERED).length;
  const failed = orders.filter((o) => o.status === OrderStatus.DELIVERY_FAILED).length;
  const remaining = orders.filter((o) => o.status === OrderStatus.ACCEPTED).length + notOnRunCount;
  return { planned: delivered + failed + remaining, delivered, failed, remaining };
}
