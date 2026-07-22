import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, Prisma } from '@prisma/client';
import { OrderFactsService } from './order-facts.service';
import { PrismaService } from '../prisma/prisma.service';

const duplicateKeyError = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

const makePayload = (overrides: Record<string, unknown> = {}) => ({
  orderId: 'order-1',
  distributorId: 'dist-1',
  traderCustomerId: 'cust-1',
  status: OrderStatus.SUBMITTED,
  occurredAt: '2026-03-15T10:00:00.000Z',
  ...overrides,
});

describe('OrderFactsService', () => {
  let service: OrderFactsService;
  let prisma: {
    order: { findUnique: jest.Mock };
    distributorSettings: { findUnique: jest.Mock };
    orderFact: { create: jest.Mock };
    orderLine: { findMany: jest.Mock };
    orderLineFact: { createMany: jest.Mock };
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      order: { findUnique: jest.fn().mockResolvedValue({ subtotalAmount: new Prisma.Decimal('123.45') }) },
      distributorSettings: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/London' }) },
      orderFact: { create: jest.fn().mockResolvedValue({}) },
      orderLine: { findMany: jest.fn().mockResolvedValue([]) },
      orderLineFact: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderFactsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(OrderFactsService);
  });

  describe('handleOrderEvent', () => {
    it('skips recording when the order no longer exists', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await service.handleOrderEvent('evt-1', 'OrderSubmitted', makePayload());

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('records an order_facts row using the distributor timezone for the local date', async () => {
      await service.handleOrderEvent('evt-1', 'OrderSubmitted', makePayload());

      expect(prisma.orderFact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'evt-1',
          distributorId: 'dist-1',
          orderId: 'order-1',
          traderCustomerId: 'cust-1',
          eventType: 'OrderSubmitted',
          resultingStatus: OrderStatus.SUBMITTED,
          subtotalAmount: expect.objectContaining({}),
          occurredAt: new Date('2026-03-15T10:00:00.000Z'),
          distributorLocalDate: new Date('2026-03-15T00:00:00.000Z'),
        }),
      });
    });

    it('defaults to UTC when the distributor has no settings row yet', async () => {
      prisma.distributorSettings.findUnique.mockResolvedValue(null);

      await service.handleOrderEvent('evt-1', 'OrderSubmitted', makePayload({ occurredAt: '2026-03-15T23:30:00.000Z' }));

      expect(prisma.orderFact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ distributorLocalDate: new Date('2026-03-15T00:00:00.000Z') }),
      });
    });

    it('records order_line_facts only for OrderSubmitted', async () => {
      prisma.orderLine.findMany.mockResolvedValue([
        { id: 'line-1', productId: 'prod-1', quantityOrdered: 2, subtotalAmount: new Prisma.Decimal('20.00') },
        { id: 'line-2', productId: 'prod-2', quantityOrdered: 1, subtotalAmount: new Prisma.Decimal('9.99') },
      ]);

      await service.handleOrderEvent('evt-1', 'OrderSubmitted', makePayload());

      expect(prisma.orderLineFact.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ eventId: 'evt-1', orderLineId: 'line-1', productId: 'prod-1', quantity: 2 }),
          expect.objectContaining({ eventId: 'evt-1', orderLineId: 'line-2', productId: 'prod-2', quantity: 1 }),
        ],
        skipDuplicates: true,
      });
    });

    it('does not touch order_line_facts for non-submission events', async () => {
      await service.handleOrderEvent('evt-2', 'OrderAccepted', makePayload({ status: OrderStatus.ACCEPTED }));

      expect(prisma.orderLine.findMany).not.toHaveBeenCalled();
      expect(prisma.orderLineFact.createMany).not.toHaveBeenCalled();
    });

    it('upserts order_analytics_state via a guarded raw SQL statement', async () => {
      await service.handleOrderEvent('evt-1', 'OrderSubmitted', makePayload());

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const params = prisma.$executeRaw.mock.calls[0].slice(1);
      expect(params).toEqual(
        expect.arrayContaining([
          'order-1',
          'dist-1',
          'cust-1',
          OrderStatus.SUBMITTED,
          new Date('2026-03-15T00:00:00.000Z'),
          new Date('2026-03-15T10:00:00.000Z'),
        ]),
      );
    });

    it('treats a duplicate eventId+occurredAt as an already-processed replay and stops', async () => {
      prisma.orderFact.create.mockRejectedValue(duplicateKeyError());

      await service.handleOrderEvent('evt-1', 'OrderSubmitted', makePayload());

      expect(prisma.orderLineFact.createMany).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('rethrows non-duplicate errors from the fact insert', async () => {
      prisma.orderFact.create.mockRejectedValue(new Error('connection reset'));

      await expect(service.handleOrderEvent('evt-1', 'OrderSubmitted', makePayload())).rejects.toThrow('connection reset');
    });
  });

  describe('upsertAnalyticsState', () => {
    it('is directly callable with a transaction client (reused by the rebuild command)', async () => {
      const tx = { $executeRaw: jest.fn().mockResolvedValue(1) };

      await service.upsertAnalyticsState(tx as unknown as Prisma.TransactionClient, {
        orderId: 'order-9',
        distributorId: 'dist-1',
        traderCustomerId: 'cust-1',
        status: OrderStatus.CANCELLED,
        subtotalAmount: new Prisma.Decimal('50.00'),
        distributorLocalDate: new Date('2026-03-01T00:00:00.000Z'),
        occurredAt: new Date('2026-03-02T09:00:00.000Z'),
      });

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
