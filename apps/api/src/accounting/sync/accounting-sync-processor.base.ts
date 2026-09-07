import { WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { AccountingConnection, AccountingConnectionStatus, IngestionRunTrigger } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HEARTBEAT_ITEM_INTERVAL,
  HEARTBEAT_TIME_INTERVAL_MS,
  IngestionRunService,
} from '../../ingestion/ingestion-run.service';
import { ACCOUNTING_SOURCE_TYPE } from './accounting-sync.constants';
import { AccountingConnectionService } from '../accounting-connection.service';
import { AccountingAdapterRegistry } from '../adapters/accounting-adapter.registry';
import {
  AccountingConnectionAdapter,
  AccountingTokenSet,
} from '../adapters/accounting-connection-adapter.interface';
import {
  AccountingMatchResult,
  AccountingRecordMatcher,
} from '../matching/accounting-record-matcher.interface';
import { AccountingChangeDetectionService } from '../accounting-change-detection.service';

export interface OutboxEventJobData {
  eventId: string;
  aggregateType: string;
  aggregateId: string; // AccountingConnection id
  payload: unknown; // { runId?: string }
}

// A domain suggestion row reduced to what the shared lifecycle logic needs:
// its id and which Wholo candidate it currently proposes.
export interface AccountingSyncSuggestionRef {
  id: string;
  candidateId: string;
}

type MatcherOutcome = 'created' | 'updated' | 'superseded' | 'none';

// How a cache upsert changed the row this run — drives the
// new/updated/removed/unchanged breakdown on the "sync complete" panel.
// "updated" means a stored field actually moved, not merely that the row was
// seen again. "removed" is for record types that carry their own archived flag
// (contacts): a row that flipped to archived this run. Record types where
// disappearance from the fetch is the only deletion signal (products, tax
// types) report removals via handleStaleRecords' return instead.
export type CacheRecordChange = 'created' | 'updated' | 'removed' | 'unchanged';

export interface CacheUpsertResult<TCached> {
  record: TCached;
  change: CacheRecordChange;
}

// Equality for change classification — tolerant of the shapes Prisma returns:
// Decimal (compare stringified), Date (compare epoch), and null/undefined
// treated as the same "absent" value.
function fieldValuesEqual(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === 'object' && typeof b === 'object' && 'toString' in a && 'toString' in b) {
    return a.toString() === b.toString();
  }
  return a === b;
}

// How many cache upserts run in parallel per batch. The old code did one big
// Promise.all over every record; with 3 sync jobs in flight that could pin
// hundreds of connections against a pool of 10. Batching bounds the burst and
// gives a natural point to heartbeat progress. See ADR-061 / "Concurrency".
const UPSERT_BATCH_SIZE = 25;

// Framework template for one accounting record-type sync (contacts, products,
// ...). The pipeline shape is always the same — pull provider data via the
// adapter, upsert into the domain's cache table, run the domain's matcher
// against unmapped Wholo candidates, maintain suggestions — so this base owns
// that orchestration and subclasses supply only the domain hooks (which table,
// which matcher, which candidate pool). A new record type, or a whole new
// integration family, adds hooks and tables, never a new pipeline.
//
// Progress + failure are tracked in an IngestionRun row (source-agnostic) so
// the admin UI can show live progress that survives navigation. Mappings are
// written exclusively by explicit user actions; the pipeline only ever
// produces suggestions (see shouldAutoLink).
export abstract class AccountingSyncProcessorBase<
  TExternal,
  TCached extends { id: string },
  TCandidate,
  TMethod,
> extends WorkerHost {
  protected abstract readonly logger: Logger;
  // Used in log lines, e.g. 'contact' → "3 contact(s) fetched".
  protected abstract readonly recordNoun: string;
  // Opaque IngestionRun.resourceType, e.g. 'contact' | 'product' | 'tax_type'.
  protected abstract readonly resourceType: string;
  protected abstract readonly matcher: AccountingRecordMatcher<TCached, TCandidate, TMethod>;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly accountingConnectionService: AccountingConnectionService,
    protected readonly adapters: AccountingAdapterRegistry,
    protected readonly changeDetection: AccountingChangeDetectionService,
    protected readonly ingestionRuns: IngestionRunService,
  ) {
    super();
  }

  async process(job: Job<OutboxEventJobData>): Promise<void> {
    const connectionId = job.data.aggregateId;
    const runIdFromPayload = (job.data.payload as { runId?: string } | undefined)?.runId ?? null;

    const connection = await this.prisma.accountingConnection.findUnique({ where: { id: connectionId } });
    if (!connection) {
      this.logger.warn(`AccountingConnection ${connectionId} no longer exists — skipping sync`);
      if (runIdFromPayload) {
        await this.ingestionRuns.finalizeFailure(runIdFromPayload, 'Accounting connection no longer exists');
      }
      return;
    }
    if (connection.status !== AccountingConnectionStatus.CONNECTED) {
      this.logger.log(`AccountingConnection ${connectionId} is not CONNECTED — skipping sync`);
      if (runIdFromPayload) {
        await this.ingestionRuns.finalizeFailure(runIdFromPayload, 'Accounting connection is not connected');
      }
      return;
    }

    // Pre-`runId` jobs (a deploy straddling this change) have no runId in the
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
    if (!run) {
      // Already COMPLETED, or a live attempt holds it.
      return;
    }

    try {
      await this.runSync(connection, runId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.ingestionRuns.finalizeFailure(runId, message);
      throw err; // let BullMQ apply its backoff / attempts
    }
  }

  private async runSync(connection: AccountingConnection, runId: string): Promise<void> {
    const tokenSet = await this.accountingConnectionService.getValidTokenSet(
      connection.distributorId,
      connection.provider,
    );
    const adapter = this.adapters.get(connection.provider);
    // Deliberately a full fetch every time, not an incremental one keyed off
    // connection.lastSyncedAt: that field also means "last successful token
    // refresh" (see AccountingConnectionService.getValidTokenSet, called
    // just above) — reusing it as an If-Modified-Since cursor conflates two
    // different clocks and can silently starve the sync of everything that
    // existed before some unrelated token refresh. A proper incremental
    // cursor needs its own dedicated field; not worth the complexity yet at
    // this feature's record volumes.
    const externalRecords = await this.fetchExternalRecords(adapter, tokenSet, connection.externalOrganisationId);
    await this.ingestionRuns.setTotal(runId, externalRecords.length);

    // Upsert in bounded batches, heartbeating progress between them.
    const cachedRecords: TCached[] = [];
    let created = 0;
    let updated = 0;
    let removed = 0;
    let lastBeat = Date.now();
    for (let i = 0; i < externalRecords.length; i += UPSERT_BATCH_SIZE) {
      const batch = externalRecords.slice(i, i + UPSERT_BATCH_SIZE);
      const results = await Promise.all(batch.map((record) => this.upsertCacheRecord(connection, record)));
      for (const result of results) {
        cachedRecords.push(result.record);
        if (result.change === 'created') created += 1;
        else if (result.change === 'updated') updated += 1;
        else if (result.change === 'removed') removed += 1;
      }
      if (cachedRecords.length % (HEARTBEAT_ITEM_INTERVAL * 2) === 0 || Date.now() - lastBeat > HEARTBEAT_TIME_INTERVAL_MS) {
        await this.ingestionRuns.heartbeat(runId, {
          recordsProcessed: cachedRecords.length,
          recordsCreated: created,
          recordsUpdated: updated,
          recordsRemoved: removed,
        });
        lastBeat = Date.now();
      }
    }
    await this.ingestionRuns.heartbeat(runId, {
      recordsProcessed: cachedRecords.length,
      recordsCreated: created,
      recordsUpdated: updated,
      recordsRemoved: removed,
    });

    // Record types without a per-record archived flag surface removals here.
    removed += await this.handleStaleRecords(connection, cachedRecords);

    const candidates = await this.loadMatchCandidates(connection);

    let suggestionsCreated = 0;
    let matched = 0;
    lastBeat = Date.now();
    for (const cached of cachedRecords) {
      const outcome = await this.runMatcherFor(connection, cached, candidates);
      if (outcome === 'created') suggestionsCreated += 1;
      matched += 1;
      if (matched % HEARTBEAT_ITEM_INTERVAL === 0 || Date.now() - lastBeat > HEARTBEAT_TIME_INTERVAL_MS) {
        await this.ingestionRuns.heartbeat(runId, { detailCount: suggestionsCreated });
        lastBeat = Date.now();
      }
    }

    // lastSyncedAt is written by every record-type pipeline on this
    // connection — its semantics are a loose "last successful provider
    // round-trip", not per-record-type freshness (which would need dedicated
    // fields if the UI ever wants it).
    await this.prisma.accountingConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });

    await this.ingestionRuns.finalizeSuccess(runId, {
      recordsProcessed: cachedRecords.length,
      recordsCreated: created,
      recordsUpdated: updated,
      recordsRemoved: removed,
      detailCount: suggestionsCreated,
    });

    this.logger.log(
      `Accounting ${this.recordNoun} sync complete for connection ${connection.id}: ${externalRecords.length} ${this.recordNoun}(s) fetched ` +
        `(${created} new, ${updated} updated, ${removed} removed), ${suggestionsCreated} suggestion(s) created`,
    );
  }

  // Classify a cache upsert for the "sync complete" breakdown: no previous row
  // → created; any of the given stored fields moved → updated; otherwise the
  // row was seen again unchanged. `fields` should be the business fields shown
  // in the review table, not sync bookkeeping columns (lastSyncedAt etc.).
  protected classifyChange(
    previous: Record<string, unknown> | null,
    current: Record<string, unknown>,
    fields: string[],
  ): CacheRecordChange {
    if (!previous) return 'created';
    const moved = fields.some((field) => !fieldValuesEqual(previous[field], current[field]));
    return moved ? 'updated' : 'unchanged';
  }

  private async runMatcherFor(
    connection: AccountingConnection,
    cached: TCached,
    candidates: TCandidate[],
  ): Promise<MatcherOutcome> {
    if (!this.shouldMatch(cached)) return 'none';
    if (await this.hasActiveMapping(cached.id)) return 'none';

    const match = this.matcher.findBestMatch(cached, candidates);

    if (match && this.shouldAutoLink(match)) {
      await this.createMappingFromMatch(connection, cached, match);
      return 'none';
    }

    const existingSuggestion = await this.findOpenSuggestion(cached.id);

    if (existingSuggestion && match && existingSuggestion.candidateId === match.candidateId) {
      await this.updateSuggestion(existingSuggestion.id, match);
      return 'updated';
    }

    if (existingSuggestion) {
      await this.supersedeSuggestion(existingSuggestion.id);
    }

    if (match) {
      await this.createSuggestion(connection, cached, match);
      return 'created';
    }

    return existingSuggestion ? 'superseded' : 'none';
  }

  // ── Domain hooks ────────────────────────────────────────────────────────

  // The only provider call in the pipeline (e.g. adapter.listContacts).
  protected abstract fetchExternalRecords(
    adapter: AccountingConnectionAdapter,
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
  ): Promise<TExternal[]>;

  // Upsert one fetched record into the domain cache table. Must leave
  // ignoredAt untouched on update — a re-sync must not silently un-ignore a
  // record the distributor deliberately dismissed. Returns whether the row was
  // created, had a stored field change, or was seen again unchanged (drives the
  // "sync complete" panel breakdown).
  protected abstract upsertCacheRecord(
    connection: AccountingConnection,
    record: TExternal,
  ): Promise<CacheUpsertResult<TCached>>;

  // Reconcile cache rows absent from a full fetch (e.g. Xero Items are hard
  // deleted upstream, so absence is the only deletion signal). Returns the
  // number of rows newly marked removed this run. Default: no-op (0) for
  // providers/record types with an explicit archived flag on the record itself.
  protected async handleStaleRecords(_connection: AccountingConnection, _fetched: TCached[]): Promise<number> {
    return 0;
  }

  // The pool of unmapped Wholo candidates the matcher ranks against.
  protected abstract loadMatchCandidates(connection: AccountingConnection): Promise<TCandidate[]>;

  // Whether this cache row should be considered for matching at all
  // (e.g. skip archived/ignored rows).
  protected abstract shouldMatch(cached: TCached): boolean;

  protected abstract hasActiveMapping(cachedId: string): Promise<boolean>;

  // Suggestion lifecycle — thin accessors over the domain's suggestion table.
  protected abstract findOpenSuggestion(cachedId: string): Promise<AccountingSyncSuggestionRef | null>;
  protected abstract updateSuggestion(suggestionId: string, match: AccountingMatchResult<TMethod>): Promise<void>;
  protected abstract supersedeSuggestion(suggestionId: string): Promise<void>;
  protected abstract createSuggestion(
    connection: AccountingConnection,
    cached: TCached,
    match: AccountingMatchResult<TMethod>,
  ): Promise<void>;

  // Auto-link decision point. Deliberately false for every record type today:
  // all mappings require explicit user confirmation (mirrors the contacts
  // MVP). Enabling it (e.g. for unique SKU_EXACT matches) is a product
  // decision, likely a per-connection setting — a subclass that flips this on
  // must also implement createMappingFromMatch.
  protected shouldAutoLink(_match: AccountingMatchResult<TMethod>): boolean {
    return false;
  }

  protected createMappingFromMatch(
    _connection: AccountingConnection,
    _cached: TCached,
    _match: AccountingMatchResult<TMethod>,
  ): Promise<void> {
    return Promise.reject(new Error('Auto-linking is enabled but createMappingFromMatch is not implemented'));
  }
}
