import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, OrganisationType, CartOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PriceResolutionService } from '../price-lists/price-resolution.service';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';

const cartLineInclude = {
  product: { select: { id: true, name: true, sku: true } },
} as const;

@Injectable()
export class CartService {
  constructor(
    private prisma: PrismaService,
    private priceResolution: PriceResolutionService,
  ) {}

  async getCart(distributorSlug: string, customerId: string, userId: string) {
    const distributor = await this.resolveDistributor(distributorSlug);
    const order = await this.findOrCreateDraft(distributor.id, customerId, userId);
    return this.formatCart(order);
  }

  async upsertItem(dto: UpsertCartItemDto, customerId: string, userId: string) {
    const distributor = await this.resolveDistributor(dto.distributorSlug);
    const order = await this.findOrCreateDraft(distributor.id, customerId, userId);

    if (dto.quantity === 0) {
      await this.prisma.cartOrderLine.deleteMany({
        where: { orderId: order.id, productId: dto.productId },
      });
    } else {
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, distributorId: distributor.id, deletedAt: null },
        select: { id: true, price: true },
      });

      if (!product) throw new NotFoundException('Product not found');

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
        },
        update: {
          quantity: dto.quantity,
          unitPrice,
          resolvedPriceListId: resolved?.priceListId ?? null,
          resolvedPriceListRuleId: resolved?.priceListRuleId ?? null,
          priceResolvedAt: new Date(),
        },
      });
    }

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

  private async findOrCreateDraft(distributorId: string, customerId: string, userId: string) {
    return this.prisma.cartOrder.upsert({
      where: { distributorId_customerId_userId_status: { distributorId, customerId, userId, status: CartOrderStatus.DRAFT } },
      create: { distributorId, customerId, userId, status: CartOrderStatus.DRAFT },
      update: {},
      include: { lines: { include: cartLineInclude } },
    });
  }

  private formatCart(order: {
    id: string;
    lines: Array<{
      productId: string;
      quantity: number;
      unitPrice: { toFixed: (n: number) => string } | string | null;
      product: { id: string; name: string; sku: string | null };
    }>;
  }) {
    return {
      orderId: order.id,
      items: order.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: typeof line.unitPrice === 'object' && line.unitPrice !== null
          ? (line.unitPrice as { toFixed: (n: number) => string }).toFixed(2)
          : String(line.unitPrice),
        product: line.product,
      })),
    };
  }
}
