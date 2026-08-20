import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DeliveryRunsService } from './delivery-runs.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';

const NOW = new Date('2026-08-19T10:00:00.000Z');
const DAY = new Date('2026-08-20T00:00:00.000Z');

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'ORD-1',
    distributorId: 'dist-1',
    traderCustomerId: 'cust-1',
    status: 'ACCEPTED',
    deliveryAddressSnapshot: null,
    scheduledDeliveryDate: DAY,
    requestedDeliveryDate: DAY,
    customer: { id: 'cust-1', name: 'Blackbird Kitchen' },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRunOrder(order: ReturnType<typeof makeOrder>, overrides: Record<string, unknown> = {}) {
  return {
    id: `dro-${order.id}`,
    runId: 'run-1',
    orderId: order.id,
    deliverySequence: null,
    allocationSource: 'DEFAULT_ROUTE',
    assignedAt: NOW,
    removedAt: null,
    order,
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    distributorId: 'dist-1',
    routeId: 'route-1',
    deliveryDate: DAY,
    name: 'Yorkshire',
    driverName: null,
    status: 'OPEN',
    version: 0,
    orders: [],
    ...overrides,
  };
}

describe('DeliveryRunsService', () => {
  let service: DeliveryRunsService;
  let prisma: any;
  let outbox: { writeEvent: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: any;

  beforeEach(async () => {
    tx = {
      deliveryRun: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn().mockResolvedValue({}) },
      deliveryRunOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'dro-new' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    prisma = {
      deliveryRun: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      order: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      deliveryRouteCustomer: { findMany: jest.fn().mockResolvedValue([]) },
      deliveryRunOrder: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    outbox = { writeEvent: jest.fn().mockResolvedValue({}) };
    audit = { record: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryRunsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: outbox },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(DeliveryRunsService);
  });

  describe('getDay', () => {
    it('assigns dense stop numbers 1..n even when stored deliverySequence is sparse', async () => {
      const orderA = makeOrder({ id: 'order-a' });
      const orderB = makeOrder({ id: 'order-b' });
      const run = makeRun({
        orders: [
          makeRunOrder(orderA, { deliverySequence: 7 }),
          makeRunOrder(orderB, { deliverySequence: 41 }),
        ],
      });
      (prisma.deliveryRun.findMany as jest.Mock)
        .mockResolvedValueOnce([run])
        .mockResolvedValueOnce([]);
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.deliveryRouteCustomer.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await service.getDay('dist-1', '2026-08-20');

      expect(result.runs[0].cards.map((c) => c.stopNumber)).toEqual([1, 2]);
    });

    it('never calls deliveryRun.create on the read path', async () => {
      (prisma.deliveryRun.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.deliveryRouteCustomer.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await service.getDay('dist-1', '2026-08-20');

      expect((prisma as unknown as { deliveryRun: { create?: unknown } }).deliveryRun.create).toBeUndefined();
    });

    it('issues exactly one route findMany and one run findMany for candidateRuns regardless of card count', async () => {
      const orders = Array.from({ length: 5 }, (_, i) => makeOrder({ id: `order-${i}`, traderCustomerId: `cust-${i}` }));
      const run = makeRun({ orders: orders.map((o) => makeRunOrder(o)) });
      const routeCustomers = orders.map((o) => ({
        activeDistributorCustomerId: `dist-1:${o.traderCustomerId}`,
        route: { id: 'route-1', name: 'Yorkshire', active: true },
      }));
      (prisma.deliveryRun.findMany as jest.Mock)
        .mockResolvedValueOnce([run])
        .mockResolvedValueOnce([]);
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.deliveryRouteCustomer.findMany as jest.Mock).mockResolvedValue(routeCustomers);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await service.getDay('dist-1', '2026-08-20');

      expect(prisma.deliveryRouteCustomer.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.deliveryRun.findMany).toHaveBeenCalledTimes(2);
    });

    it('issues exactly one $queryRaw rollup call regardless of card count', async () => {
      const orders = Array.from({ length: 5 }, (_, i) => makeOrder({ id: `order-${i}` }));
      const run = makeRun({ orders: orders.map((o) => makeRunOrder(o)) });
      (prisma.deliveryRun.findMany as jest.Mock)
        .mockResolvedValueOnce([run])
        .mockResolvedValueOnce([]);
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.deliveryRouteCustomer.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await service.getDay('dist-1', '2026-08-20');

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('short-circuits the route/run/rollup queries when there are no orders at all', async () => {
      (prisma.deliveryRun.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getDay('dist-1', '2026-08-20');

      expect(prisma.deliveryRouteCustomer.findMany).not.toHaveBeenCalled();
      expect(prisma.deliveryRun.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(result.runs).toEqual([]);
      expect(result.unassigned).toEqual([]);
    });

    it('counts stopCount as card count, not distinct customers', async () => {
      const orderA = makeOrder({ id: 'order-a', traderCustomerId: 'cust-1' });
      const orderB = makeOrder({ id: 'order-b', traderCustomerId: 'cust-1' });
      const run = makeRun({ orders: [makeRunOrder(orderA), makeRunOrder(orderB)] });
      (prisma.deliveryRun.findMany as jest.Mock)
        .mockResolvedValueOnce([run])
        .mockResolvedValueOnce([]);
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.deliveryRouteCustomer.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await service.getDay('dist-1', '2026-08-20');

      expect(result.runs[0].stopCount).toBe(2);
    });

    describe('unassigned reason precedence', () => {
      const setup = async (
        order: ReturnType<typeof makeOrder>,
        routeCustomers: unknown[],
        candidateRuns: unknown[],
      ) => {
        (prisma.deliveryRun.findMany as jest.Mock)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce(candidateRuns);
        (prisma.order.findMany as jest.Mock).mockResolvedValue([order]);
        (prisma.deliveryRouteCustomer.findMany as jest.Mock).mockResolvedValue(routeCustomers);
        (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
        return service.getDay('dist-1', '2026-08-20');
      };

      it('derives NO_SCHEDULED_DATE when neither date is set', async () => {
        const order = makeOrder({ scheduledDeliveryDate: null, requestedDeliveryDate: null });
        const result = await setup(order, [], []);
        expect(result.unassigned[0].unallocatedReason).toBe('NO_SCHEDULED_DATE');
      });

      it('derives NO_ROUTE when the customer has no active route assignment', async () => {
        const order = makeOrder();
        const result = await setup(order, [], []);
        expect(result.unassigned[0].unallocatedReason).toBe('NO_ROUTE');
      });

      it('derives NO_ROUTE when the route exists but is inactive', async () => {
        const order = makeOrder();
        const routeCustomers = [{
          activeDistributorCustomerId: 'dist-1:cust-1',
          route: { id: 'route-1', name: 'Yorkshire', active: false },
        }];
        const result = await setup(order, routeCustomers, []);
        expect(result.unassigned[0].unallocatedReason).toBe('NO_ROUTE');
      });

      it('derives RUN_READY and pins the suggestion when the resolved run is READY', async () => {
        const order = makeOrder();
        const routeCustomers = [{
          activeDistributorCustomerId: 'dist-1:cust-1',
          route: { id: 'route-1', name: 'Yorkshire', active: true },
        }];
        const candidateRuns = [{ id: 'run-9', routeId: 'route-1', status: 'READY' }];
        const result = await setup(order, routeCustomers, candidateRuns);
        expect(result.unassigned[0].unallocatedReason).toBe('RUN_READY');
        expect(result.unassigned[0].suggestedRunId).toBe('run-9');
        expect(result.unassigned[0].suggestedRouteName).toBe('Yorkshire');
      });

      it('derives a null reason (not NO_ROUTE) when a route exists but no run has been created yet', async () => {
        const order = makeOrder();
        const routeCustomers = [{
          activeDistributorCustomerId: 'dist-1:cust-1',
          route: { id: 'route-1', name: 'Yorkshire', active: true },
        }];
        const result = await setup(order, routeCustomers, []);
        expect(result.unassigned[0].unallocatedReason).toBeNull();
        expect(result.unassigned[0].suggestedRouteName).toBe('Yorkshire');
      });
    });
  });

  describe('listDays', () => {
    it('rejects a window wider than 31 days', async () => {
      await expect(service.listDays('dist-1', '2026-08-01', '2026-09-15')).rejects.toThrow(BadRequestException);
    });

    it('pads every date in the window, including zero-count days', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ date: '2026-08-20', runCount: 1, runStopCount: 3 }])
        .mockResolvedValueOnce([]);

      const result = await service.listDays('dist-1', '2026-08-19', '2026-08-21');

      expect(result.data.map((d) => d.date)).toEqual(['2026-08-19', '2026-08-20', '2026-08-21']);
      expect(result.data[0]).toEqual({ date: '2026-08-19', runCount: 0, stopCount: 0, unassignedCount: 0 });
      expect(result.data[1]).toEqual({ date: '2026-08-20', runCount: 1, stopCount: 3, unassignedCount: 0 });
    });
  });

  describe('assignOrderToRun', () => {
    it('throws NotFoundException when the destination run is not found', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.assignOrderToRun('dist-1', 'run-1', { orderId: 'order-1', version: 0 }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when the destination run is READY', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun({ status: 'READY' }));
      await expect(
        service.assignOrderToRun('dist-1', 'run-1', { orderId: 'order-1', version: 0 }, 'user-1'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws NotFoundException when the order is not found', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.order.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.assignOrderToRun('dist-1', 'run-1', { orderId: 'order-1', version: 0 }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when the order date does not match the run date', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun({ deliveryDate: DAY }));
      prisma.order.findFirst.mockResolvedValueOnce(makeOrder({
        scheduledDeliveryDate: new Date('2026-08-21T00:00:00.000Z'),
        requestedDeliveryDate: new Date('2026-08-21T00:00:00.000Z'),
      }));
      await expect(
        service.assignOrderToRun('dist-1', 'run-1', { orderId: 'order-1', version: 0 }, 'user-1'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('no-ops without touching the transaction when the order is already in the target run', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.order.findFirst.mockResolvedValueOnce(makeOrder());
      prisma.deliveryRunOrder.findFirst.mockResolvedValueOnce({ id: 'dro-1', runId: 'run-1' });

      await service.assignOrderToRun('dist-1', 'run-1', { orderId: 'order-1', version: 0 }, 'user-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(outbox.writeEvent).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when the source run is READY', async () => {
      prisma.deliveryRun.findFirst
        .mockResolvedValueOnce(makeRun({ id: 'run-2' }))
        .mockResolvedValueOnce(makeRun({ id: 'run-1', status: 'READY' }));
      prisma.order.findFirst.mockResolvedValueOnce(makeOrder());
      prisma.deliveryRunOrder.findFirst.mockResolvedValueOnce({ id: 'dro-1', runId: 'run-1' });

      await expect(
        service.assignOrderToRun('dist-1', 'run-2', { orderId: 'order-1', version: 0, sourceRunId: 'run-1' }, 'user-1'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws ConflictException when the destination version is stale', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.order.findFirst.mockResolvedValueOnce(makeOrder());
      tx.deliveryRun.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.assignOrderToRun('dist-1', 'run-1', { orderId: 'order-1', version: 5 }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when the source allocation has already moved', async () => {
      prisma.deliveryRun.findFirst
        .mockResolvedValueOnce(makeRun({ id: 'run-2' }))
        .mockResolvedValueOnce(makeRun({ id: 'run-1', status: 'OPEN' }));
      prisma.order.findFirst.mockResolvedValueOnce(makeOrder());
      prisma.deliveryRunOrder.findFirst.mockResolvedValueOnce({ id: 'dro-1', runId: 'run-1' });
      tx.deliveryRunOrder.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.assignOrderToRun('dist-1', 'run-2', { orderId: 'order-1', version: 0, sourceRunId: 'run-1' }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('soft-removes the source allocation before creating the destination row (load-bearing ordering)', async () => {
      prisma.deliveryRun.findFirst
        .mockResolvedValueOnce(makeRun({ id: 'run-2' }))
        .mockResolvedValueOnce(makeRun({ id: 'run-1', status: 'OPEN' }));
      prisma.order.findFirst.mockResolvedValueOnce(makeOrder());
      prisma.deliveryRunOrder.findFirst.mockResolvedValueOnce({ id: 'dro-1', runId: 'run-1' });

      const callOrder: string[] = [];
      tx.deliveryRunOrder.updateMany.mockImplementation(async () => {
        callOrder.push('remove');
        return { count: 1 };
      });
      tx.deliveryRunOrder.create.mockImplementation(async () => {
        callOrder.push('create');
        return { id: 'dro-new' };
      });

      await service.assignOrderToRun('dist-1', 'run-2', { orderId: 'order-1', version: 0, sourceRunId: 'run-1' }, 'user-1');

      expect(callOrder).toEqual(['remove', 'create']);
      expect(tx.deliveryRunOrder.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          runId: 'run-2', orderId: 'order-1', allocationSource: 'MANUAL', assignedByUserId: 'user-1',
        }),
      }));
    });

    it('blind-increments the source run version and writes outbox + audit inside the transaction', async () => {
      prisma.deliveryRun.findFirst
        .mockResolvedValueOnce(makeRun({ id: 'run-2' }))
        .mockResolvedValueOnce(makeRun({ id: 'run-1', status: 'OPEN' }));
      prisma.order.findFirst.mockResolvedValueOnce(makeOrder());
      prisma.deliveryRunOrder.findFirst.mockResolvedValueOnce({ id: 'dro-1', runId: 'run-1' });

      await service.assignOrderToRun('dist-1', 'run-2', { orderId: 'order-1', version: 0, sourceRunId: 'run-1' }, 'user-1');

      expect(tx.deliveryRun.update).toHaveBeenCalledWith({ where: { id: 'run-1' }, data: { version: { increment: 1 } } });
      expect(outbox.writeEvent).toHaveBeenCalledWith(
        tx, 'DeliveryRun', 'run-2', 'DeliveryRunOrderMoved', expect.objectContaining({ orderId: 'order-1' }),
      );
      expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'DELIVERY_RUN_ORDER_MOVED' }));
    });

    it('translates a P2002 race (order already active elsewhere) into ConflictException', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.order.findFirst.mockResolvedValueOnce(makeOrder());
      prisma.deliveryRunOrder.findFirst.mockResolvedValueOnce(null);
      tx.deliveryRunOrder.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.0.0' }),
      );

      await expect(
        service.assignOrderToRun('dist-1', 'run-1', { orderId: 'order-1', version: 0 }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('unassignOrderFromRun', () => {
    it('throws NotFoundException when the run is not found', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(null);
      await expect(service.unassignOrderFromRun('dist-1', 'run-1', 'order-1', 0, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when the run is READY', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun({ status: 'READY' }));
      await expect(service.unassignOrderFromRun('dist-1', 'run-1', 'order-1', 0, 'user-1')).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws NotFoundException when the order is not found', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.order.findFirst.mockResolvedValueOnce(null);
      await expect(service.unassignOrderFromRun('dist-1', 'run-1', 'order-1', 0, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the run version is stale', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.order.findFirst.mockResolvedValueOnce(makeOrder());
      tx.deliveryRun.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.unassignOrderFromRun('dist-1', 'run-1', 'order-1', 5, 'user-1')).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when the allocation has already moved', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.order.findFirst.mockResolvedValueOnce(makeOrder());
      tx.deliveryRunOrder.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.unassignOrderFromRun('dist-1', 'run-1', 'order-1', 0, 'user-1')).rejects.toThrow(ConflictException);
    });

    it('densifies the remaining active sequence after removal', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.order.findFirst.mockResolvedValueOnce(makeOrder());
      tx.deliveryRunOrder.findMany.mockResolvedValueOnce([{ id: 'dro-b' }, { id: 'dro-c' }]);

      await service.unassignOrderFromRun('dist-1', 'run-1', 'order-1', 0, 'user-1');

      expect(tx.deliveryRunOrder.update).toHaveBeenNthCalledWith(1, { where: { id: 'dro-b' }, data: { deliverySequence: 1 } });
      expect(tx.deliveryRunOrder.update).toHaveBeenNthCalledWith(2, { where: { id: 'dro-c' }, data: { deliverySequence: 2 } });
    });

    it('writes an outbox event and audit record inside the transaction', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.order.findFirst.mockResolvedValueOnce(makeOrder());

      await service.unassignOrderFromRun('dist-1', 'run-1', 'order-1', 0, 'user-1');

      expect(outbox.writeEvent).toHaveBeenCalledWith(
        tx, 'DeliveryRun', 'run-1', 'DeliveryRunOrderUnassigned', expect.objectContaining({ orderId: 'order-1' }),
      );
      expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'DELIVERY_RUN_ORDER_UNASSIGNED' }));
    });
  });

  describe('reorderRunOrders', () => {
    it('throws NotFoundException when the run is not found', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.reorderRunOrders('dist-1', 'run-1', { version: 0, orderedOrderIds: ['a'] }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when the run is READY', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun({ status: 'READY' }));
      await expect(
        service.reorderRunOrders('dist-1', 'run-1', { version: 0, orderedOrderIds: ['a'] }, 'user-1'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects a reorder that omits an active order', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.deliveryRunOrder.findMany.mockResolvedValueOnce([{ id: 'dro-a', orderId: 'a' }, { id: 'dro-b', orderId: 'b' }]);

      await expect(
        service.reorderRunOrders('dist-1', 'run-1', { version: 0, orderedOrderIds: ['a'] }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException on a stale version', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.deliveryRunOrder.findMany.mockResolvedValueOnce([{ id: 'dro-a', orderId: 'a' }, { id: 'dro-b', orderId: 'b' }]);
      tx.deliveryRun.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.reorderRunOrders('dist-1', 'run-1', { version: 5, orderedOrderIds: ['b', 'a'] }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('renumbers deliverySequence to match orderedOrderIds exactly', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.deliveryRunOrder.findMany.mockResolvedValueOnce([{ id: 'dro-a', orderId: 'a' }, { id: 'dro-b', orderId: 'b' }]);

      await service.reorderRunOrders('dist-1', 'run-1', { version: 0, orderedOrderIds: ['b', 'a'] }, 'user-1');

      expect(tx.deliveryRunOrder.update).toHaveBeenCalledWith({ where: { id: 'dro-b' }, data: { deliverySequence: 1 } });
      expect(tx.deliveryRunOrder.update).toHaveBeenCalledWith({ where: { id: 'dro-a' }, data: { deliverySequence: 2 } });
    });

    it('writes an outbox event and audit record inside the transaction', async () => {
      prisma.deliveryRun.findFirst.mockResolvedValueOnce(makeRun());
      prisma.deliveryRunOrder.findMany.mockResolvedValueOnce([{ id: 'dro-a', orderId: 'a' }]);

      await service.reorderRunOrders('dist-1', 'run-1', { version: 0, orderedOrderIds: ['a'] }, 'user-1');

      expect(outbox.writeEvent).toHaveBeenCalledWith(
        tx, 'DeliveryRun', 'run-1', 'DeliveryRunOrdersResequenced', expect.objectContaining({ orderedOrderIds: ['a'] }),
      );
      expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'DELIVERY_RUN_ORDERS_RESEQUENCED' }));
    });
  });
});
