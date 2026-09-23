import { UnableToDeliverReason, type DeliveryOutcomesResponse, type DeliveryOverview } from '@wholo/types';

export const overviewFixture = (over: Partial<DeliveryOverview> = {}): DeliveryOverview => ({
  distributorId: 'dist-1',
  date: '2026-09-18',
  timezone: 'Europe/London',
  generatedAt: '2026-09-18T11:24:00.000Z', // 12:24 BST
  counts: {
    toAccept: { count: 4, oldestSubmittedAt: '2026-09-18T09:14:00.000Z' },
    overdue: { count: 5 },
    notOnRun: { count: 12 },
    failedLast24h: { count: 3 },
  },
  progress: { planned: 51, delivered: 32, failed: 2, remaining: 17 },
  runs: [
    { runId: 'r1', name: 'R1 North', driverName: 'Dan Whitmore', status: 'READY', stopCount: 18, attemptedCount: 15, lastDropAt: '2026-09-18T11:09:00.000Z' },
    { runId: 'r4', name: 'R4 West', driverName: null, status: 'OPEN', stopCount: 6, attemptedCount: 0, lastDropAt: null },
  ],
  queue: [
    { kind: 'FAILED', orderId: 'o-f1', orderNumber: 'ORD-71', customerName: 'Riverside Care Home', since: '2026-09-18T08:52:00.000Z', dueDate: '2026-09-18', reason: UnableToDeliverReason.CUSTOMER_CLOSED, runName: 'R2 Central' },
    { kind: 'OVERDUE', orderId: 'o-v1', orderNumber: 'ORD-41', customerName: 'Baker & Co', since: null, dueDate: '2026-09-15', reason: null, runName: null },
    { kind: 'TO_ACCEPT', orderId: 'o-t1', orderNumber: 'ORD-78', customerName: 'The Green Grocer', since: '2026-09-18T09:14:00.000Z', dueDate: null, reason: null, runName: null },
    { kind: 'NOT_ON_RUN', orderId: 'o-n1', orderNumber: 'ORD-82', customerName: 'Marlowe Hotel', since: null, dueDate: '2026-09-18', reason: null, runName: null },
  ],
  queueCap: 10,
  ...over,
});

export const outcomesFixture = (over: Partial<DeliveryOutcomesResponse> = {}): DeliveryOutcomesResponse => ({
  distributorId: 'dist-1', from: '2026-09-11', to: '2026-09-17', timezone: 'Europe/London',
  days: [
    { date: '2026-09-11', onTime: 39, late: 1, failed: 0 },
    { date: '2026-09-12', onTime: 6, late: 0, failed: 0 },
    { date: '2026-09-13', onTime: 60, late: 3, failed: 1 },
    { date: '2026-09-14', onTime: 58, late: 4, failed: 2 },
    { date: '2026-09-15', onTime: 43, late: 1, failed: 0 },
    { date: '2026-09-16', onTime: 51, late: 3, failed: 2 },
    { date: '2026-09-17', onTime: 32, late: 0, failed: 2 },
  ],
  ...over,
});
