import { Test } from '@nestjs/testing';
import { TradeRelationshipStatus } from '@prisma/client';
import { PortalService } from './portal.service';

const mockPrisma = {
  tradeRelationship: { findMany: jest.fn() },
  assetImage: { findFirst: jest.fn() },
  order: { count: jest.fn() },
};

const mockR2 = {
  getPublicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
};

describe('PortalService', () => {
  let service: PortalService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PortalService,
        { provide: 'PrismaService', useValue: mockPrisma },
        { provide: 'R2StorageService', useValue: mockR2 },
      ],
    })
      .overrideProvider(PortalService)
      .useFactory({
        factory: () => new PortalService(mockPrisma as any, mockR2 as any),
      })
      .compile();

    service = module.get(PortalService);
  });

  describe('getMyDistributors', () => {
    it('returns empty array when no active relationships', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([]);
      const result = await service.getMyDistributors('cust-1');
      expect(result).toEqual([]);
    });

    it('queries only ACTIVE non-deleted relationships for the customer', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([]);
      await service.getMyDistributors('cust-1');
      expect(mockPrisma.tradeRelationship.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerId: 'cust-1',
            status: TradeRelationshipStatus.ACTIVE,
            deletedAt: null,
          }),
        }),
      );
    });

    it('returns distributor summary with logo url and order count', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([
        {
          distributor: {
            id: 'dist-1', name: 'Winos', slug: 'winos',
            email: 'orders@winos.com', phone: '+61290000000',
          },
        },
      ]);
      mockPrisma.assetImage.findFirst.mockResolvedValue({
        variants: { full: 'logos/winos.jpg' },
      });
      mockPrisma.order.count.mockResolvedValue(14);

      const result = await service.getMyDistributors('cust-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'dist-1',
        name: 'Winos',
        slug: 'winos',
        email: 'orders@winos.com',
        phone: '+61290000000',
        orderCount: 14,
        logoUrl: 'https://cdn.example.com/logos/winos.jpg',
      });
    });

    it('returns null logoUrl when no logo image exists', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([
        { distributor: { id: 'dist-1', name: 'Winos', slug: 'winos', email: null, phone: null } },
      ]);
      mockPrisma.assetImage.findFirst.mockResolvedValue(null);
      mockPrisma.order.count.mockResolvedValue(0);

      const result = await service.getMyDistributors('cust-1');
      expect(result[0].logoUrl).toBeNull();
    });

    it('counts orders for the correct distributor and customer', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([
        { distributor: { id: 'dist-1', name: 'Winos', slug: 'winos', email: null, phone: null } },
      ]);
      mockPrisma.assetImage.findFirst.mockResolvedValue(null);
      mockPrisma.order.count.mockResolvedValue(5);

      await service.getMyDistributors('cust-1');

      expect(mockPrisma.order.count).toHaveBeenCalledWith({
        where: { distributorId: 'dist-1', traderCustomerId: 'cust-1' },
      });
    });
  });
});
