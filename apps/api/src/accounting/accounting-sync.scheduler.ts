import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AccountingConnectionStatus } from '@prisma/client';
import { loggableError } from '@wholo/nest-telemetry';
import { PrismaService } from '../prisma/prisma.service';
import { IngestionRunService } from '../ingestion/ingestion-run.service';
import { AccountingSyncService } from './sync/accounting-sync.service';
import {
  ACCOUNTING_SOURCE_TYPE,
  ACCOUNTING_SYNC_INTERVAL_MS,
  ACCOUNTING_SYNC_RESOURCE_TYPES,
  AccountingSyncResourceType,
} from './sync/accounting-sync.constants';

const TICK_MS = 60 * 1000;
// A fresh worker still catches up quickly, but not in the same instant it
// (and everything else) restarts. See ADR-061 / "Concurrency".
const INITIAL_DELAY_MS = 90 * 1000;

// First slot for a row that predates scheduling. A connection made within the
// last interval syncs straight away; the rest of the fleet is spread at random
// across one interval so the first deploy doesn't queue everything at once.
// After that every row keeps its own slot (nextSlotAfter), so the spread holds.
export function firstSlot(now: Date, connectedAt: Date, intervalMs: number, random: () => number = Math.random): Date {
  if (now.getTime() - connectedAt.getTime() < intervalMs) return now;
  return new Date(now.getTime() + Math.floor(random() * intervalMs));
}

interface DueSync {
  connectionId: string;
  distributorId: string;
  resourceType: AccountingSyncResourceType;
  // null = the triple has never run (no row yet) — due now.
  slot: Date | null;
}

export interface TickSummary {
  connections: number;
  due: number;
  enqueued: number;
  skippedInFlight: number;
  failed: number;
  seeded: number;
}

// One scheduler for every accounting resource type (ADR-061 "Scheduling"),
// replacing the per-type serial sweeps. Each (connection, resource type) row
// carries its own nextRunAt; every minute this enqueues **every** row whose
// slot has passed — no per-tick cap, on purpose: the queues absorb bursts and
// drain at their fixed concurrency, so queue depth stays the one measure of
// waiting work (a cap would hide some of it here instead).
//
// Runs only in the worker process. Enqueueing goes through the outbox
// (AccountingSyncService.enqueueDue), same path as a manual Sync.
@Injectable()
export class AccountingSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(AccountingSyncScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestionRuns: IngestionRunService,
    private readonly accountingSync: AccountingSyncService,
  ) {}

  onModuleInit(): void {
    const t = setTimeout(() => {
      void this.tick();
    }, INITIAL_DELAY_MS);
    t.unref();
  }

  @Interval(TICK_MS)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce(new Date());
    } catch (err) {
      this.logger.error(
        { event: 'accounting.scheduler.tick_failed', err: loggableError(err) },
        'Accounting sync scheduler tick failed',
      );
    } finally {
      this.running = false;
    }
  }

  async runOnce(now: Date): Promise<TickSummary> {
    const started = Date.now();
    const connections = await this.prisma.accountingConnection.findMany({
      where: { status: AccountingConnectionStatus.CONNECTED },
      select: { id: true, distributorId: true, connectedAt: true },
    });
    const scheduled = await this.ingestionRuns.listScheduled(
      ACCOUNTING_SOURCE_TYPE,
      connections.map((c) => c.id),
    );
    const rowByKey = new Map(scheduled.map((row) => [`${row.sourceRef}|${row.resourceType}`, row]));

    const toSeed: Array<{ sourceType: string; sourceRef: string; resourceType: string; nextRunAt: Date }> = [];
    const due: DueSync[] = [];
    for (const connection of connections) {
      for (const resourceType of ACCOUNTING_SYNC_RESOURCE_TYPES) {
        const row = rowByKey.get(`${connection.id}|${resourceType}`);
        const base = { connectionId: connection.id, distributorId: connection.distributorId, resourceType };
        if (!row) {
          due.push({ ...base, slot: null });
        } else if (!row.nextRunAt) {
          toSeed.push({
            sourceType: ACCOUNTING_SOURCE_TYPE,
            sourceRef: connection.id,
            resourceType,
            nextRunAt: firstSlot(now, connection.connectedAt, ACCOUNTING_SYNC_INTERVAL_MS[resourceType]),
          });
        } else if (row.nextRunAt.getTime() <= now.getTime()) {
          due.push({ ...base, slot: row.nextRunAt });
        }
      }
    }

    const seeded = await this.ingestionRuns.fillMissingSchedules(toSeed);

    let enqueued = 0;
    let skippedInFlight = 0;
    let failed = 0;
    for (const item of due) {
      try {
        const result = await this.accountingSync.enqueueDue(
          item.distributorId,
          item.connectionId,
          item.resourceType,
          item.slot,
          now,
        );
        if (result.enqueued) enqueued += 1;
        else skippedInFlight += 1;
      } catch (err) {
        failed += 1;
        this.logger.error(
          {
            event: 'accounting.scheduler.enqueue_failed',
            distributorId: item.distributorId,
            connectionId: item.connectionId,
            resourceType: item.resourceType,
            err: loggableError(err),
          },
          `Failed to enqueue scheduled ${item.resourceType} sync for connection ${item.connectionId}`,
        );
      }
    }

    const summary: TickSummary = {
      connections: connections.length,
      due: due.length,
      enqueued,
      skippedInFlight,
      failed,
      seeded,
    };
    // Every tick, even an idle one: the steady line is what shows the
    // scheduler is alive, and due vs enqueued shows whether we keep up.
    this.logger.log(
      { event: 'accounting.scheduler.tick', ...summary, durationMs: Date.now() - started },
      `Accounting sync tick: ${due.length} due, ${enqueued} queued, ${skippedInFlight} already in flight, ${failed} failed`,
    );
    return summary;
  }
}
