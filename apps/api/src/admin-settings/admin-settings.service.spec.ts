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
  addressLine1: '42 Foveaux Street',
  addressLine2: null,
  addressCity: 'Surry Hills',
  addressState: 'NSW',
  addressPostcode: '2010',
  addressCountry: 'Australia',
};

const mockSettings = {
  distributorId: 'dist-1',
  defaultOrderAcceptanceMode: OrderAcceptanceMode.MANUAL,
  marketplaceVisible: false,
  marketplaceDescription: null,
  orderNotificationEmails: [],
  minimumOrderSpend: null,
  tagline: null,
  aboutText: null,
  processingDays: [],
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
        addressLine1: '42 Foveaux Street',
        addressLine2: null,
        addressCity: 'Surry Hills',
        addressState: 'NSW',
        addressPostcode: '2010',
        addressCountry: 'Australia',
        defaultOrderAcceptanceMode: OrderAcceptanceMode.MANUAL,
        marketplaceVisible: false,
        marketplaceDescription: null,
        orderNotificationEmails: [],
        minimumOrderSpend: null,
        tagline: null,
        aboutText: null,
        processingDays: [],
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

    it('writes address fields to orgPatch', async () => {
      mockPrisma.organisation.update.mockResolvedValue(mockOrg);

      await service.update('dist-1', {
        addressLine1: '1 New Street',
        addressCity: 'Melbourne',
        addressState: 'VIC',
        addressPostcode: '3000',
        addressCountry: 'Australia',
      });

      expect(mockPrisma.organisation.update).toHaveBeenCalledWith({
        where: { id: 'dist-1' },
        data: {
          addressLine1: '1 New Street',
          addressCity: 'Melbourne',
          addressState: 'VIC',
          addressPostcode: '3000',
          addressCountry: 'Australia',
        },
      });
      expect(mockPrisma.distributorSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ distributorId: 'dist-1' }) }),
      );
    });

    it('returns refreshed settings after update', async () => {
      const result = await service.update('dist-1', { name: 'Updated' });

      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('defaultOrderAcceptanceMode');
    });

    it('maps a slug unique-constraint violation to ConflictException (409, not 500)', async () => {
      const { Prisma } = jest.requireActual('@prisma/client');
      mockPrisma.organisation.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['slug'] },
        }),
      );

      await expect(service.update('dist-1', { slug: 'taken-slug' })).rejects.toMatchObject({
        status: 409,
      });
    });

    it('converts minimumOrderSpend string to Decimal in settingsPatch', async () => {
      await service.update('dist-1', { minimumOrderSpend: '50.00' });

      const upsertCall = mockPrisma.distributorSettings.upsert.mock.calls[0][0];
      expect(upsertCall.update.minimumOrderSpend).toBeDefined();
      expect(upsertCall.update.minimumOrderSpend.toString()).toBe('50');
    });

    it('includes minimumOrderSpend in find() result', async () => {
      mockPrisma.distributorSettings.upsert.mockResolvedValue({
        ...mockSettings,
        minimumOrderSpend: { toString: () => '75.50' },
      });

      const result = await service.find('dist-1');
      expect(result.minimumOrderSpend).toBe('75.50');
    });
  });
});
