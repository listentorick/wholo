import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, OrganisationType, TradeRelationshipStatus, InvitationStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

const relationshipInclude = {
  customer: {
    select: { id: true, name: true, email: true, phone: true },
  },
  invitations: {
    where: { status: InvitationStatus.PENDING },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { id: true, email: true, status: true, expiresAt: true, token: true },
  },
} satisfies Prisma.TradeRelationshipInclude;

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
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
      const decoded: CursorPayload = JSON.parse(
        Buffer.from(query.cursor, 'base64url').toString('utf8'),
      );
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
          JSON.stringify({ createdAt: data[data.length - 1].createdAt, id: data[data.length - 1].id }),
        ).toString('base64url')
      : null;

    return { data: data.map(this.formatCustomer.bind(this)), pagination: { nextCursor, hasMore, total } };
  }

  async findOne(id: string, distributorId: string) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id, distributorId, deletedAt: null },
      include: relationshipInclude,
    });
    if (!rel) throw new NotFoundException('Customer not found');
    return this.formatCustomer(rel);
  }

  async create(distributorId: string, dto: CreateCustomerDto) {
    const portalUrl = this.config.get<string>('PORTAL_URL', 'http://localhost:3010');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const rel = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organisation.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          type: OrganisationType.TRADE_CUSTOMER,
        },
      });

      const relationship = await tx.tradeRelationship.create({
        data: {
          distributorId,
          customerId: org.id,
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
    const inviteUrl = dto.email
      ? `${portalUrl}/accept-invite?token=${token}`
      : null;

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
          ...(dto.creditLimit !== undefined && { creditLimit: dto.creditLimit != null ? new Prisma.Decimal(dto.creditLimit) : null }),
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

  async invite(id: string, distributorId: string) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id, distributorId, deletedAt: null },
      include: { customer: { select: { email: true } } },
    });
    if (!rel) throw new NotFoundException('Customer not found');
    if (!rel.customer.email) throw new BadRequestException('Customer has no email address');

    const portalUrl = this.config.get<string>('PORTAL_URL', 'http://localhost:3010');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.customerInvitation.updateMany({
        where: { tradeRelationshipId: id, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.REVOKED },
      }),
      this.prisma.customerInvitation.create({
        data: {
          tradeRelationshipId: id,
          distributorId,
          email: rel.customer.email,
          token,
          expiresAt,
        },
      }),
    ]);

    return {
      inviteUrl: `${portalUrl}/accept-invite?token=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private formatCustomer(rel: any) {
    const latestInvitation = rel.invitations?.[0] ?? null;
    return {
      id: rel.id,
      organisationId: rel.customerId,
      distributorId: rel.distributorId,
      status: rel.status,
      organisation: rel.customer,
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
      latestInvitation: latestInvitation
        ? { status: latestInvitation.status, email: latestInvitation.email, expiresAt: latestInvitation.expiresAt }
        : null,
      createdAt: rel.createdAt,
      updatedAt: rel.updatedAt,
    };
  }
}
