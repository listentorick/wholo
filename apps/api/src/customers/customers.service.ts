import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganisationType, TradeRelationshipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  /**
   * The distributor's customer record (base customer + trade information) as
   * visible to the customer principal — the distributor's working data
   * (notes, credit, pricing/catalogue wiring, invitations) is never selected.
   */
  async getSelfView(distributorId: string, customerId: string) {
    const distributor = await this.prisma.organisation.findFirst({
      where: { id: distributorId, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: { id: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { distributorId, customerId, deletedAt: null },
      select: {
        id: true,
        distributorId: true,
        customerId: true,
        status: true,
        accountNumber: true,
        minimumOrderSpend: true,
        paymentTerms: true,
        recentContactSelfDeclared: true,
        deliveryLine1: true,
        deliveryLine2: true,
        deliveryCity: true,
        deliveryState: true,
        deliveryPostcode: true,
        deliveryCountry: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: {
            id: true, name: true, legalName: true, email: true, phone: true,
            addressLine1: true, addressLine2: true, addressCity: true,
            addressState: true, addressPostcode: true, addressCountry: true,
            billingLine1: true, billingLine2: true, billingCity: true,
            billingState: true, billingPostcode: true, billingCountry: true,
          },
        },
      },
    });
    if (!rel) throw new NotFoundException('Customer not found');

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
      minimumOrderSpend: rel.minimumOrderSpend,
      paymentTerms: rel.paymentTerms,
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
      createdAt: rel.createdAt,
      updatedAt: rel.updatedAt,
    };
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

    const existing = await this.prisma.tradeRelationship.findUnique({
      where: { distributorId_customerId: { distributorId, customerId } },
      select: { id: true, status: true },
    });

    if (!existing) {
      await this.prisma.tradeRelationship.create({
        data: {
          distributorId,
          customerId,
          status: TradeRelationshipStatus.PENDING_REQUEST,
          recentContactSelfDeclared: recentContact,
        },
      });
    } else if (existing.status === TradeRelationshipStatus.INACTIVE) {
      // The only status a customer can self-reactivate from — mirrors "suspended
      // is not customer-reactivatable" by excluding SUSPENDED from this branch.
      await this.prisma.tradeRelationship.update({
        where: { id: existing.id },
        data: { status: TradeRelationshipStatus.PENDING_REQUEST, recentContactSelfDeclared: recentContact },
      });
    } else if (existing.status === TradeRelationshipStatus.SUSPENDED) {
      throw new ForbiddenException('This relationship is suspended — contact the distributor directly');
    } else {
      // ACTIVE, PENDING_INVITE, PENDING_REQUEST — the UI should never surface
      // the request-access action in these states; this is a defensive
      // server-side guard against a stale client or a replayed request.
      throw new ConflictException('A relationship with this distributor already exists');
    }

    return this.getSelfView(distributorId, customerId);
  }
}
