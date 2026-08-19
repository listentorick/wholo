import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      deliveryRun: { findMany: jest.fn() },
      order: { findMany: jest.fn() },
      deliveryRouteCustomer: { findMany: jest.fn() },
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryRunsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: { writeEvent: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(DeliveryRunsService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
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
});
