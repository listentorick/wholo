import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryProfileDto } from './dto/create-delivery-profile.dto';
import { UpdateDeliveryProfileDto } from './dto/update-delivery-profile.dto';
import { CreateCutoffRuleDto } from './dto/create-cutoff-rule.dto';
import { UpdateCutoffRuleDto } from './dto/update-cutoff-rule.dto';
import { AssignDeliveryProfileDto } from './dto/assign-delivery-profile.dto';
import { DeliveryProfileQueryDto } from './dto/delivery-profile-query.dto';

interface CursorPayload { createdAt: string; id: string }

@Injectable()
export class AdminDeliveryProfilesService {
  constructor(private prisma: PrismaService) {}

  async findAll(distributorId: string, query: DeliveryProfileQueryDto) {
    const limit = query.limit ?? 50;
    const take = limit + 1;
    const baseWhere = { distributorId };

    let cursorWhere = {};
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
      this.prisma.deliveryProfile.findMany({
        where: { AND: [baseWhere, cursorWhere] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: { _count: { select: { customerSettings: true } } },
      }),
      this.prisma.deliveryProfile.count({ where: baseWhere }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, -1) : items;
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ createdAt: data[data.length - 1].createdAt, id: data[data.length - 1].id })).toString('base64url')
      : null;

    return { data: data.map(this.formatSummary), pagination: { nextCursor, hasMore, total } };
  }

  async findOne(id: string, distributorId: string) {
    const profile = await this.prisma.deliveryProfile.findFirst({
      where: { id, distributorId },
      include: {
        cutoffRules: { orderBy: { weekday: 'asc' } },
      },
    });
    if (!profile) throw new NotFoundException('Delivery profile not found');
    return this.formatProfile(profile);
  }

  async create(distributorId: string, dto: CreateDeliveryProfileDto) {
    const profile = await this.prisma.deliveryProfile.create({
      data: {
        distributorId,
        name: dto.name,
        active: dto.active ?? true,
        defaultWeekdays: dto.defaultWeekdays ?? [],
        defaultCutoffTime: dto.defaultCutoffTime ?? '17:00',
        defaultCutoffProcessingDays: dto.defaultCutoffProcessingDays ?? 1,
        speciallyEnabledDates: dto.speciallyEnabledDates
          ? dto.speciallyEnabledDates.map((d) => new Date(d))
          : [],
        speciallyDisabledDates: dto.speciallyDisabledDates
          ? dto.speciallyDisabledDates.map((d) => new Date(d))
          : [],
      },
      include: { cutoffRules: { orderBy: { weekday: 'asc' } } },
    });
    return this.formatProfile(profile);
  }

  async update(id: string, distributorId: string, dto: UpdateDeliveryProfileDto) {
    await this.assertOwnership(id, distributorId);
    const profile = await this.prisma.deliveryProfile.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.defaultWeekdays !== undefined && { defaultWeekdays: dto.defaultWeekdays }),
        ...(dto.defaultCutoffTime !== undefined && { defaultCutoffTime: dto.defaultCutoffTime }),
        ...(dto.defaultCutoffProcessingDays !== undefined && { defaultCutoffProcessingDays: dto.defaultCutoffProcessingDays }),
        ...(dto.speciallyEnabledDates !== undefined && {
          speciallyEnabledDates: { set: dto.speciallyEnabledDates.map((d) => new Date(d)) },
        }),
        ...(dto.speciallyDisabledDates !== undefined && {
          speciallyDisabledDates: { set: dto.speciallyDisabledDates.map((d) => new Date(d)) },
        }),
      },
      include: { cutoffRules: { orderBy: { weekday: 'asc' } } },
    });
    return this.formatProfile(profile);
  }

  async remove(id: string, distributorId: string) {
    await this.assertOwnership(id, distributorId);
    await this.prisma.deliveryProfile.update({ where: { id }, data: { active: false } });
  }

  // ── Cutoff Rules ──────────────────────────────────────────────────────────────

  async listCutoffRules(profileId: string, distributorId: string) {
    await this.assertOwnership(profileId, distributorId);
    const rules = await this.prisma.deliveryProfileCutoffRule.findMany({
      where: { deliveryProfileId: profileId },
      orderBy: { weekday: 'asc' },
    });
    return rules.map(this.formatCutoffRule);
  }

  async createCutoffRule(profileId: string, distributorId: string, dto: CreateCutoffRuleDto) {
    await this.assertOwnership(profileId, distributorId);

    const existing = await this.prisma.deliveryProfileCutoffRule.findUnique({
      where: { deliveryProfileId_weekday: { deliveryProfileId: profileId, weekday: dto.weekday } },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(`A cutoff rule for weekday ${dto.weekday} already exists on this profile`);
    }

    const rule = await this.prisma.deliveryProfileCutoffRule.create({
      data: {
        deliveryProfileId: profileId,
        weekday: dto.weekday,
        cutoffTime: dto.cutoffTime,
        processingDaysBeforeDelivery: dto.processingDaysBeforeDelivery,
      },
    });
    return this.formatCutoffRule(rule);
  }

  async updateCutoffRule(
    profileId: string,
    ruleId: string,
    distributorId: string,
    dto: UpdateCutoffRuleDto,
  ) {
    await this.assertRuleOwnership(ruleId, profileId, distributorId);
    const rule = await this.prisma.deliveryProfileCutoffRule.update({
      where: { id: ruleId },
      data: {
        ...(dto.weekday !== undefined && { weekday: dto.weekday }),
        ...(dto.cutoffTime !== undefined && { cutoffTime: dto.cutoffTime }),
        ...(dto.processingDaysBeforeDelivery !== undefined && { processingDaysBeforeDelivery: dto.processingDaysBeforeDelivery }),
      },
    });
    return this.formatCutoffRule(rule);
  }

  async removeCutoffRule(profileId: string, ruleId: string, distributorId: string) {
    await this.assertRuleOwnership(ruleId, profileId, distributorId);
    await this.prisma.deliveryProfileCutoffRule.delete({ where: { id: ruleId } });
  }

  // ── Customer assignment ───────────────────────────────────────────────────────

  async assignDeliveryProfile(
    tradeRelationshipId: string,
    distributorId: string,
    dto: AssignDeliveryProfileDto,
  ) {
    const rel = await this.prisma.tradeRelationship.findFirst({
      where: { id: tradeRelationshipId, distributorId, deletedAt: null },
      select: { id: true, customerId: true },
    });
    if (!rel) throw new NotFoundException('Trade relationship not found');

    if (dto.deliveryProfileId !== null) {
      const profile = await this.prisma.deliveryProfile.findFirst({
        where: { id: dto.deliveryProfileId, distributorId, active: true },
        select: { id: true },
      });
      if (!profile) throw new NotFoundException('Delivery profile not found');
    }

    await this.prisma.traderCustomerSettings.upsert({
      where: { distributorId_traderCustomerId: { distributorId, traderCustomerId: rel.customerId } },
      create: {
        distributorId,
        traderCustomerId: rel.customerId,
        tradeRelationshipId,
        deliveryProfileId: dto.deliveryProfileId,
      },
      update: { deliveryProfileId: dto.deliveryProfileId },
    });

    return { deliveryProfileId: dto.deliveryProfileId };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async assertOwnership(id: string, distributorId: string) {
    const profile = await this.prisma.deliveryProfile.findUnique({
      where: { id },
      select: { distributorId: true },
    });
    if (!profile || profile.distributorId !== distributorId) {
      throw new NotFoundException('Delivery profile not found');
    }
  }

  private async assertRuleOwnership(ruleId: string, profileId: string, distributorId: string) {
    const rule = await this.prisma.deliveryProfileCutoffRule.findUnique({
      where: { id: ruleId },
      select: { deliveryProfileId: true, deliveryProfile: { select: { distributorId: true } } },
    });
    if (
      !rule ||
      rule.deliveryProfileId !== profileId ||
      rule.deliveryProfile.distributorId !== distributorId
    ) {
      throw new NotFoundException('Cutoff rule not found');
    }
  }

  private formatSummary(profile: any) {
    return {
      id: profile.id,
      distributorId: profile.distributorId,
      name: profile.name,
      active: profile.active,
      defaultWeekdays: profile.defaultWeekdays,
      _count: profile._count,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private formatProfile(profile: any) {
    const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
    return {
      id: profile.id,
      distributorId: profile.distributorId,
      name: profile.name,
      active: profile.active,
      defaultWeekdays: profile.defaultWeekdays,
      defaultCutoffTime: profile.defaultCutoffTime,
      defaultCutoffProcessingDays: profile.defaultCutoffProcessingDays,
      speciallyEnabledDates: (profile.speciallyEnabledDates ?? []).map(toIsoDate),
      speciallyDisabledDates: (profile.speciallyDisabledDates ?? []).map(toIsoDate),
      cutoffRules: (profile.cutoffRules ?? []).map(this.formatCutoffRule),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private formatCutoffRule(rule: any) {
    return {
      id: rule.id,
      deliveryProfileId: rule.deliveryProfileId,
      weekday: rule.weekday,
      cutoffTime: rule.cutoffTime,
      processingDaysBeforeDelivery: rule.processingDaysBeforeDelivery,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }
}
