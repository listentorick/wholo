import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
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
import { MailService } from '../mail/mail.service';
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
    private mail: MailService,
  ) {}

  async findAll(distributorId: string, query: CustomerQueryDto) {
    const limit = query.limit ?? 20;
    const take = limit + 1;

    const baseWhere: Prisma.TradeRelationshipWhereInput = {
      distributorId,
      deletedAt: null,
      ...(query.status && { status: query.status }),
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
    const portalUrl = this.config.get<string>('PORTAL_URL', 'http://localhost:3010');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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
            type: OrganisationType.TRADE_CUSTOMER,
          },
        });
        orgId = org.id;
      }

      const relationship = await tx.tradeRelationship.create({
        data: {
          distributorId,
          customerId: orgId,
          status: TradeRelationshipStatus.PENDING_INVITE,
          accountNumber: dto.accountNumber,
          creditLimit: dto.creditLimit != null ? new Prisma.Decimal(dto.creditLimit) : null,
          paymentTerms: dto.paymentTerms,
          notes: dto.notes,
          deliveryLine1: dto.deliveryLine1,
          deliveryLine2: dto.deliveryLine2,
          deliveryCity: dto.deliveryCity,
          deliveryState: dto.deliveryState,
          deliveryPostcode: dto.deliveryPostcode,
          deliveryCountry: dto.deliveryCountry,
          billingLine1: dto.billingLine1,
          billingLine2: dto.billingLine2,
          billingCity: dto.billingCity,
          billingState: dto.billingState,
          billingPostcode: dto.billingPostcode,
          billingCountry: dto.billingCountry,
        },
      });

      if (dto.email) {
        await tx.customerInvitation.create({
          data: {
            tradeRelationshipId: relationship.id,
            distributorId,
            email: dto.email,
            token,
            expiresAt,
          },
        });
      }

      return tx.tradeRelationship.findUniqueOrThrow({
        where: { id: relationship.id },
        include: relationshipInclude,
      });
    });

    const formatted = this.formatCustomer(rel);
    const inviteUrl = dto.email ? `${portalUrl}/accept-invite?token=${token}` : null;

    // Email is sent only when the distributor explicitly triggers the invite endpoint.
    // Sending automatically on create would confuse trade customers before pricing/catalogues are set up.

    return { ...formatted, inviteUrl };
  }

  async update(id: string, distributorId: string, dto: UpdateCustomerDto) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id, distributorId, deletedAt: null },
      select: { id: true, customerId: true },
    });
    if (!rel) throw new NotFoundException('Customer not found');

    await this.prisma.$transaction([
      this.prisma.organisation.update({
        where: { id: rel.customerId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
        },
      }),
      this.prisma.tradeRelationship.update({
        where: { id },
        data: {
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.accountNumber !== undefined && { accountNumber: dto.accountNumber }),
          ...(dto.creditLimit !== undefined && {
            creditLimit:
              dto.creditLimit != null ? new Prisma.Decimal(dto.creditLimit) : null,
          }),
          ...(dto.paymentTerms !== undefined && { paymentTerms: dto.paymentTerms }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.deliveryLine1 !== undefined && { deliveryLine1: dto.deliveryLine1 }),
          ...(dto.deliveryLine2 !== undefined && { deliveryLine2: dto.deliveryLine2 }),
          ...(dto.deliveryCity !== undefined && { deliveryCity: dto.deliveryCity }),
          ...(dto.deliveryState !== undefined && { deliveryState: dto.deliveryState }),
          ...(dto.deliveryPostcode !== undefined && { deliveryPostcode: dto.deliveryPostcode }),
          ...(dto.deliveryCountry !== undefined && { deliveryCountry: dto.deliveryCountry }),
          ...(dto.billingLine1 !== undefined && { billingLine1: dto.billingLine1 }),
          ...(dto.billingLine2 !== undefined && { billingLine2: dto.billingLine2 }),
          ...(dto.billingCity !== undefined && { billingCity: dto.billingCity }),
          ...(dto.billingState !== undefined && { billingState: dto.billingState }),
          ...(dto.billingPostcode !== undefined && { billingPostcode: dto.billingPostcode }),
          ...(dto.billingCountry !== undefined && { billingCountry: dto.billingCountry }),
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
        customer: { select: { email: true } },
        distributor: { select: { name: true } },
      },
    });
    if (!rel) throw new NotFoundException('Customer not found');

    const target = email || rel.customer.email;
    if (!target) throw new BadRequestException('Customer has no email address');

    const portalUrl = this.config.get<string>('PORTAL_URL', 'http://localhost:3010');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.customerInvitation.updateMany({
        where: { tradeRelationshipId: id, email: target, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.REVOKED },
      }),
      this.prisma.customerInvitation.create({
        data: {
          tradeRelationshipId: id,
          distributorId,
          email: target,
          token,
          expiresAt,
        },
      }),
    ]);

    const inviteUrl = `${portalUrl}/accept-invite?token=${token}`;
    await this.mail.sendInvite(target, rel.distributor.name, inviteUrl);

    return {
      inviteUrl,
      expiresAt: expiresAt.toISOString(),
    };
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
      paymentTerms: rel.paymentTerms,
      notes: rel.notes,
      deliveryLine1: rel.deliveryLine1,
      deliveryLine2: rel.deliveryLine2,
      deliveryCity: rel.deliveryCity,
      deliveryState: rel.deliveryState,
      deliveryPostcode: rel.deliveryPostcode,
      deliveryCountry: rel.deliveryCountry,
      billingLine1: rel.billingLine1,
      billingLine2: rel.billingLine2,
      billingCity: rel.billingCity,
      billingState: rel.billingState,
      billingPostcode: rel.billingPostcode,
      billingCountry: rel.billingCountry,
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
