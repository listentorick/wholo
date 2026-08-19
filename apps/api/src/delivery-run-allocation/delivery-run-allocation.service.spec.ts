import { Test, TestingModule } from '@nestjs/testing';
import {
  DeliveryAllocationSource,
  DeliveryRunStatus,
  Order,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { DeliveryRunAllocationService } from './delivery-run-allocation.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';

const DELIVERY_DATE = new Date('2026-08-19T00:00:00.000Z');

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    distributorId: 'dist-1',
    traderCustomerId: 'cust-1',
    orderNumber: 'ORD-1',
    status: OrderStatus.ACCEPTED,
    requestedDeliveryDate: DELIVERY_DATE,
    scheduledDeliveryDate: DELIVERY_DATE,
    ...overrides,
  } as Order;
}

function makeRouteCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rc-1',
    routeId: 'route-1',
    customerId: 'cust-1',
    defaultDropPosition: 3,
    route: { id: 'route-1', name: 'Yorkshire', defaultDriverName: 'Dave Walsh', active: true },
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    distributorId: 'dist-1',
    routeId: 'route-1',
    deliveryDate: DELIVERY_DATE,
    name: 'Yorkshire',
    driverName: 'Dave Walsh',
    status: DeliveryRunStatus.OPEN,
    version: 0,
    ...overrides,
  };
}

describe('DeliveryRunAllocationService', () => {
  let service: DeliveryRunAllocationService;
  let prisma: any;
  let outbox: { writeEvent: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    const tx = {
      deliveryRunOrder: { create: jest.fn().mockResolvedValue({ id: 'dro-1' }) },
      deliveryRun: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      order: { update: jest.fn().mockResolvedValue({}) },
      deliveryRouteCustomer: { findFirst: jest.fn() },
      deliveryRun: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
      },
      deliveryRunOrder: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      __tx: tx,
    };
    outbox = { writeEvent: jest.fn().mockResolvedValue({}) };
    audit = { record: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryRunAllocationService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: outbox },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(DeliveryRunAllocationService);
  });

  it('allocates into the route\'s existing open run, seeding sequence from the default drop position', async () => {
    prisma.deliveryRouteCustomer.findFirst.mockResolvedValue(makeRouteCustomer());
    prisma.deliveryRun.findUnique.mockResolvedValue(makeRun());

    const result = await service.allocateOrder(makeOrder());

    expect(result).toEqual({ allocated: true, runId: 'run-1', deliverySequence: 3 });
    expect(prisma.deliveryRun.create).not.toHaveBeenCalled();
    expect(prisma.__tx.deliveryRunOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: 'run-1',
          orderId: 'order-1',
          deliverySequence: 3,
          allocationSource: DeliveryAllocationSource.DEFAULT_ROUTE,
        }),
      }),
    );
  });

  it('lazily creates the dated run when none exists, snapshotting the route name and default driver', async () => {
    prisma.deliveryRouteCustomer.findFirst.mockResolvedValue(makeRouteCustomer());
    prisma.deliveryRun.findUnique.mockResolvedValue(null);
    prisma.deliveryRun.create.mockResolvedValue(makeRun({ id: 'run-new' }));

    const result = await service.allocateOrder(makeOrder());

    expect(result).toEqual({ allocated: true, runId: 'run-new', deliverySequence: 3 });
    expect(prisma.deliveryRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          distributorId: 'dist-1',
          routeId: 'route-1',
          name: 'Yorkshire',
          driverName: 'Dave Walsh',
        }),
      }),
    );
  });

  it('re-reads the run when two orders race to create the same dated run', async () => {
    prisma.deliveryRouteCustomer.findFirst.mockResolvedValue(makeRouteCustomer());
    prisma.deliveryRun.findUnique.mockResolvedValue(null);
    prisma.deliveryRun.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.0.0' }),
    );
    prisma.deliveryRun.findUniqueOrThrow.mockResolvedValue(makeRun({ id: 'run-raced' }));

    const result = await service.allocateOrder(makeOrder());

    expect(result).toEqual({ allocated: true, runId: 'run-raced', deliverySequence: 3 });
  });

  it('leaves the order unassigned with NO_ROUTE when the customer has no active route', async () => {
    prisma.deliveryRouteCustomer.findFirst.mockResolvedValue(null);

    const result = await service.allocateOrder(makeOrder());

    expect(result).toEqual({ allocated: false, reason: 'NO_ROUTE' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('leaves the order unassigned with NO_ROUTE when the resolved route is inactive', async () => {
    prisma.deliveryRouteCustomer.findFirst.mockResolvedValue(
      makeRouteCustomer({ route: { id: 'route-1', name: 'Yorkshire', defaultDriverName: null, active: false } }),
    );

    const result = await service.allocateOrder(makeOrder());

    expect(result).toEqual({ allocated: false, reason: 'NO_ROUTE' });
  });

  it('leaves the order unassigned with RUN_READY rather than adding to a locked run', async () => {
    prisma.deliveryRouteCustomer.findFirst.mockResolvedValue(makeRouteCustomer());
    prisma.deliveryRun.findUnique.mockResolvedValue(makeRun({ status: DeliveryRunStatus.READY }));

    const result = await service.allocateOrder(makeOrder());

    expect(result).toEqual({ allocated: false, reason: 'RUN_READY' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('leaves the order unassigned with NO_SCHEDULED_DATE when it has no delivery date at all', async () => {
    const result = await service.allocateOrder(
      makeOrder({ requestedDeliveryDate: null, scheduledDeliveryDate: null }),
    );

    expect(result).toEqual({ allocated: false, reason: 'NO_SCHEDULED_DATE' });
    expect(prisma.deliveryRouteCustomer.findFirst).not.toHaveBeenCalled();
  });

  it('sets scheduledDeliveryDate from the requested date on first allocation', async () => {
    prisma.deliveryRouteCustomer.findFirst.mockResolvedValue(makeRouteCustomer());
    prisma.deliveryRun.findUnique.mockResolvedValue(makeRun());

    await service.allocateOrder(makeOrder({ scheduledDeliveryDate: null }));

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { scheduledDeliveryDate: DELIVERY_DATE },
    });
  });

  it('never rewrites scheduledDeliveryDate once it is already set', async () => {
    prisma.deliveryRouteCustomer.findFirst.mockResolvedValue(makeRouteCustomer());
    prisma.deliveryRun.findUnique.mockResolvedValue(makeRun());

    await service.allocateOrder(makeOrder());

    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('is idempotent — an order already actively allocated is returned unchanged', async () => {
    prisma.deliveryRouteCustomer.findFirst.mockResolvedValue(makeRouteCustomer());
    prisma.deliveryRun.findUnique.mockResolvedValue(makeRun());
    prisma.deliveryRunOrder.findFirst.mockResolvedValue({ id: 'dro-1', runId: 'run-1', deliverySequence: 3 });

    const result = await service.allocateOrder(makeOrder());

    expect(result).toEqual({ allocated: true, runId: 'run-1', deliverySequence: 3 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('publishes an allocation event and bumps the run version in the same transaction', async () => {
    prisma.deliveryRouteCustomer.findFirst.mockResolvedValue(makeRouteCustomer());
    prisma.deliveryRun.findUnique.mockResolvedValue(makeRun());

    await service.allocateOrder(makeOrder());

    expect(outbox.writeEvent).toHaveBeenCalledWith(
      expect.anything(),
      'DeliveryRun',
      'run-1',
      'DeliveryRunOrderAllocated',
      expect.objectContaining({ orderId: 'order-1', runId: 'run-1', deliverySequence: 3 }),
    );
    expect(prisma.__tx.deliveryRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { version: { increment: 1 } },
    });
    expect(audit.record).toHaveBeenCalled();
  });
});
