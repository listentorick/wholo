import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountingContactMatchStatus,
  AccountingProductMatchStatus,
  ExternalAccountingContact,
  ExternalAccountingProduct,
} from '@prisma/client';
import type {
  AccountingCustomerLink,
  AccountingLinkedContact,
  AccountingLinkedProduct,
  AccountingProductLink,
  AccountingRecordLink,
  AccountingRecordLinkUser,
} from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectionService } from './accounting-connection.service';
import { AccountingAdapterRegistry } from './adapters/accounting-adapter.registry';
import { AccountingConnectionWithOrganisation, organisationScope } from './accounting-organisation';

// The link to the accounting system seen from a Stocdup record's side — the
// customer or product detail page. Every other accounting route starts from
// the provider's record; this is the reverse lookup. Read-only: linking,
// unlinking and acknowledging go through the existing contact/product
// routes. Nothing here knows which provider it is — the name comes from the
// adapter registry (accounting-framework.arch.spec.ts).

interface MappingRow<TExternal> {
  id: string;
  matchMethod: string;
  linkedByUserId: string;
  linkedAt: Date;
  unlinkedAt: Date | null;
  external: TExternal;
}

interface SuggestionRow<TExternal> {
  id: string;
  confidence: number;
  matchMethod: string;
  matchReason: string;
  external: TExternal;
}

interface ChangeTracked {
  changeDetectedAt: Date | null;
  changeAcknowledgedAt: Date | null;
}

@Injectable()
export class AccountingRecordLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: AccountingConnectionService,
    private readonly adapters: AccountingAdapterRegistry,
  ) {}

  async getCustomerLink(distributorId: string, customerId: string): Promise<AccountingCustomerLink> {
    const relationship = await this.prisma.tradeRelationship.findFirst({
      where: { distributorId, customerId, deletedAt: null },
      select: { id: true },
    });
    if (!relationship) throw new NotFoundException('Customer not found');

    const connection = await this.connections.getCurrentConnection(distributorId);
    if (!connection) return emptyLink();
    const scope = organisationScope(connection);

    const mappings = await this.prisma.customerAccountingMapping.findMany({
      where: { ...scope, tradeRelationshipId: relationship.id },
      include: { externalContact: true },
      orderBy: { linkedAt: 'desc' },
    });
    const linked = mappings.some((m) => m.unlinkedAt === null);
    const suggestion = linked
      ? null
      : await this.prisma.accountingContactMatchSuggestion.findFirst({
          where: {
            ...scope,
            suggestedTradeRelationshipId: relationship.id,
            status: AccountingContactMatchStatus.SUGGESTED,
            // A provider record linked to another customer since the
            // suggestion was made can't be confirmed — don't offer it.
            externalContact: { ignoredAt: null, mappings: { none: { unlinkedAt: null } } },
          },
          include: { externalContact: true },
          orderBy: { confidence: 'desc' },
        });

    return this.build(
      connection,
      mappings.map((m) => ({ ...m, external: m.externalContact })),
      suggestion && { ...suggestion, external: suggestion.externalContact },
      async (contact: ExternalAccountingContact): Promise<AccountingLinkedContact> => ({
        id: contact.id,
        displayName: contact.displayName,
        code: contact.externalContactCode ?? contact.externalAccountNumber,
        email: contact.email,
      }),
    ) as Promise<AccountingCustomerLink>;
  }

  async getProductLink(distributorId: string, productId: string): Promise<AccountingProductLink> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, distributorId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const connection = await this.connections.getCurrentConnection(distributorId);
    if (!connection) return emptyLink();
    const scope = organisationScope(connection);

    const mappings = await this.prisma.productAccountingMapping.findMany({
      where: { ...scope, productId },
      include: { externalProduct: true },
      orderBy: { linkedAt: 'desc' },
    });
    const linked = mappings.some((m) => m.unlinkedAt === null);
    const suggestion = linked
      ? null
      : await this.prisma.accountingProductMatchSuggestion.findFirst({
          where: {
            ...scope,
            suggestedProductId: productId,
            status: AccountingProductMatchStatus.SUGGESTED,
            externalProduct: { ignoredAt: null, mappings: { none: { unlinkedAt: null } } },
          },
          include: { externalProduct: true },
          orderBy: { confidence: 'desc' },
        });

    // Provider tax codes are shown by the provider's own name for them.
    const taxCodes = [
      ...mappings.filter((m) => m.unlinkedAt === null).map((m) => m.externalProduct.taxCode),
      suggestion?.externalProduct.taxCode,
    ].filter((code): code is string => !!code);
    const taxRows = taxCodes.length
      ? await this.prisma.externalAccountingTaxType.findMany({
          where: { ...scope, taxType: { in: taxCodes } },
          select: { taxType: true, displayName: true },
        })
      : [];
    const taxNames = new Map(taxRows.map((t) => [t.taxType, t.displayName]));

    return this.build(
      connection,
      mappings.map((m) => ({ ...m, external: m.externalProduct })),
      suggestion && { ...suggestion, external: suggestion.externalProduct },
      async (item: ExternalAccountingProduct): Promise<AccountingLinkedProduct> => ({
        id: item.id,
        displayName: item.displayName,
        code: item.externalProductCode,
        salesUnitPrice: item.salesUnitPrice?.toString() ?? null,
        taxCode: item.taxCode,
        taxName: item.taxCode ? (taxNames.get(item.taxCode) ?? null) : null,
      }),
    ) as Promise<AccountingProductLink>;
  }

  private async build<TExternal extends ChangeTracked & { displayName: string }, TOut>(
    connection: AccountingConnectionWithOrganisation,
    mappings: MappingRow<TExternal>[],
    suggestion: SuggestionRow<TExternal> | null,
    toExternal: (external: TExternal) => Promise<TOut>,
  ): Promise<AccountingRecordLink<TOut, string>> {
    const users = await this.userNames(mappings.map((m) => m.linkedByUserId));
    const active = mappings.find((m) => m.unlinkedAt === null) ?? null;
    const changed =
      active?.external.changeDetectedAt &&
      (!active.external.changeAcknowledgedAt || active.external.changeAcknowledgedAt < active.external.changeDetectedAt)
        ? active.external.changeDetectedAt
        : null;

    return {
      connection: {
        provider: connection.provider,
        providerName: this.adapters.displayName(connection.provider),
        status: connection.status,
        lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
      },
      link: active && {
        mappingId: active.id,
        matchMethod: active.matchMethod,
        linkedAt: active.linkedAt.toISOString(),
        linkedBy: users.get(active.linkedByUserId) ?? null,
        external: await toExternal(active.external),
      },
      change: changed ? { detectedAt: changed.toISOString() } : null,
      suggestion: suggestion && {
        id: suggestion.id,
        confidence: suggestion.confidence,
        matchMethod: suggestion.matchMethod,
        matchReason: suggestion.matchReason,
        external: await toExternal(suggestion.external),
      },
      history: mappings.map((m) => ({
        externalDisplayName: m.external.displayName,
        matchMethod: m.matchMethod,
        linkedAt: m.linkedAt.toISOString(),
        linkedBy: users.get(m.linkedByUserId) ?? null,
        unlinkedAt: m.unlinkedAt?.toISOString() ?? null,
      })),
    };
  }

  private async userNames(ids: string[]): Promise<Map<string, AccountingRecordLinkUser>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(users.map((u) => [u.id, { name: `${u.firstName} ${u.lastName}`.trim() }]));
  }
}

function emptyLink<TExternal, TMatchMethod>(): AccountingRecordLink<TExternal, TMatchMethod> {
  return { connection: null, link: null, change: null, suggestion: null, history: [] };
}
