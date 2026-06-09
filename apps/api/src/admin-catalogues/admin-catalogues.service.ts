import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminCatalogueDto } from './dto/create-admin-catalogue.dto';
import { UpdateAdminCatalogueDto } from './dto/update-admin-catalogue.dto';
import { SyncProductsDto } from './dto/sync-products.dto';
import { AdminCatalogueQueryDto } from './dto/catalogue-query.dto';

interface CursorPayload { createdAt: string; id: string }

const catalogueInclude = {
  products: {
    include: {
      product: {
        select: { id: true, name: true, sku: true, status: true, price: true, productType: { select: { id: true, name: true, code: true } } },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: { select: { customers: true } },
} satisfies Prisma.CatalogueInclude;

@Injectable()
export class AdminCataloguesService {
  constructor(private prisma: PrismaService) {}

  async findAll(distributorId: string, query: AdminCatalogueQueryDto) {
    const limit = query.limit ?? 50;
    const take = limit + 1;
    const baseWhere: Prisma.CatalogueWhereInput = { distributorId, deletedAt: null };

    let cursorWhere: Prisma.CatalogueWhereInput = {};
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
      this.prisma.catalogue.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: { _count: { select: { products: true, customers: true } } },
      }),
      this.prisma.catalogue.count({ where: baseWhere }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, -1) : items;
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ createdAt: data[data.length - 1].createdAt, id: data[data.length - 1].id })).toString('base64url')
      : null;

    return { data, pagination: { nextCursor, hasMore, total } };
  }

  async findOne(id: string, distributorId: string) {
    const catalogue = await this.prisma.catalogue.findFirst({
      where: { id, distributorId, deletedAt: null },
      include: catalogueInclude,
    });
    if (!catalogue) throw new NotFoundException('Catalogue not found');
    return catalogue;
  }

  async create(distributorId: string, dto: CreateAdminCatalogueDto) {
    return this.prisma.catalogue.create({
      data: { distributorId, name: dto.name, description: dto.description },
      include: catalogueInclude,
    });
  }

  async update(id: string, distributorId: string, dto: UpdateAdminCatalogueDto) {
    await this.assertOwnership(id, distributorId);
    return this.prisma.catalogue.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      include: catalogueInclude,
    });
  }

  async remove(id: string, distributorId: string) {
    await this.assertOwnership(id, distributorId);
    await this.prisma.catalogue.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async syncProducts(id: string, distributorId: string, dto: SyncProductsDto) {
    await this.assertOwnership(id, distributorId);

    if (dto.productIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: dto.productIds }, distributorId, deletedAt: null },
        select: { id: true },
      });
      if (products.length !== dto.productIds.length) {
        throw new NotFoundException('One or more products not found');
      }
    }

    await this.prisma.$transaction([
      this.prisma.catalogueProduct.deleteMany({ where: { catalogueId: id } }),
      ...(dto.productIds.length > 0
        ? [this.prisma.catalogueProduct.createMany({
            data: dto.productIds.map((productId) => ({ catalogueId: id, productId })),
          })]
        : []),
    ]);

    return this.findOne(id, distributorId);
  }

  // ── Customer assignment ──────────────────────────────────────────────────────

  async getCustomerCatalogues(tradeRelationshipId: string, distributorId: string) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id: tradeRelationshipId, distributorId, deletedAt: null },
      select: { id: true },
    });
    if (!rel) throw new NotFoundException('Customer not found');

    const assignments = await this.prisma.customerCatalogue.findMany({
      where: { tradeRelationshipId },
      include: {
        catalogue: {
          select: { id: true, name: true, description: true, _count: { select: { products: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return assignments.map((a) => a.catalogue);
  }

  async assignCatalogue(tradeRelationshipId: string, distributorId: string, catalogueId: string) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id: tradeRelationshipId, distributorId, deletedAt: null },
      select: { id: true },
    });
    if (!rel) throw new NotFoundException('Customer not found');

    const catalogue = await this.prisma.catalogue.findFirst({
      where: { id: catalogueId, distributorId, deletedAt: null },
      select: { id: true },
    });
    if (!catalogue) throw new NotFoundException('Catalogue not found');

    await this.prisma.customerCatalogue.upsert({
      where: { tradeRelationshipId_catalogueId: { tradeRelationshipId, catalogueId } },
      create: { tradeRelationshipId, catalogueId },
      update: {},
    });
    return this.getCustomerCatalogues(tradeRelationshipId, distributorId);
  }

  async unassignCatalogue(tradeRelationshipId: string, distributorId: string, catalogueId: string) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id: tradeRelationshipId, distributorId, deletedAt: null },
      select: { id: true },
    });
    if (!rel) throw new NotFoundException('Customer not found');
    await this.prisma.customerCatalogue.deleteMany({ where: { tradeRelationshipId, catalogueId } });
  }

  private async assertOwnership(id: string, distributorId: string) {
    const c = await this.prisma.catalogue.findUnique({ where: { id }, select: { distributorId: true, deletedAt: true } });
    if (!c || c.deletedAt) throw new NotFoundException('Catalogue not found');
    if (c.distributorId !== distributorId) throw new NotFoundException('Catalogue not found');
  }
}
