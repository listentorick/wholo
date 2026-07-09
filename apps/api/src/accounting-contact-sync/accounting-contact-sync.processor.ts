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
} from '../accounting/sync/accounting-sync-processor.base';

// Consumes AccountingContactSyncRequested — written to the outbox by both
// AccountingContactSyncScheduler (periodic) and the "Sync now" HTTP endpoint
// (manual). One trigger, one path: the shared sync pipeline
// (AccountingSyncProcessorBase) pulls contacts from the provider, caches
// them, and runs the matcher against unmapped Wholo customers. Never writes a
// CustomerAccountingMapping itself — only ever produces suggestions.
@Processor(ACCOUNTING_CONTACT_SYNC_QUEUE)
export class AccountingContactSyncProcessor extends AccountingSyncProcessorBase<
  AccountingExternalContact,
  ExternalAccountingContact,
  AccountingMatchCandidate,
  AccountingContactMatchMethod
> {
  protected readonly logger = new Logger(AccountingContactSyncProcessor.name);
  protected readonly recordNoun = 'contact';

  constructor(
    prisma: PrismaService,
    accountingConnectionService: AccountingConnectionService,
    adapters: AccountingAdapterRegistry,
    protected readonly matcher: AccountingContactMatcherService,
  ) {
    super(prisma, accountingConnectionService, adapters);
  }

  protected fetchExternalRecords(
    adapter: AccountingConnectionAdapter,
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
  ): Promise<AccountingExternalContact[]> {
    return adapter.listContacts(tokenSet, externalOrganisationId);
  }

  protected upsertCacheRecord(
    connection: AccountingConnection,
    contact: AccountingExternalContact,
  ): Promise<ExternalAccountingContact> {
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
      isCustomer: contact.isCustomer,
      isSupplier: contact.isSupplier,
      isArchived: contact.isArchived,
      lastExternalUpdatedAt: contact.updatedAt ? new Date(contact.updatedAt) : null,
      lastSyncedAt: new Date(),
      rawProviderData: contact.raw as Prisma.InputJsonValue,
    };

    return this.prisma.externalAccountingContact.upsert({
      where: {
        accountingConnectionId_externalContactId: {
          accountingConnectionId: connection.id,
          externalContactId: contact.externalId,
        },
      },
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
