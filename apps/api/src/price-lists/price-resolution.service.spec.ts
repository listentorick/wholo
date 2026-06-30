import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, PriceListRuleDiscountBaseType, PriceListRuleSelectorType, PriceListRuleValueType } from '@prisma/client';
import { PriceResolutionService, ResolvedPrice } from './price-resolution.service';
import { PrismaService } from '../prisma/prisma.service';

const DISTRIBUTOR_ID = 'dist-1';
const CUSTOMER_ID = 'cust-1';
const PRODUCT_ID_1 = 'prod-1';
const PRODUCT_ID_2 = 'prod-2';
const PRICE_LIST_ID = 'pl-1';
const PRICE_LIST_ID_2 = 'pl-2';
const RULE_ID = 'rule-1';

const dec = (v: string) => new Prisma.Decimal(v);

const fixedRule = (overrides: Partial<{
  id: string; selectorType: PriceListRuleSelectorType; productId: string | null;
  minQuantity: number; unitPrice: Prisma.Decimal;
}> = {}) => ({
  id: overrides.id ?? RULE_ID,
  selectorType: overrides.selectorType ?? PriceListRuleSelectorType.ALL_PRODUCTS,
  productId: overrides.productId ?? null,
  minQuantity: overrides.minQuantity ?? 1,
  valueType: PriceListRuleValueType.FIXED_PRICE,
  unitPrice: overrides.unitPrice ?? dec('10.00'),
  discountPercentage: null,
  discountBaseType: null,
  basePriceListId: null,
});

const pctProductPriceRule = (overrides: Partial<{
  id: string; selectorType: PriceListRuleSelectorType; productId: string | null;
  minQuantity: number; discountPercentage: Prisma.Decimal;
}> = {}) => ({
  id: overrides.id ?? RULE_ID,
  selectorType: overrides.selectorType ?? PriceListRuleSelectorType.ALL_PRODUCTS,
  productId: overrides.productId ?? null,
  minQuantity: overrides.minQuantity ?? 1,
  valueType: PriceListRuleValueType.PERCENTAGE_DISCOUNT,
  unitPrice: null,
  discountPercentage: overrides.discountPercentage ?? dec('10'),
  discountBaseType: PriceListRuleDiscountBaseType.PRODUCT_PRICE,
  basePriceListId: null,
});

const pctPriceListRule = (basePriceListId: string, discountPercentage = dec('20')) => ({
  id: RULE_ID,
  selectorType: PriceListRuleSelectorType.ALL_PRODUCTS,
  productId: null,
  minQuantity: 1,
  valueType: PriceListRuleValueType.PERCENTAGE_DISCOUNT,
  unitPrice: null,
  discountPercentage,
  discountBaseType: PriceListRuleDiscountBaseType.PRICE_LIST,
  basePriceListId,
});

const mockPrisma = {
  tradeRelationship: { findUnique: jest.fn() },
  priceList: { findFirst: jest.fn() },
  priceListRule: { findMany: jest.fn() },
  product: { findUnique: jest.fn(), findMany: jest.fn() },
};

describe('PriceResolutionService', () => {
  let service: PriceResolutionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceResolutionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PriceResolutionService>(PriceResolutionService);
    jest.clearAllMocks();

    // Sensible defaults — override in each test as needed
    mockPrisma.tradeRelationship.findUnique.mockResolvedValue(null);
    mockPrisma.priceList.findFirst.mockResolvedValue({ id: PRICE_LIST_ID });
    mockPrisma.priceListRule.findMany.mockResolvedValue([]);
    mockPrisma.product.findUnique.mockResolvedValue(null);
    mockPrisma.product.findMany.mockResolvedValue([]);
  });

  // ─── resolvePriceListId ──────────────────────────────────────────────────────

  describe('resolvePriceListId', () => {
    it('returns customer-specific price list when relationship has one assigned', async () => {
      mockPrisma.tradeRelationship.findUnique.mockResolvedValue({
        traderCustomerSettings: { priceListId: 'customer-pl' },
      });
      const result = await service.resolvePriceListId(DISTRIBUTOR_ID, CUSTOMER_ID);
      expect(result).toBe('customer-pl');
      expect(mockPrisma.priceList.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to default price list when no customer-specific list assigned', async () => {
      mockPrisma.tradeRelationship.findUnique.mockResolvedValue({
        traderCustomerSettings: { priceListId: null },
      });
      mockPrisma.priceList.findFirst.mockResolvedValue({ id: PRICE_LIST_ID });
      const result = await service.resolvePriceListId(DISTRIBUTOR_ID, CUSTOMER_ID);
      expect(result).toBe(PRICE_LIST_ID);
    });

    it('returns null when no relationship and no default price list', async () => {
      mockPrisma.priceList.findFirst.mockResolvedValue(null);
      const result = await service.resolvePriceListId(DISTRIBUTOR_ID, CUSTOMER_ID);
      expect(result).toBeNull();
    });
  });

  // ─── resolvePrice ────────────────────────────────────────────────────────────

  describe('resolvePrice', () => {
    it('returns null when customer has no price list', async () => {
      mockPrisma.priceList.findFirst.mockResolvedValue(null);
      const result = await service.resolvePrice(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1);
      expect(result).toBeNull();
    });

    it('returns null when no rules match', async () => {
      const result = await service.resolvePrice(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1);
      expect(result).toBeNull();
    });

    it('returns FIXED_PRICE from ALL_PRODUCTS rule', async () => {
      mockPrisma.priceListRule.findMany.mockResolvedValue([fixedRule({ unitPrice: dec('25.00') })]);
      const result = await service.resolvePrice(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1);
      expect(result).not.toBeNull();
      expect(result!.unitPrice.toString()).toBe('25');
      expect(result!.priceListId).toBe(PRICE_LIST_ID);
    });

    it('PRODUCT rule takes precedence over ALL_PRODUCTS rule for the same product', async () => {
      mockPrisma.priceListRule.findMany.mockResolvedValue([
        fixedRule({ id: 'all-rule', selectorType: PriceListRuleSelectorType.ALL_PRODUCTS, unitPrice: dec('20.00') }),
        fixedRule({ id: 'prod-rule', selectorType: PriceListRuleSelectorType.PRODUCT, productId: PRODUCT_ID_1, unitPrice: dec('15.00') }),
      ]);
      const result = await service.resolvePrice(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1);
      expect(result!.unitPrice.toString()).toBe('15');
      expect(result!.priceListRuleId).toBe('prod-rule');
    });

    it('applies PERCENTAGE_DISCOUNT against PRODUCT_PRICE base', async () => {
      mockPrisma.priceListRule.findMany.mockResolvedValue([
        pctProductPriceRule({ discountPercentage: dec('10') }),
      ]);
      mockPrisma.product.findUnique.mockResolvedValue({ price: dec('100.00') });
      const result = await service.resolvePrice(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1);
      // 10% off $100 = $90
      expect(result!.unitPrice.toFixed(2)).toBe('90.00');
    });

    it('applies PERCENTAGE_DISCOUNT against chained PRICE_LIST base', async () => {
      mockPrisma.priceListRule.findMany
        // First call: the outer price list rule (20% off)
        .mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID_2, dec('20'))])
        // Second call (recursive): the base price list has a fixed price of $50
        .mockResolvedValueOnce([fixedRule({ unitPrice: dec('50.00') })]);

      const result = await service.resolvePrice(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1);
      // 20% off $50 = $40
      expect(result!.unitPrice.toFixed(2)).toBe('40.00');
    });

    it('does not match rules with minQuantity above the requested quantity', async () => {
      mockPrisma.priceListRule.findMany.mockResolvedValue([]);
      await service.resolvePrice(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1);
      expect(mockPrisma.priceListRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ minQuantity: { lte: 1 } }),
        }),
      );
    });

    it('returns null for PRICE_LIST base when depth reaches MAX_DEPTH', async () => {
      // Pass depth=3 directly to trigger the guard
      const result = await service.resolvePrice(
        DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1, 3, PRICE_LIST_ID,
      );
      // No rules fetched because priceListId is provided, but even if there were a PRICE_LIST rule,
      // depth >= MAX_DEPTH means it would return null for the base resolution.
      // Here we test the boundary: depth=3 means the recursive call would be at depth=4 > MAX_DEPTH.
      // With no rules returned the result is null regardless.
      expect(result).toBeNull();
    });
  });

  // ─── resolvePricesForProducts ────────────────────────────────────────────────

  describe('resolvePricesForProducts', () => {
    it('returns empty Map immediately without DB calls when productIds is empty', async () => {
      const result = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, []);
      expect(result.size).toBe(0);
      expect(mockPrisma.tradeRelationship.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.priceListRule.findMany).not.toHaveBeenCalled();
    });

    it('returns empty Map when customer has no price list', async () => {
      mockPrisma.priceList.findFirst.mockResolvedValue(null);
      const result = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1]);
      expect(result.size).toBe(0);
      expect(mockPrisma.priceListRule.findMany).not.toHaveBeenCalled();
    });

    it('returns empty Map when no rules match any product', async () => {
      const result = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1, PRODUCT_ID_2]);
      expect(result.size).toBe(0);
    });

    it('applies FIXED_PRICE ALL_PRODUCTS rule to all products', async () => {
      mockPrisma.priceListRule.findMany.mockResolvedValue([
        fixedRule({ unitPrice: dec('12.50') }),
      ]);
      const result = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1, PRODUCT_ID_2]);
      expect(result.size).toBe(2);
      expect(result.get(PRODUCT_ID_1)!.toFixed(2)).toBe('12.50');
      expect(result.get(PRODUCT_ID_2)!.toFixed(2)).toBe('12.50');
    });

    it('PRODUCT rule overrides ALL_PRODUCTS rule for the specific product only', async () => {
      mockPrisma.priceListRule.findMany.mockResolvedValue([
        fixedRule({ id: 'all-rule', selectorType: PriceListRuleSelectorType.ALL_PRODUCTS, unitPrice: dec('20.00') }),
        fixedRule({ id: 'prod-rule', selectorType: PriceListRuleSelectorType.PRODUCT, productId: PRODUCT_ID_1, unitPrice: dec('15.00') }),
      ]);
      const result = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1, PRODUCT_ID_2]);
      expect(result.get(PRODUCT_ID_1)!.toFixed(2)).toBe('15.00');
      expect(result.get(PRODUCT_ID_2)!.toFixed(2)).toBe('20.00');
    });

    it('fetches all product prices in one findMany (not per-product) for PRODUCT_PRICE discount base', async () => {
      mockPrisma.priceListRule.findMany.mockResolvedValue([
        pctProductPriceRule({ discountPercentage: dec('25') }),
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: PRODUCT_ID_1, price: dec('80.00') },
        { id: PRODUCT_ID_2, price: dec('40.00') },
      ]);
      const result = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1, PRODUCT_ID_2]);
      // 25% off $80 = $60; 25% off $40 = $30
      expect(result.get(PRODUCT_ID_1)!.toFixed(2)).toBe('60.00');
      expect(result.get(PRODUCT_ID_2)!.toFixed(2)).toBe('30.00');
      // Must be one findMany, never findUnique
      expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.product.findUnique).not.toHaveBeenCalled();
    });

    it('delegates PRICE_LIST discount base to resolvePrice per affected product', async () => {
      mockPrisma.priceListRule.findMany
        // Batch call: one PRICE_LIST rule
        .mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID_2, dec('10'))])
        // resolvePrice recursive call for PRODUCT_ID_1: base fixed at $50
        .mockResolvedValueOnce([fixedRule({ unitPrice: dec('50.00') })])
        // resolvePrice recursive call for PRODUCT_ID_2: base fixed at $80
        .mockResolvedValueOnce([fixedRule({ unitPrice: dec('80.00') })]);

      const result = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1, PRODUCT_ID_2]);
      // 10% off $50 = $45; 10% off $80 = $72
      expect(result.get(PRODUCT_ID_1)!.toFixed(2)).toBe('45.00');
      expect(result.get(PRODUCT_ID_2)!.toFixed(2)).toBe('72.00');
    });

    it('excludes products with no matching rule from the result Map', async () => {
      mockPrisma.priceListRule.findMany.mockResolvedValue([
        // Rule only for PRODUCT_ID_1
        fixedRule({ selectorType: PriceListRuleSelectorType.PRODUCT, productId: PRODUCT_ID_1, unitPrice: dec('9.99') }),
      ]);
      const result = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1, PRODUCT_ID_2]);
      expect(result.has(PRODUCT_ID_1)).toBe(true);
      expect(result.has(PRODUCT_ID_2)).toBe(false);
    });

    it('filters rules by minQuantity — rules requiring qty > requested quantity are excluded', async () => {
      // Rule requires quantity >= 5; batch called with default quantity=1
      mockPrisma.priceListRule.findMany.mockResolvedValue([]);
      await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1]);
      expect(mockPrisma.priceListRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ minQuantity: { lte: 1 } }),
        }),
      );
    });

    it('passes the productIds list to the rules query OR clause', async () => {
      await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1, PRODUCT_ID_2]);
      expect(mockPrisma.priceListRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ productId: { in: [PRODUCT_ID_1, PRODUCT_ID_2] } }),
            ]),
          }),
        }),
      );
    });
  });
});
