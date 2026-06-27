import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TradeRelationshipStatus } from '@prisma/client';
import { PortalService } from './portal.service';

const mockPrisma = {
  organisation: { findFirst: jest.fn(), update: jest.fn() },
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
          minimumOrderSpend: null,
          distributor: {
            id: 'dist-1', name: 'Winos', slug: 'winos',
            email: 'orders@winos.com', phone: '+61290000000',
            distributorSettings: null,
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
        { minimumOrderSpend: null, distributor: { id: 'dist-1', name: 'Winos', slug: 'winos', email: null, phone: null, distributorSettings: null } },
      ]);
      mockPrisma.assetImage.findFirst.mockResolvedValue(null);
      mockPrisma.order.count.mockResolvedValue(0);

      const result = await service.getMyDistributors('cust-1');
      expect(result[0].logoUrl).toBeNull();
    });

    it('returns relationship minimumOrderSpend override when set', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([
        {
          minimumOrderSpend: { toString: () => '150.00' },
          distributor: { id: 'dist-1', name: 'Winos', slug: 'winos', email: null, phone: null, distributorSettings: { minimumOrderSpend: { toString: () => '200.00' } } },
        },
      ]);
      mockPrisma.assetImage.findFirst.mockResolvedValue(null);
      mockPrisma.order.count.mockResolvedValue(0);

      const result = await service.getMyDistributors('cust-1');
      expect(result[0].minimumOrderSpend).toBe(150);
    });

    it('falls back to distributor minimumOrderSpend when no relationship override', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([
        {
          minimumOrderSpend: null,
          distributor: { id: 'dist-1', name: 'Winos', slug: 'winos', email: null, phone: null, distributorSettings: { minimumOrderSpend: { toString: () => '200.00' } } },
        },
      ]);
      mockPrisma.assetImage.findFirst.mockResolvedValue(null);
      mockPrisma.order.count.mockResolvedValue(0);

      const result = await service.getMyDistributors('cust-1');
      expect(result[0].minimumOrderSpend).toBe(200);
    });

    it('returns null minimumOrderSpend when neither relationship nor distributor has one set', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([
        { minimumOrderSpend: null, distributor: { id: 'dist-1', name: 'Winos', slug: 'winos', email: null, phone: null, distributorSettings: null } },
      ]);
      mockPrisma.assetImage.findFirst.mockResolvedValue(null);
      mockPrisma.order.count.mockResolvedValue(0);

      const result = await service.getMyDistributors('cust-1');
      expect(result[0].minimumOrderSpend).toBeNull();
    });

    it('counts orders for the correct distributor and customer', async () => {
      mockPrisma.tradeRelationship.findMany.mockResolvedValue([
        { minimumOrderSpend: null, distributor: { id: 'dist-1', name: 'Winos', slug: 'winos', email: null, phone: null, distributorSettings: null } },
      ]);
      mockPrisma.assetImage.findFirst.mockResolvedValue(null);
      mockPrisma.order.count.mockResolvedValue(5);

      await service.getMyDistributors('cust-1');

      expect(mockPrisma.order.count).toHaveBeenCalledWith({
        where: { distributorId: 'dist-1', traderCustomerId: 'cust-1' },
      });
    });
  });

  describe('getMyProfile', () => {
    const orgData = {
      name: 'Acme Bar', legalName: 'Acme Bar Pty Ltd', email: 'info@acme.com', phone: '0411111111',
      billingLine1: '1 Main St', billingLine2: null, billingCity: 'Sydney',
      billingState: 'NSW', billingPostcode: '2000', billingCountry: 'Australia',
    };

    it('returns profile for existing organisation', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue(orgData);
      const result = await service.getMyProfile('org-1');
      expect(result).toMatchObject({ name: 'Acme Bar', legalName: 'Acme Bar Pty Ltd', billingCity: 'Sydney' });
    });

    it('throws NotFoundException when organisation does not exist', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue(null);
      await expect(service.getMyProfile('missing')).rejects.toThrow(NotFoundException);
    });

    it('coerces null fields', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue({ ...orgData, legalName: null, email: null });
      const result = await service.getMyProfile('org-1');
      expect(result.legalName).toBeNull();
      expect(result.email).toBeNull();
    });
  });

  describe('updateMyProfile', () => {
    const existingOrg = { id: 'org-1' };
    const updatedOrg = {
      name: 'New Name', legalName: null, email: 'new@example.com', phone: null,
      billingLine1: null, billingLine2: null, billingCity: null,
      billingState: null, billingPostcode: null, billingCountry: null,
    };

    it('updates and returns updated profile', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue(existingOrg);
      mockPrisma.organisation.update.mockResolvedValue(updatedOrg);
      const result = await service.updateMyProfile('org-1', { name: 'New Name', email: 'new@example.com' });
      expect(result.name).toBe('New Name');
      expect(mockPrisma.organisation.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'org-1' } }),
      );
    });

    it('throws NotFoundException when organisation does not exist', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue(null);
      await expect(service.updateMyProfile('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('only sends defined fields to Prisma', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue(existingOrg);
      mockPrisma.organisation.update.mockResolvedValue(updatedOrg);
      await service.updateMyProfile('org-1', { name: 'Only Name' });
      const updateCall = mockPrisma.organisation.update.mock.calls[0][0];
      expect(updateCall.data).toEqual({ name: 'Only Name' });
    });
  });
});
