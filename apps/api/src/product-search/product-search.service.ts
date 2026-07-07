import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildProductSearchText, escapeLike, normalise } from './product-search.util';

export interface IndexableProduct {
  id: string;
  distributorId: string;
  name: string;
  sku: string | null;
  description: string | null;
}

export interface ProductSearchHit {
  productId: string;
  tier: number;
  score: number;
}

export interface ProductSearchOptions {
  limit: number;
  offset: number;
}

// word_similarity threshold for fuzzy name matches; below the pg_trgm operator
// default (0.6) so single-word typos like "savignon" → "Sauvignon" still hit.
const NAME_SIMILARITY_THRESHOLD = 0.45;

/**
 * Lexical product search over curated search documents (ADR-050).
 *
 * The contract — ranked product ids for a query string — is the seam for a
 * future pgvector hybrid: only the internals of search() would change.
 */
@Injectable()
export class ProductSearchService {
  constructor(private prisma: PrismaService) {}

  /** Upsert the search document for a product. Pass the surrounding
   *  transaction client so the document cannot drift from the product row. */
  async indexProduct(product: IndexableProduct, tx: Prisma.TransactionClient = this.prisma) {
    const searchText = buildProductSearchText(product);
    const fields = {
      distributorId: product.distributorId,
      searchText,
      searchTextNormalised: normalise(searchText),
      nameNormalised: normalise(product.name),
      skuNormalised: product.sku ? normalise(product.sku) : null,
    };
    await tx.productSearchDocument.upsert({
      where: { productId: product.id },
      create: { productId: product.id, ...fields },
      update: fields,
    });
  }

  /** Remove a product from the index (product soft-deleted). */
  async removeProduct(productId: string, tx: Prisma.TransactionClient = this.prisma) {
    await tx.productSearchDocument.deleteMany({ where: { productId } });
  }

  /**
   * Ranked search within a distributor's catalogue.
   *
   * Tiers: 0 exact SKU, 1 SKU prefix/fragment, 2 exact name, 3 name
   * trigram/fuzzy, 4 anything else in the search document (description,
   * full-text). Within a tier, orders by trigram/ts_rank score.
   */
  async search(
    distributorId: string,
    query: string,
    { limit, offset }: ProductSearchOptions,
  ): Promise<ProductSearchHit[]> {
    const qn = normalise(query);
    if (!qn) return [];
    const fragment = `%${escapeLike(qn)}%`;

    const rows = await this.prisma.$queryRaw<
      Array<{ productId: string; tier: number; score: number }>
    >`
      SELECT
        d."productId",
        CASE
          WHEN d."skuNormalised" = ${qn} THEN 0
          WHEN d."skuNormalised" LIKE ${fragment} THEN 1
          WHEN d."nameNormalised" = ${qn} THEN 2
          WHEN d."nameNormalised" LIKE ${fragment}
            OR word_similarity(${qn}, d."nameNormalised") > ${NAME_SIMILARITY_THRESHOLD} THEN 3
          ELSE 4
        END::int AS tier,
        GREATEST(
          word_similarity(${qn}, d."nameNormalised"),
          word_similarity(${qn}, d."searchTextNormalised"),
          ts_rank(d."searchVector", websearch_to_tsquery('english', ${qn}))
        )::float8 AS score
      FROM "product_search_documents" d
      WHERE d."distributorId" = ${distributorId}
        AND (
          d."skuNormalised" = ${qn}
          OR d."skuNormalised" LIKE ${fragment}
          OR d."nameNormalised" = ${qn}
          OR d."nameNormalised" LIKE ${fragment}
          OR word_similarity(${qn}, d."nameNormalised") > ${NAME_SIMILARITY_THRESHOLD}
          OR d."searchTextNormalised" LIKE ${fragment}
          OR d."searchVector" @@ websearch_to_tsquery('english', ${qn})
        )
      ORDER BY tier ASC, score DESC, d."productId" ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return rows.map((row) => ({
      productId: row.productId,
      tier: Number(row.tier),
      score: Number(row.score),
    }));
  }

  /** Rebuild all search documents (backfill / re-curation of searchText). */
  async reindexAll(): Promise<number> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      select: { id: true, distributorId: true, name: true, sku: true, description: true },
    });
    for (const product of products) {
      await this.indexProduct(product);
    }
    await this.prisma.productSearchDocument.deleteMany({
      where: { product: { deletedAt: { not: null } } },
    });
    return products.length;
  }
}
