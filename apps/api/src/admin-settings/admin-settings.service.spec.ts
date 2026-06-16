import { Test, TestingModule } from '@nestjs/testing';
import { OrderAcceptanceMode } from '@prisma/client';
import { AdminSettingsService } from './admin-settings.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  organisation: {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  distributorSettings: {
    upsert: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockOrg = {
  id: 'dist-1',
  name: 'Acme Wines',
  email: 'hello@acme.com',
  phone: '+61400000000',
  slug: 'acme-wines',
};

const mockSettings = {
  distributorId: 'dist-1',
  defaultOrderAcceptanceMode: OrderAcceptanceMode.MANUAL,
  marketplaceVisible: false,
  marketplaceDescription: null,
  orderNotificationEmails: [],
};

describe('AdminSettingsService', () => {
  let service: AdminSettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSettingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(AdminSettingsService);
  });

  describe('find', () => {
    it('returns merged org and settings', async () => {
      mockPrisma.organisation.findUniqueOrThrow.mockResolvedValue(mockOrg);
      mockPrisma.distributorSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.find('dist-1');

      expect(result).toEqual({
        name: 'Acme Wines',
        email: 'hello@acme.com',
        phone: '+61400000000',
        slug: 'acme-wines',
        defaultOrderAcceptanceMode: OrderAcceptanceMode.MANUAL,
        marketplaceVisible: false,
        marketplaceDescription: null,
        orderNotificationEmails: [],
      });
      expect(mockPrisma.distributorSettings.upsert).toHaveBeenCalledWith({
        where: { distributorId: 'dist-1' },
        create: { distributorId: 'dist-1' },
        update: {},
      });
    });
  });

  describe('update', () => {
    beforeEach(() => {
      mockPrisma.organisation.findUniqueOrThrow.mockResolvedValue(mockOrg);
      mockPrisma.distributorSettings.upsert.mockResolvedValue(mockSettings);
      mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => Promise<void>) =>
        fn(mockPrisma),
      );
    });

    it('updates org fields when provided', async () => {
      mockPrisma.organisation.update.mockResolvedValue({ ...mockOrg, name: 'New Name' });

      await service.update('dist-1', { name: 'New Name' });

      expect(mockPrisma.organisation.update).toHaveBeenCalledWith({
        where: { id: 'dist-1' },
        data: { name: 'New Name' },
      });
    });

    it('does not call organisation.update when no org fields provided', async () => {
      await service.update('dist-1', { defaultOrderAcceptanceMode: OrderAcceptanceMode.AUTO_ON_SUBMISSION });

      expect(mockPrisma.organisation.update).not.toHaveBeenCalled();
    });

    it('upserts distributor settings with provided fields', async () => {
      await service.update('dist-1', {
        defaultOrderAcceptanceMode: OrderAcceptanceMode.AUTO_ON_SUBMISSION,
        marketplaceVisible: true,
        orderNotificationEmails: ['orders@acme.com'],
      });

      expect(mockPrisma.distributorSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { distributorId: 'dist-1' },
          create: expect.objectContaining({
            distributorId: 'dist-1',
            defaultOrderAcceptanceMode: OrderAcceptanceMode.AUTO_ON_SUBMISSION,
            marketplaceVisible: true,
            orderNotificationEmails: ['orders@acme.com'],
          }),
          update: expect.objectContaining({
            defaultOrderAcceptanceMode: OrderAcceptanceMode.AUTO_ON_SUBMISSION,
            marketplaceVisible: true,
            orderNotificationEmails: ['orders@acme.com'],
          }),
        }),
      );
    });

    it('returns refreshed settings after update', async () => {
      const result = await service.update('dist-1', { name: 'Updated' });

      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('defaultOrderAcceptanceMode');
    });
  });
});
