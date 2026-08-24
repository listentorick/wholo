import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PriceListRuleSelectorType } from '@prisma/client';
import { AdminPriceListsService } from './admin-price-lists.service';
import { PrismaService } from '../prisma/prisma.service';

const DISTRIBUTOR_ID = 'dist-1';
const PRICE_LIST_ID = 'pl-1';

function makeCreatedPriceList(overrides: Record<string, unknown> = {}) {
  return {
    id: PRICE_LIST_ID,
    distributorId: DISTRIBUTOR_ID,
    name: 'Standard',
    description: null,
    currency: 'GBP',
    isDefault: false,
    active: true,
    rules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCreatedRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    distributorId: DISTRIBUTOR_ID,
    priceListId: PRICE_LIST_ID,
    selectorType: PriceListRuleSelectorType.ALL_PRODUCTS,
    productId: null,
    productVariantId: null,
    minQuantity: 1,
    valueType: 'FIXED_PRICE',
    unitPrice: { toFixed: () => '10.00' },
    discountPercentage: null,
    discountBaseType: null,
    basePriceListId: null,
    currency: 'GBP',
    sortOrder: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    product: null,
    ...overrides,
  };
}

describe('AdminPriceListsService', () => {
  let service: AdminPriceListsService;
  let prisma: {
    priceList: { create: jest.Mock; findUnique: jest.Mock };
    priceListRule: { create: jest.Mock };
    distributorSettings: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      priceList: { create: jest.fn(), findUnique: jest.fn() },
      priceListRule: { create: jest.fn() },
      distributorSettings: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminPriceListsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AdminPriceListsService);
  });

  describe('create', () => {
    it('uses the distributor settings currency when none is provided', async () => {
      prisma.distributorSettings.findUnique.mockResolvedValue({ currencyCode: 'USD' });
      prisma.priceList.create.mockResolvedValue(makeCreatedPriceList({ currency: 'USD' }));

      await service.create(DISTRIBUTOR_ID, { name: 'Standard' } as any);

      expect(prisma.priceList.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currency: 'USD' }) }),
      );
    });

    it('falls back to GBP when the distributor has no settings row', async () => {
      prisma.distributorSettings.findUnique.mockResolvedValue(null);
      prisma.priceList.create.mockResolvedValue(makeCreatedPriceList({ currency: 'GBP' }));

      await service.create(DISTRIBUTOR_ID, { name: 'Standard' } as any);

      expect(prisma.priceList.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currency: 'GBP' }) }),
      );
    });

    it('respects an explicit currency on the DTO over the distributor default', async () => {
      prisma.priceList.create.mockResolvedValue(makeCreatedPriceList({ currency: 'EUR' }));

      await service.create(DISTRIBUTOR_ID, { name: 'Standard', currency: 'EUR' } as any);

      expect(prisma.priceList.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currency: 'EUR' }) }),
      );
      expect(prisma.distributorSettings.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('createRule', () => {
    it('inherits the owning price list currency when none is provided on the DTO', async () => {
      prisma.priceList.findUnique.mockResolvedValue({ distributorId: DISTRIBUTOR_ID, currency: 'USD' });
      prisma.priceListRule.create.mockResolvedValue(makeCreatedRule({ currency: 'USD' }));

      await service.createRule(PRICE_LIST_ID, DISTRIBUTOR_ID, {
        selectorType: PriceListRuleSelectorType.ALL_PRODUCTS,
        unitPrice: '10.00',
      } as any);

      expect(prisma.priceListRule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currency: 'USD' }) }),
      );
    });

    it('respects an explicit currency on the DTO over the price list currency', async () => {
      prisma.priceList.findUnique.mockResolvedValue({ distributorId: DISTRIBUTOR_ID, currency: 'USD' });
      prisma.priceListRule.create.mockResolvedValue(makeCreatedRule({ currency: 'EUR' }));

      await service.createRule(PRICE_LIST_ID, DISTRIBUTOR_ID, {
        selectorType: PriceListRuleSelectorType.ALL_PRODUCTS,
        unitPrice: '10.00',
        currency: 'EUR',
      } as any);

      expect(prisma.priceListRule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currency: 'EUR' }) }),
      );
    });

    it('throws NotFoundException when the price list does not belong to the distributor', async () => {
      prisma.priceList.findUnique.mockResolvedValue({ distributorId: 'other-dist', currency: 'GBP' });

      await expect(
        service.createRule(PRICE_LIST_ID, DISTRIBUTOR_ID, {
          selectorType: PriceListRuleSelectorType.ALL_PRODUCTS,
          unitPrice: '10.00',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
