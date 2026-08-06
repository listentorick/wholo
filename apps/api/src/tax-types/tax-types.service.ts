import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaxType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaxTypeDto } from './dto/create-tax-type.dto';
import { UpdateTaxTypeDto } from './dto/update-tax-type.dto';
import { TaxTypeQueryDto } from './dto/tax-type-query.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

@Injectable()
export class TaxTypesService {
  constructor(private prisma: PrismaService) {}

  async findAll(distributorId: string, query: TaxTypeQueryDto) {
    const limit = query.limit ?? 50;
    const take = limit + 1;
    const baseWhere: Prisma.TaxTypeWhereInput = { distributorId };

    let cursorWhere: Prisma.TaxTypeWhereInput = {};
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
      this.prisma.taxType.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      }),
      this.prisma.taxType.count({ where: baseWhere }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, -1) : items;
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ createdAt: data[data.length - 1].createdAt, id: data[data.length - 1].id })).toString(
          'base64url',
        )
      : null;

    return { data: data.map(this.format), pagination: { nextCursor, hasMore, total } };
  }

  async findOne(id: string, distributorId: string) {
    const taxType = await this.prisma.taxType.findFirst({ where: { id, distributorId } });
    if (!taxType) throw new NotFoundException('Tax type not found');
    return this.format(taxType);
  }

  async create(distributorId: string, dto: CreateTaxTypeDto) {
    const taxType = await this.prisma.taxType.create({
      data: {
        distributorId,
        name: dto.name,
        classification: dto.classification,
        ratePercentage: new Prisma.Decimal(dto.ratePercentage),
        active: dto.active ?? true,
      },
    });
    return this.format(taxType);
  }

  async update(id: string, distributorId: string, dto: UpdateTaxTypeDto) {
    await this.assertOwnership(id, distributorId);
    const taxType = await this.prisma.taxType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.classification !== undefined && { classification: dto.classification }),
        ...(dto.ratePercentage !== undefined && { ratePercentage: new Prisma.Decimal(dto.ratePercentage) }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });
    return this.format(taxType);
  }

  // Soft "delete" only — a TaxType may be referenced by historical order-line
  // snapshots (Phase 2) and by Product.taxTypeId, so it's never hard-deleted.
  async deactivate(id: string, distributorId: string) {
    await this.assertOwnership(id, distributorId);
    const taxType = await this.prisma.taxType.update({ where: { id }, data: { active: false } });
    return this.format(taxType);
  }

  private async assertOwnership(id: string, distributorId: string) {
    const taxType = await this.prisma.taxType.findUnique({ where: { id }, select: { distributorId: true } });
    if (!taxType || taxType.distributorId !== distributorId) throw new NotFoundException('Tax type not found');
  }

  private format(taxType: TaxType) {
    return {
      id: taxType.id,
      distributorId: taxType.distributorId,
      name: taxType.name,
      classification: taxType.classification,
      ratePercentage: taxType.ratePercentage.toFixed(2),
      active: taxType.active,
      isDefault: taxType.isDefault,
      createdAt: taxType.createdAt.toISOString(),
      updatedAt: taxType.updatedAt.toISOString(),
    };
  }
}
