import { DeliveryFactsBackfillService } from './delivery-facts-backfill.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderFactsService } from './order-facts.service';
import { DeliveryFactsService } from './delivery-facts.service';

const outcome = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  outcome: 'DELIVERED',
  unableReason: null,
  dropMethod: 'HANDED_TO_PERSON',
  recordedAt: new Date('2026-09-10T10:00:00.000Z'),
  order: {
    id: `order-${id}`, distributorId: 'dist-1', traderCustomerId: 'cust-1',
    scheduledDeliveryDate: new Date('2026-09-10T00:00:00.000Z'), requestedDeliveryDate: new Date('2026-09-09T00:00:00.000Z'),
    deliveryRunOrders: [{ runId: 'run-1', run: { routeId: 'route-1' } }],
  },
  ...over,
});

function setup(batches: string[][], outcomes: Record<string, unknown>[]) {
  const queue = [...batches];
  const prisma = {
    $queryRaw: jest.fn(async () => (queue.shift() ?? []).map((id) => ({ id }))),
    orderDeliveryOutcome: { findMany: jest.fn(async ({ where }: any) => outcomes.filter((o: any) => where.id.in.includes(o.id))) },
  };
  const orderFacts = { handleOrderEvent: jest.fn().mockResolvedValue(undefined) };
  const deliveryFacts = { handleDeliveryEvent: jest.fn().mockResolvedValue(undefined) };
  const service = new DeliveryFactsBackfillService(prisma as unknown as PrismaService, orderFacts as unknown as OrderFactsService, deliveryFacts as unknown as DeliveryFactsService);
  return { service, orderFacts, deliveryFacts };
}

describe('DeliveryFactsBackfillService', () => {
  it('does nothing when every outcome already has a fact', async () => {
    const { service, orderFacts, deliveryFacts } = setup([[]], []);

    await expect(service.backfillMissing()).resolves.toBe(0);
    expect(orderFacts.handleOrderEvent).not.toHaveBeenCalled();
    expect(deliveryFacts.handleDeliveryEvent).not.toHaveBeenCalled();
  });

  it('replays a missing outcome through both consumers under a stable, outcome-derived event id', async () => {
    const { service, orderFacts, deliveryFacts } = setup([['o1']], [outcome('o1')]);

    await expect(service.backfillMissing()).resolves.toBe(1);

    expect(orderFacts.handleOrderEvent).toHaveBeenCalledWith('backfill-outcome-o1', 'OrderDelivered',
      expect.objectContaining({ orderId: 'order-o1', status: 'DELIVERED', occurredAt: '2026-09-10T10:00:00.000Z' }));
    expect(deliveryFacts.handleDeliveryEvent).toHaveBeenCalledWith('backfill-outcome-o1', 'OrderDelivered',
      expect.objectContaining({ committedDate: '2026-09-10', requestedDate: '2026-09-09', runId: 'run-1', routeId: 'route-1', dropMethod: 'HANDED_TO_PERSON' }));
  });

  it('treats a failed outcome as OrderDeliveryFailed, carrying its reason', async () => {
    const failed = outcome('o2', { outcome: 'UNABLE_TO_DELIVER', unableReason: 'NO_ACCESS', dropMethod: null });
    const { service, deliveryFacts } = setup([['o2']], [failed]);

    await service.backfillMissing();

    expect(deliveryFacts.handleDeliveryEvent).toHaveBeenCalledWith('backfill-outcome-o2', 'OrderDeliveryFailed',
      expect.objectContaining({ outcome: 'UNABLE_TO_DELIVER', unableReason: 'NO_ACCESS' }));
  });

  it('copes with an order that was never on a run, and one with no scheduled date (falls back to requested)', async () => {
    const o = outcome('o3');
    (o.order as any).deliveryRunOrders = [];
    (o.order as any).scheduledDeliveryDate = null;
    const { service, deliveryFacts } = setup([['o3']], [o]);

    await service.backfillMissing();

    expect(deliveryFacts.handleDeliveryEvent).toHaveBeenCalledWith('backfill-outcome-o3', 'OrderDelivered',
      expect.objectContaining({ committedDate: '2026-09-09', runId: null, routeId: null }));
  });

  it('keeps going through full batches until nothing is missing', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `a${i}`);
    const { service, deliveryFacts } = setup([ids, ['z1'], []], [...ids.map((i) => outcome(i)), outcome('z1')]);

    await expect(service.backfillMissing()).resolves.toBe(201);
    expect(deliveryFacts.handleDeliveryEvent).toHaveBeenCalledTimes(201);
  });

  it('does not let a failure escape the scheduled tick (it is retried on the next interval)', async () => {
    const { service } = setup([['o1']], [outcome('o1')]);
    jest.spyOn(service, 'backfillMissing').mockRejectedValue(new Error('db down'));

    await expect(service.tick()).resolves.toBeUndefined();
  });
});
