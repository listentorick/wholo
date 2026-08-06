import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  AccountingConnection,
  AccountingTaxTypeMatchMethod,
  AccountingTaxTypeMatchStatus,
  ExternalAccountingTaxType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_TAX_TYPE_SYNC_QUEUE } from '../queues/queue.constants';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import {
  AccountingConnectionAdapter,
  AccountingExternalTaxRate,
  AccountingTokenSet,
} from '../accounting/adapters/accounting-connection-adapter.interface';
import {
  AccountingTaxTypeMatchCandidate,
  AccountingTaxTypeMatcherService,
} from '../accounting/matching/accounting-tax-type-matcher.service';
import { AccountingMatchResult } from '../accounting/matching/accounting-record-matcher.interface';
import {
  AccountingSyncProcessorBase,
  AccountingSyncSuggestionRef,
} from '../accounting/sync/accounting-sync-processor.base';
import { AccountingChangeDetectionService } from '../accounting/accounting-change-detection.service';

// Consumes AccountingTaxTypeSyncRequested — written to the outbox by both
// AccountingTaxTypeSyncScheduler (periodic) and the "Sync now" HTTP endpoint
// (manual). Third implementation of the shared sync pipeline
// (AccountingSyncProcessorBase): pull tax rates from the provider, cache
// them, and run the matcher against unmapped Wholo tax types. Never writes a
// TaxTypeAccountingMapping itself — only ever produces suggestions.
//
// Post-link syncs only refresh the cache row; TaxType.ratePercentage is never
// mutated here — same deliberate rule as products/contacts. A rate change on
// a mapped row is surfaced via AccountingChangeDetectionService instead.
@Processor(ACCOUNTING_TAX_TYPE_SYNC_QUEUE)
export class AccountingTaxTypeSyncProcessor extends AccountingSyncProcessorBase<
  AccountingExternalTaxRate,
  ExternalAccountingTaxType,
  AccountingTaxTypeMatchCandidate,
  AccountingTaxTypeMatchMethod
> {
  protected readonly logger = new Logger(AccountingTaxTypeSyncProcessor.name);
  protected readonly recordNoun = 'tax type';

  constructor(
    prisma: PrismaService,
    accountingConnectionService: AccountingConnectionService,
    adapters: AccountingAdapterRegistry,
    changeDetection: AccountingChangeDetectionService,
    protected readonly matcher: AccountingTaxTypeMatcherService,
  ) {
    super(prisma, accountingConnectionService, adapters, changeDetection);
  }

  protected fetchExternalRecords(
    adapter: AccountingConnectionAdapter,
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
  ): Promise<AccountingExternalTaxRate[]> {
    return adapter.listTaxRates(tokenSet, externalOrganisationId);
  }

  protected async upsertCacheRecord(
    connection: AccountingConnection,
    taxRate: AccountingExternalTaxRate,
  ): Promise<ExternalAccountingTaxType> {
    const shared = {
      displayName: taxRate.displayName,
      ratePercentage: new Prisma.Decimal(taxRate.ratePercentage),
      // A re-appearing rate reactivates its cache row here; disappearance is
      // handled by handleStaleRecords below.
      isActive: taxRate.isActive,
      lastSyncedAt: new Date(),
      rawProviderData: taxRate.raw as Prisma.InputJsonValue,
    };

    const where = {
      accountingConnectionId_taxType: {
        accountingConnectionId: connection.id,
        taxType: taxRate.taxType,
      },
    };

    const previous = await this.prisma.externalAccountingTaxType.findUnique({ where });

    const updated = await this.prisma.externalAccountingTaxType.upsert({
      where,
      // ignoredAt is intentionally left untouched on update — a re-sync must
      // not silently un-ignore a tax rate the distributor deliberately dismissed.
      create: {
        distributorId: connection.distributorId,
        accountingConnectionId: connection.id,
        provider: connection.provider,
        taxType: taxRate.taxType,
        ...shared,
      },
      update: shared,
    });

    await this.changeDetection.detectAndFlag({
      distributorId: connection.distributorId,
      hasActiveMapping: await this.hasActiveMapping(updated.id),
      previous,
      current: updated,
      fields: ['ratePercentage', 'isActive', 'displayName'],
      markChanged: async () => {
        await this.prisma.externalAccountingTaxType.update({
          where: { id: updated.id },
          data: { changeDetectedAt: new Date() },
        });
      },
      notification: {
        type: 'ACCOUNTING_TAX_TYPE_CHANGED',
        title: 'Linked tax rate changed in Xero',
        body: `"${updated.displayName}" changed in Xero (rate or status) since it was mapped — the Stocdup tax type's rate was not changed automatically. Review and update it if needed.`,
        linkPath: '/integrations/accounting?tab=taxTypes',
        payload: { externalTaxTypeId: updated.id, distributorId: connection.distributorId },
      },
    });

    return updated;
  }

  // Xero tax rates carry a status field, but a re-sync only sees whatever
  // Xero currently returns — a rate removed from the response entirely (not
  // just marked DELETED/ARCHIVED) is the same "vanished" case products
  // handle, so this stays as a safety net regardless of what Xero actually
  // omits vs. returns with a non-ACTIVE status.
  protected async handleStaleRecords(
    connection: AccountingConnection,
    fetched: ExternalAccountingTaxType[],
  ): Promise<void> {
    await this.prisma.externalAccountingTaxType.updateMany({
      where: {
        accountingConnectionId: connection.id,
        id: { notIn: fetched.map((taxType) => taxType.id) },
        isActive: true,
      },
      data: { isActive: false },
    });
  }

  protected async loadMatchCandidates(connection: AccountingConnection): Promise<AccountingTaxTypeMatchCandidate[]> {
    const taxTypes = await this.prisma.taxType.findMany({
      where: {
        distributorId: connection.distributorId,
        active: true,
        accountingMappings: { none: { accountingConnectionId: connection.id, unlinkedAt: null } },
      },
      select: { id: true, name: true },
    });

    return taxTypes.map((taxType) => ({
      taxTypeId: taxType.id,
      name: taxType.name,
    }));
  }

  protected shouldMatch(cached: ExternalAccountingTaxType): boolean {
    return cached.isActive && !cached.ignoredAt;
  }

  protected async hasActiveMapping(cachedId: string): Promise<boolean> {
    const mapping = await this.prisma.taxTypeAccountingMapping.findFirst({
      where: { externalTaxTypeId: cachedId, unlinkedAt: null },
      select: { id: true },
    });
    return !!mapping;
  }

  protected async findOpenSuggestion(cachedId: string): Promise<AccountingSyncSuggestionRef | null> {
    const suggestion = await this.prisma.accountingTaxTypeMatchSuggestion.findFirst({
      where: { externalTaxTypeId: cachedId, status: AccountingTaxTypeMatchStatus.SUGGESTED },
    });
    if (!suggestion) return null;
    return { id: suggestion.id, candidateId: suggestion.suggestedTaxTypeId };
  }

  protected async updateSuggestion(
    suggestionId: string,
    match: AccountingMatchResult<AccountingTaxTypeMatchMethod>,
  ): Promise<void> {
    await this.prisma.accountingTaxTypeMatchSuggestion.update({
      where: { id: suggestionId },
      data: { confidence: match.confidence, matchMethod: match.matchMethod, matchReason: match.matchReason },
    });
  }

  protected async supersedeSuggestion(suggestionId: string): Promise<void> {
    await this.prisma.accountingTaxTypeMatchSuggestion.update({
      where: { id: suggestionId },
      data: { status: AccountingTaxTypeMatchStatus.SUPERSEDED },
    });
  }

  protected async createSuggestion(
    connection: AccountingConnection,
    cached: ExternalAccountingTaxType,
    match: AccountingMatchResult<AccountingTaxTypeMatchMethod>,
  ): Promise<void> {
    await this.prisma.accountingTaxTypeMatchSuggestion.create({
      data: {
        distributorId: connection.distributorId,
        accountingConnectionId: connection.id,
        externalTaxTypeId: cached.id,
        suggestedTaxTypeId: match.candidateId,
        confidence: match.confidence,
        matchMethod: match.matchMethod,
        matchReason: match.matchReason,
      },
    });
  }
}
