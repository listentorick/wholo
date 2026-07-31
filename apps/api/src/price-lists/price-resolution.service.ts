import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PriceListRuleDiscountBaseType, PriceListRuleSelectorType, PriceListRuleValueType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedPrice {
  unitPrice: Prisma.Decimal;
  priceListId: string;
  priceListRuleId: string;
}

interface RuleRow {
  id: string;
  selectorType: PriceListRuleSelectorType;
  productId: string | null;
  minQuantity: number;
  valueType: PriceListRuleValueType;
  unitPrice: Prisma.Decimal | null;
  discountPercentage: Prisma.Decimal | null;
  discountBaseType: PriceListRuleDiscountBaseType | null;
  basePriceListId: string | null;
}

const MAX_DEPTH = 3;

const RULE_SELECT = {
  id: true,
  selectorType: true,
  productId: true,
  minQuantity: true,
  valueType: true,
  unitPrice: true,
  discountPercentage: true,
  discountBaseType: true,
  basePriceListId: true,
} satisfies Prisma.PriceListRuleSelect;

/** PRODUCT rules take precedence over ALL_PRODUCTS; within the same type, highest minQuantity wins. */
function selectWinningRule(candidates: RuleRow[]): RuleRow {
  return [...candidates].sort((a, b) => {
    const selectorOrder =
      (a.selectorType === PriceListRuleSelectorType.PRODUCT ? 0 : 1) -
      (b.selectorType === PriceListRuleSelectorType.PRODUCT ? 0 : 1);
    if (selectorOrder !== 0) return selectorOrder;
    return b.minQuantity - a.minQuantity;
  })[0];
}

@Injectable()
export class PriceResolutionService {
  private readonly logger = new Logger(PriceResolutionService.name);

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
  ): Promise<ResolvedPrice | null> {
    const resolved = await this.resolveMany(distributorId, customerId, [productId], quantity);
    return resolved.get(productId) ?? null;
  }

  async resolvePricesForProducts(
    distributorId: string,
    customerId: string,
    productIds: string[],
    quantity = 1,
  ): Promise<Map<string, Prisma.Decimal>> {
    const resolved = await this.resolveMany(distributorId, customerId, productIds, quantity);
    const result = new Map<string, Prisma.Decimal>();
    for (const [productId, price] of resolved) result.set(productId, price.unitPrice);
    return result;
  }

  /**
   * Shared, batch-aware resolution engine — the single place rule-matching, price
   * calculation, and price-list-chain recursion happen. `resolvePrice` and
   * `resolvePricesForProducts` are thin wrappers over this so they can never
   * disagree with each other (see the C1 code-quality finding this replaces).
   *
   * `depth`/`overridePriceListId`/`visitedPriceListIds` are internal recursion
   * state only — no external caller ever needs them.
   */
  private async resolveMany(
    distributorId: string,
    customerId: string,
    productIds: string[],
    quantity: number,
    depth = 0,
    overridePriceListId?: string,
    visitedPriceListIds: ReadonlySet<string> = new Set(),
  ): Promise<Map<string, ResolvedPrice>> {
    const result = new Map<string, ResolvedPrice>();
    if (productIds.length === 0) return result;

    const priceListId = overridePriceListId ?? (await this.resolvePriceListId(distributorId, customerId));
    if (!priceListId) return result;

    if (visitedPriceListIds.has(priceListId)) {
      // A misconfigured price-list chain (A based on B based on ... on A) must not fail
      // the whole request — the affected product(s) simply have no resolvable price,
      // exactly like exhausting MAX_DEPTH already does below. Log for admin visibility.
      this.logger.warn(
        `Circular price list reference detected (priceListId=${priceListId}, distributorId=${distributorId}); ` +
          `productIds=[${productIds.join(',')}] will resolve without this base.`,
      );
      return result;
    }
    const nextVisited = new Set(visitedPriceListIds).add(priceListId);

    // This level's own rules are evaluated regardless of depth — depth only gates
    // whether we're allowed to recurse further from here (see step below).
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
      select: RULE_SELECT,
    });
    if (rules.length === 0) return result;

    const matchedByProduct = new Map<string, RuleRow>();
    for (const productId of productIds) {
      const candidates = rules.filter(
        (r) =>
          r.selectorType === PriceListRuleSelectorType.ALL_PRODUCTS ||
          (r.selectorType === PriceListRuleSelectorType.PRODUCT && r.productId === productId),
      );
      if (candidates.length === 0) continue;
      matchedByProduct.set(productId, selectWinningRule(candidates));
    }

    const needsProductPrice: string[] = [];
    const needsPriceListBase = new Map<string, string[]>(); // basePriceListId -> productIds needing it
    for (const [productId, rule] of matchedByProduct) {
      if (rule.valueType === PriceListRuleValueType.FIXED_PRICE) continue;
      if (rule.discountBaseType === PriceListRuleDiscountBaseType.PRODUCT_PRICE) {
        needsProductPrice.push(productId);
      } else if (rule.discountBaseType === PriceListRuleDiscountBaseType.PRICE_LIST && rule.basePriceListId) {
        if (depth < MAX_DEPTH) {
          const ids = needsPriceListBase.get(rule.basePriceListId) ?? [];
          ids.push(productId);
          needsPriceListBase.set(rule.basePriceListId, ids);
        }
        // else: depth cap reached — this product is left unresolved, same as today.
      }
    }

    const productPriceMap = new Map<string, Prisma.Decimal | null>();
    if (needsProductPrice.length > 0) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: needsProductPrice } },
        select: { id: true, price: true },
      });
      for (const p of products) productPriceMap.set(p.id, (p.price as Prisma.Decimal | null) ?? null);
    }

    // One recursive call per DISTINCT base price list (covering every product that shares
    // it), not one per product — this is what fixes the batch path's N+1.
    const baseResults = new Map<string, ResolvedPrice>();
    for (const [baseListId, ids] of needsPriceListBase) {
      const resolved = await this.resolveMany(distributorId, customerId, ids, quantity, depth + 1, baseListId, nextVisited);
      for (const [pid, r] of resolved) baseResults.set(pid, r);
    }

    for (const [productId, rule] of matchedByProduct) {
      if (rule.valueType === PriceListRuleValueType.FIXED_PRICE) {
        if (!rule.unitPrice) continue;
        result.set(productId, { unitPrice: rule.unitPrice, priceListId, priceListRuleId: rule.id });
        continue;
      }

      let base: Prisma.Decimal | null = null;
      if (rule.discountBaseType === PriceListRuleDiscountBaseType.PRODUCT_PRICE) {
        base = productPriceMap.get(productId) ?? null;
      } else if (rule.discountBaseType === PriceListRuleDiscountBaseType.PRICE_LIST) {
        base = baseResults.get(productId)?.unitPrice ?? null;
      }

      if (!base || !rule.discountPercentage) continue;

      const multiplier = new Prisma.Decimal(1).minus(rule.discountPercentage.div(100));
      result.set(productId, { unitPrice: base.mul(multiplier), priceListId, priceListRuleId: rule.id });
    }

    return result;
  }
}
