import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma, TaxClassification } from '@prisma/client';
import { TaxTypesService } from './tax-types.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  taxType: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

const DISTRIBUTOR_ID = 'dist-1';
const TAX_TYPE_ID = 'tax-1';
const NOW = new Date('2025-01-15T00:00:00Z');

const baseTaxType = {
  id: TAX_TYPE_ID,
  distributorId: DISTRIBUTOR_ID,
  name: 'Standard rate',
  classification: TaxClassification.STANDARD,
  ratePercentage: new Prisma.Decimal('20.00'),
  active: true,
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('TaxTypesService', () => {
  let service: TaxTypesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaxTypesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<TaxTypesService>(TaxTypesService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns paginated, distributor-scoped list', async () => {
      mockPrisma.taxType.findMany.mockResolvedValue([baseTaxType]);
      mockPrisma.taxType.count.mockResolvedValue(1);

      const result = await service.findAll(DISTRIBUTOR_ID, {});

      expect(result.data).toEqual([expect.objectContaining({ id: TAX_TYPE_ID, ratePercentage: '20.00' })]);
      expect(result.pagination.total).toBe(1);
      const call = mockPrisma.taxType.findMany.mock.calls[0][0];
      expect(call.where.AND[0]).toEqual({ distributorId: DISTRIBUTOR_ID });
    });

    it('sets hasMore and nextCursor when result exceeds limit', async () => {
      const items = Array.from({ length: 3 }, (_, i) => ({
        ...baseTaxType,
        id: `tax-${i}`,
        createdAt: new Date(NOW.getTime() - i * 1000),
      }));
      mockPrisma.taxType.findMany.mockResolvedValue(items);
      mockPrisma.taxType.count.mockResolvedValue(5);

      const result = await service.findAll(DISTRIBUTOR_ID, { limit: 2 });

      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).not.toBeNull();
      expect(result.data).toHaveLength(2);
    });
  });

  describe('findOne', () => {
    it('returns the tax type when found', async () => {
      mockPrisma.taxType.findFirst.mockResolvedValue(baseTaxType);

      const result = await service.findOne(TAX_TYPE_ID, DISTRIBUTOR_ID);

      expect(result.id).toBe(TAX_TYPE_ID);
      expect(mockPrisma.taxType.findFirst).toHaveBeenCalledWith({
        where: { id: TAX_TYPE_ID, distributorId: DISTRIBUTOR_ID },
      });
    });

    it('throws NotFoundException when not found', async () => {
      mockPrisma.taxType.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TAX_TYPE_ID, DISTRIBUTOR_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the tax type belongs to a different distributor', async () => {
      // findFirst returns null because distributorId is part of the where clause —
      // a tax type owned by another distributor is invisible, not forbidden
      mockPrisma.taxType.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TAX_TYPE_ID, 'other-dist')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.taxType.findFirst).toHaveBeenCalledWith({
        where: { id: TAX_TYPE_ID, distributorId: 'other-dist' },
      });
    });
  });

  describe('create', () => {
    it('creates a tax type scoped to the distributor', async () => {
      mockPrisma.taxType.create.mockResolvedValue(baseTaxType);

      const result = await service.create(DISTRIBUTOR_ID, {
        name: 'Standard rate',
        classification: TaxClassification.STANDARD,
        ratePercentage: '20.00',
      });

      expect(mockPrisma.taxType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ distributorId: DISTRIBUTOR_ID, name: 'Standard rate', active: true }),
        }),
      );
      expect(result.ratePercentage).toBe('20.00');
    });

    it('defaults active to true when not provided', async () => {
      mockPrisma.taxType.create.mockResolvedValue(baseTaxType);

      await service.create(DISTRIBUTOR_ID, {
        name: 'Zero-rated',
        classification: TaxClassification.ZERO_RATED,
        ratePercentage: '0',
      });

      const call = mockPrisma.taxType.create.mock.calls[0][0];
      expect(call.data.active).toBe(true);
    });
  });

  describe('update', () => {
    it('updates the tax type when owned by the distributor', async () => {
      mockPrisma.taxType.findUnique.mockResolvedValue({ distributorId: DISTRIBUTOR_ID });
      mockPrisma.taxType.update.mockResolvedValue({ ...baseTaxType, name: 'Renamed' });

      const result = await service.update(TAX_TYPE_ID, DISTRIBUTOR_ID, { name: 'Renamed' });

      expect(result.name).toBe('Renamed');
    });

    it('throws NotFoundException when the tax type does not exist', async () => {
      mockPrisma.taxType.findUnique.mockResolvedValue(null);

      await expect(service.update(TAX_TYPE_ID, DISTRIBUTOR_ID, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the tax type belongs to a different distributor', async () => {
      mockPrisma.taxType.findUnique.mockResolvedValue({ distributorId: 'other-dist' });

      await expect(service.update(TAX_TYPE_ID, DISTRIBUTOR_ID, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.taxType.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('sets active to false rather than deleting the row', async () => {
      mockPrisma.taxType.findUnique.mockResolvedValue({ distributorId: DISTRIBUTOR_ID });
      mockPrisma.taxType.update.mockResolvedValue({ ...baseTaxType, active: false });

      const result = await service.deactivate(TAX_TYPE_ID, DISTRIBUTOR_ID);

      expect(mockPrisma.taxType.update).toHaveBeenCalledWith({
        where: { id: TAX_TYPE_ID },
        data: { active: false },
      });
      expect(result.active).toBe(false);
    });

    it('throws NotFoundException when the tax type belongs to a different distributor', async () => {
      mockPrisma.taxType.findUnique.mockResolvedValue({ distributorId: 'other-dist' });

      await expect(service.deactivate(TAX_TYPE_ID, DISTRIBUTOR_ID)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.taxType.update).not.toHaveBeenCalled();
    });
  });
});
