import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  AccountingConnection,
  AccountingProductMatchMethod,
  AccountingProductMatchStatus,
  ExternalAccountingProduct,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_PRODUCT_SYNC_QUEUE } from '../queues/queue.constants';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import {
  AccountingConnectionAdapter,
  AccountingExternalProduct,
  AccountingTokenSet,
} from '../accounting/adapters/accounting-connection-adapter.interface';
import {
  AccountingProductMatchCandidate,
  AccountingProductMatcherService,
} from '../accounting/matching/accounting-product-matcher.service';
import { AccountingMatchResult } from '../accounting/matching/accounting-record-matcher.interface';
import {
  AccountingSyncProcessorBase,
  AccountingSyncSuggestionRef,
} from '../accounting/sync/accounting-sync-processor.base';

// Consumes AccountingProductSyncRequested — written to the outbox by both
// AccountingProductSyncScheduler (periodic) and the "Sync now" HTTP endpoint
// (manual). Second implementation of the shared sync pipeline
// (AccountingSyncProcessorBase): pull products/items from the provider, cache
// them, and run the matcher against unmapped Wholo products. Never writes a
// ProductAccountingMapping itself — only ever produces suggestions.
//
// Post-link syncs only refresh the cache row; Wholo Product fields are never
// mutated here. If accounting-owned field updates (e.g. price) are ever
// allowed after linking, that rule would run after upsertCacheRecord for rows
// with an active mapping — a deliberate product decision, not a default.
@Processor(ACCOUNTING_PRODUCT_SYNC_QUEUE)
export class AccountingProductSyncProcessor extends AccountingSyncProcessorBase<
  AccountingExternalProduct,
  ExternalAccountingProduct,
  AccountingProductMatchCandidate,
  AccountingProductMatchMethod
> {
  protected readonly logger = new Logger(AccountingProductSyncProcessor.name);
  protected readonly recordNoun = 'product';

  constructor(
    prisma: PrismaService,
    accountingConnectionService: AccountingConnectionService,
    adapters: AccountingAdapterRegistry,
    protected readonly matcher: AccountingProductMatcherService,
  ) {
    super(prisma, accountingConnectionService, adapters);
  }

  protected fetchExternalRecords(
    adapter: AccountingConnectionAdapter,
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
  ): Promise<AccountingExternalProduct[]> {
    return adapter.listProducts(tokenSet, externalOrganisationId);
  }

  protected upsertCacheRecord(
    connection: AccountingConnection,
    product: AccountingExternalProduct,
  ): Promise<ExternalAccountingProduct> {
    const shared = {
      externalProductCode: product.code ?? null,
      displayName: product.displayName,
      description: product.description ?? null,
      salesUnitPrice: product.salesUnitPrice ?? null,
      purchaseUnitPrice: product.purchaseUnitPrice ?? null,
      taxCode: product.taxCode ?? null,
      accountCode: product.accountCode ?? null,
      purchaseTaxCode: product.purchaseTaxCode ?? null,
      purchaseAccountCode: product.purchaseAccountCode ?? null,
      isSold: product.isSold,
      isPurchased: product.isPurchased,
      isTracked: product.isTracked,
      // A re-appearing item reactivates its cache row here; disappearance is
      // handled by handleStaleRecords below.
      isActive: product.isActive,
      quantityOnHand: product.quantityOnHand ?? null,
      lastExternalUpdatedAt: product.updatedAt ? new Date(product.updatedAt) : null,
      lastSyncedAt: new Date(),
      rawProviderData: product.raw as Prisma.InputJsonValue,
    };

    return this.prisma.externalAccountingProduct.upsert({
      where: {
        accountingConnectionId_externalProductId: {
          accountingConnectionId: connection.id,
          externalProductId: product.externalId,
        },
      },
      // ignoredAt is intentionally left untouched on update — a re-sync must
      // not silently un-ignore a product the distributor deliberately dismissed.
      create: {
        distributorId: connection.distributorId,
        accountingConnectionId: connection.id,
        provider: connection.provider,
        externalProductId: product.externalId,
        ...shared,
      },
      update: shared,
    });
  }

  // Xero Items carry no archived/deleted flag — a deleted item simply stops
  // appearing in the (always-full) fetch. Absence is therefore the deletion
  // signal: any cache row not in this sync's fetched set is marked inactive.
  protected async handleStaleRecords(
    connection: AccountingConnection,
    fetched: ExternalAccountingProduct[],
  ): Promise<void> {
    await this.prisma.externalAccountingProduct.updateMany({
      where: {
        accountingConnectionId: connection.id,
        id: { notIn: fetched.map((product) => product.id) },
        isActive: true,
      },
      data: { isActive: false },
    });
  }

  protected async loadMatchCandidates(connection: AccountingConnection): Promise<AccountingProductMatchCandidate[]> {
    const products = await this.prisma.product.findMany({
      where: {
        distributorId: connection.distributorId,
        deletedAt: null,
        accountingMappings: { none: { accountingConnectionId: connection.id, unlinkedAt: null } },
      },
      select: { id: true, sku: true, name: true },
    });

    return products.map((product) => ({
      productId: product.id,
      sku: product.sku,
      name: product.name,
    }));
  }

  protected shouldMatch(cached: ExternalAccountingProduct): boolean {
    // Deliberately not gated on isSold: a purchase-only item can still be a
    // legitimate link target (e.g. an exact SKU match on a product the
    // distributor also buys in) — the computed NOT_SOLD status labels it in
    // the UI without suppressing a strong suggestion.
    return cached.isActive && !cached.ignoredAt;
  }

  protected async hasActiveMapping(cachedId: string): Promise<boolean> {
    const mapping = await this.prisma.productAccountingMapping.findFirst({
      where: { externalProductId: cachedId, unlinkedAt: null },
      select: { id: true },
    });
    return !!mapping;
  }

  protected async findOpenSuggestion(cachedId: string): Promise<AccountingSyncSuggestionRef | null> {
    const suggestion = await this.prisma.accountingProductMatchSuggestion.findFirst({
      where: { externalProductId: cachedId, status: AccountingProductMatchStatus.SUGGESTED },
    });
    if (!suggestion) return null;
    return { id: suggestion.id, candidateId: suggestion.suggestedProductId };
  }

  protected async updateSuggestion(
    suggestionId: string,
    match: AccountingMatchResult<AccountingProductMatchMethod>,
  ): Promise<void> {
    await this.prisma.accountingProductMatchSuggestion.update({
      where: { id: suggestionId },
      data: { confidence: match.confidence, matchMethod: match.matchMethod, matchReason: match.matchReason },
    });
  }

  protected async supersedeSuggestion(suggestionId: string): Promise<void> {
    await this.prisma.accountingProductMatchSuggestion.update({
      where: { id: suggestionId },
      data: { status: AccountingProductMatchStatus.SUPERSEDED },
    });
  }

  protected async createSuggestion(
    connection: AccountingConnection,
    cached: ExternalAccountingProduct,
    match: AccountingMatchResult<AccountingProductMatchMethod>,
  ): Promise<void> {
    await this.prisma.accountingProductMatchSuggestion.create({
      data: {
        distributorId: connection.distributorId,
        accountingConnectionId: connection.id,
        externalProductId: cached.id,
        suggestedProductId: match.candidateId,
        confidence: match.confidence,
        matchMethod: match.matchMethod,
        matchReason: match.matchReason,
      },
    });
  }
}
