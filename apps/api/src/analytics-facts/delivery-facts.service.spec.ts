import { DeliveryOutcomeType, Prisma, UnableToDeliverReason } from '@prisma/client';
import { DeliveryFactsService, toOrderEventPayload } from './delivery-facts.service';
import { PrismaService } from '../prisma/prisma.service';

const base = {
  orderId: 'order-1',
  distributorId: 'dist-1',
  traderCustomerId: 'cust-1',
  recordedAt: '2026-09-18T23:30:00.000Z', // 00:30 on the 19th in Europe/London (BST)
};

function makeService(timezone: string | null = 'Europe/London') {
  const rows: Array<Record<string, any>> = [];
  const prisma = {
    distributorSettings: { findUnique: jest.fn().mockResolvedValue(timezone ? { timezone } : null) },
    deliveryFact: {
      create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        if (rows.some((r) => r.eventId === data.eventId)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'x' });
        }
        rows.push(data);
      }),
    },
  };
  return { service: new DeliveryFactsService(prisma as unknown as PrismaService), rows };
}

describe('DeliveryFactsService', () => {
  it('records a delivered outcome against the committed date, the route and the run', async () => {
    const { service, rows } = makeService();

    await service.handleDeliveryEvent('evt-1', 'OrderDelivered', {
      ...base, outcome: DeliveryOutcomeType.DELIVERED, dropMethod: 'HANDED_TO_PERSON', committedDate: '2026-09-18', requestedDate: '2026-09-17', runId: 'run-1', routeId: 'route-1',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outcome: 'DELIVERED', dropMethod: 'HANDED_TO_PERSON', runId: 'run-1', routeId: 'route-1', unableReason: null,
      committedDate: new Date('2026-09-18T00:00:00.000Z'), requestedDate: new Date('2026-09-17T00:00:00.000Z'),
    });
  });

  it('attributes the outcome to the distributor-local calendar day, not the UTC day', async () => {
    const { service, rows } = makeService('Europe/London');

    await service.handleDeliveryEvent('evt-1', 'OrderDelivered', { ...base, committedDate: '2026-09-18' });

    // 23:30Z on the 18th is 00:30 BST on the 19th: delivered a day after it was committed.
    expect(rows[0].distributorLocalDate).toEqual(new Date('2026-09-19T00:00:00.000Z'));
  });

  it('falls back to UTC for a distributor with no settings row', async () => {
    const { service, rows } = makeService(null);
    await service.handleDeliveryEvent('evt-1', 'OrderDelivered', { ...base });
    expect(rows[0].distributorLocalDate).toEqual(new Date('2026-09-18T00:00:00.000Z'));
  });

  it('records the reason for a failed delivery, and only for a failed delivery', async () => {
    const { service, rows } = makeService();

    await service.handleDeliveryEvent('evt-fail', 'OrderDeliveryFailed', { ...base, unableReason: UnableToDeliverReason.CUSTOMER_CLOSED });
    await service.handleDeliveryEvent('evt-ok', 'OrderDelivered', { ...base, orderId: 'order-2', unableReason: UnableToDeliverReason.CUSTOMER_CLOSED });

    expect(rows.find((r) => r.eventId === 'evt-fail')).toMatchObject({ outcome: 'UNABLE_TO_DELIVER', unableReason: 'CUSTOMER_CLOSED' });
    expect(rows.find((r) => r.eventId === 'evt-ok')).toMatchObject({ outcome: 'DELIVERED', unableReason: null });
  });

  it('copes with an event written before the new fields existed: outcome from the event type, no committed date', async () => {
    const { service, rows } = makeService();

    await service.handleDeliveryEvent('evt-old', 'OrderDeliveryFailed', { ...base });

    expect(rows[0]).toMatchObject({ outcome: 'UNABLE_TO_DELIVER', committedDate: null, requestedDate: null, runId: null, routeId: null });
  });

  it('is idempotent: replaying the same event records one fact and does not throw', async () => {
    const { service, rows } = makeService();

    await service.handleDeliveryEvent('evt-1', 'OrderDelivered', { ...base });
    await expect(service.handleDeliveryEvent('evt-1', 'OrderDelivered', { ...base })).resolves.toBeUndefined();

    expect(rows).toHaveLength(1);
  });

  it('lets an unexpected database error surface so the job is retried', async () => {
    const { service } = makeService();
    (service as any).prisma.deliveryFact.create.mockRejectedValueOnce(new Error('connection lost'));

    await expect(service.handleDeliveryEvent('evt-1', 'OrderDelivered', { ...base })).rejects.toThrow('connection lost');
  });
});

describe('toOrderEventPayload', () => {
  it('maps a delivery event onto the order lifecycle', () => {
    expect(toOrderEventPayload('OrderDelivered', base)).toEqual({
      orderId: 'order-1', distributorId: 'dist-1', traderCustomerId: 'cust-1', status: 'DELIVERED', occurredAt: base.recordedAt,
    });
    expect(toOrderEventPayload('OrderDeliveryFailed', base).status).toBe('DELIVERY_FAILED');
  });
});
