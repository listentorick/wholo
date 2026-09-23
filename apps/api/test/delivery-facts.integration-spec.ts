/**
 * The delivery-facts consumer against a real database: an OrderDelivered /
 * OrderDeliveryFailed event becomes a delivery fact AND moves the order's
 * analytics state to DELIVERED / DELIVERY_FAILED (which is what stops the
 * reconciliation check reporting delivered orders as drift); a replay is a
 * no-op; and the backfill heals outcomes recorded before any of this existed.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { Test } from '@nestjs/testing';
import { AcceptanceModeSource, OrderAcceptanceMode, OrderStatus, OrganisationType, Prisma } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AnalyticsFactsModule } from '../src/analytics-facts/analytics-facts.module';
import { AnalyticsFactsProcessor } from '../src/analytics-facts/analytics-facts.processor';
import { DeliveryFactsBackfillService } from '../src/analytics-facts/delivery-facts-backfill.service';
import { OrderFactsService } from '../src/analytics-facts/order-facts.service';

const DIST = 'test-dfacts-dist';
const CUSTOMER = 'test-dfacts-cust';
const RUN = 'test-dfacts-run';

describe('Delivery facts (integration)', () => {
  let prisma: PrismaService;
  let processor: AnalyticsFactsProcessor;
  let backfill: DeliveryFactsBackfillService;
  let orderFacts: OrderFactsService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PrismaModule, AnalyticsFactsModule] }).compile();
    prisma = module.get(PrismaService);
    await prisma.$connect();
    processor = module.get(AnalyticsFactsProcessor);
    backfill = module.get(DeliveryFactsBackfillService);
    orderFacts = module.get(OrderFactsService);

    await prisma.organisation.upsert({ where: { id: DIST }, create: { id: DIST, name: 'Delivery Facts Test', type: OrganisationType.DISTRIBUTOR }, update: {} });
    await prisma.distributorSettings.upsert({ where: { distributorId: DIST }, create: { distributorId: DIST, timezone: 'Europe/London' }, update: { timezone: 'Europe/London' } });
    await prisma.organisation.upsert({ where: { id: CUSTOMER }, create: { id: CUSTOMER, name: 'Facts Customer', type: OrganisationType.TRADE_CUSTOMER }, update: {} });
  });

  const clean = async () => {
    await prisma.deliveryFact.deleteMany({ where: { distributorId: { in: [DIST] } } });
    await prisma.orderFact.deleteMany({ where: { distributorId: { in: [DIST] } } });
    await prisma.orderAnalyticsState.deleteMany({ where: { distributorId: { in: [DIST] } } });
    await prisma.orderDeliveryOutcome.deleteMany({ where: { order: { distributorId: { in: [DIST] } } } });
    await prisma.deliveryRunOrder.deleteMany({ where: { run: { distributorId: { in: [DIST] } } } });
    await prisma.deliveryRun.deleteMany({ where: { distributorId: { in: [DIST] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST] } } });
  };
  beforeEach(clean);
  afterAll(async () => {
    await clean();
    await prisma.distributorSettings.deleteMany({ where: { distributorId: DIST } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST, CUSTOMER] } } });
    await prisma.$disconnect();
  });

  let seq = 0;
  async function acceptedOrder(status: OrderStatus, over: Partial<Prisma.OrderUncheckedCreateInput> = {}) {
    seq++;
    const order = await prisma.order.create({
      data: {
        id: `test-dfacts-order-${seq}-${Date.now()}`, distributorId: DIST, traderCustomerId: CUSTOMER, placedByUserId: 'test-dfacts-user',
        orderNumber: `DFACTS-${seq}-${Date.now()}`, currency: 'GBP', status,
        acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL, acceptanceModeSourceSnapshot: AcceptanceModeSource.DISTRIBUTOR_DEFAULT,
        subtotalAmount: new Prisma.Decimal('100.00'), taxAmount: new Prisma.Decimal('0.00'), totalAmount: new Prisma.Decimal('100.00'),
        acceptedAt: new Date('2026-09-15T10:00:00.000Z'),
        requestedDeliveryDate: new Date('2026-09-17T00:00:00.000Z'), scheduledDeliveryDate: new Date('2026-09-18T00:00:00.000Z'),
        ...over,
      },
    });
    // What the live consumer would already have projected for an accepted order.
    await orderFacts.handleOrderEvent(`evt-accept-${order.id}`, 'OrderAccepted', {
      orderId: order.id, distributorId: DIST, traderCustomerId: CUSTOMER, status: OrderStatus.ACCEPTED, occurredAt: '2026-09-15T10:00:00.000Z',
    });
    return order;
  }

  const deliveredEvent = (orderId: string, over: Record<string, unknown> = {}) => ({
    orderId, distributorId: DIST, traderCustomerId: CUSTOMER, recordedAt: '2026-09-18T23:30:00.000Z', // 00:30 on the 19th in London
    outcome: 'DELIVERED', dropMethod: 'LEFT_IN_SAFE_LOCATION', committedDate: '2026-09-18', requestedDate: '2026-09-17', runId: RUN, routeId: null, ...over,
  });
  const job = (name: string, eventId: string, payload: Record<string, unknown>) => ({ name, data: { eventId, aggregateType: 'Order', aggregateId: 'x', payload } }) as never;

  it('turns an OrderDelivered event into a delivery fact, and moves the order to DELIVERED in the analytics state', async () => {
    const order = await acceptedOrder(OrderStatus.DELIVERED);

    await processor.process(job('OrderDelivered', 'evt-1', deliveredEvent(order.id)));

    const fact = await prisma.deliveryFact.findFirstOrThrow({ where: { eventId: 'evt-1' } });
    expect(fact).toMatchObject({ orderId: order.id, outcome: 'DELIVERED', dropMethod: 'LEFT_IN_SAFE_LOCATION', runId: RUN, unableReason: null });
    expect(fact.committedDate).toEqual(new Date('2026-09-18T00:00:00.000Z'));
    expect(fact.distributorLocalDate).toEqual(new Date('2026-09-19T00:00:00.000Z')); // the distributor's day, not the UTC day
    const state = await prisma.orderAnalyticsState.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(state.status).toBe('DELIVERED');
    expect((await prisma.orderFact.findMany({ where: { orderId: order.id, eventType: 'OrderDelivered' } }))).toHaveLength(1);
  });

  it('records a failed delivery with its reason', async () => {
    const order = await acceptedOrder(OrderStatus.DELIVERY_FAILED);

    await processor.process(job('OrderDeliveryFailed', 'evt-2', deliveredEvent(order.id, { outcome: 'UNABLE_TO_DELIVER', unableReason: 'CUSTOMER_CLOSED', dropMethod: null })));

    expect(await prisma.deliveryFact.findFirstOrThrow({ where: { eventId: 'evt-2' } })).toMatchObject({ outcome: 'UNABLE_TO_DELIVER', unableReason: 'CUSTOMER_CLOSED' });
    expect((await prisma.orderAnalyticsState.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe('DELIVERY_FAILED');
  });

  it('is idempotent: replaying the same event changes nothing', async () => {
    const order = await acceptedOrder(OrderStatus.DELIVERED);
    const event = job('OrderDelivered', 'evt-3', deliveredEvent(order.id));

    await processor.process(event);
    await processor.process(event);

    expect(await prisma.deliveryFact.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.orderFact.count({ where: { orderId: order.id, eventType: 'OrderDelivered' } })).toBe(1);
  });

  describe('backfill', () => {
    it('gives an outcome recorded before delivery facts existed a fact, and heals its analytics state', async () => {
      const order = await acceptedOrder(OrderStatus.DELIVERED);
      const run = await prisma.deliveryRun.create({ data: { id: RUN, distributorId: DIST, name: 'R1', deliveryDate: new Date('2026-09-18T00:00:00.000Z') } });
      await prisma.deliveryRunOrder.create({ data: { runId: run.id, orderId: order.id, allocationSource: 'MANUAL', assignedByUserId: 'test-dfacts-user' } });
      await prisma.orderDeliveryOutcome.create({ data: { orderId: order.id, outcome: 'DELIVERED', dropMethod: 'LEFT_IN_SAFE_LOCATION', recordedAt: new Date('2026-09-18T15:00:00.000Z') } });
      // The gap: the order is DELIVERED but the analytics state still says ACCEPTED.
      expect((await prisma.orderAnalyticsState.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe('ACCEPTED');

      await backfill.backfillMissing();

      const facts = await prisma.deliveryFact.findMany({ where: { orderId: order.id } });
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({ outcome: 'DELIVERED', runId: RUN, distributorLocalDate: new Date('2026-09-18T00:00:00.000Z') });
      expect(facts[0].committedDate).toEqual(new Date('2026-09-18T00:00:00.000Z'));
      expect((await prisma.orderAnalyticsState.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe('DELIVERED');
    });

    it('is safe to run again: nothing is duplicated', async () => {
      const order = await acceptedOrder(OrderStatus.DELIVERED);
      await prisma.orderDeliveryOutcome.create({ data: { orderId: order.id, outcome: 'DELIVERED', dropMethod: 'LEFT_IN_SAFE_LOCATION', recordedAt: new Date('2026-09-18T15:00:00.000Z') } });

      await backfill.backfillMissing();
      const second = await backfill.backfillMissing();

      expect(second).toBe(0);
      expect(await prisma.deliveryFact.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('leaves an outcome alone once the live consumer has already recorded it', async () => {
      const order = await acceptedOrder(OrderStatus.DELIVERED);
      await prisma.orderDeliveryOutcome.create({ data: { orderId: order.id, outcome: 'DELIVERED', dropMethod: 'LEFT_IN_SAFE_LOCATION', recordedAt: new Date('2026-09-18T15:00:00.000Z') } });
      await processor.process(job('OrderDelivered', 'evt-live', deliveredEvent(order.id, { recordedAt: '2026-09-18T15:00:00.000Z' })));

      await backfill.backfillMissing();

      expect(await prisma.deliveryFact.count({ where: { orderId: order.id } })).toBe(1);
    });
  });

  it('reconciliation no longer reports a delivered order as drift once its delivery event has been consumed', async () => {
    const order = await acceptedOrder(OrderStatus.DELIVERED);
    const mismatched = async () => (await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM orders o JOIN order_analytics_state s ON s."orderId" = o.id
      WHERE o.id = ${order.id} AND o.status::text != s.status::text`)[0].n;

    expect(await mismatched()).toBe(1); // before: ACCEPTED in state, DELIVERED on the order

    await processor.process(job('OrderDelivered', 'evt-4', deliveredEvent(order.id)));

    expect(await mismatched()).toBe(0);
  });
});
