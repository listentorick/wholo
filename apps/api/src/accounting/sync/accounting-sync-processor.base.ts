import { Logger } from '@nestjs/common';
import { AccountingConnection } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IngestionRunService } from '../../ingestion/ingestion-run.service';
import { AccountingConnectionService } from '../accounting-connection.service';
import { AccountingAdapterRegistry } from '../adapters/accounting-adapter.registry';
import {
  AccountingConnectionAdapter,
  AccountingFetchResult,
  AccountingTokenSet,
} from '../adapters/accounting-connection-adapter.interface';
import {
  AccountingMatchResult,
  AccountingRecordMatcher,
} from '../matching/accounting-record-matcher.interface';
import { AccountingChangeDetectionService } from '../accounting-change-detection.service';
import { AccountingPullProcessorBase, PullContext, PullResult } from './accounting-pull-processor.base';

// Re-exported for the processors and specs that import them from here.
export { OutboxEventJobData, shouldRunFull } from './accounting-pull-processor.base';

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

// Pull base for record types the distributor reviews and maps (contacts,
// products, tax rates) — AccountingPullProcessorBase (run lifecycle, token,
// heartbeat, failure policy; the guide for pulls is in its header) plus the
// cache → match → suggestion pipeline. The pipeline shape is always the same —
// pull provider data via the adapter, upsert into the domain's cache table,
// run the domain's matcher against unmapped Stocdup candidates, maintain
// suggestions — so this base owns that orchestration and subclasses supply
// only the domain hooks (which table, which matcher, which candidate pool). A
// new record type, or a whole new provider, adds hooks and tables, never a
// new pipeline.
//
// Mappings are written exclusively by explicit user actions; the pipeline only
// ever produces suggestions (see shouldAutoLink).
export abstract class AccountingSyncProcessorBase<
  TExternal,
  TCached extends { id: string },
  TCandidate,
  TMethod,
> extends AccountingPullProcessorBase {
  protected abstract readonly logger: Logger;
  protected abstract readonly matcher: AccountingRecordMatcher<TCached, TCandidate, TMethod>;

  constructor(
    prisma: PrismaService,
    accountingConnectionService: AccountingConnectionService,
    adapters: AccountingAdapterRegistry,
    protected readonly changeDetection: AccountingChangeDetectionService,
    ingestionRuns: IngestionRunService,
  ) {
    super(prisma, accountingConnectionService, adapters, ingestionRuns);
  }

  protected async pull({ connection, adapter, tokenSet, cursor, full, progress }: PullContext): Promise<PullResult> {
    // Incremental pulls pass the stored cursor (opaque, adapter-produced); a
    // full pull passes null.
    const fetched = await this.fetchExternalRecords(adapter, tokenSet, connection.externalOrganisationId, cursor);
    const externalRecords = fetched.records;
    await progress.setTotal(externalRecords.length);

    // Upsert in bounded batches, heartbeating progress between them.
    const cachedRecords: TCached[] = [];
    let created = 0;
    let updated = 0;
    let removed = 0;
    const upsertCounts = () => ({
      recordsProcessed: cachedRecords.length,
      recordsCreated: created,
      recordsUpdated: updated,
      recordsRemoved: removed,
    });
    for (let i = 0; i < externalRecords.length; i += UPSERT_BATCH_SIZE) {
      const batch = externalRecords.slice(i, i + UPSERT_BATCH_SIZE);
      const results = await Promise.all(batch.map((record) => this.upsertCacheRecord(connection, record)));
      for (const result of results) {
        cachedRecords.push(result.record);
        if (result.change === 'created') created += 1;
        else if (result.change === 'updated') updated += 1;
        else if (result.change === 'removed') removed += 1;
      }
      await progress.tick(upsertCounts(), batch.length);
    }
    await progress.flush(upsertCounts());

    // Absence from the fetched set only means "deleted upstream" when the
    // fetch was full — an incremental pull returns just the changed records.
    if (full) {
      removed += await this.handleStaleRecords(connection, cachedRecords);
    }

    const candidates = await this.loadMatchCandidates(connection);

    let suggestionsCreated = 0;
    for (const cached of cachedRecords) {
      const outcome = await this.runMatcherFor(connection, cached, candidates);
      if (outcome === 'created') suggestionsCreated += 1;
      await progress.tick({ detailCount: suggestionsCreated });
    }

    return {
      counts: { ...upsertCounts(), recordsRemoved: removed, detailCount: suggestionsCreated },
      nextCursor: fetched.nextCursor,
      summary: {
        fields: { fetched: externalRecords.length, created, updated, removed, suggestionsCreated },
        message:
          `Accounting ${this.recordNoun} sync complete: ${externalRecords.length} ${this.recordNoun}(s) fetched ` +
          `(${created} new, ${updated} updated, ${removed} removed), ${suggestionsCreated} suggestion(s) created`,
      },
    };
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
  // cursor is null for a full pull; record types with no incremental option
  // ignore it and return nextCursor null.
  protected abstract fetchExternalRecords(
    adapter: AccountingConnectionAdapter,
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    cursor: string | null,
  ): Promise<AccountingFetchResult<TExternal>>;

  // Upsert one fetched record into the domain cache table. Must leave
  // ignoredAt untouched on update — a re-sync must not silently un-ignore a
  // record the distributor deliberately dismissed. Returns whether the row was
  // created, had a stored field change, or was seen again unchanged (drives the
  // "sync complete" panel breakdown).
  protected abstract upsertCacheRecord(
    connection: AccountingConnection,
    record: TExternal,
  ): Promise<CacheUpsertResult<TCached>>;

  // Reconcile cache rows absent from a FULL fetch (e.g. Xero Items are hard
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
