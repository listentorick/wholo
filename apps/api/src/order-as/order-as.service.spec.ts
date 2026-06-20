import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { TradeRelationshipStatus } from '@prisma/client';
import { OrderAsService } from './order-as.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  tradeRelationship: { findUnique: jest.fn() },
  orderAsSession: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
  },
  orderAsDeliveryToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

describe('OrderAsService', () => {
  let service: OrderAsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderAsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(OrderAsService);
  });

  describe('createOrRefreshSession', () => {
    const adminUserId = 'admin-1';
    const distributorId = 'dist-1';
    const tradeRelationshipId = 'tr-1';
    const customerId = 'cust-1';

    const mockRel = {
      id: tradeRelationshipId,
      distributorId,
      customerId,
      status: TradeRelationshipStatus.ACTIVE,
      distributor: { id: distributorId, slug: 'test-dist' },
    };

    beforeEach(() => {
      mockPrisma.tradeRelationship.findUnique.mockResolvedValue(mockRel);
      mockPrisma.orderAsSession.upsert.mockResolvedValue({ id: 'session-id' });
      mockPrisma.orderAsDeliveryToken.create.mockResolvedValue({});
    });

    it('creates a session and returns a delivery token and distributorSlug', async () => {
      const result = await service.createOrRefreshSession(adminUserId, distributorId, tradeRelationshipId);
      expect(result.deliveryToken).toBeDefined();
      expect(typeof result.deliveryToken).toBe('string');
      expect(result.deliveryToken.length).toBeGreaterThan(0);
      expect(result.distributorSlug).toBe('test-dist');
    });

    it('upserts on (adminUserId, tradeRelationshipId) so same pair returns the same session', async () => {
      await service.createOrRefreshSession(adminUserId, distributorId, tradeRelationshipId);
      expect(mockPrisma.orderAsSession.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { adminUserId_tradeRelationshipId: { adminUserId, tradeRelationshipId } },
        }),
      );
    });

    it('throws NotFoundException when trade relationship not found', async () => {
      mockPrisma.tradeRelationship.findUnique.mockResolvedValue(null);
      await expect(service.createOrRefreshSession(adminUserId, distributorId, tradeRelationshipId))
        .rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when trade relationship belongs to a different distributor', async () => {
      mockPrisma.tradeRelationship.findUnique.mockResolvedValue({ ...mockRel, distributorId: 'other-dist' });
      await expect(service.createOrRefreshSession(adminUserId, distributorId, tradeRelationshipId))
        .rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when no active trade relationship', async () => {
      mockPrisma.tradeRelationship.findUnique.mockResolvedValue(null);
      await expect(service.createOrRefreshSession(adminUserId, distributorId, tradeRelationshipId))
        .rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when relationship is not ACTIVE', async () => {
      mockPrisma.tradeRelationship.findUnique.mockResolvedValue({ ...mockRel, status: TradeRelationshipStatus.SUSPENDED });
      await expect(service.createOrRefreshSession(adminUserId, distributorId, tradeRelationshipId))
        .rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('exchangeDeliveryToken', () => {
    const adminUserId = 'admin-1';
    const futureDate = new Date(Date.now() + 60_000);

    const mockRecord = {
      id: 'token-1',
      usedAt: null,
      expiresAt: futureDate,
      session: {
        id: 'session-id',
        adminUserId,
        customerId: 'cust-1',
        distributorId: 'dist-1',
        expiresAt: futureDate,
        customer: { id: 'cust-1', name: 'Test Customer' },
        distributor: { id: 'dist-1', slug: 'test-dist' },
      },
    };

    beforeEach(() => {
      mockPrisma.orderAsDeliveryToken.findUnique.mockResolvedValue(mockRecord);
      mockPrisma.orderAsDeliveryToken.update.mockResolvedValue({});
    });

    it('returns session data on valid token', async () => {
      const result = await service.exchangeDeliveryToken('valid-raw-token', adminUserId);
      expect(result.sessionToken).toBe('session-id');
      expect(result.customerName).toBe('Test Customer');
      expect(result.distributorSlug).toBe('test-dist');
    });

    it('throws UnauthorizedException when token not found', async () => {
      mockPrisma.orderAsDeliveryToken.findUnique.mockResolvedValue(null);
      await expect(service.exchangeDeliveryToken('bad-token', adminUserId))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token already used', async () => {
      mockPrisma.orderAsDeliveryToken.findUnique.mockResolvedValue({ ...mockRecord, usedAt: new Date() });
      await expect(service.exchangeDeliveryToken('used-token', adminUserId))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token expired', async () => {
      mockPrisma.orderAsDeliveryToken.findUnique.mockResolvedValue({
        ...mockRecord,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.exchangeDeliveryToken('expired-token', adminUserId))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when adminUserId does not match', async () => {
      await expect(service.exchangeDeliveryToken('valid-raw-token', 'wrong-admin'))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('resolveSession', () => {
    const adminUserId = 'admin-1';
    const futureDate = new Date(Date.now() + 60_000);

    it('returns customer and distributor context', async () => {
      mockPrisma.orderAsSession.findUnique.mockResolvedValue({
        adminUserId,
        customerId: 'cust-1',
        distributorId: 'dist-1',
        expiresAt: futureDate,
      });
      const result = await service.resolveSession('session-id', adminUserId);
      expect(result.customerId).toBe('cust-1');
      expect(result.distributorId).toBe('dist-1');
    });

    it('throws UnauthorizedException when session not found', async () => {
      mockPrisma.orderAsSession.findUnique.mockResolvedValue(null);
      await expect(service.resolveSession('missing', adminUserId))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when session expired', async () => {
      mockPrisma.orderAsSession.findUnique.mockResolvedValue({
        adminUserId,
        customerId: 'cust-1',
        distributorId: 'dist-1',
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.resolveSession('expired', adminUserId))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when adminUserId does not match', async () => {
      mockPrisma.orderAsSession.findUnique.mockResolvedValue({
        adminUserId: 'other-admin',
        customerId: 'cust-1',
        distributorId: 'dist-1',
        expiresAt: futureDate,
      });
      await expect(service.resolveSession('session-id', adminUserId))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('deleteSession', () => {
    it('deletes only the matching session', async () => {
      mockPrisma.orderAsSession.deleteMany.mockResolvedValue({ count: 1 });
      await service.deleteSession('session-id', 'admin-1');
      expect(mockPrisma.orderAsSession.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session-id', adminUserId: 'admin-1' },
      });
    });
  });
});
