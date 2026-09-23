import { Injectable } from '@nestjs/common';
import type { DeliveryOverview, DeliveryOverviewQueueKind } from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { distributorLocalDate } from '../common/distributor-local-date';
import {
  QUEUE_CAP, bucketOrderBy, bucketWhere, buildQueue, isoDate, queueOrderSelect, runSelect, summariseProgress, summariseRuns,
} from './delivery-overview.logic';

const DAY_MS = 24 * 60 * 60 * 1000;

// The Delivery dashboard's live snapshot: current state read straight from the
// transactional tables, in one pass, so every number on it comes from the same
// moment and adds up. History (trends) is a separate read — see
// DeliveryOutcomesService — built from delivery facts.
@Injectable()
export class DeliveryOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(distributorId: string): Promise<DeliveryOverview> {
    const now = new Date();
    const settings = await this.prisma.distributorSettings.findUnique({ where: { distributorId }, select: { timezone: true } });
    const timezone = settings?.timezone ?? 'UTC';
    const day = distributorLocalDate(now, timezone);
    const failedSince = new Date(now.getTime() - DAY_MS);

    const where = (kind: DeliveryOverviewQueueKind) => bucketWhere(kind, distributorId, day, failedSince);
    const list = (kind: DeliveryOverviewQueueKind) =>
      this.prisma.order.findMany({ where: where(kind), orderBy: bucketOrderBy[kind], take: QUEUE_CAP, select: queueOrderSelect });
    const count = (kind: DeliveryOverviewQueueKind) => this.prisma.order.count({ where: where(kind) });

    const [runs, failedCount, overdueCount, toAcceptCount, notOnRunCount, failed, overdue, toAccept, notOnRun] = await Promise.all([
      this.prisma.deliveryRun.findMany({ where: { distributorId, deliveryDate: day }, orderBy: { createdAt: 'asc' }, select: runSelect }),
      count('FAILED'), count('OVERDUE'), count('TO_ACCEPT'), count('NOT_ON_RUN'),
      list('FAILED'), list('OVERDUE'), list('TO_ACCEPT'), list('NOT_ON_RUN'),
    ]);

    const lists = { FAILED: failed, OVERDUE: overdue, TO_ACCEPT: toAccept, NOT_ON_RUN: notOnRun };

    return {
      distributorId,
      date: isoDate(day)!,
      timezone,
      generatedAt: now.toISOString(),
      counts: {
        toAccept: { count: toAcceptCount, oldestSubmittedAt: toAccept[0]?.submittedAt?.toISOString() ?? null },
        overdue: { count: overdueCount },
        notOnRun: { count: notOnRunCount },
        failedLast24h: { count: failedCount },
      },
      progress: summariseProgress(runs, notOnRunCount),
      runs: summariseRuns(runs),
      queue: buildQueue(lists),
      queueCap: QUEUE_CAP,
    };
  }
}
