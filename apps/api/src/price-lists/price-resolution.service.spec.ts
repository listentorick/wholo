import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, PriceListRuleDiscountBaseType, PriceListRuleSelectorType, PriceListRuleValueType } from '@prisma/client';
import { PriceResolutionService } from './price-resolution.service';
import { PrismaService } from '../prisma/prisma.service';

const DISTRIBUTOR_ID = 'dist-1';
const CUSTOMER_ID = 'cust-1';
const PRODUCT_ID_1 = 'prod-1';
const PRODUCT_ID_2 = 'prod-2';
const PRICE_LIST_ID = 'pl-1';
const PRICE_LIST_ID_2 = 'pl-2';
const PRICE_LIST_ID_3 = 'pl-3';
const PRICE_LIST_ID_4 = 'pl-4';
const PRICE_LIST_ID_5 = 'pl-5';
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

const pctPriceListRuleForProduct = (productId: string, basePriceListId: string, discountPercentage = dec('10')) => ({
  id: `rule-for-${productId}`,
  selectorType: PriceListRuleSelectorType.PRODUCT,
  productId,
  minQuantity: 1,
  valueType: PriceListRuleValueType.PERCENTAGE_DISCOUNT,
  unitPrice: null,
  discountPercentage,
  discountBaseType: PriceListRuleDiscountBaseType.PRICE_LIST,
  basePriceListId,
});

const mockPrisma = {
  tradeRelationship: { findFirst: jest.fn() },
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
    mockPrisma.tradeRelationship.findFirst.mockResolvedValue(null);
    mockPrisma.priceList.findFirst.mockResolvedValue({ id: PRICE_LIST_ID });
    mockPrisma.priceListRule.findMany.mockResolvedValue([]);
    mockPrisma.product.findUnique.mockResolvedValue(null);
    mockPrisma.product.findMany.mockResolvedValue([]);
  });

  // ─── resolvePriceListId ──────────────────────────────────────────────────────

  describe('resolvePriceListId', () => {
    it('returns customer-specific price list when relationship has one assigned', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue({
        traderCustomerSettings: { priceListId: 'customer-pl' },
      });
      const result = await service.resolvePriceListId(DISTRIBUTOR_ID, CUSTOMER_ID);
      expect(result).toBe('customer-pl');
      expect(mockPrisma.priceList.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to default price list when no customer-specific list assigned', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue({
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

    it('queries the relationship with a status ACTIVE filter, not just existence', async () => {
      await service.resolvePriceListId(DISTRIBUTOR_ID, CUSTOMER_ID);
      expect(mockPrisma.tradeRelationship.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            distributorId: DISTRIBUTOR_ID,
            customerId: CUSTOMER_ID,
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('falls back to the default price list when the relationship is not ACTIVE (e.g. suspended)', async () => {
      // A SUSPENDED relationship is excluded by the query's status filter, so the
      // DB returns null here exactly as it would for "no relationship at all".
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue(null);
      mockPrisma.priceList.findFirst.mockResolvedValue({ id: PRICE_LIST_ID });
      const result = await service.resolvePriceListId(DISTRIBUTOR_ID, CUSTOMER_ID);
      expect(result).toBe(PRICE_LIST_ID);
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
      mockPrisma.product.findMany.mockResolvedValue([{ id: PRODUCT_ID_1, price: dec('100.00') }]);
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

    it('resolves a legitimate 3-hop price-list chain (exactly at MAX_DEPTH)', async () => {
      // pl-1 -20%-> pl-2 -10%-> pl-3 -5%-> pl-4 (fixed $100)
      mockPrisma.priceListRule.findMany
        .mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID_2, dec('20'))])
        .mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID_3, dec('10'))])
        .mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID_4, dec('5'))])
        .mockResolvedValueOnce([fixedRule({ unitPrice: dec('100.00') })]);

      const result = await service.resolvePrice(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1);
      // $100 -> 95 (5% off) -> 85.50 (10% off) -> 68.40 (20% off)
      expect(result!.unitPrice.toFixed(2)).toBe('68.40');
      expect(mockPrisma.priceListRule.findMany).toHaveBeenCalledTimes(4);
    });

    it('returns null for a chain one hop past MAX_DEPTH, without querying the 5th list', async () => {
      // Same chain as above, but pl-4's rule is ALSO PRICE_LIST-based (-> pl-5), a 4th hop.
      mockPrisma.priceListRule.findMany
        .mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID_2, dec('20'))])
        .mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID_3, dec('10'))])
        .mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID_4, dec('5'))])
        .mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID_5, dec('1'))]);

      const result = await service.resolvePrice(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1);
      expect(result).toBeNull();
      // The 5th list is never queried — the depth guard blocks the recursive call itself.
      expect(mockPrisma.priceListRule.findMany).toHaveBeenCalledTimes(4);
    });

    it('returns null for a direct self-reference without an infinite loop', async () => {
      mockPrisma.priceListRule.findMany.mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID, dec('10'))]);

      const result = await service.resolvePrice(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1);
      expect(result).toBeNull();
      // Cycle caught immediately — the second (self-referencing) level is never queried.
      expect(mockPrisma.priceListRule.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns null for a 2-list cycle without an infinite loop', async () => {
      mockPrisma.priceListRule.findMany
        .mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID_2, dec('10'))]) // pl-1 -> pl-2
        .mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID, dec('20'))]); // pl-2 -> pl-1 (cycle)

      const result = await service.resolvePrice(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1);
      expect(result).toBeNull();
      expect(mockPrisma.priceListRule.findMany).toHaveBeenCalledTimes(2);
    });

    it('resolvePrice and resolvePricesForProducts agree on the same chain (regression test for the depth-divergence bug)', async () => {
      const chainResponses = () => [
        [pctPriceListRule(PRICE_LIST_ID_2, dec('20'))],
        [pctPriceListRule(PRICE_LIST_ID_3, dec('10'))],
        [pctPriceListRule(PRICE_LIST_ID_4, dec('5'))],
        [fixedRule({ unitPrice: dec('100.00') })],
      ];

      chainResponses().forEach((rules) => mockPrisma.priceListRule.findMany.mockResolvedValueOnce(rules));
      const viaSingle = await service.resolvePrice(DISTRIBUTOR_ID, CUSTOMER_ID, PRODUCT_ID_1, 1);

      jest.clearAllMocks();
      chainResponses().forEach((rules) => mockPrisma.priceListRule.findMany.mockResolvedValueOnce(rules));
      const viaBatch = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1], 1);

      expect(viaSingle).not.toBeNull();
      expect(viaBatch.get(PRODUCT_ID_1)).toBeDefined();
      expect(viaBatch.get(PRODUCT_ID_1)!.toFixed(2)).toBe(viaSingle!.unitPrice.toFixed(2));
    });
  });

  // ─── resolvePricesForProducts ────────────────────────────────────────────────

  describe('resolvePricesForProducts', () => {
    it('returns empty Map immediately without DB calls when productIds is empty', async () => {
      const result = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, []);
      expect(result.size).toBe(0);
      expect(mockPrisma.tradeRelationship.findFirst).not.toHaveBeenCalled();
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

    it('resolves a PRICE_LIST discount base for multiple products sharing one base list in a single recursive call (N+1 fix)', async () => {
      mockPrisma.priceListRule.findMany
        // Top-level ALL_PRODUCTS rule — applies to both products
        .mockResolvedValueOnce([pctPriceListRule(PRICE_LIST_ID_2, dec('10'))])
        // ONE batched call for the shared base list, with per-product fixed prices
        .mockResolvedValueOnce([
          fixedRule({ id: 'base-rule-1', selectorType: PriceListRuleSelectorType.PRODUCT, productId: PRODUCT_ID_1, unitPrice: dec('50.00') }),
          fixedRule({ id: 'base-rule-2', selectorType: PriceListRuleSelectorType.PRODUCT, productId: PRODUCT_ID_2, unitPrice: dec('80.00') }),
        ]);

      const result = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1, PRODUCT_ID_2]);
      // 10% off $50 = $45; 10% off $80 = $72
      expect(result.get(PRODUCT_ID_1)!.toFixed(2)).toBe('45.00');
      expect(result.get(PRODUCT_ID_2)!.toFixed(2)).toBe('72.00');
      // 2 calls total (1 top + 1 shared base), not 3 — proves the N+1 fix.
      expect(mockPrisma.priceListRule.findMany).toHaveBeenCalledTimes(2);
    });

    it('resolves PRICE_LIST bases independently when different products point at different base lists', async () => {
      mockPrisma.priceListRule.findMany
        .mockResolvedValueOnce([
          pctPriceListRuleForProduct(PRODUCT_ID_1, PRICE_LIST_ID_2, dec('10')),
          pctPriceListRuleForProduct(PRODUCT_ID_2, PRICE_LIST_ID_3, dec('20')),
        ])
        .mockResolvedValueOnce([fixedRule({ unitPrice: dec('50.00') })]) // base for PRODUCT_ID_1's chain
        .mockResolvedValueOnce([fixedRule({ unitPrice: dec('80.00') })]); // base for PRODUCT_ID_2's chain

      const result = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1, PRODUCT_ID_2]);
      // 10% off $50 = $45; 20% off $80 = $64
      expect(result.get(PRODUCT_ID_1)!.toFixed(2)).toBe('45.00');
      expect(result.get(PRODUCT_ID_2)!.toFixed(2)).toBe('64.00');
      // 1 top + 1 per distinct base list = 3 calls total.
      expect(mockPrisma.priceListRule.findMany).toHaveBeenCalledTimes(3);
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

    it('excludes only the cycling product from a batch, resolving its non-cycling sibling normally', async () => {
      mockPrisma.priceListRule.findMany.mockResolvedValueOnce([
        // PRODUCT_ID_1's rule bases off the SAME list it's already in — a self-cycle.
        pctPriceListRuleForProduct(PRODUCT_ID_1, PRICE_LIST_ID, dec('10')),
        // PRODUCT_ID_2 has an unrelated, perfectly normal fixed-price rule.
        fixedRule({ id: 'ok-rule', selectorType: PriceListRuleSelectorType.PRODUCT, productId: PRODUCT_ID_2, unitPrice: dec('30.00') }),
      ]);

      const result = await service.resolvePricesForProducts(DISTRIBUTOR_ID, CUSTOMER_ID, [PRODUCT_ID_1, PRODUCT_ID_2]);
      expect(result.has(PRODUCT_ID_1)).toBe(false);
      expect(result.get(PRODUCT_ID_2)!.toFixed(2)).toBe('30.00');
      // The cycle is caught before any second query is ever made.
      expect(mockPrisma.priceListRule.findMany).toHaveBeenCalledTimes(1);
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
