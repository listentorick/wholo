import { Injectable, Logger } from '@nestjs/common';
import { IngestionRun, IngestionRunStatus, IngestionRunTrigger, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// A PROCESSING row whose heartbeat (updatedAt, bumped by every write below via
// @updatedAt) is older than this is treated as abandoned — the worker died
// mid-run — and may be reclaimed. Mirrors AccountingBulkImportProcessor.
export const PROCESSING_STALE_MS = 5 * 60 * 1000;
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
  // atomically.
  async requestRun(tx: Prisma.TransactionClient, input: RequestRunInput): Promise<IngestionRun> {
    const { distributorId, sourceType, sourceRef, resourceType, trigger } = input;

    const existing = await tx.ingestionRun.findUnique({
      where: { sourceType_sourceRef_resourceType: { sourceType, sourceRef, resourceType } },
    });

    if (!existing) {
      return tx.ingestionRun.create({
        data: { distributorId, sourceType, sourceRef, resourceType, trigger },
      });
    }

    if (TERMINAL.includes(existing.status)) {
      // Previous run finished — start a fresh one in the same row.
      return tx.ingestionRun.update({
        where: { id: existing.id },
        data: {
          status: IngestionRunStatus.QUEUED,
          trigger,
          recordsTotal: null,
          recordsProcessed: 0,
          recordsFailed: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
          recordsRemoved: 0,
          detailCount: 0,
          errorMessage: null,
          queuedAt: new Date(),
          startedAt: null,
          finishedAt: null,
        },
      });
    }

    // A run is already queued/processing — leave its progress alone. But a
    // manual click over a running scheduled sync should escalate the UI
    // treatment (strip → full-screen panel).
    if (trigger === IngestionRunTrigger.MANUAL && existing.trigger !== IngestionRunTrigger.MANUAL) {
      return tx.ingestionRun.update({
        where: { id: existing.id },
        data: { trigger: IngestionRunTrigger.MANUAL },
      });
    }
    return existing;
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
      this.logger.log(`IngestionRun ${runId} not claimable (already running or done)`);
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

  async finalizeSuccess(runId: string, counts: RunCounts): Promise<void> {
    await this.prisma.ingestionRun.update({
      where: { id: runId },
      data: { status: IngestionRunStatus.COMPLETED, finishedAt: new Date(), ...this.countData(counts) },
    });
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
      this.logger.error(`Failed to mark IngestionRun ${runId} FAILED: ${err instanceof Error ? err.message : err}`);
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
