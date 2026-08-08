import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountingConnectionStatus, AccountingTaxTypeMatchMethod, AccountingTaxTypeMatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { TaxTypesService } from '../tax-types/tax-types.service';
import { TaxTypeQueryDto } from './dto/tax-type-query.dto';
import { ImportTaxTypeDto } from './dto/import-tax-type.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

const taxTypeInclude = {
  mappings: {
    where: { unlinkedAt: null },
    take: 1,
    include: { taxType: { select: { id: true, name: true } } },
  },
  suggestions: {
    where: { status: AccountingTaxTypeMatchStatus.SUGGESTED },
    take: 1,
    include: { suggestedTaxType: { select: { id: true, name: true } } },
  },
} satisfies Prisma.ExternalAccountingTaxTypeInclude;

export type TaxTypeRow = Prisma.ExternalAccountingTaxTypeGetPayload<{ include: typeof taxTypeInclude }>;

export type AccountingTaxTypeStatus =
  | 'LINKED'
  | 'SUGGESTED'
  | 'CONFLICT'
  | 'IGNORED'
  | 'INACTIVE'
  | 'READY_TO_IMPORT';

@Injectable()
export class AccountingTaxTypeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly taxTypes: TaxTypesService,
  ) {}

  async listTaxTypes(distributorId: string, query: TaxTypeQueryDto) {
    const connection = await this.getActiveConnection(distributorId);
    const limit = query.limit ?? 20;
    const take = limit + 1;

    const baseWhere: Prisma.ExternalAccountingTaxTypeWhereInput = { accountingConnectionId: connection.id };

    let cursorWhere: Prisma.ExternalAccountingTaxTypeWhereInput = {};
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

    const [rows, conflictedTaxTypeIds, total] = await Promise.all([
      this.prisma.externalAccountingTaxType.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: taxTypeInclude,
      }),
      this.findConflictedTaxTypeIds(connection.id),
      this.prisma.externalAccountingTaxType.count({ where: baseWhere }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    const data = page.map((row) => this.formatTaxType(row, conflictedTaxTypeIds));

    const nextCursor = hasMore
      ? Buffer.from(
          JSON.stringify({ createdAt: page[page.length - 1].createdAt, id: page[page.length - 1].id }),
        ).toString('base64url')
      : null;

    return { data, pagination: { nextCursor, hasMore, total } };
  }

  // Powers the "needs attention" badge on the Tax Types tab — a cheap
  // aggregate query, independent of the paginated list above.
  async countNeedsAttention(distributorId: string): Promise<number> {
    const connection = await this.prisma.accountingConnection.findFirst({
      where: { distributorId, status: AccountingConnectionStatus.CONNECTED },
      select: { id: true },
    });
    if (!connection) return 0;

    const [suggested, readyToImport] = await Promise.all([
      this.prisma.externalAccountingTaxType.count({
        where: {
          accountingConnectionId: connection.id,
          mappings: { none: { unlinkedAt: null } },
          suggestions: { some: { status: AccountingTaxTypeMatchStatus.SUGGESTED } },
        },
      }),
      this.prisma.externalAccountingTaxType.count({
        where: {
          accountingConnectionId: connection.id,
          isActive: true,
          ignoredAt: null,
          mappings: { none: { unlinkedAt: null } },
          suggestions: { none: { status: AccountingTaxTypeMatchStatus.SUGGESTED } },
        },
      }),
    ]);
    return suggested + readyToImport;
  }

  async requestManualSync(distributorId: string): Promise<{ queued: true }> {
    const connection = await this.getActiveConnection(distributorId);
    await this.prisma.$transaction((tx) =>
      this.outbox.writeEvent(tx, 'AccountingConnection', connection.id, 'AccountingTaxTypeSyncRequested', {}),
    );
    return { queued: true };
  }

  // PBI §2: an imported Xero tax rate can either create a new Stocdup tax
  // type or be mapped to an existing one — this is the "create new" path.
  // classification has no Xero equivalent, so it's always admin-supplied
  // (ImportTaxTypeDto), never defaulted or guessed.
  async importAsNewTaxType(distributorId: string, userId: string, externalTaxTypeId: string, dto: ImportTaxTypeDto) {
    const connection = await this.getActiveConnection(distributorId);
    const external = await this.getTaxTypeOrThrow(connection.id, externalTaxTypeId);
    await this.assertExternalTaxTypeNotMapped(external.id);

    // Not wrapped in a transaction with the mapping write below — same
    // trade-off as importAsNewProduct: TaxTypesService.create manages its own
    // write, and the unique constraint on TaxTypeAccountingMapping is still
    // the backstop against a duplicate link.
    const taxType = await this.taxTypes.create(distributorId, {
      name: dto.name ?? external.displayName,
      classification: dto.classification,
      ratePercentage: dto.ratePercentage ?? external.ratePercentage.toFixed(2),
    });

    await this.createMapping(
      distributorId,
      connection.id,
      taxType.id,
      external.id,
      AccountingTaxTypeMatchMethod.MANUAL,
      userId,
    );

    return taxType;
  }

  async confirmSuggestion(distributorId: string, userId: string, suggestionId: string) {
    const connection = await this.getActiveConnection(distributorId);
    const suggestion = await this.prisma.accountingTaxTypeMatchSuggestion.findFirst({
      where: { id: suggestionId, accountingConnectionId: connection.id, status: AccountingTaxTypeMatchStatus.SUGGESTED },
    });
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found or already resolved');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.createMapping(
        distributorId,
        connection.id,
        suggestion.suggestedTaxTypeId,
        suggestion.externalTaxTypeId,
        suggestion.matchMethod,
        userId,
        tx,
      );
      await tx.accountingTaxTypeMatchSuggestion.update({
        where: { id: suggestion.id },
        data: { status: AccountingTaxTypeMatchStatus.ACCEPTED, reviewedByUserId: userId, reviewedAt: new Date() },
      });
    });
  }

  async matchToExistingTaxType(
    distributorId: string,
    userId: string,
    externalTaxTypeId: string,
    taxTypeId: string,
  ) {
    const connection = await this.getActiveConnection(distributorId);
    const external = await this.getTaxTypeOrThrow(connection.id, externalTaxTypeId);
    await this.assertExternalTaxTypeNotMapped(external.id);

    const taxType = await this.prisma.taxType.findFirst({ where: { id: taxTypeId, distributorId } });
    if (!taxType) {
      throw new NotFoundException('Tax type not found');
    }
    await this.assertTaxTypeNotMapped(connection.id, taxTypeId);

    await this.prisma.$transaction(async (tx) => {
      await this.createMapping(
        distributorId,
        connection.id,
        taxTypeId,
        external.id,
        AccountingTaxTypeMatchMethod.MANUAL,
        userId,
        tx,
      );
      // A manual match resolves whatever the system had suggested for this
      // tax rate, right or wrong — supersede it rather than leaving it dangling.
      await tx.accountingTaxTypeMatchSuggestion.updateMany({
        where: { externalTaxTypeId: external.id, status: AccountingTaxTypeMatchStatus.SUGGESTED },
        data: { status: AccountingTaxTypeMatchStatus.SUPERSEDED },
      });
    });
  }

  async ignore(distributorId: string, userId: string, externalTaxTypeId: string): Promise<void> {
    const connection = await this.getActiveConnection(distributorId);
    const external = await this.getTaxTypeOrThrow(connection.id, externalTaxTypeId);

    await this.prisma.$transaction([
      this.prisma.externalAccountingTaxType.update({
        where: { id: external.id },
        data: { ignoredAt: new Date() },
      }),
      this.prisma.accountingTaxTypeMatchSuggestion.updateMany({
        where: { externalTaxTypeId: external.id, status: AccountingTaxTypeMatchStatus.SUGGESTED },
        data: { status: AccountingTaxTypeMatchStatus.REJECTED, reviewedByUserId: userId, reviewedAt: new Date() },
      }),
    ]);
  }

  async unlink(distributorId: string, mappingId: string): Promise<void> {
    const connection = await this.getActiveConnection(distributorId);
    const mapping = await this.prisma.taxTypeAccountingMapping.findFirst({
      where: { id: mappingId, accountingConnectionId: connection.id, unlinkedAt: null },
    });
    if (!mapping) {
      throw new NotFoundException('Mapping not found or already unlinked');
    }
    await this.prisma.taxTypeAccountingMapping.update({
      where: { id: mapping.id },
      data: { unlinkedAt: new Date() },
    });
  }

  // Clears the "changed since sync" highlight on a cache row — an explicit
  // admin action, never done automatically by a later sync (see
  // AccountingChangeDetectionService).
  async acknowledgeChange(distributorId: string, externalTaxTypeId: string): Promise<void> {
    const connection = await this.getActiveConnection(distributorId);
    const external = await this.getTaxTypeOrThrow(connection.id, externalTaxTypeId);
    await this.prisma.externalAccountingTaxType.update({
      where: { id: external.id },
      data: { changeAcknowledgedAt: new Date() },
    });
  }

  // Provider-neutral "external tax code -> confirmed Stocdup TaxType" lookup
  // (Phase 4 of the tax types PBI: resolving an accounting product's tax code
  // on import/match). Takes a connection id, not anything provider-shaped —
  // works identically for any AccountingProvider. Null whenever there's
  // nothing confirmed to resolve to: no code, the code hasn't been synced as
  // a tax rate yet, or it has but isn't linked to a Stocdup TaxType.
  async resolveTaxTypeForCode(
    accountingConnectionId: string,
    code: string | null,
  ): Promise<{ taxTypeId: string; taxTypeName: string } | null> {
    if (!code) return null;

    const externalTaxType = await this.prisma.externalAccountingTaxType.findUnique({
      where: { accountingConnectionId_taxType: { accountingConnectionId, taxType: code } },
      include: {
        mappings: {
          where: { unlinkedAt: null },
          take: 1,
          include: { taxType: { select: { id: true, name: true } } },
        },
      },
    });

    const mapping = externalTaxType?.mappings[0];
    if (!mapping) return null;

    return { taxTypeId: mapping.taxType.id, taxTypeName: mapping.taxType.name };
  }

  // Provider-neutral "confirmed Stocdup TaxType -> external tax code" lookup —
  // the reverse of resolveTaxTypeForCode above (Phase 5 of the tax types PBI:
  // resolving the tax code to send when exporting an invoice). Takes a
  // connection id and a Stocdup taxTypeId, not anything provider-shaped —
  // works identically for any AccountingProvider. Null whenever there's
  // nothing confirmed to resolve to: no taxTypeId, or it hasn't been linked
  // to an external tax rate on this connection.
  async resolveExternalCodeForTaxType(
    accountingConnectionId: string,
    taxTypeId: string | null,
  ): Promise<string | null> {
    if (!taxTypeId) return null;

    const mapping = await this.prisma.taxTypeAccountingMapping.findFirst({
      where: { accountingConnectionId, taxTypeId, unlinkedAt: null },
      include: { externalTaxType: { select: { taxType: true } } },
    });

    return mapping?.externalTaxType.taxType ?? null;
  }

  private async createMapping(
    distributorId: string,
    accountingConnectionId: string,
    taxTypeId: string,
    externalTaxTypeId: string,
    matchMethod: AccountingTaxTypeMatchMethod,
    linkedByUserId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    await this.assertTaxTypeNotMapped(accountingConnectionId, taxTypeId, tx);
    return tx.taxTypeAccountingMapping.create({
      data: { distributorId, accountingConnectionId, taxTypeId, externalTaxTypeId, matchMethod, linkedByUserId },
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

  private async getTaxTypeOrThrow(accountingConnectionId: string, externalTaxTypeId: string) {
    const external = await this.prisma.externalAccountingTaxType.findFirst({
      where: { id: externalTaxTypeId, accountingConnectionId },
    });
    if (!external) {
      throw new NotFoundException('Accounting tax type not found');
    }
    return external;
  }

  private async assertExternalTaxTypeNotMapped(externalTaxTypeId: string): Promise<void> {
    const existing = await this.prisma.taxTypeAccountingMapping.findFirst({
      where: { externalTaxTypeId, unlinkedAt: null },
    });
    if (existing) {
      throw new ConflictException('This accounting tax type is already linked to a tax type');
    }
  }

  private async assertTaxTypeNotMapped(
    accountingConnectionId: string,
    taxTypeId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const existing = await tx.taxTypeAccountingMapping.findFirst({
      where: { accountingConnectionId, taxTypeId, unlinkedAt: null },
    });
    if (existing) {
      throw new ConflictException('This tax type is already linked to a different accounting tax type');
    }
  }

  private async findConflictedTaxTypeIds(accountingConnectionId: string): Promise<Set<string>> {
    const grouped = await this.prisma.accountingTaxTypeMatchSuggestion.groupBy({
      by: ['suggestedTaxTypeId'],
      where: { accountingConnectionId, status: AccountingTaxTypeMatchStatus.SUGGESTED },
      _count: { _all: true },
    });
    return new Set(grouped.filter((g) => g._count._all > 1).map((g) => g.suggestedTaxTypeId));
  }

  private formatTaxType(row: TaxTypeRow, conflictedTaxTypeIds: Set<string>) {
    const mapping = row.mappings[0] ?? null;
    const suggestion = row.suggestions[0] ?? null;

    let status: AccountingTaxTypeStatus;
    if (mapping) status = 'LINKED';
    else if (suggestion && conflictedTaxTypeIds.has(suggestion.suggestedTaxTypeId)) status = 'CONFLICT';
    else if (suggestion) status = 'SUGGESTED';
    else if (row.ignoredAt) status = 'IGNORED';
    else if (!row.isActive) status = 'INACTIVE';
    else status = 'READY_TO_IMPORT';

    return {
      id: row.id,
      taxType: row.taxType,
      displayName: row.displayName,
      ratePercentage: row.ratePercentage.toString(),
      isActive: row.isActive,
      ignoredAt: row.ignoredAt,
      changeDetectedAt: row.changeDetectedAt,
      changeAcknowledgedAt: row.changeAcknowledgedAt,
      status,
      mapping: mapping
        ? {
            id: mapping.id,
            taxTypeId: mapping.taxTypeId,
            taxTypeName: mapping.taxType.name,
            matchMethod: mapping.matchMethod,
            linkedAt: mapping.linkedAt,
          }
        : null,
      suggestion: suggestion
        ? {
            id: suggestion.id,
            taxTypeId: suggestion.suggestedTaxTypeId,
            taxTypeName: suggestion.suggestedTaxType.name,
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
