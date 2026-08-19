import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryRouteDto } from './dto/create-delivery-route.dto';
import { UpdateDeliveryRouteDto } from './dto/update-delivery-route.dto';
import { DeliveryRouteQueryDto } from './dto/delivery-route-query.dto';
import { AssignRouteCustomerDto } from './dto/assign-route-customer.dto';
import { ReorderRouteCustomersDto } from './dto/reorder-route-customers.dto';

interface CursorPayload { createdAt: string; id: string }

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  addressLine1: true,
  addressCity: true,
  addressPostcode: true,
} satisfies Prisma.OrganisationSelect;

@Injectable()
export class DeliveryRoutesService {
  constructor(private prisma: PrismaService) {}

  async findAll(distributorId: string, query: DeliveryRouteQueryDto) {
    const limit = query.limit ?? 50;
    const take = limit + 1;
    const baseWhere: Prisma.DeliveryRouteWhereInput = {
      distributorId,
      ...(query.active !== undefined && { active: query.active }),
    };

    let cursorWhere: Prisma.DeliveryRouteWhereInput = {};
    if (query.cursor) {
      const decoded: CursorPayload = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
      cursorWhere = {
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.deliveryRoute.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: { _count: { select: { customers: { where: { removedAt: null } } } } },
      }),
      this.prisma.deliveryRoute.count({ where: baseWhere }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, -1) : items;
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ createdAt: data[data.length - 1].createdAt, id: data[data.length - 1].id })).toString('base64url')
      : null;

    return { data: data.map(this.formatSummary), pagination: { nextCursor, hasMore, total } };
  }

  async findOne(id: string, distributorId: string) {
    const route = await this.prisma.deliveryRoute.findFirst({
      where: { id, distributorId },
      include: {
        customers: {
          where: { removedAt: null },
          orderBy: { defaultDropPosition: 'asc' },
          include: { customer: { select: CUSTOMER_SELECT } },
        },
      },
    });
    if (!route) throw new NotFoundException('Delivery route not found');
    return this.formatRoute(route);
  }

  async create(distributorId: string, dto: CreateDeliveryRouteDto) {
    const route = await this.prisma.deliveryRoute.create({
      data: {
        distributorId,
        name: dto.name,
        code: dto.code,
        defaultDriverName: dto.defaultDriverName,
        active: dto.active ?? true,
      },
    });
    return this.formatRoute({ ...route, customers: [] });
  }

  async update(id: string, distributorId: string, dto: UpdateDeliveryRouteDto) {
    await this.assertOwnership(id, distributorId);
    const route = await this.prisma.deliveryRoute.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.defaultDriverName !== undefined && { defaultDriverName: dto.defaultDriverName }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      include: {
        customers: {
          where: { removedAt: null },
          orderBy: { defaultDropPosition: 'asc' },
          include: { customer: { select: CUSTOMER_SELECT } },
        },
      },
    });
    return this.formatRoute(route);
  }

  async remove(id: string, distributorId: string) {
    await this.assertOwnership(id, distributorId);
    await this.prisma.deliveryRoute.update({ where: { id }, data: { active: false } });
  }

  // ── Customer assignment ───────────────────────────────────────────────────────

  async listCustomers(routeId: string, distributorId: string) {
    await this.assertOwnership(routeId, distributorId);
    const customers = await this.prisma.deliveryRouteCustomer.findMany({
      where: { routeId, removedAt: null },
      orderBy: { defaultDropPosition: 'asc' },
      include: { customer: { select: CUSTOMER_SELECT } },
    });
    return customers.map(this.formatRouteCustomer);
  }

  async assignCustomer(routeId: string, distributorId: string, dto: AssignRouteCustomerDto, actorUserId: string) {
    await this.assertOwnership(routeId, distributorId);

    const alreadyRouted = await this.prisma.deliveryRouteCustomer.findFirst({
      where: { activeDistributorCustomerId: `${distributorId}:${dto.customerId}` },
      select: { id: true },
    });
    if (alreadyRouted) {
      throw new BadRequestException('This customer already has an active default route for this distributor');
    }

    const maxPosition = await this.prisma.deliveryRouteCustomer.aggregate({
      where: { routeId, removedAt: null },
      _max: { defaultDropPosition: true },
    });

    try {
      const created = await this.prisma.deliveryRouteCustomer.create({
        data: {
          routeId,
          customerId: dto.customerId,
          defaultDropPosition: (maxPosition._max.defaultDropPosition ?? 0) + 1,
          assignedByUserId: actorUserId,
        },
        include: { customer: { select: CUSTOMER_SELECT } },
      });
      return this.formatRouteCustomer(created);
    } catch (error) {
      // Backstop against the same race the pre-check above narrows but can't
      // close — the DB trigger + unique constraint (ADR-052) is the actual
      // enforcement, this just turns the resulting P2002 into a clean 400.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('This customer already has an active default route for this distributor');
      }
      throw error;
    }
  }

  async removeCustomer(routeId: string, customerId: string, distributorId: string, actorUserId: string) {
    await this.assertOwnership(routeId, distributorId);
    const assignment = await this.prisma.deliveryRouteCustomer.findFirst({
      where: { routeId, customerId, removedAt: null },
    });
    if (!assignment) throw new NotFoundException('Active route assignment not found for this customer');
    await this.prisma.deliveryRouteCustomer.update({
      where: { id: assignment.id },
      data: { removedAt: new Date(), removedByUserId: actorUserId },
    });
  }

  async reorderCustomers(routeId: string, distributorId: string, dto: ReorderRouteCustomersDto) {
    await this.assertOwnership(routeId, distributorId);

    const active = await this.prisma.deliveryRouteCustomer.findMany({
      where: { routeId, removedAt: null },
      select: { id: true, customerId: true },
    });

    const activeCustomerIds = new Set(active.map((a) => a.customerId));
    const providedCustomerIds = new Set(dto.orderedCustomerIds);
    const sameSet = activeCustomerIds.size === providedCustomerIds.size
      && [...activeCustomerIds].every((customerId) => providedCustomerIds.has(customerId));
    if (!sameSet) {
      throw new BadRequestException('orderedCustomerIds must contain exactly the route\'s current active customers');
    }

    const assignmentIdByCustomerId = new Map(active.map((a) => [a.customerId, a.id]));
    await this.prisma.$transaction(
      dto.orderedCustomerIds.map((customerId, index) => this.prisma.deliveryRouteCustomer.update({
        where: { id: assignmentIdByCustomerId.get(customerId)! },
        data: { defaultDropPosition: index + 1 },
      })),
    );

    return this.listCustomers(routeId, distributorId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async assertOwnership(id: string, distributorId: string) {
    const route = await this.prisma.deliveryRoute.findUnique({
      where: { id },
      select: { distributorId: true },
    });
    if (!route || route.distributorId !== distributorId) {
      throw new NotFoundException('Delivery route not found');
    }
  }

  private formatSummary(route: any) {
    return {
      id: route.id,
      distributorId: route.distributorId,
      name: route.name,
      code: route.code,
      defaultDriverName: route.defaultDriverName,
      active: route.active,
      customerCount: route._count?.customers ?? 0,
      createdAt: route.createdAt.toISOString(),
      updatedAt: route.updatedAt.toISOString(),
    };
  }

  private formatRoute(route: any) {
    return {
      id: route.id,
      distributorId: route.distributorId,
      name: route.name,
      code: route.code,
      defaultDriverName: route.defaultDriverName,
      active: route.active,
      customers: (route.customers ?? []).map((rc: any) => this.formatRouteCustomer(rc)),
      createdAt: route.createdAt.toISOString(),
      updatedAt: route.updatedAt.toISOString(),
    };
  }

  private formatRouteCustomer(routeCustomer: any) {
    return {
      id: routeCustomer.id,
      routeId: routeCustomer.routeId,
      customerId: routeCustomer.customerId,
      customerName: routeCustomer.customer?.name,
      deliveryAddress: routeCustomer.customer
        ? {
          addressLine1: routeCustomer.customer.addressLine1,
          addressCity: routeCustomer.customer.addressCity,
          addressPostcode: routeCustomer.customer.addressPostcode,
        }
        : undefined,
      defaultDropPosition: routeCustomer.defaultDropPosition,
      assignedAt: routeCustomer.assignedAt?.toISOString?.(),
    };
  }
}
