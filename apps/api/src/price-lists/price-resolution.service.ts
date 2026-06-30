import { Injectable } from '@nestjs/common';
import { Prisma, PriceListRuleDiscountBaseType, PriceListRuleSelectorType, PriceListRuleValueType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedPrice {
  unitPrice: Prisma.Decimal;
  priceListId: string;
  priceListRuleId: string;
}

const MAX_DEPTH = 3;

@Injectable()
export class PriceResolutionService {
  constructor(private prisma: PrismaService) {}

  async resolvePriceListId(distributorId: string, customerId: string): Promise<string | null> {
    const rel = await this.prisma.tradeRelationship.findUnique({
      where: { distributorId_customerId: { distributorId, customerId } },
      select: { traderCustomerSettings: { select: { priceListId: true } } },
    });

    if (rel?.traderCustomerSettings?.priceListId) return rel.traderCustomerSettings.priceListId;

    const defaultList = await this.prisma.priceList.findFirst({
      where: { distributorId, isDefault: true, active: true },
      select: { id: true },
    });

    return defaultList?.id ?? null;
  }

  async resolvePrice(
    distributorId: string,
    customerId: string,
    productId: string,
    quantity: number,
    depth = 0,
    overridePriceListId?: string,
  ): Promise<ResolvedPrice | null> {
    const priceListId = overridePriceListId ?? await this.resolvePriceListId(distributorId, customerId);
    if (!priceListId) return null;

    const rules = await this.prisma.priceListRule.findMany({
      where: {
        priceListId,
        active: true,
        minQuantity: { lte: quantity },
        OR: [
          { selectorType: PriceListRuleSelectorType.PRODUCT, productId },
          { selectorType: PriceListRuleSelectorType.ALL_PRODUCTS },
        ],
      },
      select: {
        id: true,
        selectorType: true,
        minQuantity: true,
        valueType: true,
        unitPrice: true,
        discountPercentage: true,
        discountBaseType: true,
        basePriceListId: true,
      },
    });

    if (rules.length === 0) return null;

    // PRODUCT rules take precedence over ALL_PRODUCTS; within same type, highest minQuantity wins
    rules.sort((a, b) => {
      const selectorOrder =
        (a.selectorType === PriceListRuleSelectorType.PRODUCT ? 0 : 1) -
        (b.selectorType === PriceListRuleSelectorType.PRODUCT ? 0 : 1);
      if (selectorOrder !== 0) return selectorOrder;
      return b.minQuantity - a.minQuantity;
    });

    const matched = rules[0];

    if (matched.valueType === PriceListRuleValueType.FIXED_PRICE) {
      if (!matched.unitPrice) return null;
      return { unitPrice: matched.unitPrice as Prisma.Decimal, priceListId, priceListRuleId: matched.id };
    }

    // PERCENTAGE_DISCOUNT — resolve base price
    let base: Prisma.Decimal | null = null;

    if (matched.discountBaseType === PriceListRuleDiscountBaseType.PRODUCT_PRICE) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { price: true },
      });
      base = (product?.price as Prisma.Decimal | null) ?? null;
    } else if (
      matched.discountBaseType === PriceListRuleDiscountBaseType.PRICE_LIST &&
      matched.basePriceListId &&
      depth < MAX_DEPTH
    ) {
      const baseResolved = await this.resolvePrice(
        distributorId, customerId, productId, quantity, depth + 1, matched.basePriceListId,
      );
      base = baseResolved?.unitPrice ?? null;
    }

    if (!base || !matched.discountPercentage) return null;

    const pct = matched.discountPercentage as Prisma.Decimal;
    const multiplier = new Prisma.Decimal(1).minus(pct.div(100));
    return { unitPrice: (base as Prisma.Decimal).mul(multiplier), priceListId, priceListRuleId: matched.id };
  }

  async resolvePricesForProducts(
    distributorId: string,
    customerId: string,
    productIds: string[],
    quantity = 1,
  ): Promise<Map<string, Prisma.Decimal>> {
    if (productIds.length === 0) return new Map();

    const priceListId = await this.resolvePriceListId(distributorId, customerId);
    if (!priceListId) return new Map();

    const rules = await this.prisma.priceListRule.findMany({
      where: {
        priceListId,
        active: true,
        minQuantity: { lte: quantity },
        OR: [
          { selectorType: PriceListRuleSelectorType.ALL_PRODUCTS },
          { selectorType: PriceListRuleSelectorType.PRODUCT, productId: { in: productIds } },
        ],
      },
      select: {
        id: true,
        selectorType: true,
        productId: true,
        minQuantity: true,
        valueType: true,
        unitPrice: true,
        discountPercentage: true,
        discountBaseType: true,
        basePriceListId: true,
      },
    });

    if (rules.length === 0) return new Map();

    // Pre-fetch product prices in one query when any rule needs PRODUCT_PRICE as discount base
    const needsProductPrice = rules.some(
      (r) =>
        r.valueType === PriceListRuleValueType.PERCENTAGE_DISCOUNT &&
        r.discountBaseType === PriceListRuleDiscountBaseType.PRODUCT_PRICE,
    );
    const productPriceMap = new Map<string, Prisma.Decimal | null>();
    if (needsProductPrice) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, price: true },
      });
      for (const p of products) {
        productPriceMap.set(p.id, (p.price as Prisma.Decimal | null) ?? null);
      }
    }

    const result = new Map<string, Prisma.Decimal>();

    for (const productId of productIds) {
      const candidates = rules.filter(
        (r) =>
          r.selectorType === PriceListRuleSelectorType.ALL_PRODUCTS ||
          (r.selectorType === PriceListRuleSelectorType.PRODUCT && r.productId === productId),
      );

      if (candidates.length === 0) continue;

      // PRODUCT rules take precedence over ALL_PRODUCTS; within same type, highest minQuantity wins
      candidates.sort((a, b) => {
        const selectorOrder =
          (a.selectorType === PriceListRuleSelectorType.PRODUCT ? 0 : 1) -
          (b.selectorType === PriceListRuleSelectorType.PRODUCT ? 0 : 1);
        if (selectorOrder !== 0) return selectorOrder;
        return b.minQuantity - a.minQuantity;
      });

      const matched = candidates[0];

      if (matched.valueType === PriceListRuleValueType.FIXED_PRICE) {
        if (matched.unitPrice) result.set(productId, matched.unitPrice as Prisma.Decimal);
        continue;
      }

      // PERCENTAGE_DISCOUNT — resolve base price
      let base: Prisma.Decimal | null = null;

      if (matched.discountBaseType === PriceListRuleDiscountBaseType.PRODUCT_PRICE) {
        base = productPriceMap.get(productId) ?? null;
      } else if (matched.discountBaseType === PriceListRuleDiscountBaseType.PRICE_LIST && matched.basePriceListId) {
        const baseResolved = await this.resolvePrice(
          distributorId, customerId, productId, quantity, 0, matched.basePriceListId,
        );
        base = baseResolved?.unitPrice ?? null;
      }

      if (!base || !matched.discountPercentage) continue;

      const pct = matched.discountPercentage as Prisma.Decimal;
      const multiplier = new Prisma.Decimal(1).minus(pct.div(100));
      result.set(productId, (base as Prisma.Decimal).mul(multiplier));
    }

    return result;
  }
}
