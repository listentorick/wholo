/**
 * Integration tests for the dashboard analytics fact layer (Foundation phase).
 * Proves against a real (TimescaleDB-backed) database that:
 *   - order lifecycle events are recorded durably and idempotently
 *   - order_analytics_state always reflects current truth
 *   - order_analytics_state can be fully reconstructed from order_facts alone
 *     (Foundation's "reproducible from durable facts" exit criterion)
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { Test } from '@nestjs/testing';
import { AcceptanceModeSource, OrderAcceptanceMode, OrderStatus, OrganisationType, Prisma } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AnalyticsFactsModule } from '../src/analytics-facts/analytics-facts.module';
import { OrderFactsService } from '../src/analytics-facts/order-facts.service';

const DIST_A = 'test-facts-dist-a';
const CUSTOMER_A = 'test-facts-cust-a';
const ORDER_1 = 'test-facts-order-1';
const PRODUCT_1 = 'test-facts-product-1';

describe('Analytics fact layer (integration)', () => {
  let prisma: PrismaService;
  let orderFacts: OrderFactsService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, AnalyticsFactsModule],
    }).compile();

    prisma = module.get(PrismaService);
    await prisma.$connect();
    orderFacts = module.get(OrderFactsService);

    await prisma.organisation.upsert({
      where: { id: DIST_A },
      create: { id: DIST_A, name: 'Facts Test Distributor', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.distributorSettings.upsert({
      where: { distributorId: DIST_A },
      create: { distributorId: DIST_A, timezone: 'Europe/London' },
      update: { timezone: 'Europe/London' },
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER_A },
      create: { id: CUSTOMER_A, name: 'Facts Test Customer', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    await prisma.product.upsert({
      where: { id: PRODUCT_1 },
      create: { id: PRODUCT_1, distributorId: DIST_A, name: 'Facts Test Product', status: 'ACTIVE' },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.orderLineFact.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.orderFact.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.orderAnalyticsState.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.orderLine.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.order.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.product.deleteMany({ where: { id: PRODUCT_1 } });
    await prisma.distributorSettings.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, CUSTOMER_A] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.orderLineFact.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.orderFact.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.orderAnalyticsState.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.orderLine.deleteMany({ where: { orderId: ORDER_1 } });
    await prisma.order.deleteMany({ where: { id: ORDER_1 } });

    await prisma.order.create({
      data: {
        id: ORDER_1,
        distributorId: DIST_A,
        traderCustomerId: CUSTOMER_A,
        placedByUserId: 'test-facts-user',
        orderNumber: 'FACTS-TEST-0001',
        currency: 'GBP',
        status: OrderStatus.SUBMITTED,
        acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL,
        acceptanceModeSourceSnapshot: AcceptanceModeSource.DISTRIBUTOR_DEFAULT,
        subtotalAmount: new Prisma.Decimal('100.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('100.00'),
        submittedAt: new Date('2026-03-15T10:00:00.000Z'),
      },
    });
    await prisma.orderLine.create({
      data: {
        id: `${ORDER_1}-line-1`,
        orderId: ORDER_1,
        distributorId: DIST_A,
        traderCustomerId: CUSTOMER_A,
        productId: PRODUCT_1,
        productNameSnapshot: 'Facts Test Product',
        quantityOrdered: 4,
        unitPriceSnapshot: new Prisma.Decimal('25.00'),
        subtotalAmount: new Prisma.Decimal('100.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('100.00'),
        status: 'SUBMITTED',
      },
    });
  });

  it('records order_facts and order_line_facts, and keeps order_analytics_state current through a submit → cancel sequence', async () => {
    await orderFacts.handleOrderEvent('evt-facts-1', 'OrderSubmitted', {
      orderId: ORDER_1,
      distributorId: DIST_A,
      traderCustomerId: CUSTOMER_A,
      status: OrderStatus.SUBMITTED,
      occurredAt: '2026-03-15T10:00:00.000Z',
    });

    const factsAfterSubmit = await prisma.orderFact.findMany({ where: { orderId: ORDER_1 } });
    expect(factsAfterSubmit).toHaveLength(1);
    expect(factsAfterSubmit[0].distributorLocalDate.toISOString()).toBe('2026-03-15T00:00:00.000Z');

    const lineFacts = await prisma.orderLineFact.findMany({ where: { orderId: ORDER_1 } });
    expect(lineFacts).toHaveLength(1);
    expect(lineFacts[0].productId).toBe(PRODUCT_1);
    expect(Number(lineFacts[0].netValue)).toBe(100);

    let state = await prisma.orderAnalyticsState.findUnique({ where: { orderId: ORDER_1 } });
    expect(state?.status).toBe(OrderStatus.SUBMITTED);

    await orderFacts.handleOrderEvent('evt-facts-2', 'OrderCancelled', {
      orderId: ORDER_1,
      distributorId: DIST_A,
      traderCustomerId: CUSTOMER_A,
      status: OrderStatus.CANCELLED,
      occurredAt: '2026-03-16T09:00:00.000Z',
    });

    state = await prisma.orderAnalyticsState.findUnique({ where: { orderId: ORDER_1 } });
    expect(state?.status).toBe(OrderStatus.CANCELLED);
    // distributorLocalDate stays fixed to the submission day, not the cancellation day.
    expect(state?.distributorLocalDate.toISOString()).toBe('2026-03-15T00:00:00.000Z');

    const allFacts = await prisma.orderFact.findMany({ where: { orderId: ORDER_1 } });
    expect(allFacts).toHaveLength(2);
  });

  it('is idempotent under at-least-once redelivery of the same event', async () => {
    const event = {
      orderId: ORDER_1,
      distributorId: DIST_A,
      traderCustomerId: CUSTOMER_A,
      status: OrderStatus.SUBMITTED,
      occurredAt: '2026-03-15T10:00:00.000Z',
    };

    await orderFacts.handleOrderEvent('evt-facts-replay', 'OrderSubmitted', event);
    await orderFacts.handleOrderEvent('evt-facts-replay', 'OrderSubmitted', event);

    expect(await prisma.orderFact.count({ where: { orderId: ORDER_1 } })).toBe(1);
    expect(await prisma.orderLineFact.count({ where: { orderId: ORDER_1 } })).toBe(1);
  });

  it('ignores an out-of-order (older) event after a newer one has already been applied', async () => {
    await orderFacts.handleOrderEvent('evt-facts-3', 'OrderSubmitted', {
      orderId: ORDER_1,
      distributorId: DIST_A,
      traderCustomerId: CUSTOMER_A,
      status: OrderStatus.SUBMITTED,
      occurredAt: '2026-03-15T10:00:00.000Z',
    });
    await orderFacts.handleOrderEvent('evt-facts-4', 'OrderAccepted', {
      orderId: ORDER_1,
      distributorId: DIST_A,
      traderCustomerId: CUSTOMER_A,
      status: OrderStatus.ACCEPTED,
      occurredAt: '2026-03-15T11:00:00.000Z',
    });

    // A late-arriving OrderRejected carrying an EARLIER occurredAt than the
    // already-applied OrderAccepted must not regress the state.
    await orderFacts.handleOrderEvent('evt-facts-5', 'OrderRejected', {
      orderId: ORDER_1,
      distributorId: DIST_A,
      traderCustomerId: CUSTOMER_A,
      status: OrderStatus.REJECTED,
      occurredAt: '2026-03-15T10:30:00.000Z',
    });

    const state = await prisma.orderAnalyticsState.findUnique({ where: { orderId: ORDER_1 } });
    expect(state?.status).toBe(OrderStatus.ACCEPTED);
  });

  it('reconstructs order_analytics_state from order_facts alone (rebuild reproducibility)', async () => {
    await orderFacts.handleOrderEvent('evt-facts-6', 'OrderSubmitted', {
      orderId: ORDER_1,
      distributorId: DIST_A,
      traderCustomerId: CUSTOMER_A,
      status: OrderStatus.SUBMITTED,
      occurredAt: '2026-03-15T10:00:00.000Z',
    });
    await orderFacts.handleOrderEvent('evt-facts-7', 'OrderAccepted', {
      orderId: ORDER_1,
      distributorId: DIST_A,
      traderCustomerId: CUSTOMER_A,
      status: OrderStatus.ACCEPTED,
      occurredAt: '2026-03-15T11:00:00.000Z',
    });

    const original = await prisma.orderAnalyticsState.findUnique({ where: { orderId: ORDER_1 } });
    expect(original).not.toBeNull();

    // Wipe the derived projection entirely...
    await prisma.orderAnalyticsState.deleteMany({ where: { orderId: ORDER_1 } });
    expect(await prisma.orderAnalyticsState.findUnique({ where: { orderId: ORDER_1 } })).toBeNull();

    // ...and replay purely from the durable event log, exactly as the rebuild
    // command (scripts/rebuild-analytics-state.ts) does.
    const facts = await prisma.orderFact.findMany({
      where: { orderId: ORDER_1 },
      orderBy: { occurredAt: 'asc' },
    });
    for (const fact of facts) {
      await prisma.$transaction((tx) =>
        orderFacts.upsertAnalyticsState(tx, {
          orderId: fact.orderId,
          distributorId: fact.distributorId,
          traderCustomerId: fact.traderCustomerId,
          status: fact.resultingStatus,
          subtotalAmount: fact.subtotalAmount,
          distributorLocalDate: fact.distributorLocalDate,
          occurredAt: fact.occurredAt,
        }),
      );
    }

    const rebuilt = await prisma.orderAnalyticsState.findUnique({ where: { orderId: ORDER_1 } });
    expect(rebuilt?.status).toBe(original?.status);
    expect(rebuilt?.subtotalAmount.toString()).toBe(original?.subtotalAmount.toString());
    expect(rebuilt?.distributorLocalDate.toISOString()).toBe(original?.distributorLocalDate.toISOString());
    expect(rebuilt?.lastEventAt.toISOString()).toBe(original?.lastEventAt.toISOString());
  });
});
