import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrganisationType, CartOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';

const cartLineInclude = {
  product: { select: { id: true, name: true, sku: true } },
} as const;

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  async getCart(distributorSlug: string, customerId: string) {
    const distributor = await this.resolveDistributor(distributorSlug);
    const order = await this.findOrCreateDraft(distributor.id, customerId);
    return this.formatCart(order);
  }

  async upsertItem(dto: UpsertCartItemDto, customerId: string) {
    const distributor = await this.resolveDistributor(dto.distributorSlug);
    const order = await this.findOrCreateDraft(distributor.id, customerId);

    if (dto.quantity === 0) {
      await this.prisma.cartOrderLine.deleteMany({
        where: { orderId: order.id, productId: dto.productId },
      });
    } else {
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, distributorId: distributor.id, deletedAt: null },
        select: { price: true },
      });

      if (!product) throw new NotFoundException('Product not found');
      if (product.price === null) {
        throw new UnprocessableEntityException(
          'Product has no price and cannot be added to a cart',
        );
      }

      await this.prisma.cartOrderLine.upsert({
        where: { orderId_productId: { orderId: order.id, productId: dto.productId } },
        create: {
          orderId: order.id,
          productId: dto.productId,
          quantity: dto.quantity,
          unitPrice: product.price,
        },
        update: {
          quantity: dto.quantity,
          unitPrice: product.price,
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

  private async findOrCreateDraft(distributorId: string, customerId: string) {
    return this.prisma.cartOrder.upsert({
      where: { distributorId_customerId_status: { distributorId, customerId, status: CartOrderStatus.DRAFT } },
      create: { distributorId, customerId, status: CartOrderStatus.DRAFT },
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
