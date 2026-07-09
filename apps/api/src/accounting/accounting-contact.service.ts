import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountingConnectionStatus, AccountingContactMatchMethod, AccountingContactMatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AdminCustomersService } from '../admin-customers/admin-customers.service';
import { ContactQueryDto, AccountingContactStatusFilter } from './dto/contact-query.dto';
import { ImportContactDto } from './dto/import-contact.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

const contactInclude = {
  mappings: {
    where: { unlinkedAt: null },
    take: 1,
    include: { tradeRelationship: { include: { customer: { select: { id: true, name: true } } } } },
  },
  suggestions: {
    where: { status: AccountingContactMatchStatus.SUGGESTED },
    take: 1,
    include: { suggestedTradeRelationship: { include: { customer: { select: { id: true, name: true } } } } },
  },
} satisfies Prisma.ExternalAccountingContactInclude;

type ContactRow = Prisma.ExternalAccountingContactGetPayload<{ include: typeof contactInclude }>;

@Injectable()
export class AccountingContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly adminCustomers: AdminCustomersService,
  ) {}

  async listContacts(distributorId: string, query: ContactQueryDto) {
    const connection = await this.getActiveConnection(distributorId);
    const limit = query.limit ?? 20;
    const take = limit + 1;

    const baseWhere: Prisma.ExternalAccountingContactWhereInput = {
      accountingConnectionId: connection.id,
      ...(query.search && {
        OR: [
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      // Xero's own All/Customers/Suppliers/Archived split — these are
      // stored booleans, so (unlike the computed match-status filter below)
      // this is applied at the DB level, not the fetched page.
      ...(query.type === 'customers' && { isCustomer: true }),
      ...(query.type === 'suppliers' && { isSupplier: true }),
      ...(query.type === 'archived' && { isArchived: true }),
    };

    let cursorWhere: Prisma.ExternalAccountingContactWhereInput = {};
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

    const [rows, conflictedTradeRelationshipIds] = await Promise.all([
      this.prisma.externalAccountingContact.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: contactInclude,
      }),
      this.findConflictedTradeRelationshipIds(connection.id),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    let data = page.map((row) => this.formatContact(row, conflictedTradeRelationshipIds));

    // Computed statuses (LINKED/SUGGESTED/CONFLICT/...) can't all be
    // expressed as DB predicates cheaply, so the status filter — if any — is
    // applied to the fetched page rather than the query itself. Contact
    // volumes here are modest (a distributor's customer base), so this is a
    // reasonable trade-off for a first release.
    if (query.status) {
      data = data.filter((c) => c.status === query.status);
    }

    const nextCursor = hasMore
      ? Buffer.from(
          JSON.stringify({ createdAt: page[page.length - 1].createdAt, id: page[page.length - 1].id }),
        ).toString('base64url')
      : null;

    return { data, pagination: { nextCursor, hasMore } };
  }

  // Powers the "needs attention" badge (Contacts tab label + sidebar nav) —
  // a cheap aggregate query, independent of the paginated list above.
  async countNeedsAttention(distributorId: string): Promise<number> {
    const connection = await this.prisma.accountingConnection.findFirst({
      where: { distributorId, status: AccountingConnectionStatus.CONNECTED },
      select: { id: true },
    });
    if (!connection) return 0;

    const [suggested, readyToImport] = await Promise.all([
      this.prisma.externalAccountingContact.count({
        where: {
          accountingConnectionId: connection.id,
          mappings: { none: { unlinkedAt: null } },
          suggestions: { some: { status: AccountingContactMatchStatus.SUGGESTED } },
        },
      }),
      this.prisma.externalAccountingContact.count({
        where: {
          accountingConnectionId: connection.id,
          isCustomer: true,
          isArchived: false,
          ignoredAt: null,
          mappings: { none: { unlinkedAt: null } },
          suggestions: { none: { status: AccountingContactMatchStatus.SUGGESTED } },
        },
      }),
    ]);
    return suggested + readyToImport;
  }

  async requestManualSync(distributorId: string): Promise<{ queued: true }> {
    const connection = await this.getActiveConnection(distributorId);
    await this.prisma.$transaction((tx) =>
      this.outbox.writeEvent(tx, 'AccountingConnection', connection.id, 'AccountingContactSyncRequested', {}),
    );
    return { queued: true };
  }

  async importAsNewCustomer(distributorId: string, userId: string, externalContactId: string, dto: ImportContactDto) {
    const connection = await this.getActiveConnection(distributorId);
    const contact = await this.getContactOrThrow(connection.id, externalContactId);
    await this.assertContactNotMapped(contact.id);

    // Not wrapped in a transaction with the mapping write below:
    // AdminCustomersService.create manages its own transaction internally,
    // and reusing it as-is (rather than threading an external tx through a
    // service that owns its own boundary) is the right trade-off here — the
    // unique constraint on CustomerAccountingMapping is still the backstop
    // against a duplicate link, just with a less friendly error on the rare
    // concurrent-double-click race.
    const relationship = await this.adminCustomers.create(distributorId, {
      name: dto.name ?? contact.displayName,
      legalName: dto.legalName,
      phone: dto.phone,
      accountNumber: dto.accountNumber ?? contact.externalContactCode ?? contact.externalAccountNumber ?? undefined,
      billingLine1: dto.billingLine1 ?? contact.billingLine1 ?? undefined,
      billingLine2: dto.billingLine2 ?? contact.billingLine2 ?? undefined,
      billingCity: dto.billingCity ?? contact.billingCity ?? undefined,
      billingState: dto.billingState ?? contact.billingState ?? undefined,
      billingPostcode: dto.billingPostcode ?? contact.billingPostcode ?? undefined,
      billingCountry: dto.billingCountry ?? contact.billingCountry ?? undefined,
      // Deliberately no email — importing an accounting contact must never
      // create a login user or an implicit invitation.
    });

    await this.createMapping(
      distributorId,
      connection.id,
      relationship.id,
      contact.id,
      AccountingContactMatchMethod.MANUAL,
      userId,
    );

    return relationship;
  }

  async confirmSuggestion(distributorId: string, userId: string, suggestionId: string) {
    const connection = await this.getActiveConnection(distributorId);
    const suggestion = await this.prisma.accountingContactMatchSuggestion.findFirst({
      where: { id: suggestionId, accountingConnectionId: connection.id, status: AccountingContactMatchStatus.SUGGESTED },
    });
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found or already resolved');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.createMapping(
        distributorId,
        connection.id,
        suggestion.suggestedTradeRelationshipId,
        suggestion.externalContactId,
        suggestion.matchMethod,
        userId,
        tx,
      );
      await tx.accountingContactMatchSuggestion.update({
        where: { id: suggestion.id },
        data: { status: AccountingContactMatchStatus.ACCEPTED, reviewedByUserId: userId, reviewedAt: new Date() },
      });
    });
  }

  async matchToExistingCustomer(
    distributorId: string,
    userId: string,
    externalContactId: string,
    tradeRelationshipId: string,
  ) {
    const connection = await this.getActiveConnection(distributorId);
    const contact = await this.getContactOrThrow(connection.id, externalContactId);
    await this.assertContactNotMapped(contact.id);

    const relationship = await this.prisma.tradeRelationship.findFirst({
      where: { id: tradeRelationshipId, distributorId, deletedAt: null },
    });
    if (!relationship) {
      throw new NotFoundException('Customer not found');
    }
    await this.assertTradeRelationshipNotMapped(connection.id, tradeRelationshipId);

    await this.prisma.$transaction(async (tx) => {
      await this.createMapping(
        distributorId,
        connection.id,
        tradeRelationshipId,
        contact.id,
        AccountingContactMatchMethod.MANUAL,
        userId,
        tx,
      );
      // A manual match resolves whatever the system had suggested for this
      // contact, right or wrong — supersede it rather than leaving it dangling.
      await tx.accountingContactMatchSuggestion.updateMany({
        where: { externalContactId: contact.id, status: AccountingContactMatchStatus.SUGGESTED },
        data: { status: AccountingContactMatchStatus.SUPERSEDED },
      });
    });
  }

  async ignore(distributorId: string, userId: string, externalContactId: string): Promise<void> {
    const connection = await this.getActiveConnection(distributorId);
    const contact = await this.getContactOrThrow(connection.id, externalContactId);

    await this.prisma.$transaction([
      this.prisma.externalAccountingContact.update({
        where: { id: contact.id },
        data: { ignoredAt: new Date() },
      }),
      this.prisma.accountingContactMatchSuggestion.updateMany({
        where: { externalContactId: contact.id, status: AccountingContactMatchStatus.SUGGESTED },
        data: { status: AccountingContactMatchStatus.REJECTED, reviewedByUserId: userId, reviewedAt: new Date() },
      }),
    ]);
  }

  async unlink(distributorId: string, mappingId: string): Promise<void> {
    const connection = await this.getActiveConnection(distributorId);
    const mapping = await this.prisma.customerAccountingMapping.findFirst({
      where: { id: mappingId, accountingConnectionId: connection.id, unlinkedAt: null },
    });
    if (!mapping) {
      throw new NotFoundException('Mapping not found or already unlinked');
    }
    await this.prisma.customerAccountingMapping.update({
      where: { id: mapping.id },
      data: { unlinkedAt: new Date() },
    });
  }

  private async createMapping(
    distributorId: string,
    accountingConnectionId: string,
    tradeRelationshipId: string,
    externalContactId: string,
    matchMethod: AccountingContactMatchMethod,
    linkedByUserId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    await this.assertTradeRelationshipNotMapped(accountingConnectionId, tradeRelationshipId, tx);
    return tx.customerAccountingMapping.create({
      data: { distributorId, accountingConnectionId, tradeRelationshipId, externalContactId, matchMethod, linkedByUserId },
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

  private async getContactOrThrow(accountingConnectionId: string, externalContactId: string) {
    const contact = await this.prisma.externalAccountingContact.findFirst({
      where: { id: externalContactId, accountingConnectionId },
    });
    if (!contact) {
      throw new NotFoundException('Accounting contact not found');
    }
    return contact;
  }

  private async assertContactNotMapped(externalContactId: string): Promise<void> {
    const existing = await this.prisma.customerAccountingMapping.findFirst({
      where: { externalContactId, unlinkedAt: null },
    });
    if (existing) {
      throw new ConflictException('This accounting contact is already linked to a customer');
    }
  }

  private async assertTradeRelationshipNotMapped(
    accountingConnectionId: string,
    tradeRelationshipId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const existing = await tx.customerAccountingMapping.findFirst({
      where: { accountingConnectionId, tradeRelationshipId, unlinkedAt: null },
    });
    if (existing) {
      throw new ConflictException('This customer is already linked to a different accounting contact');
    }
  }

  private async findConflictedTradeRelationshipIds(accountingConnectionId: string): Promise<Set<string>> {
    const grouped = await this.prisma.accountingContactMatchSuggestion.groupBy({
      by: ['suggestedTradeRelationshipId'],
      where: { accountingConnectionId, status: AccountingContactMatchStatus.SUGGESTED },
      _count: { _all: true },
    });
    return new Set(grouped.filter((g) => g._count._all > 1).map((g) => g.suggestedTradeRelationshipId));
  }

  private formatContact(row: ContactRow, conflictedTradeRelationshipIds: Set<string>) {
    const mapping = row.mappings[0] ?? null;
    const suggestion = row.suggestions[0] ?? null;

    let status: AccountingContactStatusFilter;
    if (mapping) status = 'LINKED';
    else if (suggestion && conflictedTradeRelationshipIds.has(suggestion.suggestedTradeRelationshipId)) status = 'CONFLICT';
    else if (suggestion) status = 'SUGGESTED';
    else if (row.ignoredAt) status = 'IGNORED';
    else if (row.isArchived) status = 'ARCHIVED';
    // A supplier-only contact (isCustomer: false) is never a candidate for
    // becoming a Wholo trade customer — surface it distinctly rather than
    // inviting the distributor to import a supplier as a customer.
    else if (!row.isCustomer) status = 'NOT_A_CUSTOMER';
    else status = 'READY_TO_IMPORT';

    return {
      id: row.id,
      displayName: row.displayName,
      email: row.email,
      externalContactCode: row.externalContactCode,
      externalAccountNumber: row.externalAccountNumber,
      isCustomer: row.isCustomer,
      isSupplier: row.isSupplier,
      isArchived: row.isArchived,
      ignoredAt: row.ignoredAt,
      status,
      mapping: mapping
        ? {
            id: mapping.id,
            tradeRelationshipId: mapping.tradeRelationshipId,
            customerName: mapping.tradeRelationship.customer.name,
            matchMethod: mapping.matchMethod,
            linkedAt: mapping.linkedAt,
          }
        : null,
      suggestion: suggestion
        ? {
            id: suggestion.id,
            tradeRelationshipId: suggestion.suggestedTradeRelationshipId,
            customerName: suggestion.suggestedTradeRelationship.customer.name,
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
