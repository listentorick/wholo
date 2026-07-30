import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountingBulkImportRecordType,
  AccountingConnectionStatus,
  AccountingProductMatchMethod,
  AccountingProductMatchStatus,
  Prisma,
  ProductStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AdminProductsService } from '../admin-products/admin-products.service';
import { ProductQueryDto, AccountingProductStatusFilter, AccountingProductTypeFilter } from './dto/product-query.dto';
import { ImportProductDto } from './dto/import-product.dto';
import { BulkImportProductSelectionDto } from './dto/bulk-import-product-selection.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

// Exported so AccountingBulkImportProcessor can fetch+format a product row
// with the same include/status logic this service uses for listing — single
// source of truth for what SUGGESTED/CONFLICT/etc. mean.
export const productInclude = {
  mappings: {
    where: { unlinkedAt: null },
    take: 1,
    include: { product: { select: { id: true, name: true } } },
  },
  suggestions: {
    where: { status: AccountingProductMatchStatus.SUGGESTED },
    take: 1,
    include: { suggestedProduct: { select: { id: true, name: true } } },
  },
} satisfies Prisma.ExternalAccountingProductInclude;

export type ProductRow = Prisma.ExternalAccountingProductGetPayload<{ include: typeof productInclude }>;

@Injectable()
export class AccountingProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly adminProducts: AdminProductsService,
  ) {}

  async listProducts(distributorId: string, query: ProductQueryDto) {
    const connection = await this.getActiveConnection(distributorId);
    const limit = query.limit ?? 20;

    // The provider's own item flags — stored booleans, so (unlike the
    // computed match-status filter below) applied at the DB level. Multiple
    // selected types are OR'd: an item can genuinely be both sold and
    // purchased, for example.
    const typeConditions: Prisma.ExternalAccountingProductWhereInput[] = (query.type ?? []).map((t) =>
      t === 'sold' ? { isSold: true } : t === 'purchased' ? { isPurchased: true } : { isTracked: true },
    );

    // search and type each contribute an OR clause of their own — combined
    // via AND so neither overwrites the other (see resolveExternalIdsForFilter
    // below, which already gets this right).
    const conditions: Prisma.ExternalAccountingProductWhereInput[] = [];
    if (query.search) {
      conditions.push({
        OR: [
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { externalProductCode: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (typeConditions.length) {
      conditions.push({ OR: typeConditions });
    }

    const baseWhere: Prisma.ExternalAccountingProductWhereInput = {
      accountingConnectionId: connection.id,
      ...(conditions.length && { AND: conditions }),
    };

    // Computed statuses (LINKED/SUGGESTED/CONFLICT/...) aren't DB columns,
    // so they can't be combined with DB-level take+cursor pagination — the
    // DB page would already be fixed before the filter even runs, which
    // would make hasMore/nextCursor wrong. When a status filter is active,
    // fetch every row matching the DB-level predicates instead (org-scoped
    // volumes here are in the thousands, not worth a schema change) and
    // paginate the filtered, in-memory list — same approach as contacts.
    if (query.status?.length) {
      const [rows, conflictedProductIds] = await Promise.all([
        this.prisma.externalAccountingProduct.findMany({
          where: baseWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: productInclude,
        }),
        this.findConflictedProductIds(connection.id),
      ]);

      const matches = rows
        .map((row) => ({ row, formatted: this.formatProduct(row, conflictedProductIds) }))
        .filter((m) => query.status!.includes(m.formatted.status));

      return this.paginateFilteredMatches(matches, query.cursor, limit);
    }

    const take = limit + 1;
    let cursorWhere: Prisma.ExternalAccountingProductWhereInput = {};
    if (query.cursor) {
      let decoded: CursorPayload;
      try {
        decoded = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
      } catch {
        throw new NotFoundException('Invalid cursor');
      }
      cursorWhere = {
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ],
      };
    }

    const [rows, conflictedProductIds, total] = await Promise.all([
      this.prisma.externalAccountingProduct.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: productInclude,
      }),
      this.findConflictedProductIds(connection.id),
      this.prisma.externalAccountingProduct.count({ where: baseWhere }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    const data = page.map((row) => this.formatProduct(row, conflictedProductIds));

    const nextCursor = hasMore
      ? Buffer.from(
          JSON.stringify({ createdAt: page[page.length - 1].createdAt, id: page[page.length - 1].id }),
        ).toString('base64url')
      : null;

    return { data, pagination: { nextCursor, hasMore, total } };
  }

  // Paginates an already status-filtered, createdAt-desc-sorted list in
  // memory, using the same cursor shape/encoding as the DB-level path above
  // so callers can't tell which strategy served a given page.
  private paginateFilteredMatches<F>(
    matches: { row: { id: string; createdAt: Date }; formatted: F }[],
    cursor: string | undefined,
    limit: number,
  ): { data: F[]; pagination: { nextCursor: string | null; hasMore: boolean; total: number } } {
    let startIndex = 0;
    if (cursor) {
      let decoded: CursorPayload;
      try {
        decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      } catch {
        throw new NotFoundException('Invalid cursor');
      }
      const decodedCreatedAt = new Date(decoded.createdAt).getTime();
      const idx = matches.findIndex(
        ({ row }) =>
          row.createdAt.getTime() < decodedCreatedAt ||
          (row.createdAt.getTime() === decodedCreatedAt && row.id < decoded.id),
      );
      startIndex = idx === -1 ? matches.length : idx;
    }

    const page = matches.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < matches.length;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? Buffer.from(JSON.stringify({ createdAt: last.row.createdAt, id: last.row.id })).toString('base64url')
        : null;

    return { data: page.map((m) => m.formatted), pagination: { nextCursor, hasMore, total: matches.length } };
  }

  // Powers the "needs attention" badge on the Products tab — a cheap
  // aggregate query, independent of the paginated list above.
  async countNeedsAttention(distributorId: string): Promise<number> {
    const connection = await this.prisma.accountingConnection.findFirst({
      where: { distributorId, status: AccountingConnectionStatus.CONNECTED },
      select: { id: true },
    });
    if (!connection) return 0;

    const [suggested, readyToImport] = await Promise.all([
      this.prisma.externalAccountingProduct.count({
        where: {
          accountingConnectionId: connection.id,
          mappings: { none: { unlinkedAt: null } },
          suggestions: { some: { status: AccountingProductMatchStatus.SUGGESTED } },
        },
      }),
      this.prisma.externalAccountingProduct.count({
        where: {
          accountingConnectionId: connection.id,
          isSold: true,
          isActive: true,
          ignoredAt: null,
          mappings: { none: { unlinkedAt: null } },
          suggestions: { none: { status: AccountingProductMatchStatus.SUGGESTED } },
        },
      }),
    ]);
    return suggested + readyToImport;
  }

  async requestManualSync(distributorId: string): Promise<{ queued: true }> {
    const connection = await this.getActiveConnection(distributorId);
    await this.prisma.$transaction((tx) =>
      this.outbox.writeEvent(tx, 'AccountingConnection', connection.id, 'AccountingProductSyncRequested', {}),
    );
    return { queued: true };
  }

  // Every external id currently matching a filter (status/type/search), with
  // no pagination — the set a "select all N matching filters" bulk import
  // resolves against. Re-run at process time by the bulk-import processor,
  // never trusted as a client-supplied snapshot, so a job that runs minutes
  // after being queued reflects current data.
  async resolveExternalIdsForFilter(
    distributorId: string,
    filter: { status?: AccountingProductStatusFilter[]; type?: AccountingProductTypeFilter[]; search?: string },
  ): Promise<string[]> {
    const connection = await this.getActiveConnection(distributorId);

    const typeConditions: Prisma.ExternalAccountingProductWhereInput[] = (filter.type ?? []).map((t) =>
      t === 'sold' ? { isSold: true } : t === 'purchased' ? { isPurchased: true } : { isTracked: true },
    );

    const conditions: Prisma.ExternalAccountingProductWhereInput[] = [];
    if (filter.search) {
      conditions.push({
        OR: [
          { displayName: { contains: filter.search, mode: 'insensitive' } },
          { externalProductCode: { contains: filter.search, mode: 'insensitive' } },
        ],
      });
    }
    if (typeConditions.length) {
      conditions.push({ OR: typeConditions });
    }
    const baseWhere: Prisma.ExternalAccountingProductWhereInput = {
      accountingConnectionId: connection.id,
      ...(conditions.length && { AND: conditions }),
    };

    const [rows, conflictedProductIds] = await Promise.all([
      this.prisma.externalAccountingProduct.findMany({ where: baseWhere, include: productInclude }),
      this.findConflictedProductIds(connection.id),
    ]);

    return rows
      .map((row) => ({ id: row.id, status: this.formatProduct(row, conflictedProductIds).status }))
      .filter((r) => !filter.status?.length || filter.status.includes(r.status))
      .map((r) => r.id);
  }

  async requestBulkImport(
    distributorId: string,
    userId: string,
    dto: BulkImportProductSelectionDto,
  ): Promise<{ jobId: string }> {
    if (!dto.ids?.length && !dto.filter) {
      throw new BadRequestException('Either ids or filter must be provided');
    }
    const connection = await this.getActiveConnection(distributorId);

    const job = await this.prisma.accountingBulkImportJob.create({
      data: {
        distributorId,
        accountingConnectionId: connection.id,
        recordType: AccountingBulkImportRecordType.PRODUCT,
        requestedByUserId: userId,
        honourSuggestions: dto.honourSuggestions ?? false,
        selection: (dto.ids?.length ? { ids: dto.ids } : { filter: dto.filter }) as Prisma.InputJsonValue,
      },
    });

    await this.prisma.$transaction((tx) =>
      this.outbox.writeEvent(tx, 'AccountingBulkImportJob', job.id, 'AccountingBulkImportRequested', {}),
    );

    return { jobId: job.id };
  }

  async getBulkImportJob(distributorId: string, jobId: string) {
    const job = await this.prisma.accountingBulkImportJob.findFirst({
      where: { id: jobId, distributorId, recordType: AccountingBulkImportRecordType.PRODUCT },
    });
    if (!job) {
      throw new NotFoundException('Bulk import job not found');
    }
    return job;
  }

  async importAsNewProduct(distributorId: string, userId: string, externalProductId: string, dto: ImportProductDto) {
    const connection = await this.getActiveConnection(distributorId);
    const external = await this.getProductOrThrow(connection.id, externalProductId);
    await this.assertExternalProductNotMapped(external.id);

    // Pre-check the SKU rather than letting the DB unique constraint surface
    // as a 500: the [distributorId, sku] unique index also covers
    // soft-deleted products, so a collision can be with a product the user
    // believes is gone.
    const sku = dto.sku ?? external.externalProductCode ?? undefined;
    if (sku) {
      const existing = await this.prisma.product.findFirst({
        where: { distributorId, sku },
        select: { id: true, deletedAt: true },
      });
      if (existing) {
        throw new ConflictException(
          existing.deletedAt
            ? `A deleted product still holds SKU ${sku} — restore it or clear its SKU before importing`
            : `A product with SKU ${sku} already exists — match the accounting product to it instead of importing`,
        );
      }
    }

    // Imported products are seeds, not finished storefront products: DRAFT is
    // the "needs catalogue setup" state. Tax/account codes, purchase price
    // and quantity-on-hand stay on the cache row only — Wholo owns the
    // catalogue fields from here on.
    //
    // Not wrapped in a transaction with the mapping write below:
    // AdminProductsService.create manages its own transaction internally
    // (product + search index), and reusing it as-is is the right trade-off —
    // the unique constraint on ProductAccountingMapping is still the backstop
    // against a duplicate link. Same reasoning as importAsNewCustomer.
    const product = await this.adminProducts.create(distributorId, {
      name: dto.name ?? external.displayName,
      description: dto.description ?? external.description ?? undefined,
      sku,
      status: ProductStatus.DRAFT,
      productTypeId: dto.productTypeId,
      supplierId: dto.supplierId,
      // The cache holds 4-dp provider prices; Product.price is 2-dp, so the
      // default rounds at import — the one place precision is dropped.
      price: dto.price ?? (external.salesUnitPrice ? external.salesUnitPrice.toFixed(2) : undefined),
    });

    await this.createMapping(
      distributorId,
      connection.id,
      product.id,
      external.id,
      AccountingProductMatchMethod.MANUAL,
      userId,
    );

    return product;
  }

  async confirmSuggestion(distributorId: string, userId: string, suggestionId: string) {
    const connection = await this.getActiveConnection(distributorId);
    const suggestion = await this.prisma.accountingProductMatchSuggestion.findFirst({
      where: { id: suggestionId, accountingConnectionId: connection.id, status: AccountingProductMatchStatus.SUGGESTED },
    });
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found or already resolved');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.createMapping(
        distributorId,
        connection.id,
        suggestion.suggestedProductId,
        suggestion.externalProductId,
        suggestion.matchMethod,
        userId,
        tx,
      );
      await tx.accountingProductMatchSuggestion.update({
        where: { id: suggestion.id },
        data: { status: AccountingProductMatchStatus.ACCEPTED, reviewedByUserId: userId, reviewedAt: new Date() },
      });
    });
  }

  async matchToExistingProduct(
    distributorId: string,
    userId: string,
    externalProductId: string,
    productId: string,
  ) {
    const connection = await this.getActiveConnection(distributorId);
    const external = await this.getProductOrThrow(connection.id, externalProductId);
    await this.assertExternalProductNotMapped(external.id);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, distributorId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    await this.assertProductNotMapped(connection.id, productId);

    await this.prisma.$transaction(async (tx) => {
      await this.createMapping(
        distributorId,
        connection.id,
        productId,
        external.id,
        AccountingProductMatchMethod.MANUAL,
        userId,
        tx,
      );
      // A manual match resolves whatever the system had suggested for this
      // product, right or wrong — supersede it rather than leaving it dangling.
      await tx.accountingProductMatchSuggestion.updateMany({
        where: { externalProductId: external.id, status: AccountingProductMatchStatus.SUGGESTED },
        data: { status: AccountingProductMatchStatus.SUPERSEDED },
      });
    });
  }

  async ignore(distributorId: string, userId: string, externalProductId: string): Promise<void> {
    const connection = await this.getActiveConnection(distributorId);
    const external = await this.getProductOrThrow(connection.id, externalProductId);

    await this.prisma.$transaction([
      this.prisma.externalAccountingProduct.update({
        where: { id: external.id },
        data: { ignoredAt: new Date() },
      }),
      this.prisma.accountingProductMatchSuggestion.updateMany({
        where: { externalProductId: external.id, status: AccountingProductMatchStatus.SUGGESTED },
        data: { status: AccountingProductMatchStatus.REJECTED, reviewedByUserId: userId, reviewedAt: new Date() },
      }),
    ]);
  }

  async unlink(distributorId: string, mappingId: string): Promise<void> {
    const connection = await this.getActiveConnection(distributorId);
    const mapping = await this.prisma.productAccountingMapping.findFirst({
      where: { id: mappingId, accountingConnectionId: connection.id, unlinkedAt: null },
    });
    if (!mapping) {
      throw new NotFoundException('Mapping not found or already unlinked');
    }
    await this.prisma.productAccountingMapping.update({
      where: { id: mapping.id },
      data: { unlinkedAt: new Date() },
    });
  }

  private async createMapping(
    distributorId: string,
    accountingConnectionId: string,
    productId: string,
    externalProductId: string,
    matchMethod: AccountingProductMatchMethod,
    linkedByUserId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    await this.assertProductNotMapped(accountingConnectionId, productId, tx);
    return tx.productAccountingMapping.create({
      data: { distributorId, accountingConnectionId, productId, externalProductId, matchMethod, linkedByUserId },
    });
  }

  private async getActiveConnection(distributorId: string) {
    const connection = await this.prisma.accountingConnection.findFirst({
      where: { distributorId, status: AccountingConnectionStatus.CONNECTED },
    });
    if (!connection) {
      throw new NotFoundException('No active accounting connection for this distributor');
    }
    return connection;
  }

  private async getProductOrThrow(accountingConnectionId: string, externalProductId: string) {
    const external = await this.prisma.externalAccountingProduct.findFirst({
      where: { id: externalProductId, accountingConnectionId },
    });
    if (!external) {
      throw new NotFoundException('Accounting product not found');
    }
    return external;
  }

  private async assertExternalProductNotMapped(externalProductId: string): Promise<void> {
    const existing = await this.prisma.productAccountingMapping.findFirst({
      where: { externalProductId, unlinkedAt: null },
    });
    if (existing) {
      throw new ConflictException('This accounting product is already linked to a product');
    }
  }

  private async assertProductNotMapped(
    accountingConnectionId: string,
    productId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const existing = await tx.productAccountingMapping.findFirst({
      where: { accountingConnectionId, productId, unlinkedAt: null },
    });
    if (existing) {
      throw new ConflictException('This product is already linked to a different accounting product');
    }
  }

  // Public: reused by AccountingBulkImportProcessor, which needs the same
  // connection-wide conflict set to compute per-item status during a batch.
  async findConflictedProductIds(accountingConnectionId: string): Promise<Set<string>> {
    const grouped = await this.prisma.accountingProductMatchSuggestion.groupBy({
      by: ['suggestedProductId'],
      where: { accountingConnectionId, status: AccountingProductMatchStatus.SUGGESTED },
      _count: { _all: true },
    });
    return new Set(grouped.filter((g) => g._count._all > 1).map((g) => g.suggestedProductId));
  }

  // Public: reused by AccountingBulkImportProcessor for per-item status
  // recompute — single source of truth for the computed status, so a
  // resumed/re-run bulk import always sees each item's current reality.
  formatProduct(row: ProductRow, conflictedProductIds: Set<string>) {
    const mapping = row.mappings[0] ?? null;
    const suggestion = row.suggestions[0] ?? null;

    let status: AccountingProductStatusFilter;
    if (mapping) status = 'LINKED';
    else if (suggestion && conflictedProductIds.has(suggestion.suggestedProductId)) status = 'CONFLICT';
    else if (suggestion) status = 'SUGGESTED';
    else if (row.ignoredAt) status = 'IGNORED';
    // No archived flag on provider items — inactive means "vanished from the
    // provider's full fetch", the closest thing to archived/deleted.
    else if (!row.isActive) status = 'INACTIVE';
    // A purchase-only item isn't something to invite into the storefront
    // catalogue — surface it distinctly rather than as ready-to-import.
    else if (!row.isSold) status = 'NOT_SOLD';
    else status = 'READY_TO_IMPORT';

    return {
      id: row.id,
      displayName: row.displayName,
      description: row.description,
      externalProductCode: row.externalProductCode,
      salesUnitPrice: row.salesUnitPrice ? row.salesUnitPrice.toString() : null,
      quantityOnHand: row.quantityOnHand ? row.quantityOnHand.toString() : null,
      isSold: row.isSold,
      isPurchased: row.isPurchased,
      isTracked: row.isTracked,
      isActive: row.isActive,
      ignoredAt: row.ignoredAt,
      status,
      mapping: mapping
        ? {
            id: mapping.id,
            productId: mapping.productId,
            productName: mapping.product.name,
            matchMethod: mapping.matchMethod,
            linkedAt: mapping.linkedAt,
          }
        : null,
      suggestion: suggestion
        ? {
            id: suggestion.id,
            productId: suggestion.suggestedProductId,
            productName: suggestion.suggestedProduct.name,
            confidence: suggestion.confidence,
            matchMethod: suggestion.matchMethod,
            matchReason: suggestion.matchReason,
          }
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
