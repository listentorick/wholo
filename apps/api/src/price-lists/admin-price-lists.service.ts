import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, PriceListRuleDiscountBaseType, PriceListRuleSelectorType, PriceListRuleValueType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';
import { PriceListQueryDto } from './dto/price-list-query.dto';
import { CreatePriceListRuleDto } from './dto/create-price-list-rule.dto';
import { UpdatePriceListRuleDto } from './dto/update-price-list-rule.dto';
import { AssignPriceListDto } from './dto/assign-price-list.dto';

interface CursorPayload { createdAt: string; id: string }

const ruleSelect = {
  id: true,
  distributorId: true,
  priceListId: true,
  selectorType: true,
  productId: true,
  productVariantId: true,
  minQuantity: true,
  valueType: true,
  unitPrice: true,
  discountPercentage: true,
  discountBaseType: true,
  basePriceListId: true,
  currency: true,
  sortOrder: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  product: { select: { name: true } },
} as const;

const priceListWithRulesInclude = {
  rules: {
    where: { active: true },
    select: ruleSelect,
    orderBy: [
      { selectorType: 'asc' as const },
      { minQuantity: 'desc' as const },
      { sortOrder: 'asc' as const },
    ],
  },
} satisfies Prisma.PriceListInclude;

@Injectable()
export class AdminPriceListsService {
  constructor(private prisma: PrismaService) {}

  async findAll(distributorId: string, query: PriceListQueryDto) {
    const limit = query.limit ?? 50;
    const take = limit + 1;
    const baseWhere: Prisma.PriceListWhereInput = { distributorId };

    let cursorWhere: Prisma.PriceListWhereInput = {};
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
      this.prisma.priceList.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: { _count: { select: { rules: { where: { active: true } } } } },
      }),
      this.prisma.priceList.count({ where: baseWhere }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, -1) : items;
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ createdAt: data[data.length - 1].createdAt, id: data[data.length - 1].id })).toString('base64url')
      : null;

    return { data: data.map(this.formatPriceList), pagination: { nextCursor, hasMore, total } };
  }

  async findOne(id: string, distributorId: string) {
    const pl = await this.prisma.priceList.findFirst({
      where: { id, distributorId },
      include: priceListWithRulesInclude,
    });
    if (!pl) throw new NotFoundException('Price list not found');
    return this.formatPriceListWithRules(pl);
  }

  async create(distributorId: string, dto: CreatePriceListDto) {
    const pl = await this.prisma.priceList.create({
      data: {
        distributorId,
        name: dto.name,
        description: dto.description,
        currency: dto.currency ?? 'GBP',
      },
      include: priceListWithRulesInclude,
    });
    return this.formatPriceListWithRules(pl);
  }

  async update(id: string, distributorId: string, dto: UpdatePriceListDto) {
    await this.assertOwnership(id, distributorId);
    const pl = await this.prisma.priceList.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      include: priceListWithRulesInclude,
    });
    return this.formatPriceListWithRules(pl);
  }

  async remove(id: string, distributorId: string) {
    await this.assertOwnership(id, distributorId);
    await this.prisma.priceList.update({ where: { id }, data: { active: false } });
  }

  async setDefault(id: string, distributorId: string) {
    await this.assertOwnership(id, distributorId);
    await this.prisma.$transaction([
      this.prisma.priceList.updateMany({ where: { distributorId }, data: { isDefault: false } }),
      this.prisma.priceList.update({ where: { id }, data: { isDefault: true, active: true } }),
    ]);
    return this.findOne(id, distributorId);
  }

  // ── Rules ────────────────────────────────────────────────────────────────────

  async listRules(priceListId: string, distributorId: string) {
    await this.assertOwnership(priceListId, distributorId);
    const rules = await this.prisma.priceListRule.findMany({
      where: { priceListId, active: true },
      select: ruleSelect,
      orderBy: [{ selectorType: 'asc' }, { minQuantity: 'desc' }, { sortOrder: 'asc' }],
    });
    return rules.map(this.formatRule);
  }

  async createRule(priceListId: string, distributorId: string, dto: CreatePriceListRuleDto) {
    await this.assertOwnership(priceListId, distributorId);

    if (dto.selectorType === PriceListRuleSelectorType.PRODUCT && !dto.productId) {
      throw new BadRequestException('productId is required for PRODUCT selector rules');
    }

    const vt = dto.valueType ?? PriceListRuleValueType.FIXED_PRICE;

    if (vt === PriceListRuleValueType.FIXED_PRICE && !dto.unitPrice) {
      throw new BadRequestException('unitPrice is required for FIXED_PRICE rules');
    }
    if (vt === PriceListRuleValueType.PERCENTAGE_DISCOUNT) {
      if (!dto.discountPercentage) {
        throw new BadRequestException('discountPercentage is required for PERCENTAGE_DISCOUNT rules');
      }
      if (!dto.discountBaseType) {
        throw new BadRequestException('discountBaseType is required for PERCENTAGE_DISCOUNT rules');
      }
      if (dto.discountBaseType === PriceListRuleDiscountBaseType.PRICE_LIST && !dto.basePriceListId) {
        throw new BadRequestException('basePriceListId is required when discountBaseType is PRICE_LIST');
      }
      if (dto.basePriceListId) {
        const base = await this.prisma.priceList.findFirst({
          where: { id: dto.basePriceListId, distributorId, active: true },
          select: { id: true },
        });
        if (!base) throw new BadRequestException('basePriceListId not found or not active');
      }
    }

    const rule = await this.prisma.priceListRule.create({
      data: {
        distributorId,
        priceListId,
        selectorType: dto.selectorType,
        productId: dto.productId ?? null,
        productVariantId: dto.productVariantId ?? null,
        minQuantity: dto.minQuantity ?? 1,
        valueType: vt,
        unitPrice: dto.unitPrice ? new Prisma.Decimal(dto.unitPrice) : null,
        discountPercentage: dto.discountPercentage ? new Prisma.Decimal(dto.discountPercentage) : null,
        discountBaseType: dto.discountBaseType ?? null,
        basePriceListId: dto.basePriceListId ?? null,
        currency: dto.currency ?? 'GBP',
        sortOrder: dto.sortOrder ?? 0,
      },
      select: ruleSelect,
    });
    return this.formatRule(rule);
  }

  async updateRule(
    priceListId: string,
    ruleId: string,
    distributorId: string,
    dto: UpdatePriceListRuleDto,
  ) {
    await this.assertRuleOwnership(ruleId, priceListId, distributorId);
    const rule = await this.prisma.priceListRule.update({
      where: { id: ruleId },
      data: {
        ...(dto.minQuantity !== undefined && { minQuantity: dto.minQuantity }),
        ...(dto.unitPrice !== undefined && { unitPrice: new Prisma.Decimal(dto.unitPrice) }),
        ...(dto.discountPercentage !== undefined && { discountPercentage: new Prisma.Decimal(dto.discountPercentage) }),
        ...(dto.discountBaseType !== undefined && { discountBaseType: dto.discountBaseType }),
        ...(dto.basePriceListId !== undefined && { basePriceListId: dto.basePriceListId }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      select: ruleSelect,
    });
    return this.formatRule(rule);
  }

  async removeRule(priceListId: string, ruleId: string, distributorId: string) {
    await this.assertRuleOwnership(ruleId, priceListId, distributorId);
    await this.prisma.priceListRule.update({ where: { id: ruleId }, data: { active: false } });
  }

  // ── Product pricing (cross-pricelist) ────────────────────────────────────────

  async getPricingForProduct(productId: string, distributorId: string) {
    const rules = await this.prisma.priceListRule.findMany({
      where: {
        distributorId,
        active: true,
        priceList: { active: true },
        OR: [
          { selectorType: PriceListRuleSelectorType.PRODUCT, productId },
          { selectorType: PriceListRuleSelectorType.ALL_PRODUCTS },
        ],
      },
      select: {
        ...ruleSelect,
        priceList: { select: { id: true, name: true, currency: true } },
      },
      orderBy: [{ priceListId: 'asc' }, { selectorType: 'asc' }, { minQuantity: 'desc' }],
    });

    return rules.map((r) => ({
      priceListId: r.priceList.id,
      priceListName: r.priceList.name,
      currency: r.priceList.currency,
      rule: this.formatRule(r),
    }));
  }

  // ── Customer price list assignment ────────────────────────────────────────────

  async assignPriceList(tradeRelationshipId: string, distributorId: string, dto: AssignPriceListDto) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id: tradeRelationshipId, distributorId, deletedAt: null },
      select: { id: true },
    });
    if (!rel) throw new NotFoundException('Trade relationship not found');

    if (dto.priceListId !== null) {
      const pl = await this.prisma.priceList.findFirst({
        where: { id: dto.priceListId, distributorId, active: true },
        select: { id: true },
      });
      if (!pl) throw new NotFoundException('Price list not found');
    }

    await this.prisma.traderCustomerSettings.upsert({
      where: { tradeRelationshipId },
      create: { tradeRelationshipId, priceListId: dto.priceListId },
      update: { priceListId: dto.priceListId },
    });

    return { priceListId: dto.priceListId };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async assertOwnership(id: string, distributorId: string) {
    const pl = await this.prisma.priceList.findUnique({ where: { id }, select: { distributorId: true } });
    if (!pl || pl.distributorId !== distributorId) throw new NotFoundException('Price list not found');
  }

  private async assertRuleOwnership(ruleId: string, priceListId: string, distributorId: string) {
    const rule = await this.prisma.priceListRule.findUnique({
      where: { id: ruleId },
      select: { priceListId: true, distributorId: true },
    });
    if (!rule || rule.priceListId !== priceListId || rule.distributorId !== distributorId) {
      throw new NotFoundException('Price list rule not found');
    }
  }

  private formatPriceList(pl: any) {
    return {
      id: pl.id,
      distributorId: pl.distributorId,
      name: pl.name,
      description: pl.description,
      currency: pl.currency,
      isDefault: pl.isDefault,
      active: pl.active,
      _count: pl._count,
      createdAt: pl.createdAt.toISOString(),
      updatedAt: pl.updatedAt.toISOString(),
    };
  }

  private formatPriceListWithRules(pl: any) {
    return {
      ...this.formatPriceList(pl),
      rules: pl.rules?.map(this.formatRule) ?? [],
    };
  }

  private formatRule(rule: any) {
    const toFixed2 = (v: unknown) =>
      v != null && typeof v === 'object' && 'toFixed' in (v as object)
        ? (v as { toFixed: (n: number) => string }).toFixed(2)
        : v != null ? String(v) : null;

    return {
      id: rule.id,
      distributorId: rule.distributorId,
      priceListId: rule.priceListId,
      selectorType: rule.selectorType,
      productId: rule.productId,
      productVariantId: rule.productVariantId,
      productName: rule.product?.name ?? null,
      minQuantity: rule.minQuantity,
      valueType: rule.valueType,
      unitPrice: rule.unitPrice != null ? toFixed2(rule.unitPrice) : null,
      discountPercentage: rule.discountPercentage != null ? toFixed2(rule.discountPercentage) : null,
      discountBaseType: rule.discountBaseType ?? null,
      basePriceListId: rule.basePriceListId ?? null,
      currency: rule.currency,
      sortOrder: rule.sortOrder,
      active: rule.active,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }
}
