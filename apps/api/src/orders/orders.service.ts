import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import {
  OrganisationType,
  CartOrderStatus,
  OrderStatus,
  OrderLineStatus,
  OrderAcceptanceMode,
  AcceptanceModeSource,
  AcceptedByActorType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { DeliveryAvailabilityService } from '../delivery-availability/delivery-availability.service';
import { SubmitOrderDto } from './dto/submit-order.dto';
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
  requestedDeliveryDate: true,
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
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private outbox: OutboxService,
    private deliveryAvailability: DeliveryAvailabilityService,
  ) {}

  async submitOrder(
    dto: SubmitOrderDto,
    placedByUserId: string,
    traderCustomerId: string,
    orderAsSessionToken?: string,
  ) {
    // Resolve distributor
    const distributor = await this.prisma.organisation.findFirst({
      where: { slug: dto.distributorSlug, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: { id: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    // Load cart
    const cart = await this.prisma.cartOrder.findUnique({
      where: {
        distributorId_customerId_userId_status: {
          distributorId: distributor.id,
          customerId: traderCustomerId,
          userId: placedByUserId,
          status: CartOrderStatus.DRAFT,
        },
      },
      include: {
        lines: {
          include: { product: { select: { id: true, name: true, sku: true, price: true } } },
        },
      },
    });

    if (!cart) throw new UnprocessableEntityException('No active cart found for this distributor');
    if (cart.lines.length === 0) throw new UnprocessableEntityException('Cart is empty');

    // Resolve acceptance mode
    const { mode, source } = await this.resolveAcceptanceMode(distributor.id, traderCustomerId);

    // Revalidate requested delivery date against availability
    if (dto.requestedDeliveryDate) {
      const availability = await this.deliveryAvailability.getAvailableDates(distributor.id, traderCustomerId);
      const isAvailable = availability.dates.some((d) => d.date === dto.requestedDeliveryDate);
      if (!isAvailable) {
        throw new UnprocessableEntityException('Requested delivery date is no longer available');
      }
    }

    // Snapshot address from TradeRelationship
    const tradeRel = await this.prisma.tradeRelationship.findUnique({
      where: { distributorId_customerId: { distributorId: distributor.id, customerId: traderCustomerId } },
      select: {
        billingLine1: true, billingLine2: true, billingCity: true,
        billingState: true, billingPostcode: true, billingCountry: true,
        deliveryLine1: true, deliveryLine2: true, deliveryCity: true,
        deliveryState: true, deliveryPostcode: true, deliveryCountry: true,
      },
    });

    const billingAddressSnapshot = tradeRel ? {
      line1: tradeRel.billingLine1, line2: tradeRel.billingLine2,
      city: tradeRel.billingCity, state: tradeRel.billingState,
      postcode: tradeRel.billingPostcode, country: tradeRel.billingCountry,
    } : null;

    const deliveryAddressSnapshot = tradeRel ? {
      line1: tradeRel.deliveryLine1, line2: tradeRel.deliveryLine2,
      city: tradeRel.deliveryCity, state: tradeRel.deliveryState,
      postcode: tradeRel.deliveryPostcode, country: tradeRel.deliveryCountry,
    } : null;

    // Compute totals (tax = 0 for Phase 1)
    const lines = cart.lines.map((line) => {
      const unitPrice = line.unitPrice as { toFixed: (n: number) => string };
      const unit = parseFloat(unitPrice.toFixed(2));
      const subtotal = unit * line.quantity;
      return {
        productId: line.productId,
        skuSnapshot: line.product.sku,
        productNameSnapshot: line.product.name,
        unitPriceSnapshot: new Prisma.Decimal(unit),
        quantityOrdered: line.quantity,
        subtotalAmount: new Prisma.Decimal(subtotal),
        taxAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(subtotal),
        priceListIdSnapshot: line.resolvedPriceListId ?? null,
        priceListRuleIdSnapshot: line.resolvedPriceListRuleId ?? null,
      };
    });

    const subtotalAmount = lines.reduce((s, l) => s + parseFloat(l.subtotalAmount.toString()), 0);
    const taxAmount = 0;
    const totalAmount = subtotalAmount + taxAmount;

    // Generate order number
    const seqResult = await this.prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    const year = new Date().getFullYear();
    const orderNumber = `ORD-${year}-${String(seqResult[0].nextval).padStart(5, '0')}`;

    const isAutoAccept = mode === OrderAcceptanceMode.AUTO_ON_SUBMISSION;
    const now = new Date();

    const order = await this.prisma.$transaction(async (tx) => {
      // Create commercial order
      const newOrder = await tx.order.create({
        data: {
          distributorId: distributor.id,
          traderCustomerId,
          placedByUserId,
          orderNumber,
          ...(orderAsSessionToken && {
            isOrderedByDelegate: true,
            delegateAdminUserId: placedByUserId,
          }),
          currency: 'GBP',
          status: isAutoAccept ? OrderStatus.ACCEPTED : OrderStatus.SUBMITTED,
          acceptanceModeSnapshot: mode,
          acceptanceModeSourceSnapshot: source,
          subtotalAmount: new Prisma.Decimal(subtotalAmount),
          taxAmount: new Prisma.Decimal(taxAmount),
          totalAmount: new Prisma.Decimal(totalAmount),
          billingAddressSnapshot: billingAddressSnapshot ?? Prisma.JsonNull,
          deliveryAddressSnapshot: deliveryAddressSnapshot ?? Prisma.JsonNull,
          requestedDeliveryDate: dto.requestedDeliveryDate ? new Date(dto.requestedDeliveryDate) : null,
          customerReference: dto.customerReference ?? null,
          notes: dto.notes ?? null,
          submittedAt: now,
          ...(isAutoAccept && {
            acceptedAt: now,
            acceptedByActorType: AcceptedByActorType.SYSTEM,
            acceptedByUserId: null,
          }),
        },
        select: orderSelect,
      });

      // Create order lines with snapshots
      await tx.orderLine.createMany({
        data: lines.map((l) => ({
          orderId: newOrder.id,
          distributorId: distributor.id,
          traderCustomerId,
          productId: l.productId,
          productNameSnapshot: l.productNameSnapshot,
          skuSnapshot: l.skuSnapshot,
          quantityOrdered: l.quantityOrdered,
          unitPriceSnapshot: l.unitPriceSnapshot,
          subtotalAmount: l.subtotalAmount,
          taxAmount: l.taxAmount,
          totalAmount: l.totalAmount,
          status: isAutoAccept ? OrderLineStatus.ACCEPTED : OrderLineStatus.SUBMITTED,
        })),
      });

      // Clear cart
      await tx.cartOrderLine.deleteMany({ where: { orderId: cart.id } });
      await tx.cartOrder.delete({ where: { id: cart.id } });

      // End order-as session atomically with order creation
      if (orderAsSessionToken) {
        await tx.orderAsSession.deleteMany({ where: { id: orderAsSessionToken, adminUserId: placedByUserId } });
      }

      // Outbox events
      const basePayload = {
        orderId: newOrder.id,
        distributorId: distributor.id,
        traderCustomerId,
        orderNumber,
        occurredAt: now.toISOString(),
      };

      await this.outbox.writeEvent(tx, 'Order', newOrder.id, 'OrderSubmitted', {
        ...basePayload,
        status: OrderStatus.SUBMITTED,
      });

      if (isAutoAccept) {
        await this.outbox.writeEvent(tx, 'Order', newOrder.id, 'OrderAccepted', {
          ...basePayload,
          status: OrderStatus.ACCEPTED,
          acceptedByActorType: AcceptedByActorType.SYSTEM,
          acceptedByUserId: null,
        });
      }

      return newOrder;
    });

    return this.formatOrder(order);
  }

  async listCustomerOrders(traderCustomerId: string, query: OrderQueryDto) {
    const limit = query.limit ?? 20;
    const take = limit + 1;

    const baseWhere: Prisma.OrderWhereInput = {
      traderCustomerId,
      ...(query.status && { status: query.status }),
    };

    let cursorWhere: Prisma.OrderWhereInput = {};
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
      this.prisma.order.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true, orderNumber: true, status: true, totalAmount: true,
          submittedAt: true, acceptedAt: true, rejectedAt: true, cancelledAt: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.order.count({ where: baseWhere }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString('base64url')
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

  async getCustomerOrder(orderId: string, traderCustomerId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, traderCustomerId },
      select: orderSelect,
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.formatOrder(order);
  }

  async cancelCustomerOrder(orderId: string, traderCustomerId: string, reason: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, traderCustomerId },
      select: { id: true, status: true, distributorId: true, traderCustomerId: true, orderNumber: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.SUBMITTED) {
      throw new UnprocessableEntityException('Only submitted orders can be cancelled by the customer');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: now,
          cancelledByUserId: traderCustomerId,
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
        distributorId: order.distributorId,
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

  private async resolveAcceptanceMode(
    distributorId: string,
    traderCustomerId: string,
  ): Promise<{ mode: OrderAcceptanceMode; source: AcceptanceModeSource }> {
    const rel = await this.prisma.tradeRelationship.findUnique({
      where: { distributorId_customerId: { distributorId, customerId: traderCustomerId } },
      select: { traderCustomerSettings: { select: { orderAcceptanceModeOverride: true } } },
    });

    const customerSettings = rel?.traderCustomerSettings;

    if (customerSettings?.orderAcceptanceModeOverride) {
      return {
        mode: customerSettings.orderAcceptanceModeOverride,
        source: AcceptanceModeSource.TRADER_CUSTOMER_OVERRIDE,
      };
    }

    const distSettings = await this.prisma.distributorSettings.findUnique({
      where: { distributorId },
      select: { defaultOrderAcceptanceMode: true },
    });

    return {
      mode: distSettings?.defaultOrderAcceptanceMode ?? OrderAcceptanceMode.MANUAL,
      source: AcceptanceModeSource.DISTRIBUTOR_DEFAULT,
    };
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
      requestedDeliveryDate: order.requestedDeliveryDate
        ? order.requestedDeliveryDate.toISOString().slice(0, 10)
        : null,
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
