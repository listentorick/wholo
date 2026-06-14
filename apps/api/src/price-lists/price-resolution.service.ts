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
    const settings = await this.prisma.traderCustomerSettings.findUnique({
      where: { distributorId_traderCustomerId: { distributorId, traderCustomerId: customerId } },
      select: { priceListId: true },
    });

    if (settings?.priceListId) return settings.priceListId;

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
}
