import { Logger } from '@nestjs/common';
import { AccountingConnection, AccountingConnectionStatus, IngestionRun, IngestionRunTrigger } from '@prisma/client';
import { Job, UnrecoverableError } from 'bullmq';
import { loggableError } from '@wholo/nest-telemetry';
import { LoggedWorkerHost } from '../../queues/logged-worker-host';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HEARTBEAT_ITEM_INTERVAL,
  HEARTBEAT_TIME_INTERVAL_MS,
  IngestionRunService,
  RunCounts,
} from '../../ingestion/ingestion-run.service';
import { AccountingConnectionService } from '../accounting-connection.service';
import { AccountingAdapterRegistry } from '../adapters/accounting-adapter.registry';
import { AccountingConnectionAdapter, AccountingTokenSet } from '../adapters/accounting-connection-adapter.interface';
import { classifyJobFailure } from '../accounting-job-failure';
import { ACCOUNTING_FULL_SYNC_INTERVAL_MS, ACCOUNTING_SOURCE_TYPE } from './accounting-sync.constants';

// ─── Pulling data from an accounting provider ───────────────────────────────
//
// Part of the provider-neutral accounting integration framework — the
// framework overview and the provider contract are in
// adapters/accounting-connection-adapter.interface.ts. This file is the guide
// for framework-side code that PULLS provider data into Stocdup.
//
// Every pull extends AccountingPullProcessorBase. The base owns everything a
// pull has in common, so no pull re-implements it:
//   - the connection check (missing / not CONNECTED → the run is finalised,
//     nothing is called);
//   - the IngestionRun lifecycle (ADR-061): ensureRun for legacy jobs →
//     claim (bail if another attempt holds it) → finalizeSuccess, or on
//     failure requeueForRetry / finalizeFailure;
//   - full vs incremental (shouldRunFull) and the opaque cursor;
//   - the token (AccountingConnectionService.getValidTokenSet — the only
//     token gateway) and the adapter (AccountingAdapterRegistry);
//   - heartbeats: `ctx.progress` keeps the run's updatedAt fresh so a long,
//     live pull is never mistaken for a dead one (PROCESSING_STALE_MS);
//   - the failure policy (classifyJobFailure): permanent → UnrecoverableError,
//     transient → BullMQ retries with the Retry-After-aware backoff;
//   - one structured log line each for started / completed / failed.
//
// A subclass supplies only what differs:
//   - `resourceType` / `recordNoun`;
//   - optionally `preflight` — cheap checks before any provider call that
//     throw a permanent AccountingProviderError (e.g. a missing scope);
//   - `pull(ctx)` — the provider call(s) through `ctx.adapter`, writing the
//     results, calling `ctx.progress.tick` as it goes, and returning the
//     run's counts, the next cursor and a completion summary.
//
// Which base to extend:
//   - Records the distributor reviews and maps to Stocdup records (contacts,
//     products, tax rates): extend AccountingSyncProcessorBase, which is this
//     base plus the cache → match → suggestion pipeline.
//   - Provider facts written onto existing Stocdup records (invoice status):
//     extend this base directly (see AccountingInvoiceSyncProcessor).
//
// Checklist — adding a pull:
//   1. Add the provider-neutral method to AccountingConnectionAdapter and
//      implement it in every adapter.
//   2. Add a queue and route its "…SyncRequested" event
//      (queues/queue.constants.ts), register the queue in worker.module.ts
//      with the `accounting` backoff.
//   3. Add the resource type to ACCOUNTING_SYNC_RESOURCE_TYPES with an
//      interval, so the scheduler and manual Sync pick it up (triggers always
//      go through the outbox and IngestionRunService.requestRun).
//   4. Subclass the right base; write derived state only through its single
//      writer (e.g. InvoicePaymentStateService).
//   5. Tests: the subclass's own behaviour — the lifecycle is covered once, in
//      accounting-pull-processor.base.spec.ts. The architecture spec fails if
//      a pull queue's processor doesn't extend this base.

// Full or incremental? A pull is full when a person asked for it (manual
// Sync), when there is no incremental position yet, or when the last full
// pull is older than ACCOUNTING_FULL_SYNC_INTERVAL_MS — incremental pulls
// can't see deletions or re-offer matches for records that haven't changed.
export function shouldRunFull(
  run: Pick<IngestionRun, 'trigger' | 'cursor' | 'lastFullRunAt'>,
  now: Date = new Date(),
): boolean {
  if (run.trigger === IngestionRunTrigger.MANUAL) return true;
  if (!run.cursor) return true;
  if (!run.lastFullRunAt) return true;
  return now.getTime() - run.lastFullRunAt.getTime() >= ACCOUNTING_FULL_SYNC_INTERVAL_MS;
}

export interface OutboxEventJobData {
  eventId: string;
  aggregateType: string;
  aggregateId: string; // AccountingConnection id
  payload: unknown; // { runId?: string }
}

// Keeps a run's heartbeat (IngestionRun.updatedAt) fresh while a pull works:
// writes progress every HEARTBEAT_ITEM_INTERVAL items or
// HEARTBEAT_TIME_INTERVAL_MS, whichever comes first.
export class RunProgress {
  private sinceBeat = 0;
  private lastBeat: number;

  constructor(
    private readonly ingestionRuns: IngestionRunService,
    private readonly runId: string,
    private readonly now: () => number = Date.now,
  ) {
    this.lastBeat = now();
  }

  // The fetch is a single await with no heartbeat inside it; recording the
  // total straight after marks the run live again.
  async setTotal(recordsTotal: number): Promise<void> {
    await this.ingestionRuns.setTotal(this.runId, recordsTotal);
    this.lastBeat = this.now();
  }

  // Call after each item (or batch of `items`) with the counts so far.
  async tick(counts: RunCounts, items = 1): Promise<void> {
    this.sinceBeat += items;
    if (this.sinceBeat >= HEARTBEAT_ITEM_INTERVAL || this.now() - this.lastBeat > HEARTBEAT_TIME_INTERVAL_MS) {
      await this.flush(counts);
    }
  }

  // Write the counts now (e.g. at the end of a phase).
  async flush(counts: RunCounts): Promise<void> {
    await this.ingestionRuns.heartbeat(this.runId, counts);
    this.sinceBeat = 0;
    this.lastBeat = this.now();
  }
}

export interface PullContext {
  connection: AccountingConnection;
  adapter: AccountingConnectionAdapter;
  tokenSet: AccountingTokenSet;
  // null for a full pull; otherwise the adapter's opaque incremental position.
  cursor: string | null;
  full: boolean;
  progress: RunProgress;
}

export interface PullResult {
  counts: RunCounts;
  // The adapter's new incremental position (null = next pull must be full).
  nextCursor: string | null;
  // Extra fields and a human sentence for the `accounting.sync.completed` line.
  summary: { fields: Record<string, unknown>; message: string };
}

export abstract class AccountingPullProcessorBase extends LoggedWorkerHost {
  protected abstract readonly logger: Logger;
  // Used in log lines, e.g. 'contact' → "Accounting contact sync started".
  protected abstract readonly recordNoun: string;
  // Opaque IngestionRun.resourceType, e.g. 'contact' | 'invoice'.
  protected abstract readonly resourceType: string;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly accountingConnectionService: AccountingConnectionService,
    protected readonly adapters: AccountingAdapterRegistry,
    protected readonly ingestionRuns: IngestionRunService,
  ) {
    super();
  }

  // Cheap checks before any provider call. Throw a permanent
  // AccountingProviderError to fail the run without retrying. Default: none.
  protected async preflight(_connection: AccountingConnection, _adapter: AccountingConnectionAdapter): Promise<void> {}

  // The pull itself: provider call(s) through ctx.adapter, then writing the
  // results. Throw to fail (the base applies the failure policy).
  protected abstract pull(ctx: PullContext): Promise<PullResult>;

  async process(job: Job<OutboxEventJobData>): Promise<void> {
    const connectionId = job.data.aggregateId;
    const runIdFromPayload = (job.data.payload as { runId?: string } | undefined)?.runId ?? null;
    const skipFields = { event: 'accounting.sync.skipped', connectionId, resourceType: this.resourceType };

    const connection = await this.prisma.accountingConnection.findUnique({ where: { id: connectionId } });
    if (!connection) {
      this.logger.warn({ ...skipFields, reason: 'connection_missing' }, `AccountingConnection ${connectionId} no longer exists — skipping sync`);
      if (runIdFromPayload) {
        await this.ingestionRuns.finalizeFailure(runIdFromPayload, 'Accounting connection no longer exists');
      }
      return;
    }
    if (connection.status !== AccountingConnectionStatus.CONNECTED) {
      this.logger.log(
        { ...skipFields, reason: 'not_connected', distributorId: connection.distributorId, status: connection.status },
        `AccountingConnection ${connectionId} is not CONNECTED — skipping sync`,
      );
      if (runIdFromPayload) {
        await this.ingestionRuns.finalizeFailure(runIdFromPayload, 'Accounting connection is not connected');
      }
      return;
    }

    // Pre-`runId` jobs (a deploy straddling ADR-061) have no runId in the
    // payload — recreate the row so tracking still works.
    const runId =
      runIdFromPayload ??
      (await this.ingestionRuns.ensureRun({
        distributorId: connection.distributorId,
        sourceType: ACCOUNTING_SOURCE_TYPE,
        sourceRef: connection.id,
        resourceType: this.resourceType,
        trigger: IngestionRunTrigger.SCHEDULED,
      }));

    const run = await this.ingestionRuns.claim(runId);
    if (!run) return; // Already COMPLETED, or a live attempt holds it.

    const full = shouldRunFull(run);
    const logFields = {
      provider: connection.provider,
      distributorId: connection.distributorId,
      connectionId: connection.id,
      externalOrgId: connection.externalOrganisationId,
      runId,
      resourceType: this.resourceType,
      trigger: run.trigger,
      mode: full ? 'full' : 'incremental',
      jobId: job.id,
      eventId: job.data.eventId,
    };
    this.logger.log({ event: 'accounting.sync.started', ...logFields }, `Accounting ${this.recordNoun} sync started (${logFields.mode})`);
    const started = Date.now();

    try {
      const adapter = this.adapters.get(connection.provider);
      await this.preflight(connection, adapter);
      const tokenSet = await this.accountingConnectionService.getValidTokenSet(connection.distributorId, connection.provider);
      const result = await this.pull({
        connection,
        adapter,
        tokenSet,
        cursor: full ? null : run.cursor,
        full,
        progress: new RunProgress(this.ingestionRuns, runId),
      });

      // lastSyncedAt is written by every pull on this connection — a loose
      // "last successful provider round-trip", not per-resource freshness.
      await this.prisma.accountingConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } });
      await this.ingestionRuns.finalizeSuccess(runId, result.counts, { cursor: result.nextCursor, full });
      this.logger.log(
        { event: 'accounting.sync.completed', ...logFields, durationMs: Date.now() - started, ...result.summary.fields },
        result.summary.message,
      );
    } catch (err) {
      await this.handleFailure(err, job, runId, logFields, started);
    }
  }

  private async handleFailure(
    err: unknown,
    job: Job<OutboxEventJobData>,
    runId: string,
    logFields: Record<string, unknown>,
    started: number,
  ): Promise<never> {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - started;
    const { providerError, permanent, lastAttempt } = classifyJobFailure(err, job);
    if (permanent || lastAttempt) {
      await this.ingestionRuns.finalizeFailure(runId, message);
    } else {
      await this.ingestionRuns.requeueForRetry(runId, message);
    }
    if (providerError) {
      // An expected external failure: the provider said no, or is briefly
      // unavailable. The message is already clean (adapters guarantee it).
      this.logger.warn(
        {
          event: 'accounting.sync.failed',
          ...logFields,
          durationMs,
          code: providerError.code,
          statusCode: providerError.statusCode,
          transient: providerError.transient,
        },
        `Accounting ${this.recordNoun} sync failed: ${message}`,
      );
      // Another attempt would fail identically, so stop BullMQ retrying.
      if (permanent) throw new UnrecoverableError(message);
    } else {
      // Anything else is our bug — log it with the stack.
      this.logger.error(
        { event: 'accounting.sync.failed', ...logFields, durationMs, err: loggableError(err) },
        `Accounting ${this.recordNoun} sync failed unexpectedly`,
      );
    }
    throw err; // transient: BullMQ applies its backoff / attempts
  }
}
