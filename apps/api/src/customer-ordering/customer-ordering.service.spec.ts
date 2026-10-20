import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerOrderingService } from './customer-ordering.service';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = new Date('2026-10-17T12:00:00Z');

describe('CustomerOrderingService', () => {
  let service: CustomerOrderingService;
  let prisma: {
    tradeRelationship: { findUnique: jest.Mock };
    distributorSettings: { findUnique: jest.Mock };
    orderAnalyticsState: { findFirst: jest.Mock; aggregate: jest.Mock; findMany: jest.Mock };
    orderLineFact: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      tradeRelationship: { findUnique: jest.fn().mockResolvedValue({ id: 'rel-1' }) },
      distributorSettings: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/London', currencyCode: 'GBP' }) },
      orderAnalyticsState: {
        // Newest first for the last order, oldest first for the first.
        findFirst: jest.fn(({ orderBy }) =>
          Promise.resolve({ distributorLocalDate: orderBy.distributorLocalDate === 'desc' ? d('2026-10-09') : d('2026-03-01') }),
        ),
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _count: { _all: 4 }, _sum: { subtotalAmount: '2480.00' } }) // this period
          .mockResolvedValueOnce({ _sum: { subtotalAmount: '2400.00' } }), // the period before
        findMany: jest.fn().mockResolvedValue([{ orderId: 'o-1' }, { orderId: 'o-2' }, { orderId: 'o-3' }, { orderId: 'o-4' }]),
      },
      orderLineFact: { findMany: jest.fn().mockResolvedValue(Array.from({ length: 18 }, (_, i) => ({ productId: `p-${i}` }))) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [CustomerOrderingService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CustomerOrderingService);
  });

  it('reports recency, frequency, spend and product breadth for the last 30 days', async () => {
    expect(await service.getBehaviour('dist-1', 'cust-1', NOW)).toEqual({
      customerId: 'cust-1',
      asOf: '2026-10-17',
      periodDays: 30,
      periodStart: '2026-09-18',
      periodEnd: '2026-10-17',
      recency: { lastOrderDate: '2026-10-09', daysSinceLastOrder: 8 },
      frequency: { orders: 4 },
      monetary: { amounts: [{ currency: 'GBP', amount: 2480 }] },
      productBreadth: { distinctProducts: 18 },
      trend: 'steady',
    });
  });

  it('has nothing to report for a customer who has never ordered', async () => {
    prisma.orderAnalyticsState.findFirst.mockResolvedValue(null);
    prisma.orderAnalyticsState.aggregate.mockReset().mockResolvedValue({ _count: { _all: 0 }, _sum: { subtotalAmount: null } });
    prisma.orderAnalyticsState.findMany.mockResolvedValue([]);

    const behaviour = await service.getBehaviour('dist-1', 'cust-1', NOW);

    expect(behaviour).toMatchObject({
      recency: { lastOrderDate: null, daysSinceLastOrder: null },
      frequency: { orders: 0 },
      monetary: { amounts: [] },
      productBreadth: { distinctProducts: 0 },
      trend: 'insufficient_history',
    });
    expect(prisma.orderLineFact.findMany).not.toHaveBeenCalled();
  });

  it('is not found for someone who is not this distributor’s customer', async () => {
    prisma.tradeRelationship.findUnique.mockResolvedValue(null);

    await expect(service.getBehaviour('dist-1', 'stranger', NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});
