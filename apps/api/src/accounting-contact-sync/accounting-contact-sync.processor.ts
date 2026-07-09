import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { AccountingConnectionStatus, AccountingContactMatchStatus, AccountingProvider, Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_CONTACT_SYNC_QUEUE } from '../queues/queue.constants';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import { AccountingExternalContact } from '../accounting/adapters/accounting-connection-adapter.interface';
import {
  AccountingContactMatcherService,
  AccountingMatchCandidate,
} from '../accounting/matching/accounting-contact-matcher.service';

interface OutboxEventJobData {
  eventId: string;
  aggregateType: string;
  aggregateId: string; // AccountingConnection id
  payload: unknown;
}

// Consumes AccountingContactSyncRequested — written to the outbox by both
// AccountingContactSyncScheduler (periodic) and the "Sync now" HTTP endpoint
// (manual). One trigger, one path: pull contacts from the provider, cache
// them, and run the matcher against unmapped Wholo customers. Never writes a
// CustomerAccountingMapping itself — only ever produces suggestions.
@Processor(ACCOUNTING_CONTACT_SYNC_QUEUE)
export class AccountingContactSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountingContactSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingConnectionService: AccountingConnectionService,
    private readonly adapters: AccountingAdapterRegistry,
    private readonly matcher: AccountingContactMatcherService,
  ) {
    super();
  }

  async process(job: Job<OutboxEventJobData>): Promise<void> {
    const connectionId = job.data.aggregateId;
    const connection = await this.prisma.accountingConnection.findUnique({ where: { id: connectionId } });
    if (!connection) {
      this.logger.warn(`AccountingConnection ${connectionId} no longer exists — skipping sync`);
      return;
    }
    if (connection.status !== AccountingConnectionStatus.CONNECTED) {
      this.logger.log(`AccountingConnection ${connectionId} is not CONNECTED — skipping sync`);
      return;
    }

    const tokenSet = await this.accountingConnectionService.getValidTokenSet(
      connection.distributorId,
      connection.provider,
    );
    const adapter = this.adapters.get(connection.provider);
    // Deliberately a full fetch every time, not an incremental one keyed off
    // connection.lastSyncedAt: that field also means "last successful token
    // refresh" (see AccountingConnectionService.getValidTokenSet, called
    // just above) — reusing it as the contacts If-Modified-Since cursor
    // conflates two different clocks and can silently starve the sync of
    // everything that existed before some unrelated token refresh. A proper
    // incremental cursor needs its own dedicated field; not worth the
    // complexity yet at this feature's contact volumes.
    const externalContacts = await adapter.listContacts(tokenSet, connection.externalOrganisationId);

    const cachedContacts = await Promise.all(
      externalContacts.map((contact) => this.upsertExternalContact(connection.id, connection.distributorId, connection.provider, contact)),
    );

    const candidates = await this.loadMatchCandidates(connection.distributorId, connection.id);

    for (const cached of cachedContacts) {
      await this.runMatcherFor(connection.id, connection.distributorId, cached, candidates);
    }

    await this.prisma.accountingConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });

    this.logger.log(
      `Accounting contact sync complete for connection ${connection.id}: ${externalContacts.length} contact(s) fetched`,
    );
  }

  private async upsertExternalContact(
    accountingConnectionId: string,
    distributorId: string,
    provider: AccountingProvider,
    contact: AccountingExternalContact,
  ) {
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
          accountingConnectionId,
          externalContactId: contact.externalId,
        },
      },
      // ignoredAt is intentionally left untouched on update — a re-sync must
      // not silently un-ignore a contact the distributor deliberately dismissed.
      create: {
        distributorId,
        accountingConnectionId,
        provider,
        externalContactId: contact.externalId,
        ...shared,
      },
      update: shared,
    });
  }

  private async loadMatchCandidates(
    distributorId: string,
    accountingConnectionId: string,
  ): Promise<AccountingMatchCandidate[]> {
    const tradeRelationships = await this.prisma.tradeRelationship.findMany({
      where: {
        distributorId,
        deletedAt: null,
        accountingMappings: { none: { accountingConnectionId, unlinkedAt: null } },
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

  private async runMatcherFor(
    accountingConnectionId: string,
    distributorId: string,
    cached: {
      id: string;
      externalContactCode: string | null;
      externalAccountNumber: string | null;
      displayName: string;
      email: string | null;
      billingPostcode: string | null;
      isArchived: boolean;
      ignoredAt: Date | null;
    },
    candidates: AccountingMatchCandidate[],
  ): Promise<void> {
    // Deliberately not gated on isCustomer/isSupplier: those flags are set
    // automatically by Xero based on transaction history (has an AR invoice
    // or AP bill ever been raised against this contact), not a business
    // classification — an untransacted contact has both flags false but can
    // still be a real match (e.g. an exact account-code match). formatContact
    // already handles the "not a customer" label correctly: a contact that
    // gets a suggestion here shows SUGGESTED, never falling through to
    // NOT_A_CUSTOMER.
    if (cached.isArchived || cached.ignoredAt) return;

    const hasActiveMapping = await this.prisma.customerAccountingMapping.findFirst({
      where: { externalContactId: cached.id, unlinkedAt: null },
      select: { id: true },
    });
    if (hasActiveMapping) return;

    const match = this.matcher.findBestMatch(
      {
        externalContactCode: cached.externalContactCode,
        externalAccountNumber: cached.externalAccountNumber,
        displayName: cached.displayName,
        email: cached.email,
        billingPostcode: cached.billingPostcode,
      },
      candidates,
    );

    const existingSuggestion = await this.prisma.accountingContactMatchSuggestion.findFirst({
      where: { externalContactId: cached.id, status: AccountingContactMatchStatus.SUGGESTED },
    });

    if (existingSuggestion && match && existingSuggestion.suggestedTradeRelationshipId === match.tradeRelationshipId) {
      await this.prisma.accountingContactMatchSuggestion.update({
        where: { id: existingSuggestion.id },
        data: { confidence: match.confidence, matchMethod: match.matchMethod, matchReason: match.matchReason },
      });
      return;
    }

    if (existingSuggestion) {
      await this.prisma.accountingContactMatchSuggestion.update({
        where: { id: existingSuggestion.id },
        data: { status: AccountingContactMatchStatus.SUPERSEDED },
      });
    }

    if (match) {
      await this.prisma.accountingContactMatchSuggestion.create({
        data: {
          distributorId,
          accountingConnectionId,
          externalContactId: cached.id,
          suggestedTradeRelationshipId: match.tradeRelationshipId,
          confidence: match.confidence,
          matchMethod: match.matchMethod,
          matchReason: match.matchReason,
        },
      });
    }
  }
}
