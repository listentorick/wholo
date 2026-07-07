import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OrganisationType, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PriceResolutionService } from '../price-lists/price-resolution.service';
import { R2StorageService } from '../asset-images/r2-storage.service';
import { ProductSearchService } from '../product-search/product-search.service';
import { CatalogueQueryDto } from './dto/catalogue-query.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

interface SearchCursorPayload {
  offset: number;
}

// Ranked candidates considered per search before visibility filtering.
const MAX_SEARCH_CANDIDATES = 500;

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
    private productSearch: ProductSearchService,
  ) {}

  async getDistributor(distributorSlug: string) {
    const distributor = await this.prisma.organisation.findFirst({
      where: { slug: distributorSlug, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        addressCity: true,
        addressState: true,
        addressPostcode: true,
        addressCountry: true,
        distributorSettings: { select: { tagline: true, aboutText: true, minimumOrderSpend: true } },
      },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    const [logoImage, bannerImage] = await Promise.all([
      this.prisma.assetImage.findFirst({
        where: { assetType: 'distributor-logo', entityId: distributor.id, distributorId: distributor.id },
      }),
      this.prisma.assetImage.findFirst({
        where: { assetType: 'distributor-banner', entityId: distributor.id, distributorId: distributor.id },
      }),
    ]);

    return {
      id: distributor.id,
      name: distributor.name,
      slug: distributor.slug,
      email: distributor.email ?? null,
      phone: distributor.phone ?? null,
      addressLine1: distributor.addressLine1 ?? null,
      addressLine2: distributor.addressLine2 ?? null,
      addressCity: distributor.addressCity ?? null,
      addressState: distributor.addressState ?? null,
      addressPostcode: distributor.addressPostcode ?? null,
      addressCountry: distributor.addressCountry ?? null,
      tagline: distributor.distributorSettings?.tagline ?? null,
      aboutText: distributor.distributorSettings?.aboutText ?? null,
      minimumOrderSpend: distributor.distributorSettings?.minimumOrderSpend != null
        ? parseFloat(distributor.distributorSettings.minimumOrderSpend.toString())
        : null,
      logoUrl: logoImage
        ? this.r2Storage.getPublicUrl((logoImage.variants as Record<string, string>).full)
        : null,
      bannerUrl: bannerImage
        ? this.r2Storage.getPublicUrl((bannerImage.variants as Record<string, string>).mobile)
        : null,
      bannerDominantColor: bannerImage?.dominantColor ?? null,
    };
  }

  async getProducts(distributorSlug: string, query: CatalogueQueryDto, customerOrgId?: string) {
    const distributor = await this.prisma.organisation.findFirst({
      where: { slug: distributorSlug, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    // Unauthenticated → no products. Authenticated with no relationship → all active products.
    // Authenticated customer → only their assigned catalogue products.
    let catalogueProductIdFilter: string[] | undefined;
    if (!customerOrgId) {
      catalogueProductIdFilter = [];
    } else {
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
      }
      // else: authenticated, no relationship → catalogueProductIdFilter stays undefined → all active products
    }

    const limit = query.limit ?? 50;

    const baseWhere: Prisma.ProductWhereInput = {
      distributorId: distributor.id,
      status: ProductStatus.ACTIVE,
      deletedAt: null,
      ...(catalogueProductIdFilter !== undefined && { id: { in: catalogueProductIdFilter } }),
      ...(query.productTypeCode && {
        productType: { code: query.productTypeCode },
      }),
    };

    const search = query.search?.trim();
    if (search) {
      return this.getProductsBySearch(distributor, search, baseWhere, limit, query.cursor, customerOrgId);
    }

    const take = limit + 1;

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

    const nextCursor = hasMore && rawData.length > 0
      ? Buffer.from(
          JSON.stringify({ createdAt: rawData[rawData.length - 1].createdAt, id: rawData[rawData.length - 1].id }),
        ).toString('base64url')
      : null;

    return {
      distributor: { id: distributor.id, name: distributor.name },
      data: await this.hydrateProducts(distributor.id, rawData, customerOrgId),
      pagination: { nextCursor, hasMore, total },
    };
  }

  /**
   * Search-mode listing: ranked ids from ProductSearchService intersected with
   * the same visibility rules as the browse path, order preserved. Relevance
   * order cannot use the keyset cursor, so the opaque cursor carries an offset
   * into the visible result set instead.
   */
  private async getProductsBySearch(
    distributor: { id: string; name: string },
    search: string,
    baseWhere: Prisma.ProductWhereInput,
    limit: number,
    cursor: string | undefined,
    customerOrgId?: string,
  ) {
    let offset = 0;
    if (cursor) {
      try {
        const decoded: SearchCursorPayload = JSON.parse(
          Buffer.from(cursor, 'base64url').toString('utf8'),
        );
        if (Number.isInteger(decoded.offset) && decoded.offset > 0) offset = decoded.offset;
      } catch {
        offset = 0;
      }
    }

    const hits = await this.productSearch.search(distributor.id, search, {
      limit: MAX_SEARCH_CANDIDATES,
      offset: 0,
    });

    let ordered: Array<Prisma.ProductGetPayload<{ include: typeof catalogueProductInclude }>> = [];
    if (hits.length > 0) {
      const visible = await this.prisma.product.findMany({
        where: { AND: [baseWhere, { id: { in: hits.map((h) => h.productId) } }] },
        include: catalogueProductInclude,
      });
      const rank = new Map(hits.map((h, i) => [h.productId, i]));
      ordered = visible.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    }

    const total = ordered.length;
    const page = ordered.slice(offset, offset + limit);
    const hasMore = offset + limit < total;
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ offset: offset + limit })).toString('base64url')
      : null;

    return {
      distributor: { id: distributor.id, name: distributor.name },
      data: await this.hydrateProducts(distributor.id, page, customerOrgId),
      pagination: { nextCursor, hasMore, total },
    };
  }

  /** Attach thumbnail urls and resolved prices, and serialise Decimal prices. */
  private async hydrateProducts(
    distributorId: string,
    rawData: Array<Prisma.ProductGetPayload<{ include: typeof catalogueProductInclude }>>,
    customerOrgId?: string,
  ) {
    const thumbnailUrls = new Map<string, string>();
    const resolvedPrices = new Map<string, Prisma.Decimal>();

    if (rawData.length > 0) {
      const productIds = rawData.map((p) => p.id);
      const [images, priceMap] = await Promise.all([
        this.prisma.assetImage.findMany({
          where: {
            assetType: 'product-image',
            entityId: { in: productIds },
            distributorId,
            isPrimary: true,
          },
          select: { entityId: true, variants: true },
        }),
        customerOrgId
          ? this.priceResolution.resolvePricesForProducts(distributorId, customerOrgId, productIds)
          : Promise.resolve(new Map<string, Prisma.Decimal>()),
      ]);

      for (const img of images) {
        const variants = img.variants as AssetImageVariants;
        const thumbKey = variants?.thumb ?? null;
        if (thumbKey) thumbnailUrls.set(img.entityId, this.r2Storage.getPublicUrl(thumbKey));
      }
      for (const [id, price] of priceMap) resolvedPrices.set(id, price);
    }

    return rawData.map((p) => ({
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
      resolvedPrice: resolvedPrices.get(p.id)?.toFixed(2) ?? null,
      thumbnailUrl: thumbnailUrls.get(p.id) ?? null,
    }));
  }

  async getProduct(distributorSlug: string, productId: string, customerOrgId?: string) {
    const distributor = await this.prisma.organisation.findFirst({
      where: { slug: distributorSlug, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    let catalogueProductIdFilter: string[] | undefined;
    if (!customerOrgId) {
      catalogueProductIdFilter = [];
    } else {
      const relationship = await this.prisma.tradeRelationship.findFirst({
        where: { distributorId: distributor.id, customerId: customerOrgId, deletedAt: null },
        select: { id: true },
      });
      if (relationship) {
        const assignments = await this.prisma.customerCatalogue.findMany({
          where: { tradeRelationshipId: relationship.id },
          select: {
            catalogue: {
              select: { products: { select: { productId: true } } },
            },
          },
        });
        const ids = new Set<string>();
        for (const a of assignments) {
          for (const p of a.catalogue.products) ids.add(p.productId);
        }
        catalogueProductIdFilter = [...ids];
      }
      // else: authenticated, no relationship → show all products for browsing
    }

    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        distributorId: distributor.id,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      },
      include: catalogueProductInclude,
    });
    if (!product) throw new NotFoundException('Product not found');

    if (catalogueProductIdFilter !== undefined && !catalogueProductIdFilter.includes(productId)) {
      throw new NotFoundException('Product not found');
    }

    const image = await this.prisma.assetImage.findFirst({
      where: {
        assetType: 'product-image',
        entityId: productId,
        distributorId: distributor.id,
        isPrimary: true,
      },
      select: { variants: true },
    });
    const variants = image?.variants as AssetImageVariants | null;
    const imageKey = variants?.catalogue ?? variants?.large ?? null;
    const imageUrl = imageKey ? this.r2Storage.getPublicUrl(imageKey) : null;

    const thumbnailKey = variants?.thumb ?? null;
    const thumbnailUrl = thumbnailKey ? this.r2Storage.getPublicUrl(thumbnailKey) : null;

    let resolvedPrice: string | null = null;

    if (customerOrgId) {
      const resolved = await this.priceResolution.resolvePrice(
        distributor.id, customerOrgId, product.id, 1,
      );
      resolvedPrice = resolved?.unitPrice.toFixed(2) ?? null;
    }

    return {
      ...product,
      price: product.price
        ? typeof product.price === 'object' && 'toFixed' in (product.price as object)
          ? (product.price as { toFixed: (n: number) => string }).toFixed(2)
          : String(product.price)
        : null,
      compareAtPrice: product.compareAtPrice
        ? typeof product.compareAtPrice === 'object' && 'toFixed' in (product.compareAtPrice as object)
          ? (product.compareAtPrice as { toFixed: (n: number) => string }).toFixed(2)
          : String(product.compareAtPrice)
        : null,
      resolvedPrice,
      thumbnailUrl,
      imageUrl,
    };
  }
}
