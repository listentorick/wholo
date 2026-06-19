import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const mockUser = {
  id: 'user-1',
  email: 'james@vineandco.com',
  keycloakId: 'kc-sub-123',
  firstName: 'James',
  lastName: 'Vine',
  deletedAt: null,
  memberships: [
    {
      role: 'DISTRIBUTOR_ADMIN',
      organisationId: 'org-1',
      organisation: { id: 'org-1', name: 'Vine & Co' },
    },
  ],
};

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findById', () => {
    it('returns user with memberships when found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      const result = await service.findById('user-1');
      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', deletedAt: null },
        include: { memberships: { include: { organisation: true } } },
      });
    });

    it('returns null when not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const result = await service.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('findByKeycloakId', () => {
    it('returns user when keycloakId matches', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      const result = await service.findByKeycloakId('kc-sub-123');
      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { keycloakId: 'kc-sub-123', deletedAt: null },
        include: { memberships: { include: { organisation: true } } },
      });
    });

    it('returns null when keycloakId not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const result = await service.findByKeycloakId('unknown-sub');
      expect(result).toBeNull();
    });
  });

  describe('linkKeycloakId', () => {
    it('links keycloakId to existing user by email', async () => {
      const unlinkedUser = { ...mockUser, keycloakId: null };
      const linkedUser = { ...mockUser, keycloakId: 'new-kc-sub' };
      mockPrisma.user.findFirst.mockResolvedValue(unlinkedUser);
      mockPrisma.user.update.mockResolvedValue(linkedUser);

      const result = await service.linkKeycloakId('james@vineandco.com', 'new-kc-sub');
      expect(result).toEqual(linkedUser);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { keycloakId: 'new-kc-sub' },
        include: { memberships: { include: { organisation: true } } },
      });
    });

    it('returns null when no user found with that email and null keycloakId', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const result = await service.linkKeycloakId('unknown@example.com', 'some-sub');
      expect(result).toBeNull();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
