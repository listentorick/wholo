import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import {
  OrderStatus,
  OrderLineStatus,
  AcceptedByActorType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { OrderQueryDto } from './dto/order-query.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

const orderLineSelect = {
  id: true,
  orderId: true,
  distributorId: true,
  traderCustomerId: true,
  productId: true,
  productVariantId: true,
  skuSnapshot: true,
  productNameSnapshot: true,
  unitOfMeasureSnapshot: true,
  quantityOrdered: true,
  unitPriceSnapshot: true,
  taxRateSnapshot: true,
  subtotalAmount: true,
  taxAmount: true,
  totalAmount: true,
  priceListIdSnapshot: true,
  priceListRuleIdSnapshot: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const orderSelect = {
  id: true,
  orderNumber: true,
  distributorId: true,
  traderCustomerId: true,
  placedByUserId: true,
  status: true,
  currency: true,
  subtotalAmount: true,
  taxAmount: true,
  totalAmount: true,
  billingAddressSnapshot: true,
  deliveryAddressSnapshot: true,
  customerReference: true,
  notes: true,
  acceptanceModeSnapshot: true,
  acceptanceModeSourceSnapshot: true,
  submittedAt: true,
  acceptedAt: true,
  acceptedByActorType: true,
  acceptedByUserId: true,
  rejectedAt: true,
  rejectedByUserId: true,
  rejectionReason: true,
  cancelledAt: true,
  cancelledByUserId: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true } },
  lines: { select: orderLineSelect },
} satisfies Prisma.OrderSelect;

@Injectable()
export class AdminOrdersService {
  constructor(
    private prisma: PrismaService,
    private outbox: OutboxService,
  ) {}

  async listOrders(distributorId: string, query: OrderQueryDto) {
    const limit = query.limit ?? 20;
    const take = limit + 1;

    const baseWhere: Prisma.OrderWhereInput = {
      distributorId,
      ...(query.status && { status: query.status }),
    };

    let cursorWhere: Prisma.OrderWhereInput = {};
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
      this.prisma.order.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          submittedAt: true,
          acceptedAt: true,
          rejectedAt: true,
          cancelledAt: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.order.count({ where: baseWhere }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const last = data[data.length - 1];
    const nextCursor =
      hasMore && last
        ? Buffer.from(
            JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
          ).toString('base64url')
        : null;

    return {
      data: data.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalAmount: (o.totalAmount as { toFixed: (n: number) => string }).toFixed(2),
        traderCustomerName: o.customer?.name ?? '',
        submittedAt: o.submittedAt?.toISOString() ?? null,
        acceptedAt: o.acceptedAt?.toISOString() ?? null,
        rejectedAt: o.rejectedAt?.toISOString() ?? null,
        cancelledAt: o.cancelledAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
      pagination: { nextCursor, hasMore, total },
    };
  }

  async getOrder(orderId: string, distributorId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, distributorId },
      select: orderSelect,
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.formatOrder(order);
  }

  async acceptOrder(orderId: string, distributorId: string, acceptedByUserId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, distributorId },
      select: { id: true, status: true, traderCustomerId: true, orderNumber: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.SUBMITTED) {
      throw new UnprocessableEntityException('Only submitted orders can be accepted');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.ACCEPTED,
          acceptedAt: now,
          acceptedByActorType: AcceptedByActorType.USER,
          acceptedByUserId,
        },
        select: orderSelect,
      });
      await tx.orderLine.updateMany({
        where: { orderId },
        data: { status: OrderLineStatus.ACCEPTED },
      });
      await this.outbox.writeEvent(tx, 'Order', orderId, 'OrderAccepted', {
        orderId,
        distributorId,
        traderCustomerId: order.traderCustomerId,
        orderNumber: order.orderNumber,
        status: OrderStatus.ACCEPTED,
        acceptedByActorType: AcceptedByActorType.USER,
        acceptedByUserId,
        occurredAt: now.toISOString(),
      });
      return u;
    });

    return this.formatOrder(updated);
  }

  async rejectOrder(
    orderId: string,
    distributorId: string,
    rejectedByUserId: string,
    reason: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, distributorId },
      select: { id: true, status: true, traderCustomerId: true, orderNumber: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.SUBMITTED) {
      throw new UnprocessableEntityException('Only submitted orders can be rejected');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.REJECTED,
          rejectedAt: now,
          rejectedByUserId,
          rejectionReason: reason,
        },
        select: orderSelect,
      });
      await tx.orderLine.updateMany({
        where: { orderId },
        data: { status: OrderLineStatus.REJECTED },
      });
      await this.outbox.writeEvent(tx, 'Order', orderId, 'OrderRejected', {
        orderId,
        distributorId,
        traderCustomerId: order.traderCustomerId,
        orderNumber: order.orderNumber,
        status: OrderStatus.REJECTED,
        rejectionReason: reason,
        occurredAt: now.toISOString(),
      });
      return u;
    });

    return this.formatOrder(updated);
  }

  async cancelOrder(
    orderId: string,
    distributorId: string,
    cancelledByUserId: string,
    reason: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, distributorId },
      select: { id: true, status: true, traderCustomerId: true, orderNumber: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const cancellableStatuses: OrderStatus[] = [OrderStatus.SUBMITTED, OrderStatus.ACCEPTED];
    if (!cancellableStatuses.includes(order.status)) {
      throw new UnprocessableEntityException('Only submitted or accepted orders can be cancelled');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: now,
          cancelledByUserId,
          cancellationReason: reason,
        },
        select: orderSelect,
      });
      await tx.orderLine.updateMany({
        where: { orderId },
        data: { status: OrderLineStatus.CANCELLED },
      });
      await this.outbox.writeEvent(tx, 'Order', orderId, 'OrderCancelled', {
        orderId,
        distributorId,
        traderCustomerId: order.traderCustomerId,
        orderNumber: order.orderNumber,
        status: OrderStatus.CANCELLED,
        cancellationReason: reason,
        occurredAt: now.toISOString(),
      });
      return u;
    });

    return this.formatOrder(updated);
  }

  private formatOrder(order: Prisma.OrderGetPayload<{ select: typeof orderSelect }>) {
    const dec = (v: unknown) =>
      typeof v === 'object' && v !== null && 'toFixed' in v
        ? (v as { toFixed: (n: number) => string }).toFixed(2)
        : String(v);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      distributorId: order.distributorId,
      traderCustomerId: order.traderCustomerId,
      placedByUserId: order.placedByUserId,
      status: order.status,
      currency: order.currency,
      subtotalAmount: dec(order.subtotalAmount),
      taxAmount: dec(order.taxAmount),
      totalAmount: dec(order.totalAmount),
      billingAddressSnapshot: order.billingAddressSnapshot as Record<string, unknown> | null,
      deliveryAddressSnapshot: order.deliveryAddressSnapshot as Record<string, unknown> | null,
      customerReference: order.customerReference,
      notes: order.notes,
      acceptanceModeSnapshot: order.acceptanceModeSnapshot,
      acceptanceModeSourceSnapshot: order.acceptanceModeSourceSnapshot,
      submittedAt: order.submittedAt?.toISOString() ?? null,
      acceptedAt: order.acceptedAt?.toISOString() ?? null,
      acceptedByActorType: order.acceptedByActorType,
      acceptedByUserId: order.acceptedByUserId,
      rejectedAt: order.rejectedAt?.toISOString() ?? null,
      rejectedByUserId: order.rejectedByUserId,
      rejectionReason: order.rejectionReason,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      cancelledByUserId: order.cancelledByUserId,
      cancellationReason: order.cancellationReason,
      traderCustomer: order.customer ? { id: order.customer.id, name: order.customer.name } : null,
      lines: order.lines.map((l) => ({
        id: l.id,
        orderId: l.orderId,
        distributorId: l.distributorId,
        traderCustomerId: l.traderCustomerId,
        productId: l.productId,
        productVariantId: l.productVariantId,
        skuSnapshot: l.skuSnapshot,
        productNameSnapshot: l.productNameSnapshot,
        unitOfMeasureSnapshot: l.unitOfMeasureSnapshot,
        quantityOrdered: l.quantityOrdered,
        unitPriceSnapshot: dec(l.unitPriceSnapshot),
        taxRateSnapshot: l.taxRateSnapshot,
        subtotalAmount: dec(l.subtotalAmount),
        taxAmount: dec(l.taxAmount),
        totalAmount: dec(l.totalAmount),
        priceListIdSnapshot: l.priceListIdSnapshot,
        priceListRuleIdSnapshot: l.priceListRuleIdSnapshot,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}
