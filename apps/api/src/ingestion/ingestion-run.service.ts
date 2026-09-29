import { Injectable, Logger } from '@nestjs/common';
import { loggableError } from '@wholo/nest-telemetry';
import { IngestionRun, IngestionRunStatus, IngestionRunTrigger, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// A PROCESSING row whose heartbeat (updatedAt, bumped by every write below via
// @updatedAt) is older than this is treated as abandoned — the worker died
// mid-run — and may be reclaimed/re-queued. 15 min (was 5): the provider fetch
// is a single await with no heartbeat inside it, so the window must comfortably
// exceed the longest plausible fetch (incremental pulls, 1000-record pages) or
// a slow-but-live run could be claimed a second time. Same value as the invoice
// export's PROCESSING_STALE_MS.
export const PROCESSING_STALE_MS = 15 * 60 * 1000;
// A QUEUED row this old has no job behind it any more (e.g. its job exhausted
// its attempts before it ever claimed the run) — without this it could never
// be re-queued, because requestRun treats QUEUED as "already in flight".
export const QUEUED_STALE_MS = 60 * 60 * 1000;
// Heartbeat cadence for long-running consumers (the accounting sync processor
// reads these). One definition, here.
export const HEARTBEAT_ITEM_INTERVAL = 25;
export const HEARTBEAT_TIME_INTERVAL_MS = 5_000;

const ERROR_MESSAGE_MAX = 1000;
const TERMINAL: IngestionRunStatus[] = [IngestionRunStatus.COMPLETED, IngestionRunStatus.FAILED];

export interface RequestRunInput {
  distributorId: string;
  sourceType: string;
  sourceRef: string;
  resourceType: string;
  trigger: IngestionRunTrigger;
}

export interface RequestRunResult {
  run: IngestionRun;
  // True only when this call moved the run to QUEUED — the caller must then
  // write the event that gets it processed. False means a run is already
  // queued or processing, so another job would only be a duplicate.
  shouldEnqueue: boolean;
}

export interface FinalizeSuccessOptions {
  // The source's incremental position after this run (null = none; the next
  // pull must be full). Omitted = leave the stored cursor untouched.
  cursor?: string | null;
  // Whether this run was a full pull — stamps lastFullRunAt.
  full?: boolean;
}

const RESET_COUNTERS = {
  recordsTotal: null,
  recordsProcessed: 0,
  recordsFailed: 0,
  recordsCreated: 0,
  recordsUpdated: 0,
  recordsRemoved: 0,
  detailCount: 0,
  errorMessage: null,
  startedAt: null,
  finishedAt: null,
} as const;

export interface RunCounts {
  recordsProcessed?: number;
  recordsFailed?: number;
  recordsCreated?: number;
  recordsUpdated?: number;
  recordsRemoved?: number;
  detailCount?: number;
}

// Source-agnostic tracking for one "pull from an external system into Wholo"
// run. Knows nothing about accounting — callers pass opaque
// (sourceType, sourceRef, resourceType) strings. Lifecycle mirrors
// AccountingBulkImportProcessor (claim / heartbeat-via-updatedAt / finalize);
// see ADR-061.
@Injectable()
export class IngestionRunService {
  private readonly logger = new Logger(IngestionRunService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Create or reset the run row for a triple and mark it QUEUED. MUST be
  // called inside the caller's $transaction (same rule as
  // OutboxService.writeEvent) so the run row and the outbox event commit
  // atomically — and the caller writes that event only when shouldEnqueue.
  //
  // Both the create and the reset are single conditional statements, so two
  // concurrent callers (a scheduler tick in the worker and a manual click in
  // the API) can never both enqueue: the create is ON CONFLICT DO NOTHING
  // (a unique violation would abort the caller's transaction), and the reset
  // is an UPDATE whose WHERE re-checks the status under the row lock.
  async requestRun(tx: Prisma.TransactionClient, input: RequestRunInput): Promise<RequestRunResult> {
    const { distributorId, sourceType, sourceRef, resourceType, trigger } = input;
    const where = { sourceType_sourceRef_resourceType: { sourceType, sourceRef, resourceType } };

    const created = await tx.ingestionRun.createMany({
      data: [{ distributorId, sourceType, sourceRef, resourceType, trigger }],
      skipDuplicates: true,
    });
    if (created.count === 1) {
      return { run: await tx.ingestionRun.findUniqueOrThrow({ where }), shouldEnqueue: true };
    }

    const existing = await tx.ingestionRun.findUniqueOrThrow({ where });
    const now = Date.now();
    const reset = await tx.ingestionRun.updateMany({
      where: {
        id: existing.id,
        OR: [
          { status: { in: TERMINAL } },
          { status: IngestionRunStatus.PROCESSING, updatedAt: { lt: new Date(now - PROCESSING_STALE_MS) } },
          { status: IngestionRunStatus.QUEUED, queuedAt: { lt: new Date(now - QUEUED_STALE_MS) } },
        ],
      },
      data: { ...RESET_COUNTERS, status: IngestionRunStatus.QUEUED, trigger, queuedAt: new Date(now) },
    });
    if (reset.count === 1) {
      return { run: await tx.ingestionRun.findUniqueOrThrow({ where }), shouldEnqueue: true };
    }

    // A run is already queued/processing — leave its progress alone. But a
    // manual click over a running scheduled sync should escalate the UI
    // treatment (strip → full-screen panel).
    if (trigger === IngestionRunTrigger.MANUAL && existing.trigger !== IngestionRunTrigger.MANUAL) {
      const run = await tx.ingestionRun.update({ where: { id: existing.id }, data: { trigger: IngestionRunTrigger.MANUAL } });
      return { run, shouldEnqueue: false };
    }
    return { run: existing, shouldEnqueue: false };
  }

  // Scheduler support ───────────────────────────────────────────────────

  // Give rows that predate scheduling (nextRunAt null) their first slot.
  // Deliberately never creates rows: a triple with no row at all has never
  // run, so the scheduler treats it as due now and requestRun creates a real
  // QUEUED run (a placeholder row would read as "has synced" in the admin UI).
  async fillMissingSchedules(
    rows: Array<{ sourceType: string; sourceRef: string; resourceType: string; nextRunAt: Date }>,
  ): Promise<number> {
    let filled = 0;
    for (const row of rows) {
      const { count } = await this.prisma.ingestionRun.updateMany({
        where: { sourceType: row.sourceType, sourceRef: row.sourceRef, resourceType: row.resourceType, nextRunAt: null },
        data: { nextRunAt: row.nextRunAt },
      });
      filled += count;
    }
    return filled;
  }

  // Every scheduled row for these sources whose slot has come up.
  listDue(sourceType: string, sourceRefs: string[], now: Date): Promise<IngestionRun[]> {
    if (sourceRefs.length === 0) return Promise.resolve([]);
    return this.prisma.ingestionRun.findMany({
      where: { sourceType, sourceRef: { in: sourceRefs }, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
    });
  }

  // Rows that exist for these sources (used to spot missing triples to seed).
  listScheduled(
    sourceType: string,
    sourceRefs: string[],
  ): Promise<Array<Pick<IngestionRun, 'id' | 'sourceRef' | 'resourceType' | 'nextRunAt'>>> {
    if (sourceRefs.length === 0) return Promise.resolve([]);
    return this.prisma.ingestionRun.findMany({
      where: { sourceType, sourceRef: { in: sourceRefs } },
      select: { id: true, sourceRef: true, resourceType: true, nextRunAt: true },
    });
  }

  async advanceSchedule(tx: Prisma.TransactionClient, runId: string, nextRunAt: Date): Promise<void> {
    await tx.ingestionRun.update({ where: { id: runId }, data: { nextRunAt } });
  }

  // Non-transactional upsert to guarantee a row exists, for a processor that
  // received a job whose payload predates `runId` (only during a deploy that
  // straddles this change). Returns the row id; claim() decides its fate.
  async ensureRun(input: RequestRunInput): Promise<string> {
    const { distributorId, sourceType, sourceRef, resourceType, trigger } = input;
    const row = await this.prisma.ingestionRun.upsert({
      where: { sourceType_sourceRef_resourceType: { sourceType, sourceRef, resourceType } },
      create: { distributorId, sourceType, sourceRef, resourceType, trigger },
      update: {},
    });
    return row.id;
  }

  // Atomic compare-and-set QUEUED | stale-PROCESSING → PROCESSING. Returns the
  // claimed row, or null if it is already terminal or a live attempt holds it.
  // updateMany makes this a single statement, so it stays correct even if the
  // sync processors are ever run multi-replica (see ADR-061 / "Concurrency").
  async claim(runId: string): Promise<IngestionRun | null> {
    const staleCutoff = new Date(Date.now() - PROCESSING_STALE_MS);
    const { count } = await this.prisma.ingestionRun.updateMany({
      where: {
        id: runId,
        OR: [
          { status: IngestionRunStatus.QUEUED },
          { status: IngestionRunStatus.PROCESSING, updatedAt: { lt: staleCutoff } },
        ],
      },
      data: { status: IngestionRunStatus.PROCESSING, startedAt: new Date() },
    });
    if (count !== 1) {
      this.logger.log({ event: 'ingestion.run.not_claimable', runId }, `IngestionRun ${runId} not claimable (already running or done)`);
      return null;
    }
    return this.prisma.ingestionRun.findUnique({ where: { id: runId } });
  }

  async setTotal(runId: string, recordsTotal: number): Promise<void> {
    await this.prisma.ingestionRun.update({ where: { id: runId }, data: { recordsTotal } });
  }

  async heartbeat(runId: string, counts: RunCounts): Promise<void> {
    await this.prisma.ingestionRun.update({ where: { id: runId }, data: this.countData(counts) });
  }

  async finalizeSuccess(runId: string, counts: RunCounts, options: FinalizeSuccessOptions = {}): Promise<void> {
    const finishedAt = new Date();
    await this.prisma.ingestionRun.update({
      where: { id: runId },
      data: {
        status: IngestionRunStatus.COMPLETED,
        finishedAt,
        ...this.countData(counts),
        ...(options.cursor !== undefined ? { cursor: options.cursor } : {}),
        ...(options.full ? { lastFullRunAt: finishedAt } : {}),
      },
    });
  }

  // A transient failure with retries left: put the run back to QUEUED (keeping
  // the error for the UI) so the queue's next attempt can claim it — a FAILED
  // run is not claimable, so finalizing here would turn every retry into a
  // silent no-op. Must never throw (called from a catch block).
  async requeueForRetry(runId: string, message: string): Promise<void> {
    try {
      await this.prisma.ingestionRun.update({
        where: { id: runId },
        data: { status: IngestionRunStatus.QUEUED, queuedAt: new Date(), errorMessage: message.slice(0, ERROR_MESSAGE_MAX) },
      });
    } catch (err) {
      this.logger.error(
        { event: 'ingestion.run.requeue_failed', runId, err: loggableError(err) },
        `Failed to re-queue IngestionRun ${runId} for retry`,
      );
    }
  }

  // Called from a catch block — must never throw, or it masks the original error.
  async finalizeFailure(runId: string, message: string): Promise<void> {
    try {
      await this.prisma.ingestionRun.update({
        where: { id: runId },
        data: {
          status: IngestionRunStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: message.slice(0, ERROR_MESSAGE_MAX),
        },
      });
    } catch (err) {
      // The stale-PROCESSING reclaim (5 min) is the backstop if this write is lost.
      this.logger.error(
        { event: 'ingestion.run.finalize_failed', runId, err: loggableError(err) },
        `Failed to mark IngestionRun ${runId} FAILED`,
      );
    }
  }

  listRuns(query: { distributorId: string; sourceType: string; sourceRef: string }): Promise<IngestionRun[]> {
    return this.prisma.ingestionRun.findMany({
      where: {
        distributorId: query.distributorId,
        sourceType: query.sourceType,
        sourceRef: query.sourceRef,
      },
      orderBy: { resourceType: 'asc' },
    });
  }

  private countData(counts: RunCounts): Prisma.IngestionRunUpdateInput {
    return {
      recordsProcessed: counts.recordsProcessed,
      recordsFailed: counts.recordsFailed,
      recordsCreated: counts.recordsCreated,
      recordsUpdated: counts.recordsUpdated,
      recordsRemoved: counts.recordsRemoved,
      detailCount: counts.detailCount,
    };
  }
}
