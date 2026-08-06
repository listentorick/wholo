import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, OrganisationType, CartOrderStatus, TradeRelationshipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PriceResolutionService } from '../price-lists/price-resolution.service';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';
import { calculateLineTax, resolveTaxLabel } from '../common/tax-calculation';

const cartLineInclude = {
  product: { select: { id: true, name: true, sku: true } },
  // Live current name, not a snapshot — cart lines are pre-purchase/mutable,
  // unlike OrderLine's frozen taxTypeNameSnapshot.
  taxType: { select: { name: true } },
} as const;

@Injectable()
export class CartService {
  constructor(
    private prisma: PrismaService,
    private priceResolution: PriceResolutionService,
  ) {}

  async getCart(distributorSlug: string, customerId: string, userId: string) {
    const distributor = await this.resolveDistributor(distributorSlug);
    const order = await this.findDraft(distributor.id, customerId, userId);
    return this.formatCart(order ?? { id: null, lines: [] });
  }

  async upsertItem(dto: UpsertCartItemDto, customerId: string, userId: string, orderAsDistributorId?: string) {
    const distributor = await this.resolveDistributor(dto.distributorSlug);

    const relationship = await this.prisma.tradeRelationship.findFirst({
      where: { distributorId: distributor.id, customerId, status: TradeRelationshipStatus.ACTIVE, deletedAt: null },
      select: { id: true },
    });
    if (!relationship) throw new ForbiddenException('No active trade relationship');

    if (dto.quantity === 0) {
      const existing = await this.findDraft(distributor.id, customerId, userId);
      if (!existing) return this.formatCart({ id: null, lines: [] });

      await this.prisma.cartOrderLine.deleteMany({
        where: { orderId: existing.id, productId: dto.productId },
      });

      const updated = await this.prisma.cartOrder.findUniqueOrThrow({
        where: { id: existing.id },
        include: { lines: { include: cartLineInclude } },
      });
      return this.formatCart(updated);
    }

    const order = await this.findOrCreateDraft(distributor.id, customerId, userId);

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, distributorId: distributor.id, deletedAt: null },
      select: { id: true, price: true, distributorId: true, taxTypeId: true },
    });

    if (!product) throw new NotFoundException('Product not found');

    if (orderAsDistributorId && product.distributorId !== orderAsDistributorId) {
      throw new ForbiddenException('Order-as session is not authorised for this distributor');
    }

    const resolved = await this.priceResolution.resolvePrice(
      distributor.id,
      customerId,
      dto.productId,
      dto.quantity,
    );

    // Fall back to the base product price when no price list rule applies.
    const unitPrice: Prisma.Decimal =
      resolved?.unitPrice ??
      (product.price as Prisma.Decimal | null) ??
      (() => { throw new UnprocessableEntityException('No price available for this product'); })();

    // Resolved once, here, and frozen on the cart line — never re-resolved,
    // same as unitPrice above (ADR-036: stability during checkout).
    if (!product.taxTypeId) {
      throw new UnprocessableEntityException('This product has no tax type configured');
    }
    const taxType = await this.prisma.taxType.findUnique({
      where: { id: product.taxTypeId },
      select: { ratePercentage: true },
    });

    await this.prisma.cartOrderLine.upsert({
      where: { orderId_productId: { orderId: order.id, productId: dto.productId } },
      create: {
        orderId: order.id,
        productId: dto.productId,
        quantity: dto.quantity,
        unitPrice,
        resolvedPriceListId: resolved?.priceListId ?? null,
        resolvedPriceListRuleId: resolved?.priceListRuleId ?? null,
        priceResolvedAt: new Date(),
        taxTypeId: product.taxTypeId,
        taxRateSnapshot: taxType?.ratePercentage ?? null,
      },
      update: {
        quantity: dto.quantity,
        unitPrice,
        resolvedPriceListId: resolved?.priceListId ?? null,
        resolvedPriceListRuleId: resolved?.priceListRuleId ?? null,
        priceResolvedAt: new Date(),
        taxTypeId: product.taxTypeId,
        taxRateSnapshot: taxType?.ratePercentage ?? null,
      },
    });

    const updated = await this.prisma.cartOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { lines: { include: cartLineInclude } },
    });

    return this.formatCart(updated);
  }

  private async resolveDistributor(slug: string) {
    const distributor = await this.prisma.organisation.findFirst({
      where: { slug, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: { id: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');
    return distributor;
  }

  private async findDraft(distributorId: string, customerId: string, userId: string) {
    return this.prisma.cartOrder.findUnique({
      where: { distributorId_customerId_userId_status: { distributorId, customerId, userId, status: CartOrderStatus.DRAFT } },
      include: { lines: { include: cartLineInclude } },
    });
  }

  private async findOrCreateDraft(distributorId: string, customerId: string, userId: string) {
    return this.prisma.cartOrder.upsert({
      where: { distributorId_customerId_userId_status: { distributorId, customerId, userId, status: CartOrderStatus.DRAFT } },
      create: { distributorId, customerId, userId, status: CartOrderStatus.DRAFT },
      update: {},
      include: { lines: { include: cartLineInclude } },
    });
  }

  private formatCart(order: {
    id: string | null;
    lines: Array<{
      productId: string;
      quantity: number;
      unitPrice: Prisma.Decimal | string | null;
      taxRateSnapshot: Prisma.Decimal | string | null;
      product: { id: string; name: string; sku: string | null };
      taxType: { name: string } | null;
    }>;
  }) {
    const dec = (v: Prisma.Decimal | string | null) =>
      typeof v === 'object' && v !== null ? v.toFixed(2) : v == null ? '0.00' : String(v);
    const asDecimal = (v: Prisma.Decimal | string | null) =>
      v == null ? new Prisma.Decimal(0) : v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);

    const items = order.lines.map((line) => {
      const unitPrice = asDecimal(line.unitPrice);
      const taxRate = line.taxRateSnapshot == null ? null : asDecimal(line.taxRateSnapshot);
      const { taxAmount } = calculateLineTax(line.quantity, unitPrice, taxRate);
      return {
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: dec(line.unitPrice),
        taxRatePercentage: dec(line.taxRateSnapshot),
        taxAmount: taxAmount.toFixed(2),
        taxTypeName: line.taxType?.name ?? null,
        product: line.product,
      };
    });

    // Sum already-rounded per-line amounts — never re-round after summing,
    // same rule as OrdersService building Order.taxAmount from its lines.
    const subtotal = items.reduce((sum, item) => sum.plus(new Prisma.Decimal(item.unitPrice).mul(item.quantity)), new Prisma.Decimal(0));
    const taxAmount = items.reduce((sum, item) => sum.plus(new Prisma.Decimal(item.taxAmount)), new Prisma.Decimal(0));

    return {
      orderId: order.id,
      items,
      subtotal: subtotal.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      total: subtotal.plus(taxAmount).toFixed(2),
      taxLabel: resolveTaxLabel(items),
    };
  }
}
