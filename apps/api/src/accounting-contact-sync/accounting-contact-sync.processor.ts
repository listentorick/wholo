import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  AccountingConnection,
  AccountingContactMatchMethod,
  AccountingContactMatchStatus,
  ExternalAccountingContact,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_CONTACT_SYNC_QUEUE } from '../queues/queue.constants';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import {
  AccountingConnectionAdapter,
  AccountingExternalContact,
  AccountingTokenSet,
} from '../accounting/adapters/accounting-connection-adapter.interface';
import {
  AccountingContactMatcherService,
  AccountingMatchCandidate,
} from '../accounting/matching/accounting-contact-matcher.service';
import { AccountingMatchResult } from '../accounting/matching/accounting-record-matcher.interface';
import {
  AccountingSyncProcessorBase,
  AccountingSyncSuggestionRef,
  CacheUpsertResult,
} from '../accounting/sync/accounting-sync-processor.base';
import { AccountingChangeDetectionService } from '../accounting/accounting-change-detection.service';
import { IngestionRunService } from '../ingestion/ingestion-run.service';

// Consumes AccountingContactSyncRequested — written to the outbox by both
// AccountingContactSyncScheduler (periodic) and the "Sync now" HTTP endpoint
// (manual). One trigger, one path: the shared sync pipeline
// (AccountingSyncProcessorBase) pulls contacts from the provider, caches
// them, and runs the matcher against unmapped Wholo customers. Never writes a
// CustomerAccountingMapping itself — only ever produces suggestions.
// concurrency 2: bounds the per-worker DB burst (2 jobs × 25-wide upsert
// batches vs a 10-connection pool) while letting one slow org not block the
// queue. See ADR-061 / "Concurrency".
@Processor(ACCOUNTING_CONTACT_SYNC_QUEUE, { concurrency: 2 })
export class AccountingContactSyncProcessor extends AccountingSyncProcessorBase<
  AccountingExternalContact,
  ExternalAccountingContact,
  AccountingMatchCandidate,
  AccountingContactMatchMethod
> {
  protected readonly logger = new Logger(AccountingContactSyncProcessor.name);
  protected readonly recordNoun = 'contact';
  protected readonly resourceType = 'contact';

  constructor(
    prisma: PrismaService,
    accountingConnectionService: AccountingConnectionService,
    adapters: AccountingAdapterRegistry,
    changeDetection: AccountingChangeDetectionService,
    ingestionRuns: IngestionRunService,
    protected readonly matcher: AccountingContactMatcherService,
  ) {
    super(prisma, accountingConnectionService, adapters, changeDetection, ingestionRuns);
  }

  protected fetchExternalRecords(
    adapter: AccountingConnectionAdapter,
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
  ): Promise<AccountingExternalContact[]> {
    return adapter.listContacts(tokenSet, externalOrganisationId);
  }

  // Business fields shown in the review table — a move in any of these makes
  // the row "updated" on the sync-complete panel.
  private static readonly CHANGE_FIELDS = [
    'externalContactCode',
    'externalAccountNumber',
    'displayName',
    'email',
    'billingLine1',
    'billingLine2',
    'billingCity',
    'billingState',
    'billingPostcode',
    'billingCountry',
    'deliveryLine1',
    'deliveryLine2',
    'deliveryCity',
    'deliveryState',
    'deliveryPostcode',
    'deliveryCountry',
    'isCustomer',
    'isSupplier',
    'isArchived',
  ];

  protected async upsertCacheRecord(
    connection: AccountingConnection,
    contact: AccountingExternalContact,
  ): Promise<CacheUpsertResult<ExternalAccountingContact>> {
    const shared = {
      externalContactCode: contact.code ?? null,
      externalAccountNumber: contact.accountNumber ?? null,
      displayName: contact.displayName,
      email: contact.email ?? null,
      billingLine1: contact.billingLine1 ?? null,
      billingLine2: contact.billingLine2 ?? null,
      billingCity: contact.billingCity ?? null,
      billingState: contact.billingState ?? null,
      billingPostcode: contact.billingPostcode ?? null,
      billingCountry: contact.billingCountry ?? null,
      deliveryLine1: contact.deliveryLine1 ?? null,
      deliveryLine2: contact.deliveryLine2 ?? null,
      deliveryCity: contact.deliveryCity ?? null,
      deliveryState: contact.deliveryState ?? null,
      deliveryPostcode: contact.deliveryPostcode ?? null,
      deliveryCountry: contact.deliveryCountry ?? null,
      isCustomer: contact.isCustomer,
      isSupplier: contact.isSupplier,
      isArchived: contact.isArchived,
      lastExternalUpdatedAt: contact.updatedAt ? new Date(contact.updatedAt) : null,
      lastSyncedAt: new Date(),
      rawProviderData: contact.raw as Prisma.InputJsonValue,
    };

    const where = {
      accountingConnectionId_externalContactId: {
        accountingConnectionId: connection.id,
        externalContactId: contact.externalId,
      },
    };

    const previous = await this.prisma.externalAccountingContact.findUnique({ where });

    const updated = await this.prisma.externalAccountingContact.upsert({
      where,
      // ignoredAt is intentionally left untouched on update — a re-sync must
      // not silently un-ignore a contact the distributor deliberately dismissed.
      create: {
        distributorId: connection.distributorId,
        accountingConnectionId: connection.id,
        provider: connection.provider,
        externalContactId: contact.externalId,
        ...shared,
      },
      update: shared,
    });

    await this.changeDetection.detectAndFlag({
      distributorId: connection.distributorId,
      hasActiveMapping: await this.hasActiveMapping(updated.id),
      previous,
      current: updated,
      fields: ['displayName', 'email'],
      markChanged: async () => {
        await this.prisma.externalAccountingContact.update({
          where: { id: updated.id },
          data: { changeDetectedAt: new Date() },
        });
      },
      notification: {
        type: 'ACCOUNTING_CONTACT_CHANGED',
        title: 'Linked contact changed in Xero',
        body: `"${updated.displayName}" changed in Xero (name or email) since it was linked — review before your next invoice export.`,
        linkPath: '/integrations/accounting?tab=contacts',
        payload: { externalContactId: updated.id, distributorId: connection.distributorId },
      },
    });

    // A contact that flipped to archived in Xero this run counts as "removed",
    // not "updated", on the sync-complete panel.
    const change =
      previous && !previous.isArchived && updated.isArchived
        ? ('removed' as const)
        : this.classifyChange(previous, updated, AccountingContactSyncProcessor.CHANGE_FIELDS);

    return { record: updated, change };
  }

  protected async loadMatchCandidates(connection: AccountingConnection): Promise<AccountingMatchCandidate[]> {
    const tradeRelationships = await this.prisma.tradeRelationship.findMany({
      where: {
        distributorId: connection.distributorId,
        deletedAt: null,
        accountingMappings: { none: { accountingConnectionId: connection.id, unlinkedAt: null } },
      },
      select: {
        id: true,
        accountNumber: true,
        customer: { select: { name: true, email: true, billingPostcode: true } },
      },
    });

    return tradeRelationships.map((tr) => ({
      tradeRelationshipId: tr.id,
      accountNumber: tr.accountNumber,
      organisationName: tr.customer.name,
      organisationEmail: tr.customer.email,
      organisationPostcode: tr.customer.billingPostcode,
    }));
  }

  protected shouldMatch(cached: ExternalAccountingContact): boolean {
    // Deliberately not gated on isCustomer/isSupplier: those flags are set
    // automatically by Xero based on transaction history (has an AR invoice
    // or AP bill ever been raised against this contact), not a business
    // classification — an untransacted contact has both flags false but can
    // still be a real match (e.g. an exact account-code match). formatContact
    // already handles the "not a customer" label correctly: a contact that
    // gets a suggestion here shows SUGGESTED, never falling through to
    // NOT_A_CUSTOMER.
    return !cached.isArchived && !cached.ignoredAt;
  }

  protected async hasActiveMapping(cachedId: string): Promise<boolean> {
    const mapping = await this.prisma.customerAccountingMapping.findFirst({
      where: { externalContactId: cachedId, unlinkedAt: null },
      select: { id: true },
    });
    return !!mapping;
  }

  protected async findOpenSuggestion(cachedId: string): Promise<AccountingSyncSuggestionRef | null> {
    const suggestion = await this.prisma.accountingContactMatchSuggestion.findFirst({
      where: { externalContactId: cachedId, status: AccountingContactMatchStatus.SUGGESTED },
    });
    if (!suggestion) return null;
    return { id: suggestion.id, candidateId: suggestion.suggestedTradeRelationshipId };
  }

  protected async updateSuggestion(
    suggestionId: string,
    match: AccountingMatchResult<AccountingContactMatchMethod>,
  ): Promise<void> {
    await this.prisma.accountingContactMatchSuggestion.update({
      where: { id: suggestionId },
      data: { confidence: match.confidence, matchMethod: match.matchMethod, matchReason: match.matchReason },
    });
  }

  protected async supersedeSuggestion(suggestionId: string): Promise<void> {
    await this.prisma.accountingContactMatchSuggestion.update({
      where: { id: suggestionId },
      data: { status: AccountingContactMatchStatus.SUPERSEDED },
    });
  }

  protected async createSuggestion(
    connection: AccountingConnection,
    cached: ExternalAccountingContact,
    match: AccountingMatchResult<AccountingContactMatchMethod>,
  ): Promise<void> {
    await this.prisma.accountingContactMatchSuggestion.create({
      data: {
        distributorId: connection.distributorId,
        accountingConnectionId: connection.id,
        externalContactId: cached.id,
        suggestedTradeRelationshipId: match.candidateId,
        confidence: match.confidence,
        matchMethod: match.matchMethod,
        matchReason: match.matchReason,
      },
    });
  }
}
