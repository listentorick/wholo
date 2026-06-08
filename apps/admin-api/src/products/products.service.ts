import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

const productInclude = {
  productType: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(distributorId: string, query: ProductQueryDto) {
    const limit = query.limit ?? 20;
    const take = limit + 1;

    const baseWhere: Prisma.ProductWhereInput = {
      distributorId,
      deletedAt: null,
      ...(query.status && { status: query.status }),
    };

    let cursorWhere: Prisma.ProductWhereInput = {};
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
      this.prisma.product.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: productInclude,
      }),
      this.prisma.product.count({ where: baseWhere }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, -1) : items;

    const nextCursor = hasMore
      ? Buffer.from(
          JSON.stringify({ createdAt: data[data.length - 1].createdAt, id: data[data.length - 1].id }),
        ).toString('base64url')
      : null;

    return { data, pagination: { nextCursor, hasMore, total } };
  }

  async findOne(id: string, distributorId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, distributorId, deletedAt: null },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(distributorId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        distributorId,
        name: dto.name,
        description: dto.description,
        sku: dto.sku || null,
        status: dto.status ?? ProductStatus.DRAFT,
        productTypeId: dto.productTypeId || null,
        supplierId: dto.supplierId || null,
        price: dto.price != null ? new Prisma.Decimal(dto.price) : null,
        compareAtPrice: dto.compareAtPrice != null ? new Prisma.Decimal(dto.compareAtPrice) : null,
      },
      include: productInclude,
    });
  }

  async update(id: string, distributorId: string, dto: UpdateProductDto) {
    await this.assertOwnership(id, distributorId);
    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.sku !== undefined && { sku: dto.sku || null }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.productTypeId !== undefined && { productTypeId: dto.productTypeId || null }),
        ...(dto.supplierId !== undefined && { supplierId: dto.supplierId || null }),
        ...(dto.price !== undefined && { price: dto.price != null ? new Prisma.Decimal(dto.price) : null }),
        ...(dto.compareAtPrice !== undefined && { compareAtPrice: dto.compareAtPrice != null ? new Prisma.Decimal(dto.compareAtPrice) : null }),
      },
      include: productInclude,
    });
  }

  async remove(id: string, distributorId: string) {
    await this.assertOwnership(id, distributorId);
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async assertOwnership(id: string, distributorId: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { distributorId: true, deletedAt: true } });
    if (!product || product.deletedAt) throw new NotFoundException('Product not found');
    if (product.distributorId !== distributorId) throw new ForbiddenException();
  }
}
