import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganisationType, Prisma, TradeRelationshipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { RELATIONSHIP_EVENTS, relationshipEventFields } from '../common/relationship-events';
import { customerPaymentTermFields, customerPaymentTermSelect } from '../payment-terms/customer-payment-term';

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
      ...customerPaymentTermSelect,
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
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private outbox: OutboxService,
  ) {}

  /**
   * The distributor's customer record (base customer + trade information),
   * returned in full to any authorized caller — distributor staff or the
   * customer themselves. Trimming what a given UI actually shows (e.g. hiding
   * creditLimit/notes/pricing from the portal) is a BFF concern, not this
   * service's — see CLAUDE.md's "BFFs shape payloads".
   */
  async getCustomer(distributorId: string, customerId: string) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { distributorId, customerId, deletedAt: null },
      include: relationshipInclude,
    });
    if (!rel) throw new NotFoundException('Customer not found');
    return this.formatCustomer(rel);
  }

  /**
   * Customer-initiated request to connect with a distributor. The unique
   * constraint on [distributorId, customerId] means a second row can never be
   * created for the same pair — a prior relationship is transitioned in place
   * instead, branching on its current status.
   */
  async requestAccess(distributorId: string, customerId: string, recentContact: boolean) {
    const distributor = await this.prisma.organisation.findFirst({
      where: { id: distributorId, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: { id: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tradeRelationship.findUnique({
        where: { distributorId_customerId: { distributorId, customerId } },
        select: { id: true, status: true },
      });

      let rel: { id: string; distributorId: string; customerId: string; status: TradeRelationshipStatus };
      let fromStatus: TradeRelationshipStatus | null;
      if (!existing) {
        rel = await tx.tradeRelationship.create({
          data: {
            distributorId,
            customerId,
            status: TradeRelationshipStatus.PENDING_REQUEST,
            recentContactSelfDeclared: recentContact,
          },
        });
        fromStatus = null;
      } else if (existing.status === TradeRelationshipStatus.INACTIVE) {
        // The only status a customer can self-reactivate from — mirrors "suspended
        // is not customer-reactivatable" by excluding SUSPENDED from this branch.
        // Guarded on the status just read so a concurrent change can't be overwritten.
        const updated = await tx.tradeRelationship.updateMany({
          where: { id: existing.id, status: TradeRelationshipStatus.INACTIVE },
          data: { status: TradeRelationshipStatus.PENDING_REQUEST, recentContactSelfDeclared: recentContact },
        });
        if (updated.count === 0) throw new ConflictException('A relationship with this distributor already exists');
        rel = { id: existing.id, distributorId, customerId, status: TradeRelationshipStatus.PENDING_REQUEST };
        fromStatus = TradeRelationshipStatus.INACTIVE;
      } else if (existing.status === TradeRelationshipStatus.SUSPENDED) {
        throw new ForbiddenException('This relationship is suspended — contact the distributor directly');
      } else {
        // ACTIVE, PENDING_INVITE, PENDING_REQUEST — the UI should never surface
        // the request-access action in these states; this is a defensive
        // server-side guard against a stale client or a replayed request.
        throw new ConflictException('A relationship with this distributor already exists');
      }

      await this.outbox.writeEvent(tx, 'TradeRelationship', rel.id, RELATIONSHIP_EVENTS.accessRequested, {
        ...relationshipEventFields(rel, fromStatus, rel.status),
        recentContactSelfDeclared: recentContact,
      });
    });

    return this.getCustomer(distributorId, customerId);
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
      notes: rel.notes,
      recentContactSelfDeclared: rel.recentContactSelfDeclared,
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
      ...customerPaymentTermFields(rel.traderCustomerSettings),
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
