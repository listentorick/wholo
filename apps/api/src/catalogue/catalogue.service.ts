import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OrganisationType, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogueQueryDto } from './dto/catalogue-query.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

const catalogueProductInclude = {
  productType: { select: { id: true, name: true, code: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class CatalogueService {
  constructor(private prisma: PrismaService) {}

  async getProducts(distributorSlug: string, query: CatalogueQueryDto) {
    const distributor = await this.prisma.organisation.findFirst({
      where: { slug: distributorSlug, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    const limit = query.limit ?? 50;
    const take = limit + 1;

    const baseWhere: Prisma.ProductWhereInput = {
      distributorId: distributor.id,
      status: ProductStatus.ACTIVE,
      deletedAt: null,
      ...(query.productTypeCode && {
        productType: { code: query.productTypeCode },
      }),
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
        include: catalogueProductInclude,
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

    return {
      distributor: { id: distributor.id, name: distributor.name },
      data,
      pagination: { nextCursor, hasMore, total },
    };
  }
}
