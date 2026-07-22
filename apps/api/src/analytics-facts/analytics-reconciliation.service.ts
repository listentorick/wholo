import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000;
// Orders created/updated more recently than this may simply not have reached
// the analytics consumer yet (outbox polling + queue processing latency) —
// excluding them avoids flagging normal in-flight lag as a discrepancy.
const GRACE_PERIOD_MS = 60 * 1000;

export interface ReconciliationResult {
  missing: number;
  mismatched: number;
}

// Periodically proves order_analytics_state hasn't drifted from the live
// Order table — the ongoing check behind Foundation's "reconciles to live
// transactional data" exit criterion. A genuine drift here means the
// analytics-facts consumer missed or misapplied an event and needs
// investigation; the rebuild command (RebuildAnalyticsStateCommand) is the
// fix once the cause is understood.
@Injectable()
export class AnalyticsReconciliationService {
  private readonly logger = new Logger(AnalyticsReconciliationService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Interval(RECONCILIATION_INTERVAL_MS)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcile();
    } finally {
      this.running = false;
    }
  }

  async reconcile(): Promise<ReconciliationResult> {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);

    const missingRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::int AS count
      FROM orders o
      LEFT JOIN order_analytics_state s ON s."orderId" = o.id
      WHERE s."orderId" IS NULL AND o."createdAt" < ${cutoff}
    `;

    const mismatchedRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::int AS count
      FROM orders o
      JOIN order_analytics_state s ON s."orderId" = o.id
      WHERE o."updatedAt" < ${cutoff}
        AND (o.status::text != s.status::text OR o."subtotalAmount" != s."subtotalAmount")
    `;

    const missing = Number(missingRows[0]?.count ?? 0);
    const mismatched = Number(mismatchedRows[0]?.count ?? 0);

    if (missing > 0 || mismatched > 0) {
      this.logger.error(
        `Analytics reconciliation found discrepancies: ${missing} order(s) missing from order_analytics_state, ${mismatched} mismatched`,
      );
    } else {
      this.logger.log('Analytics reconciliation: order_analytics_state matches live Order data');
    }

    return { missing, mismatched };
  }
}
