import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountingBulkImportRecordType,
  AccountingConnectionStatus,
  AccountingContactMatchMethod,
  AccountingContactMatchStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AdminCustomersService } from '../admin-customers/admin-customers.service';
import { ContactQueryDto, AccountingContactStatusFilter, AccountingContactTypeFilter } from './dto/contact-query.dto';
import { ImportContactDto } from './dto/import-contact.dto';
import { BulkImportContactSelectionDto } from './dto/bulk-import-contact-selection.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

// Exported so AccountingBulkImportProcessor can fetch+format a contact row
// with the same include/status logic this service uses for listing — single
// source of truth for what SUGGESTED/CONFLICT/etc. mean.
export const contactInclude = {
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

export type ContactRow = Prisma.ExternalAccountingContactGetPayload<{ include: typeof contactInclude }>;

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

    // The provider's own contact classification — stored booleans, so
    // (unlike the computed match-status filter below) applied at the DB
    // level. Multiple selected types are OR'd: a contact can genuinely be,
    // say, both a customer and archived.
    const typeConditions: Prisma.ExternalAccountingContactWhereInput[] = (query.type ?? []).map((t) =>
      t === 'customers' ? { isCustomer: true } : t === 'suppliers' ? { isSupplier: true } : { isArchived: true },
    );

    const baseWhere: Prisma.ExternalAccountingContactWhereInput = {
      accountingConnectionId: connection.id,
      ...(query.search && {
        OR: [
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(typeConditions.length && { OR: typeConditions }),
    };

    // Computed statuses (LINKED/SUGGESTED/CONFLICT/...) aren't DB columns,
    // so they can't be combined with DB-level take+cursor pagination — the
    // DB page would already be fixed before the filter even runs, which
    // would make hasMore/nextCursor wrong. When a status filter is active,
    // fetch every row matching the DB-level predicates instead (org-scoped
    // volumes here are in the thousands, not worth a schema change) and
    // paginate the filtered, in-memory list.
    if (query.status?.length) {
      const [rows, conflictedTradeRelationshipIds] = await Promise.all([
        this.prisma.externalAccountingContact.findMany({
          where: baseWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: contactInclude,
        }),
        this.findConflictedTradeRelationshipIds(connection.id),
      ]);

      const matches = rows
        .map((row) => ({ row, formatted: this.formatContact(row, conflictedTradeRelationshipIds) }))
        .filter((m) => query.status!.includes(m.formatted.status));

      return this.paginateFilteredMatches(matches, query.cursor, limit);
    }

    const take = limit + 1;
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

    const [rows, conflictedTradeRelationshipIds, total] = await Promise.all([
      this.prisma.externalAccountingContact.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: contactInclude,
      }),
      this.findConflictedTradeRelationshipIds(connection.id),
      this.prisma.externalAccountingContact.count({ where: baseWhere }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    const data = page.map((row) => this.formatContact(row, conflictedTradeRelationshipIds));

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

  // Every external id currently matching a filter (status/type/search), with
  // no pagination — the set a "select all N matching filters" bulk import
  // resolves against. Re-run at process time by the bulk-import processor,
  // never trusted as a client-supplied snapshot, so a job that runs minutes
  // after being queued reflects current data.
  async resolveExternalIdsForFilter(
    distributorId: string,
    filter: { status?: AccountingContactStatusFilter[]; type?: AccountingContactTypeFilter[]; search?: string },
  ): Promise<string[]> {
    const connection = await this.getActiveConnection(distributorId);

    const typeConditions: Prisma.ExternalAccountingContactWhereInput[] = (filter.type ?? []).map((t) =>
      t === 'customers' ? { isCustomer: true } : t === 'suppliers' ? { isSupplier: true } : { isArchived: true },
    );

    const conditions: Prisma.ExternalAccountingContactWhereInput[] = [];
    if (filter.search) {
      conditions.push({
        OR: [
          { displayName: { contains: filter.search, mode: 'insensitive' } },
          { email: { contains: filter.search, mode: 'insensitive' } },
        ],
      });
    }
    if (typeConditions.length) {
      conditions.push({ OR: typeConditions });
    }
    const baseWhere: Prisma.ExternalAccountingContactWhereInput = {
      accountingConnectionId: connection.id,
      ...(conditions.length && { AND: conditions }),
    };

    const [rows, conflictedTradeRelationshipIds] = await Promise.all([
      this.prisma.externalAccountingContact.findMany({ where: baseWhere, include: contactInclude }),
      this.findConflictedTradeRelationshipIds(connection.id),
    ]);

    return rows
      .map((row) => ({ id: row.id, status: this.formatContact(row, conflictedTradeRelationshipIds).status }))
      .filter((r) => !filter.status?.length || filter.status.includes(r.status))
      .map((r) => r.id);
  }

  async requestBulkImport(
    distributorId: string,
    userId: string,
    dto: BulkImportContactSelectionDto,
  ): Promise<{ jobId: string }> {
    if (!dto.ids?.length && !dto.filter) {
      throw new BadRequestException('Either ids or filter must be provided');
    }
    const connection = await this.getActiveConnection(distributorId);

    const job = await this.prisma.accountingBulkImportJob.create({
      data: {
        distributorId,
        accountingConnectionId: connection.id,
        recordType: AccountingBulkImportRecordType.CONTACT,
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
      where: { id: jobId, distributorId, recordType: AccountingBulkImportRecordType.CONTACT },
    });
    if (!job) {
      throw new NotFoundException('Bulk import job not found');
    }
    return job;
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

  // Public: reused by AccountingBulkImportProcessor, which needs the same
  // connection-wide conflict set to compute per-item status during a batch.
  async findConflictedTradeRelationshipIds(accountingConnectionId: string): Promise<Set<string>> {
    const grouped = await this.prisma.accountingContactMatchSuggestion.groupBy({
      by: ['suggestedTradeRelationshipId'],
      where: { accountingConnectionId, status: AccountingContactMatchStatus.SUGGESTED },
      _count: { _all: true },
    });
    return new Set(grouped.filter((g) => g._count._all > 1).map((g) => g.suggestedTradeRelationshipId));
  }

  // Public: reused by AccountingBulkImportProcessor for per-item status
  // recompute — single source of truth for the computed status, so a
  // resumed/re-run bulk import always sees each item's current reality.
  formatContact(row: ContactRow, conflictedTradeRelationshipIds: Set<string>) {
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
