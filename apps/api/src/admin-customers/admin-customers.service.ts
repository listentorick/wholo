import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  OrganisationType,
  TradeRelationshipStatus,
  InvitationStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

const relationshipInclude = {
  customer: {
    select: {
      id: true, name: true, legalName: true, email: true, phone: true,
      addressLine1: true, addressLine2: true, addressCity: true,
      addressState: true, addressPostcode: true, addressCountry: true,
      billingLine1: true, billingLine2: true, billingCity: true,
      billingState: true, billingPostcode: true, billingCountry: true,
    },
  },
  invitations: {
    orderBy: { createdAt: 'desc' as const },
    select: { id: true, email: true, status: true, expiresAt: true, createdAt: true },
  },
  traderCustomerSettings: {
    select: {
      priceListId: true,
      priceList: { select: { id: true, name: true } },
      deliveryProfileId: true,
      deliveryProfile: { select: { id: true, name: true } },
    },
  },
  catalogues: {
    where: { catalogue: { deletedAt: null } },
    select: {
      catalogue: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.TradeRelationshipInclude;

@Injectable()
export class AdminCustomersService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private outbox: OutboxService,
  ) {}

  async findAll(distributorId: string, query: CustomerQueryDto) {
    const limit = query.limit ?? 20;
    const take = limit + 1;

    // priceListId/deliveryProfileId both nest under the same traderCustomerSettings
    // relation — must be merged into one where-object, not spread as two separate
    // `traderCustomerSettings` keys (the second would silently clobber the first).
    const traderSettingsWhere: Prisma.TraderCustomerSettingsWhereInput = {
      ...(query.priceListId?.length && { priceListId: { in: query.priceListId } }),
      ...(query.deliveryProfileId?.length && { deliveryProfileId: { in: query.deliveryProfileId } }),
    };

    const baseWhere: Prisma.TradeRelationshipWhereInput = {
      distributorId,
      deletedAt: null,
      ...(query.status?.length && { status: { in: query.status } }),
      ...(Object.keys(traderSettingsWhere).length > 0 && { traderCustomerSettings: traderSettingsWhere }),
      ...(query.catalogueId?.length && { catalogues: { some: { catalogueId: { in: query.catalogueId } } } }),
    };

    let cursorWhere: Prisma.TradeRelationshipWhereInput = {};
    if (query.cursor) {
      let decoded: CursorPayload;
      try {
        decoded = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
      } catch {
        throw new BadRequestException('Invalid cursor');
      }
      cursorWhere = {
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.tradeRelationship.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: relationshipInclude,
      }),
      this.prisma.tradeRelationship.count({ where: baseWhere }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, -1) : items;
    const nextCursor = hasMore
      ? Buffer.from(
          JSON.stringify({
            createdAt: data[data.length - 1].createdAt,
            id: data[data.length - 1].id,
          }),
        ).toString('base64url')
      : null;

    return {
      data: data.map(this.formatCustomer.bind(this)),
      pagination: { nextCursor, hasMore, total },
    };
  }

  async findOne(id: string, distributorId: string) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id, distributorId, deletedAt: null },
      include: relationshipInclude,
    });
    if (!rel) throw new NotFoundException('Customer not found');
    return this.formatCustomer(rel);
  }

  async searchOrganisations(distributorId: string, q: string, limit = 10) {
    const orgs = await this.prisma.organisation.findMany({
      where: {
        type: OrganisationType.TRADE_CUSTOMER,
        deletedAt: null,
        name: { contains: q, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        addressLine1: true,
        addressLine2: true,
        addressCity: true,
        addressState: true,
        addressPostcode: true,
        addressCountry: true,
        _count: {
          select: {
            tradeRelationshipsAsCustomer: { where: { distributorId, deletedAt: null } },
          },
        },
      },
      take: limit,
      orderBy: { name: 'asc' },
    });

    return orgs.map(({ _count, ...org }) => ({
      ...org,
      isExistingCustomer: _count.tradeRelationshipsAsCustomer > 0,
    }));
  }

  async create(distributorId: string, dto: CreateCustomerDto) {
    const distributor = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: distributorId },
      select: { name: true },
    });

    const rel = await this.prisma.$transaction(async (tx) => {
      let orgId: string;

      if (dto.organisationId) {
        const existing = await tx.organisation.findFirst({
          where: { id: dto.organisationId, type: OrganisationType.TRADE_CUSTOMER, deletedAt: null },
        });
        if (!existing) throw new NotFoundException('Organisation not found');

        const existingRel = await tx.tradeRelationship.findUnique({
          where: { distributorId_customerId: { distributorId, customerId: dto.organisationId } },
        });
        if (existingRel) throw new ConflictException('A relationship with this customer already exists');

        orgId = dto.organisationId;
      } else {
        if (!dto.name?.trim()) throw new BadRequestException('name is required when not linking to an existing organisation');

        const org = await tx.organisation.create({
          data: {
            name: dto.name,
            legalName: dto.legalName,
            email: dto.email,
            phone: dto.phone,
            addressLine1: dto.addressLine1,
            addressLine2: dto.addressLine2,
            addressCity: dto.addressCity,
            addressState: dto.addressState,
            addressPostcode: dto.addressPostcode,
            addressCountry: dto.addressCountry,
            billingLine1: dto.billingLine1,
            billingLine2: dto.billingLine2,
            billingCity: dto.billingCity,
            billingState: dto.billingState,
            billingPostcode: dto.billingPostcode,
            billingCountry: dto.billingCountry,
            type: OrganisationType.TRADE_CUSTOMER,
          },
        });
        orgId = org.id;
      }

      if (dto.accountNumber) {
        const conflict = await tx.tradeRelationship.findFirst({
          where: { distributorId, accountNumber: dto.accountNumber, deletedAt: null },
          select: { id: true },
        });
        if (conflict) {
          throw new ConflictException('This account number is already in use by another customer');
        }
      }

      const relationship = await tx.tradeRelationship.create({
        data: {
          distributorId,
          customerId: orgId,
          status: TradeRelationshipStatus.PENDING_INVITE,
          accountNumber: dto.accountNumber,
          creditLimit: dto.creditLimit != null ? new Prisma.Decimal(dto.creditLimit) : null,
          minimumOrderSpend: dto.minimumOrderSpend != null ? new Prisma.Decimal(dto.minimumOrderSpend) : null,
          paymentTerms: dto.paymentTerms,
          notes: dto.notes,
          deliveryLine1: dto.deliveryLine1,
          deliveryLine2: dto.deliveryLine2,
          deliveryCity: dto.deliveryCity,
          deliveryState: dto.deliveryState,
          deliveryPostcode: dto.deliveryPostcode,
          deliveryCountry: dto.deliveryCountry,
        },
      });

      return tx.tradeRelationship.findUniqueOrThrow({
        where: { id: relationship.id },
        include: relationshipInclude,
      });
    });

    // Email is persisted here but never triggers an invitation — that only
    // happens when the distributor explicitly calls the invite endpoint,
    // which keeps trade customers from being invited before pricing/catalogues
    // are set up (and lets contact-import populate email without inviting anyone).
    return this.formatCustomer(rel);
  }

  async update(id: string, distributorId: string, dto: UpdateCustomerDto) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id, distributorId, deletedAt: null },
      select: { id: true, customerId: true },
    });
    if (!rel) throw new NotFoundException('Customer not found');

    if (dto.accountNumber) {
      const conflict = await this.prisma.tradeRelationship.findFirst({
        where: { distributorId, accountNumber: dto.accountNumber, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictException('This account number is already in use by another customer');
      }
    }

    await this.prisma.$transaction([
      this.prisma.organisation.update({
        where: { id: rel.customerId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.billingLine1 !== undefined && { billingLine1: dto.billingLine1 }),
          ...(dto.billingLine2 !== undefined && { billingLine2: dto.billingLine2 }),
          ...(dto.billingCity !== undefined && { billingCity: dto.billingCity }),
          ...(dto.billingState !== undefined && { billingState: dto.billingState }),
          ...(dto.billingPostcode !== undefined && { billingPostcode: dto.billingPostcode }),
          ...(dto.billingCountry !== undefined && { billingCountry: dto.billingCountry }),
        },
      }),
      this.prisma.tradeRelationship.update({
        where: { id },
        data: {
          ...(dto.accountNumber !== undefined && { accountNumber: dto.accountNumber }),
          ...(dto.creditLimit !== undefined && {
            creditLimit:
              dto.creditLimit != null ? new Prisma.Decimal(dto.creditLimit) : null,
          }),
          ...(dto.minimumOrderSpend !== undefined && {
            minimumOrderSpend:
              dto.minimumOrderSpend != null ? new Prisma.Decimal(dto.minimumOrderSpend) : null,
          }),
          ...(dto.paymentTerms !== undefined && { paymentTerms: dto.paymentTerms }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.deliveryLine1 !== undefined && { deliveryLine1: dto.deliveryLine1 }),
          ...(dto.deliveryLine2 !== undefined && { deliveryLine2: dto.deliveryLine2 }),
          ...(dto.deliveryCity !== undefined && { deliveryCity: dto.deliveryCity }),
          ...(dto.deliveryState !== undefined && { deliveryState: dto.deliveryState }),
          ...(dto.deliveryPostcode !== undefined && { deliveryPostcode: dto.deliveryPostcode }),
          ...(dto.deliveryCountry !== undefined && { deliveryCountry: dto.deliveryCountry }),
        },
      }),
    ]);

    return this.findOne(id, distributorId);
  }

  async remove(id: string, distributorId: string) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id, distributorId, deletedAt: null },
      select: { id: true },
    });
    if (!rel) throw new NotFoundException('Customer not found');
    await this.prisma.tradeRelationship.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async invite(id: string, distributorId: string, email?: string) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id, distributorId, deletedAt: null },
      include: {
        customer: { select: { email: true, name: true } },
        distributor: { select: { name: true, email: true, phone: true } },
      },
    });
    if (!rel) throw new NotFoundException('Customer not found');

    const target = email || rel.customer.email;
    if (!target) throw new BadRequestException('Customer has no email address');

    const portalUrl = this.config.get<string>('PORTAL_URL', 'http://localhost:3010');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const inviteUrl = `${portalUrl}/accept-invite?token=${token}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.customerInvitation.updateMany({
        where: { tradeRelationshipId: id, email: target, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.REVOKED },
      });

      const invitation = await tx.customerInvitation.create({
        data: {
          tradeRelationshipId: id,
          distributorId,
          email: target,
          token,
          expiresAt,
        },
      });

      // Sending is async from here — see CustomerInviteNotificationService
      // (NOTIFICATIONS_QUEUE, routed via EVENT_ROUTES['CustomerInviteSent']).
      await this.outbox.writeEvent(tx, 'CustomerInvitation', invitation.id, 'CustomerInviteSent', {
        invitationId: invitation.id,
        distributorId,
        email: target,
        distributorName: rel.distributor.name,
        distributorEmail: rel.distributor.email,
        distributorPhone: rel.distributor.phone,
        customerName: rel.customer.name,
        inviteUrl,
        expiresAt: expiresAt.toISOString(),
      });
    });

    return {
      inviteUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async acceptRequest(id: string, distributorId: string) {
    return this.transitionStatus(
      id, distributorId,
      TradeRelationshipStatus.PENDING_REQUEST, TradeRelationshipStatus.ACTIVE,
      'TradeRelationshipRequestAccepted',
    );
  }

  async declineRequest(id: string, distributorId: string) {
    // INACTIVE, not a hard delete — the customer can request again later
    // (see the portal's requestAccess, which re-allows a request from INACTIVE).
    return this.transitionStatus(
      id, distributorId,
      TradeRelationshipStatus.PENDING_REQUEST, TradeRelationshipStatus.INACTIVE,
      'TradeRelationshipRequestDeclined',
    );
  }

  async suspend(id: string, distributorId: string) {
    return this.transitionStatus(
      id, distributorId,
      TradeRelationshipStatus.ACTIVE, TradeRelationshipStatus.SUSPENDED,
      'TradeRelationshipSuspended',
    );
  }

  async unsuspend(id: string, distributorId: string) {
    return this.transitionStatus(
      id, distributorId,
      TradeRelationshipStatus.SUSPENDED, TradeRelationshipStatus.ACTIVE,
      'TradeRelationshipUnsuspended',
    );
  }

  // Admin-initiated activation from the new-customer wizard, bypassing actual
  // invite acceptance — the distributor is vouching for the customer directly
  // (e.g. a known contact onboarded by phone), not the customer verifying
  // their own email. A different trust model than acceptRequest above, so it
  // gets its own endpoint/event rather than reusing "accepted".
  async activate(id: string, distributorId: string) {
    return this.transitionStatus(
      id, distributorId,
      TradeRelationshipStatus.PENDING_INVITE, TradeRelationshipStatus.ACTIVE,
      'TradeRelationshipActivated',
    );
  }

  /**
   * Shared engine for the four admin-triggered status transitions above. The
   * update is guarded by `status: from` inside the transaction (not a naive
   * pre-check-then-update) so two concurrent actions on the same relationship
   * can't both succeed — the loser gets a 422 instead of silently clobbering
   * the winner's change (admin-orders' accept/reject/cancel has this exact
   * unguarded race; not repeating it here).
   */
  private async transitionStatus(
    id: string,
    distributorId: string,
    from: TradeRelationshipStatus,
    to: TradeRelationshipStatus,
    eventType: string,
  ) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id, distributorId, deletedAt: null },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        distributor: { select: { name: true, slug: true } },
      },
    });
    if (!rel) throw new NotFoundException('Customer not found');

    // No portal link while suspended — nothing to browse. Otherwise, the
    // distributor's storefront (slug should always be set for a distributor
    // in practice, but there's no DB constraint enforcing that — fall back
    // to no link rather than a broken one).
    const portalUrl =
      to === TradeRelationshipStatus.SUSPENDED || !rel.distributor.slug
        ? null
        : `${this.config.get<string>('PORTAL_URL', 'http://localhost:3010')}/${rel.distributor.slug}`;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tradeRelationship.updateMany({
        where: { id, distributorId, status: from },
        data: { status: to },
      });
      if (updated.count === 0) {
        throw new UnprocessableEntityException(`Customer must be ${from} for this action`);
      }

      await this.outbox.writeEvent(tx, 'TradeRelationship', id, eventType, {
        relationshipId: id,
        distributorId,
        customerId: rel.customerId,
        customerName: rel.customer.name,
        customerEmail: rel.customer.email,
        distributorName: rel.distributor.name,
        portalUrl,
      });
    });

    return this.findOne(id, distributorId);
  }

  private formatCustomer(rel: any) {
    return {
      id: rel.id,
      organisationId: rel.customerId,
      distributorId: rel.distributorId,
      status: rel.status,
      organisation: {
        id: rel.customer.id,
        name: rel.customer.name,
        legalName: rel.customer.legalName ?? null,
        email: rel.customer.email ?? null,
        phone: rel.customer.phone ?? null,
        addressLine1: rel.customer.addressLine1 ?? null,
        addressLine2: rel.customer.addressLine2 ?? null,
        addressCity: rel.customer.addressCity ?? null,
        addressState: rel.customer.addressState ?? null,
        addressPostcode: rel.customer.addressPostcode ?? null,
        addressCountry: rel.customer.addressCountry ?? null,
      },
      accountNumber: rel.accountNumber,
      creditLimit: rel.creditLimit,
      minimumOrderSpend: rel.minimumOrderSpend,
      paymentTerms: rel.paymentTerms,
      notes: rel.notes,
      deliveryLine1: rel.deliveryLine1,
      deliveryLine2: rel.deliveryLine2,
      deliveryCity: rel.deliveryCity,
      deliveryState: rel.deliveryState,
      deliveryPostcode: rel.deliveryPostcode,
      deliveryCountry: rel.deliveryCountry,
      billingLine1: rel.customer.billingLine1 ?? null,
      billingLine2: rel.customer.billingLine2 ?? null,
      billingCity: rel.customer.billingCity ?? null,
      billingState: rel.customer.billingState ?? null,
      billingPostcode: rel.customer.billingPostcode ?? null,
      billingCountry: rel.customer.billingCountry ?? null,
      priceListId: rel.traderCustomerSettings?.priceListId ?? null,
      priceList: rel.traderCustomerSettings?.priceList ?? null,
      deliveryProfileId: rel.traderCustomerSettings?.deliveryProfileId ?? null,
      deliveryProfile: rel.traderCustomerSettings?.deliveryProfile ?? null,
      catalogues: (rel.catalogues ?? []).map((cc: any) => cc.catalogue),
      invitations: (rel.invitations ?? []).map((inv: any) => ({
        id: inv.id,
        email: inv.email,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      })),
      createdAt: rel.createdAt,
      updatedAt: rel.updatedAt,
    };
  }
}
