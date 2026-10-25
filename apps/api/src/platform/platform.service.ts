import { Injectable } from '@nestjs/common';
import { OrganisationType, Prisma, Role, TradeRelationshipStatus } from '@prisma/client';
import { PlatformDistributor, PlatformStats } from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { attentionReasons, fillDailySeries } from './platform-shaping';

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const LIST_LIMIT = 500;
const ORDER_SUBMITTED = 'OrderSubmitted';

export type DistributorFilter = 'attention' | 'mine';

/**
 * Cross-tenant views for the Ops app (ADR-078). Read-only; every caller has
 * already passed PlatformAccessGuard. Counts come from order_facts, so no
 * money is summed across wholesalers (they may trade in different currencies).
 */
@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async listDistributors(callerUserId: string, opts: { q?: string; filter?: DistributorFilter }, now: Date = new Date()): Promise<PlatformDistributor[]> {
    const q = opts.q?.trim();
    const where: Prisma.OrganisationWhereInput = {
      type: OrganisationType.DISTRIBUTOR,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
              { memberships: { some: { user: { email: { contains: q, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };
    const orgs = await this.prisma.organisation.findMany({
      where,
      orderBy: { name: 'asc' },
      take: LIST_LIMIT,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        memberships: {
          where: { OR: [{ role: Role.DISTRIBUTOR_ADMIN }, { roles: { some: { role: Role.DISTRIBUTOR_ADMIN } } }] },
          select: { user: { select: { email: true } } },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        _count: {
          select: {
            products: true,
            tradeRelationshipsAsDistributor: { where: { status: TradeRelationshipStatus.ACTIVE } },
          },
        },
      },
    });
    if (orgs.length === 0) return [];
    const ids = orgs.map((o) => o.id);
    const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

    const [recent, last, grants] = await Promise.all([
      this.prisma.orderFact.groupBy({
        by: ['distributorId'],
        where: { distributorId: { in: ids }, eventType: ORDER_SUBMITTED, occurredAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.orderFact.groupBy({
        by: ['distributorId'],
        where: { distributorId: { in: ids }, eventType: ORDER_SUBMITTED },
        _max: { occurredAt: true },
      }),
      this.prisma.supportAccessGrant.findMany({
        where: { userId: callerUserId, distributorId: { in: ids }, revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now } },
        select: { id: true, distributorId: true, expiresAt: true, reason: true },
      }),
    ]);
    const recentBy = new Map(recent.map((r) => [r.distributorId, r._count._all]));
    const lastBy = new Map(last.map((r) => [r.distributorId, r._max.occurredAt]));
    const grantBy = new Map(grants.map((g) => [g.distributorId, g]));

    const rows = orgs.map((o): PlatformDistributor => {
      const lastOrderAt = lastBy.get(o.id) ?? null;
      const grant = grantBy.get(o.id);
      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        ownerEmail: o.memberships[0]?.user.email ?? null,
        createdAt: o.createdAt.toISOString(),
        activeCustomers: o._count.tradeRelationshipsAsDistributor,
        products: o._count.products,
        ordersLast30Days: recentBy.get(o.id) ?? 0,
        lastOrderAt: lastOrderAt?.toISOString() ?? null,
        attention: attentionReasons({ createdAt: o.createdAt, products: o._count.products, lastOrderAt }, now),
        myActiveGrant: grant ? { id: grant.id, expiresAt: grant.expiresAt.toISOString(), reason: grant.reason } : null,
      };
    });

    if (opts.filter === 'attention') return rows.filter((r) => r.attention.length > 0);
    if (opts.filter === 'mine') return rows.filter((r) => r.myActiveGrant);
    return rows;
  }

  async stats(now: Date = new Date()): Promise<PlatformStats> {
    const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const previousSince = new Date(now.getTime() - 2 * WINDOW_DAYS * DAY_MS);
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (WINDOW_DAYS - 1) * DAY_MS);
    const activeGrant = { revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now } };

    const [wholesalers, joined, customers, orders, previous, perDay, openGrants] = await Promise.all([
      this.prisma.organisation.count({ where: { type: OrganisationType.DISTRIBUTOR, deletedAt: null } }),
      this.prisma.organisation.count({ where: { type: OrganisationType.DISTRIBUTOR, deletedAt: null, createdAt: { gte: since } } }),
      this.prisma.orderFact.findMany({
        where: { eventType: ORDER_SUBMITTED, occurredAt: { gte: since } },
        distinct: ['traderCustomerId'],
        select: { traderCustomerId: true },
      }),
      this.prisma.orderFact.count({ where: { eventType: ORDER_SUBMITTED, occurredAt: { gte: since } } }),
      this.prisma.orderFact.count({ where: { eventType: ORDER_SUBMITTED, occurredAt: { gte: previousSince, lt: since } } }),
      this.prisma.orderFact.groupBy({
        by: ['distributorLocalDate'],
        where: { eventType: ORDER_SUBMITTED, distributorLocalDate: { gte: firstDay } },
        _count: { _all: true },
      }),
      this.prisma.supportAccessGrant.findMany({ where: activeGrant, select: { distributorId: true } }),
    ]);

    return {
      activeWholesalers: wholesalers,
      wholesalersJoinedLast30Days: joined,
      activeTradeCustomers: customers.length,
      ordersLast30Days: orders,
      ordersPrevious30Days: previous,
      openSupportGrants: openGrants.length,
      wholesalersWithOpenSupport: new Set(openGrants.map((g) => g.distributorId)).size,
      ordersPerDay: fillDailySeries(
        perDay.map((r) => ({ date: r.distributorLocalDate, orders: r._count._all })),
        now,
        WINDOW_DAYS,
      ),
    };
  }
}
