import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OrganisationType, ProductStatus, PriceListRuleDiscountBaseType, PriceListRuleSelectorType, PriceListRuleValueType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PriceResolutionService } from '../price-lists/price-resolution.service';
import { R2StorageService } from '../asset-images/r2-storage.service';
import { CatalogueQueryDto } from './dto/catalogue-query.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

interface AssetImageVariants {
  thumb?: string;
  catalogue?: string;
  large?: string;
  [key: string]: string | undefined;
}

const catalogueProductInclude = {
  productType: { select: { id: true, name: true, code: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class CatalogueService {
  constructor(
    private prisma: PrismaService,
    private priceResolution: PriceResolutionService,
    private r2Storage: R2StorageService,
  ) {}

  async getDistributor(distributorSlug: string) {
    const distributor = await this.prisma.organisation.findFirst({
      where: { slug: distributorSlug, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: { id: true, name: true, slug: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');
    return distributor;
  }

  async getProducts(distributorSlug: string, query: CatalogueQueryDto, customerOrgId?: string) {
    const distributor = await this.prisma.organisation.findFirst({
      where: { slug: distributorSlug, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    // When a customer is authenticated, filter products to their assigned catalogues only.
    let catalogueProductIdFilter: string[] | undefined;
    if (customerOrgId) {
      const relationship = await this.prisma.tradeRelationship.findFirst({
        where: { distributorId: distributor.id, customerId: customerOrgId, deletedAt: null },
        select: { id: true },
      });
      if (relationship) {
        const assignments = await this.prisma.customerCatalogue.findMany({
          where: { tradeRelationshipId: relationship.id },
          select: {
            catalogue: {
              select: {
                products: {
                  select: { productId: true },
                },
              },
            },
          },
        });
        const ids = new Set<string>();
        for (const a of assignments) {
          for (const p of a.catalogue.products) ids.add(p.productId);
        }
        catalogueProductIdFilter = [...ids];
      } else {
        catalogueProductIdFilter = [];
      }
    }

    const limit = query.limit ?? 50;
    const take = limit + 1;

    const baseWhere: Prisma.ProductWhereInput = {
      distributorId: distributor.id,
      status: ProductStatus.ACTIVE,
      deletedAt: null,
      ...(catalogueProductIdFilter !== undefined && { id: { in: catalogueProductIdFilter } }),
      ...(query.productTypeCode && {
        productType: { code: query.productTypeCode },
      }),
    };

    let cursorWhere: Prisma.ProductWhereInput = {};
    if (query.cursor) {
      const decoded: CursorPayload = JSON.parse(
        Buffer.from(query.cursor, 'base64url').toString('utf8'),
      );
      cursorWhere = {
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: catalogueProductInclude,
      }),
      this.prisma.product.count({ where: baseWhere }),
    ]);

    const hasMore = items.length > limit;
    const rawData = hasMore ? items.slice(0, -1) : items;

    // All catalogue products are always shown. For authenticated customers, populate
    // resolvedPrices from their price list where a rule exists. Products with no
    // matching rule fall back to the base product price on the frontend.
    const data = rawData;
    const resolvedPrices = new Map<string, string>();

    const thumbnailUrls = new Map<string, string>();
    if (rawData.length > 0) {
      const productIds = rawData.map((p) => p.id);
      const images = await this.prisma.assetImage.findMany({
        where: {
          assetType: 'product-image',
          entityId: { in: productIds },
          distributorId: distributor.id,
          isPrimary: true,
        },
        select: { entityId: true, variants: true },
      });
      for (const img of images) {
        const variants = img.variants as AssetImageVariants;
        const thumbKey = variants?.thumb ?? null;
        if (thumbKey) thumbnailUrls.set(img.entityId, this.r2Storage.getPublicUrl(thumbKey));
      }
    }

    if (customerOrgId) {
      const priceListId = await this.priceResolution.resolvePriceListId(distributor.id, customerOrgId);

      if (priceListId) {
        const rules = await this.prisma.priceListRule.findMany({
          where: { priceListId, active: true },
          select: {
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

        const toDecimal = (v: unknown): Prisma.Decimal | null =>
          v != null && typeof v === 'object' && 'toFixed' in (v as object)
            ? (v as Prisma.Decimal)
            : null;

        const priceResolutionService = this.priceResolution;
        await Promise.all(
          rawData.map(async (product) => {
            const candidates = rules.filter(
              (r) =>
                r.minQuantity <= 1 &&
                (r.selectorType === PriceListRuleSelectorType.ALL_PRODUCTS ||
                  (r.selectorType === PriceListRuleSelectorType.PRODUCT && r.productId === product.id)),
            );

            if (candidates.length === 0) return; // no rule → base price used on frontend

            candidates.sort((a, b) => {
              const selectorOrder =
                (a.selectorType === PriceListRuleSelectorType.PRODUCT ? 0 : 1) -
                (b.selectorType === PriceListRuleSelectorType.PRODUCT ? 0 : 1);
              if (selectorOrder !== 0) return selectorOrder;
              return b.minQuantity - a.minQuantity;
            });

            const matched = candidates[0];

            if (matched.valueType === PriceListRuleValueType.FIXED_PRICE) {
              const d = toDecimal(matched.unitPrice);
              if (!d) return; // malformed rule → fall back to base price
              resolvedPrices.set(product.id, d.toFixed(2));
            } else {
              // PERCENTAGE_DISCOUNT
              let base: Prisma.Decimal | null = null;
              if (matched.discountBaseType === PriceListRuleDiscountBaseType.PRODUCT_PRICE) {
                base = toDecimal(product.price);
              } else if (matched.discountBaseType === PriceListRuleDiscountBaseType.PRICE_LIST && matched.basePriceListId) {
                const baseResolved = await priceResolutionService.resolvePrice(
                  distributor.id, customerOrgId!, product.id, 1, 0, matched.basePriceListId,
                );
                base = baseResolved?.unitPrice ?? null;
              }
              if (!base || !matched.discountPercentage) return; // can't compute → fall back to base price
              const pct = toDecimal(matched.discountPercentage)!;
              const multiplier = new Prisma.Decimal(1).minus(pct.div(100));
              resolvedPrices.set(product.id, base.mul(multiplier).toFixed(2));
            }
          }),
        );
      }
    }

    const nextCursor = hasMore && rawData.length > 0
      ? Buffer.from(
          JSON.stringify({ createdAt: rawData[rawData.length - 1].createdAt, id: rawData[rawData.length - 1].id }),
        ).toString('base64url')
      : null;

    return {
      distributor: { id: distributor.id, name: distributor.name },
      data: data.map((p) => ({
        ...p,
        price: p.price
          ? typeof p.price === 'object' && 'toFixed' in (p.price as object)
            ? (p.price as { toFixed: (n: number) => string }).toFixed(2)
            : String(p.price)
          : null,
        compareAtPrice: p.compareAtPrice
          ? typeof p.compareAtPrice === 'object' && 'toFixed' in (p.compareAtPrice as object)
            ? (p.compareAtPrice as { toFixed: (n: number) => string }).toFixed(2)
            : String(p.compareAtPrice)
          : null,
        resolvedPrice: resolvedPrices.get(p.id) ?? null,
        thumbnailUrl: thumbnailUrls.get(p.id) ?? null,
      })),
      pagination: { nextCursor, hasMore, total },
    };
  }
}
