import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException, GoneException } from '@nestjs/common';
import { InvitationStatus, Role, TradeRelationshipStatus } from '@prisma/client';
import { PortalInvitationsService } from './portal-invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { KeycloakIdentity } from '../auth/strategies/portal-jwt.strategy';

const mockPrisma = {
  customerInvitation: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  membership: {
    upsert: jest.fn(),
  },
  tradeRelationship: {
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockUsers = {
  findOrCreateFromKeycloak: jest.fn(),
};

const identity: KeycloakIdentity = {
  sub: 'kc-sub-123',
  email: 'buyer@example.com',
  email_verified: true,
  given_name: 'Jane',
  family_name: 'Doe',
};

const makeInvitation = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  token: 'valid-token',
  email: 'buyer@example.com',
  status: InvitationStatus.PENDING,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  tradeRelationship: {
    id: 'rel-1',
    customerId: 'customer-org-1',
    distributor: { id: 'dist-1', slug: 'winos', name: 'Winos Pty Ltd' },
  },
  ...overrides,
});

const makeUser = () => ({ id: 'user-1', email: 'buyer@example.com' });

describe('PortalInvitationsService', () => {
  let service: PortalInvitationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
      for (const op of ops) await op;
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalInvitationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UsersService, useValue: mockUsers },
      ],
    }).compile();
    service = module.get(PortalInvitationsService);
  });

  describe('acceptInvite', () => {
    it('accepts a valid invitation and returns distributorSlug', async () => {
      mockPrisma.customerInvitation.findFirst.mockResolvedValue(makeInvitation());
      mockUsers.findOrCreateFromKeycloak.mockResolvedValue(makeUser());
      mockPrisma.membership.upsert.mockResolvedValue({});
      mockPrisma.customerInvitation.update.mockResolvedValue({});
      mockPrisma.tradeRelationship.update.mockResolvedValue({});

      const result = await service.acceptInvite(identity, 'valid-token');

      expect(result).toEqual({ distributorSlug: 'winos' });
      expect(mockUsers.findOrCreateFromKeycloak).toHaveBeenCalledWith('kc-sub-123', 'buyer@example.com', 'Jane', 'Doe');
    });

    it('creates membership with TRADE_CUSTOMER role', async () => {
      mockPrisma.customerInvitation.findFirst.mockResolvedValue(makeInvitation());
      mockUsers.findOrCreateFromKeycloak.mockResolvedValue(makeUser());
      mockPrisma.membership.upsert.mockResolvedValue({});
      mockPrisma.customerInvitation.update.mockResolvedValue({});
      mockPrisma.tradeRelationship.update.mockResolvedValue({});

      await service.acceptInvite(identity, 'valid-token');

      expect(mockPrisma.membership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ role: Role.TRADE_CUSTOMER, organisationId: 'customer-org-1' }),
        }),
      );
    });

    it('sets TradeRelationship status to ACTIVE', async () => {
      mockPrisma.customerInvitation.findFirst.mockResolvedValue(makeInvitation());
      mockUsers.findOrCreateFromKeycloak.mockResolvedValue(makeUser());
      mockPrisma.membership.upsert.mockResolvedValue({});
      mockPrisma.customerInvitation.update.mockResolvedValue({});
      mockPrisma.tradeRelationship.update.mockResolvedValue({});

      await service.acceptInvite(identity, 'valid-token');

      expect(mockPrisma.tradeRelationship.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: TradeRelationshipStatus.ACTIVE } }),
      );
    });

    it('throws NotFoundException when token is not found', async () => {
      mockPrisma.customerInvitation.findFirst.mockResolvedValue(null);

      await expect(service.acceptInvite(identity, 'bad-token')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when invitation is already accepted', async () => {
      mockPrisma.customerInvitation.findFirst.mockResolvedValue(
        makeInvitation({ status: InvitationStatus.ACCEPTED }),
      );

      await expect(service.acceptInvite(identity, 'valid-token')).rejects.toThrow(ConflictException);
    });

    it('throws GoneException when invitation is expired (status)', async () => {
      mockPrisma.customerInvitation.findFirst.mockResolvedValue(
        makeInvitation({ status: InvitationStatus.REVOKED }),
      );

      await expect(service.acceptInvite(identity, 'valid-token')).rejects.toThrow(GoneException);
    });

    it('throws GoneException when invitation has passed its expiry date', async () => {
      mockPrisma.customerInvitation.findFirst.mockResolvedValue(
        makeInvitation({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.acceptInvite(identity, 'valid-token')).rejects.toThrow(GoneException);
    });

    it('does not create a new user when one already exists with the same keycloakId', async () => {
      const existingUser = makeUser();
      mockPrisma.customerInvitation.findFirst.mockResolvedValue(makeInvitation());
      mockUsers.findOrCreateFromKeycloak.mockResolvedValue(existingUser);
      mockPrisma.membership.upsert.mockResolvedValue({});
      mockPrisma.customerInvitation.update.mockResolvedValue({});
      mockPrisma.tradeRelationship.update.mockResolvedValue({});

      await service.acceptInvite(identity, 'valid-token');

      expect(mockUsers.findOrCreateFromKeycloak).toHaveBeenCalledTimes(1);
    });

    it('throws ForbiddenException when JWT email does not match invitation email', async () => {
      mockPrisma.customerInvitation.findFirst.mockResolvedValue(
        makeInvitation({ email: 'someone-else@example.com' }),
      );

      const wrongIdentity: KeycloakIdentity = { ...identity, email: 'attacker@example.com' };
      await expect(service.acceptInvite(wrongIdentity, 'valid-token')).rejects.toThrow(ForbiddenException);
    });

    it('accepts when invitation email matches case-insensitively', async () => {
      mockPrisma.customerInvitation.findFirst.mockResolvedValue(
        makeInvitation({ email: 'Buyer@Example.Com' }),
      );
      mockUsers.findOrCreateFromKeycloak.mockResolvedValue(makeUser());
      mockPrisma.membership.upsert.mockResolvedValue({});
      mockPrisma.customerInvitation.update.mockResolvedValue({});
      mockPrisma.tradeRelationship.update.mockResolvedValue({});

      const result = await service.acceptInvite(identity, 'valid-token');

      expect(result).toEqual({ distributorSlug: 'winos' });
    });
  });
});
