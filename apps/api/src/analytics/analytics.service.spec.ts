import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

// $queryRaw is a tagged template; Prisma invokes it as `strings, ...values`.
// Rather than chain mockResolvedValueOnce by call order (fragile — several
// queries run inside Promise.all), this mock discriminates on the SQL text
// itself so each test can set up canned responses per query shape.
function makeQueryRawMock(responses: { match: (sql: string) => boolean; rows: unknown[] }[]) {
  return jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join(' ');
    const found = responses.find((r) => r.match(sql));
    return Promise.resolve(found ? found.rows : []);
  });
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    distributorSettings: { findUnique: jest.Mock };
    order: { findMany: jest.Mock };
    accountingInvoiceExport: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      distributorSettings: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      accountingInvoiceExport: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AnalyticsService);
  });

  describe('orderSummary', () => {
    it('rejects period=custom without start/end', async () => {
      await expect(service.orderSummary('dist-1', { period: 'custom' })).rejects.toThrow(
        'start and end are required when period=custom',
      );
    });

    it('classifies each metric using the earliest-data date and returns period metadata', async () => {
      prisma.$queryRaw = makeQueryRawMock([
        { match: (sql) => sql.includes('MIN('), rows: [{ earliest: new Date('2026-01-01T00:00:00.000Z') }] },
        {
          match: (sql) => sql.includes('COUNT(DISTINCT "traderCustomerId")') && sql.includes('BETWEEN'),
          rows: [{ orderValue: 1300, orderCount: 10, purchasingCustomers: 4 }],
        },
      ]);

      const result = await service.orderSummary('dist-1', { period: 'month' });

      expect(result.distributorId).toBe('dist-1');
      expect(result.timezone).toBe('UTC');
      expect(result.period.key).toBe('month');
      expect(result.metrics.orderValue.current).toBe(1300);
      expect(result.metrics.orderCount.current).toBe(10);
      expect(result.metrics.purchasingCustomers.current).toBe(4);
      expect(result.metrics.averageOrderValue.current).toBe(130);
    });

    it('marks insufficient_history when the distributor has no data yet', async () => {
      prisma.$queryRaw = makeQueryRawMock([
        { match: (sql) => sql.includes('MIN('), rows: [{ earliest: null }] },
        {
          match: (sql) => sql.includes('COUNT(DISTINCT "traderCustomerId")'),
          rows: [{ orderValue: 500, orderCount: 3, purchasingCustomers: 2 }],
        },
      ]);

      const result = await service.orderSummary('dist-1', { period: 'month' });

      expect(result.metrics.orderValue.status).toBe('insufficient_history');
    });
  });

  describe('orderTrend', () => {
    it('zero-fills days with no orders across the requested range', async () => {
      prisma.$queryRaw = makeQueryRawMock([
        {
          match: (sql) => sql.includes("AS date"),
          rows: [{ date: new Date('2026-03-02T00:00:00.000Z'), value: 100, count: 2 }],
        },
      ]);

      const result = await service.orderTrend('dist-1', { period: 'custom', start: '2026-03-01', end: '2026-03-03' });

      expect(result.current).toEqual([
        { date: '2026-03-01', value: 0, count: 0 },
        { date: '2026-03-02', value: 100, count: 2 },
        { date: '2026-03-03', value: 0, count: 0 },
      ]);
    });
  });

  describe('customerRankings', () => {
    it('computes share and top-5 concentration against the total qualifying value', async () => {
      prisma.$queryRaw = makeQueryRawMock([
        { match: (sql) => sql.includes('MIN('), rows: [{ earliest: new Date('2026-01-01T00:00:00.000Z') }] },
        {
          match: (sql) => sql.includes('organisations'),
          rows: [
            { customerId: 'rel-1', organisationId: 'org-1', customerName: 'Alpha', value: 700, orderCount: 5 },
            { customerId: 'rel-2', organisationId: 'org-2', customerName: 'Beta', value: 300, orderCount: 2 },
          ],
        },
        {
          match: (sql) => sql.includes('COUNT(DISTINCT "traderCustomerId")') && sql.includes('BETWEEN') && !sql.includes('organisations'),
          rows: [{ orderValue: 1000, orderCount: 7, purchasingCustomers: 2 }],
        },
      ]);

      const result = await service.customerRankings('dist-1', { period: 'month', limit: 10 });

      expect(result.totalQualifyingValue).toBe(1000);
      expect(result.top5Share).toBe(1);
      expect(result.customers[0]).toEqual(
        expect.objectContaining({ customerId: 'rel-1', value: 700, share: 0.7 }),
      );
      // customerId must be the trade-relationship id, never the underlying organisation id.
      expect(result.customers[0].customerId).not.toBe('org-1');
    });
  });

  describe('productRankings', () => {
    it('returns ranked products and enabled non-selling products separately', async () => {
      prisma.$queryRaw = makeQueryRawMock([
        {
          match: (sql) => sql.includes('order_line_facts') && !sql.includes('NOT EXISTS'),
          rows: [{ productId: 'prod-1', productName: 'Cabernet', value: 500, units: 20, reach: 3 }],
        },
        {
          match: (sql) => sql.includes('NOT EXISTS'),
          rows: [{ productId: 'prod-2', productName: 'Merlot' }],
        },
      ]);

      const result = await service.productRankings('dist-1', { period: 'month' });

      expect(result.products).toEqual([{ productId: 'prod-1', productName: 'Cabernet', value: 500, units: 20, reach: 3 }]);
      expect(result.nonSellingProducts).toEqual([{ productId: 'prod-2', productName: 'Merlot' }]);
    });
  });

  describe('actionItems', () => {
    it('aggregates all four action-item categories', async () => {
      prisma.order.findMany
        .mockResolvedValueOnce([{ id: 'order-1', orderNumber: 'ORD-1', traderCustomerId: 'cust-1', submittedAt: new Date(), totalAmount: 100 }])
        .mockResolvedValueOnce([{ id: 'order-2', orderNumber: 'ORD-2', traderCustomerId: 'cust-2', requestedDeliveryDate: new Date(), totalAmount: 200 }]);
      prisma.accountingInvoiceExport.findMany.mockResolvedValue([
        { id: 'exp-1', orderId: 'order-3', errorCode: 'PROVIDER_ERROR', errorMessage: 'boom', failedAt: new Date() },
      ]);
      prisma.$queryRaw = makeQueryRawMock([
        { match: (sql) => sql.includes('trade_relationships'), rows: [{ customerId: 'rel-3', customerName: 'Gamma' }] },
      ]);

      const result = await service.actionItems('dist-1');

      expect(result.awaitingAcceptance).toHaveLength(1);
      expect(result.dueForFulfilment).toHaveLength(1);
      expect(result.invoiceFailures).toHaveLength(1);
      expect(result.neverOrdered).toEqual([{ customerId: 'rel-3', customerName: 'Gamma' }]);

      expect(prisma.order.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { distributorId: 'dist-1', status: 'SUBMITTED' } }));
      expect(prisma.order.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: expect.objectContaining({ distributorId: 'dist-1', status: 'ACCEPTED' }) }),
      );
    });
  });
});
