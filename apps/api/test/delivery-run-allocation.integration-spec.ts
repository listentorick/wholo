/**
 * Integration tests for native delivery-run allocation: proves that the
 * allocation logic consuming OrderAccepted actually resolves the customer's
 * route, lazily creates the dated run, and seeds the drop order against a
 * real database — including the three "left unassigned" branches, which a
 * mocked-Prisma unit test can only assert about arguments, not outcomes.
 *
 * Drives DeliveryRunAllocationService directly rather than through BullMQ:
 * the processor is a thin re-read-and-delegate wrapper (covered by its own
 * unit spec), and standing up Redis here would test the queue, not the
 * allocation rules.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { Test } from '@nestjs/testing';
import {
  DeliveryAllocationSource,
  DeliveryRunStatus,
  Order,
  OrderStatus,
  OrganisationType,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OutboxModule } from '../src/outbox/outbox.module';
import { AuditModule } from '../src/audit/audit.module';
import { DeliveryRunAllocationService } from '../src/delivery-run-allocation/delivery-run-allocation.service';

const DIST_A = 'test-alloc-dist-a';
const CUSTOMER_1 = 'test-alloc-customer-1';
const CUSTOMER_2 = 'test-alloc-customer-2';
const ADMIN_USER = 'test-alloc-admin';

const DELIVERY_DATE = new Date('2026-09-02T00:00:00.000Z');

describe('Delivery run allocation (integration)', () => {
  let prisma: PrismaService;
  let allocation: DeliveryRunAllocationService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, OutboxModule, AuditModule],
      providers: [DeliveryRunAllocationService],
    }).compile();

    prisma = module.get(PrismaService);
    allocation = module.get(DeliveryRunAllocationService);

    await prisma.organisation.upsert({
      where: { id: DIST_A },
      create: { id: DIST_A, name: 'Allocation Test Distributor', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    for (const [id, name] of [[CUSTOMER_1, 'Blackbird Kitchen'], [CUSTOMER_2, 'The Old Mill Cafe']]) {
      await prisma.organisation.upsert({
        where: { id },
        create: { id, name, type: OrganisationType.TRADE_CUSTOMER },
        update: {},
      });
    }
    const user = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER,
        email: 'allocation-admin@integration.test',
        firstName: 'Allocation',
        lastName: 'Admin',
      },
      update: {},
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: DIST_A } },
      create: { userId: user.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });
  });

  afterEach(async () => {
    await prisma.deliveryRunOrder.deleteMany({ where: { run: { distributorId: DIST_A } } });
    await prisma.deliveryRun.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.auditLog.deleteMany({ where: { distributorId: DIST_A } });
    const orders = await prisma.order.findMany({ where: { distributorId: DIST_A }, select: { id: true } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: orders.map((o) => o.id) } } });
    await prisma.order.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.deliveryRouteCustomer.deleteMany({ where: { route: { distributorId: DIST_A } } });
    await prisma.deliveryRoute.deleteMany({ where: { distributorId: DIST_A } });
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, CUSTOMER_1, CUSTOMER_2] } } });
    await prisma.$disconnect();
  });

  const createOrder = async (
    traderCustomerId: string,
    overrides: Partial<Prisma.OrderUncheckedCreateInput> = {},
  ): Promise<Order> => {
    const seq = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    return prisma.order.create({
      data: {
        distributorId: DIST_A,
        traderCustomerId,
        placedByUserId: ADMIN_USER,
        orderNumber: `TEST-ALLOC-${seq[0].nextval}`,
        currency: 'GBP',
        status: OrderStatus.ACCEPTED,
        acceptanceModeSnapshot: 'MANUAL',
        acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
        subtotalAmount: new Prisma.Decimal('100.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('100.00'),
        requestedDeliveryDate: DELIVERY_DATE,
        scheduledDeliveryDate: DELIVERY_DATE,
        submittedAt: new Date(),
        acceptedAt: new Date(),
        ...overrides,
      },
    });
  };

  const createRouteWithCustomer = async (
    customerId: string,
    { name = 'Yorkshire', dropPosition = 1, active = true, defaultDriverName = 'Dave Walsh' } = {},
  ) => {
    const route = await prisma.deliveryRoute.create({
      data: { distributorId: DIST_A, name, defaultDriverName, active },
    });
    await prisma.deliveryRouteCustomer.create({
      data: {
        routeId: route.id,
        customerId,
        defaultDropPosition: dropPosition,
        assignedByUserId: ADMIN_USER,
      },
    });
    return route;
  };

  it('creates the dated run on the first accepted order and allocates into it', async () => {
    const route = await createRouteWithCustomer(CUSTOMER_1, { dropPosition: 2 });
    const order = await createOrder(CUSTOMER_1);

    const result = await allocation.allocateOrder(order);

    expect(result).toEqual({ allocated: true, runId: expect.any(String), deliverySequence: 2 });

    const run = await prisma.deliveryRun.findFirstOrThrow({ where: { distributorId: DIST_A } });
    expect(run.routeId).toBe(route.id);
    expect(run.name).toBe('Yorkshire');
    expect(run.driverName).toBe('Dave Walsh');
    expect(run.status).toBe(DeliveryRunStatus.OPEN);

    const allocated = await prisma.deliveryRunOrder.findFirstOrThrow({ where: { orderId: order.id } });
    expect(allocated.runId).toBe(run.id);
    expect(allocated.deliverySequence).toBe(2);
    expect(allocated.allocationSource).toBe(DeliveryAllocationSource.DEFAULT_ROUTE);
    expect(allocated.activeOrderId).toBe(order.id);
  });

  it('reuses the same dated run for a second order on the same route and date', async () => {
    const route = await createRouteWithCustomer(CUSTOMER_1, { dropPosition: 1 });
    await prisma.deliveryRouteCustomer.create({
      data: { routeId: route.id, customerId: CUSTOMER_2, defaultDropPosition: 2, assignedByUserId: ADMIN_USER },
    });

    const first = await allocation.allocateOrder(await createOrder(CUSTOMER_1));
    const second = await allocation.allocateOrder(await createOrder(CUSTOMER_2));

    expect(second.allocated && first.allocated && second.runId).toBe(first.allocated && first.runId);
    expect(await prisma.deliveryRun.count({ where: { distributorId: DIST_A } })).toBe(1);
  });

  it('creates no run at all when the routed customer has no orders for a date', async () => {
    await createRouteWithCustomer(CUSTOMER_1);

    expect(await prisma.deliveryRun.count({ where: { distributorId: DIST_A } })).toBe(0);
  });

  it('leaves an unrouted customer\'s order unassigned with NO_ROUTE and creates no run', async () => {
    const order = await createOrder(CUSTOMER_1);

    const result = await allocation.allocateOrder(order);

    expect(result).toEqual({ allocated: false, reason: 'NO_ROUTE' });
    expect(await prisma.deliveryRun.count({ where: { distributorId: DIST_A } })).toBe(0);
    expect(await prisma.deliveryRunOrder.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('leaves the order unassigned with NO_ROUTE when the route is inactive', async () => {
    await createRouteWithCustomer(CUSTOMER_1, { active: false });
    const order = await createOrder(CUSTOMER_1);

    const result = await allocation.allocateOrder(order);

    expect(result).toEqual({ allocated: false, reason: 'NO_ROUTE' });
  });

  it('leaves the order unassigned with RUN_READY and does not touch a locked run', async () => {
    const route = await createRouteWithCustomer(CUSTOMER_1);
    const readyRun = await prisma.deliveryRun.create({
      data: {
        distributorId: DIST_A,
        routeId: route.id,
        deliveryDate: DELIVERY_DATE,
        name: 'Yorkshire',
        status: DeliveryRunStatus.READY,
        readyAt: new Date(),
        readyByUserId: ADMIN_USER,
      },
    });
    const order = await createOrder(CUSTOMER_1);

    const result = await allocation.allocateOrder(order);

    expect(result).toEqual({ allocated: false, reason: 'RUN_READY' });
    expect(await prisma.deliveryRunOrder.count({ where: { runId: readyRun.id } })).toBe(0);
    const unchanged = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: readyRun.id } });
    expect(unchanged.version).toBe(readyRun.version);
  });

  it('sets scheduledDeliveryDate from the requested date on first allocation', async () => {
    await createRouteWithCustomer(CUSTOMER_1);
    const order = await createOrder(CUSTOMER_1, { scheduledDeliveryDate: null });

    await allocation.allocateOrder(order);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.scheduledDeliveryDate).toEqual(DELIVERY_DATE);
    expect(updated.requestedDeliveryDate).toEqual(DELIVERY_DATE);
  });

  it('is idempotent — re-running allocation never double-allocates the order', async () => {
    await createRouteWithCustomer(CUSTOMER_1);
    const order = await createOrder(CUSTOMER_1);

    const first = await allocation.allocateOrder(order);
    const second = await allocation.allocateOrder(order);

    expect(second).toEqual(first);
    expect(await prisma.deliveryRunOrder.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('creates exactly one run when two orders are allocated concurrently for the same route and date', async () => {
    const route = await createRouteWithCustomer(CUSTOMER_1, { dropPosition: 1 });
    await prisma.deliveryRouteCustomer.create({
      data: { routeId: route.id, customerId: CUSTOMER_2, defaultDropPosition: 2, assignedByUserId: ADMIN_USER },
    });
    const [orderA, orderB] = await Promise.all([createOrder(CUSTOMER_1), createOrder(CUSTOMER_2)]);

    const results = await Promise.all([
      allocation.allocateOrder(orderA),
      allocation.allocateOrder(orderB),
    ]);

    expect(results.every((r) => r.allocated)).toBe(true);
    expect(await prisma.deliveryRun.count({ where: { distributorId: DIST_A } })).toBe(1);
    expect(await prisma.deliveryRunOrder.count({ where: { run: { distributorId: DIST_A } } })).toBe(2);
  });

  it('writes an outbox event and an audit record for a successful allocation', async () => {
    await createRouteWithCustomer(CUSTOMER_1);
    const order = await createOrder(CUSTOMER_1);

    const result = await allocation.allocateOrder(order);

    const events = await prisma.outboxEvent.findMany({
      where: { eventType: 'DeliveryRunOrderAllocated', aggregateId: result.allocated ? result.runId : '' },
    });
    expect(events).toHaveLength(1);

    const audits = await prisma.auditLog.findMany({
      where: { distributorId: DIST_A, action: 'DELIVERY_RUN_ORDER_ALLOCATED' },
    });
    expect(audits).toHaveLength(1);
  });
});
