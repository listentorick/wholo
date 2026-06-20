import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminDeliveryProfilesService } from './admin-delivery-profiles.service';
import { PrismaService } from '../prisma/prisma.service';

const NOW = new Date('2024-06-10T10:00:00.000Z');

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    distributorId: 'dist-1',
    name: 'Western Suburbs',
    active: true,
    defaultWeekdays: [1, 3, 5],
    defaultCutoffTime: '17:00',
    defaultCutoffProcessingDays: 1,
    speciallyEnabledDates: [],
    speciallyDisabledDates: [],
    cutoffRules: [],
    _count: { customerSettings: 0 },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    deliveryProfileId: 'profile-1',
    weekday: 5,
    cutoffTime: '17:00',
    processingDaysBeforeDelivery: 2,
    deliveryProfile: { distributorId: 'dist-1' },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('AdminDeliveryProfilesService', () => {
  let service: AdminDeliveryProfilesService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      deliveryProfile: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      deliveryProfileCutoffRule: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      tradeRelationship: { findFirst: jest.fn() },
      traderCustomerSettings: { upsert: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDeliveryProfilesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(AdminDeliveryProfilesService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  describe('findOne', () => {
    it('returns formatted profile when found', async () => {
      (prisma.deliveryProfile.findFirst as jest.Mock).mockResolvedValue(makeProfile());
      const result = await service.findOne('profile-1', 'dist-1');
      expect(result.id).toBe('profile-1');
      expect(result.name).toBe('Western Suburbs');
      expect(result.speciallyEnabledDates).toEqual([]);
    });

    it('throws NotFoundException when profile not found', async () => {
      (prisma.deliveryProfile.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('bad-id', 'dist-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a profile with defaults', async () => {
      const profile = makeProfile();
      (prisma.deliveryProfile.create as jest.Mock).mockResolvedValue(profile);
      const result = await service.create('dist-1', { name: 'Western Suburbs' });
      expect(result.name).toBe('Western Suburbs');
      expect(result.defaultCutoffTime).toBe('17:00');
    });

    it('serialises special dates as ISO date strings', async () => {
      const profile = makeProfile({
        speciallyEnabledDates: [new Date('2024-06-15T00:00:00.000Z')],
      });
      (prisma.deliveryProfile.create as jest.Mock).mockResolvedValue(profile);
      const result = await service.create('dist-1', {
        name: 'Test',
        speciallyEnabledDates: ['2024-06-15'],
      });
      expect(result.speciallyEnabledDates).toEqual(['2024-06-15']);
    });
  });

  describe('remove', () => {
    it('soft-deletes by setting active to false', async () => {
      (prisma.deliveryProfile.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-1' });
      (prisma.deliveryProfile.update as jest.Mock).mockResolvedValue({});
      await service.remove('profile-1', 'dist-1');
      expect(prisma.deliveryProfile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: { active: false },
      });
    });

    it('throws NotFoundException when profile belongs to different distributor', async () => {
      (prisma.deliveryProfile.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-2' });
      await expect(service.remove('profile-1', 'dist-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createCutoffRule', () => {
    it('creates a cutoff rule', async () => {
      (prisma.deliveryProfile.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-1' });
      (prisma.deliveryProfileCutoffRule.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.deliveryProfileCutoffRule.create as jest.Mock).mockResolvedValue(makeRule());
      const result = await service.createCutoffRule('profile-1', 'dist-1', {
        weekday: 5,
        cutoffTime: '17:00',
        processingDaysBeforeDelivery: 2,
      });
      expect(result.weekday).toBe(5);
    });

    it('throws BadRequestException when weekday already has a rule', async () => {
      (prisma.deliveryProfile.findUnique as jest.Mock).mockResolvedValue({ distributorId: 'dist-1' });
      (prisma.deliveryProfileCutoffRule.findUnique as jest.Mock).mockResolvedValue({ id: 'rule-1' });
      await expect(
        service.createCutoffRule('profile-1', 'dist-1', {
          weekday: 5,
          cutoffTime: '17:00',
          processingDaysBeforeDelivery: 2,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('assignDeliveryProfile', () => {
    it('upserts TraderCustomerSettings with deliveryProfileId', async () => {
      (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue({ id: 'tr-1' });
      (prisma.deliveryProfile.findFirst as jest.Mock).mockResolvedValue({ id: 'profile-1' });
      (prisma.traderCustomerSettings.upsert as jest.Mock).mockResolvedValue({});

      await service.assignDeliveryProfile('tr-1', 'dist-1', { deliveryProfileId: 'profile-1' });

      expect(prisma.traderCustomerSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tradeRelationshipId: 'tr-1' },
          update: { deliveryProfileId: 'profile-1' },
        }),
      );
    });

    it('clears deliveryProfileId when null is passed', async () => {
      (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue({ id: 'tr-1' });
      (prisma.traderCustomerSettings.upsert as jest.Mock).mockResolvedValue({});

      const result = await service.assignDeliveryProfile('tr-1', 'dist-1', { deliveryProfileId: null });

      expect(result).toEqual({ deliveryProfileId: null });
      expect(prisma.traderCustomerSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { deliveryProfileId: null },
        }),
      );
    });

    it('throws NotFoundException when trade relationship not found', async () => {
      (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.assignDeliveryProfile('bad-tr', 'dist-1', { deliveryProfileId: 'profile-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when delivery profile not found for distributor', async () => {
      (prisma.tradeRelationship.findFirst as jest.Mock).mockResolvedValue({ id: 'tr-1' });
      (prisma.deliveryProfile.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.assignDeliveryProfile('tr-1', 'dist-1', { deliveryProfileId: 'bad-profile' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
