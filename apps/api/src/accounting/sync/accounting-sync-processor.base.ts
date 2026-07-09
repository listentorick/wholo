import { WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { AccountingConnection, AccountingConnectionStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
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

export interface OutboxEventJobData {
  eventId: string;
  aggregateType: string;
  aggregateId: string; // AccountingConnection id
  payload: unknown;
}

// A domain suggestion row reduced to what the shared lifecycle logic needs:
// its id and which Wholo candidate it currently proposes.
export interface AccountingSyncSuggestionRef {
  id: string;
  candidateId: string;
}

// Framework template for one accounting record-type sync (contacts, products,
// ...). The pipeline shape is always the same — pull provider data via the
// adapter, upsert into the domain's cache table, run the domain's matcher
// against unmapped Wholo candidates, maintain suggestions — so this base owns
// that orchestration and subclasses supply only the domain hooks (which table,
// which matcher, which candidate pool). A new record type, or a whole new
// integration family, adds hooks and tables, never a new pipeline.
//
// Mappings are written exclusively by explicit user actions. The pipeline only
// ever produces suggestions (see shouldAutoLink).
export abstract class AccountingSyncProcessorBase<
  TExternal,
  TCached extends { id: string },
  TCandidate,
  TMethod,
> extends WorkerHost {
  protected abstract readonly logger: Logger;
  // Used in log lines, e.g. 'contact' → "3 contact(s) fetched".
  protected abstract readonly recordNoun: string;
  protected abstract readonly matcher: AccountingRecordMatcher<TCached, TCandidate, TMethod>;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly accountingConnectionService: AccountingConnectionService,
    protected readonly adapters: AccountingAdapterRegistry,
  ) {
    super();
  }

  async process(job: Job<OutboxEventJobData>): Promise<void> {
    const connectionId = job.data.aggregateId;
    const connection = await this.prisma.accountingConnection.findUnique({ where: { id: connectionId } });
    if (!connection) {
      this.logger.warn(`AccountingConnection ${connectionId} no longer exists — skipping sync`);
      return;
    }
    if (connection.status !== AccountingConnectionStatus.CONNECTED) {
      this.logger.log(`AccountingConnection ${connectionId} is not CONNECTED — skipping sync`);
      return;
    }

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

    const cachedRecords = await Promise.all(
      externalRecords.map((record) => this.upsertCacheRecord(connection, record)),
    );

    await this.handleStaleRecords(connection, cachedRecords);

    const candidates = await this.loadMatchCandidates(connection);

    for (const cached of cachedRecords) {
      await this.runMatcherFor(connection, cached, candidates);
    }

    // lastSyncedAt is written by every record-type pipeline on this
    // connection — its semantics are a loose "last successful provider
    // round-trip", not per-record-type freshness (which would need dedicated
    // fields if the UI ever wants it).
    await this.prisma.accountingConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });

    this.logger.log(
      `Accounting ${this.recordNoun} sync complete for connection ${connection.id}: ${externalRecords.length} ${this.recordNoun}(s) fetched`,
    );
  }

  private async runMatcherFor(
    connection: AccountingConnection,
    cached: TCached,
    candidates: TCandidate[],
  ): Promise<void> {
    if (!this.shouldMatch(cached)) return;
    if (await this.hasActiveMapping(cached.id)) return;

    const match = this.matcher.findBestMatch(cached, candidates);

    if (match && this.shouldAutoLink(match)) {
      await this.createMappingFromMatch(connection, cached, match);
      return;
    }

    const existingSuggestion = await this.findOpenSuggestion(cached.id);

    if (existingSuggestion && match && existingSuggestion.candidateId === match.candidateId) {
      await this.updateSuggestion(existingSuggestion.id, match);
      return;
    }

    if (existingSuggestion) {
      await this.supersedeSuggestion(existingSuggestion.id);
    }

    if (match) {
      await this.createSuggestion(connection, cached, match);
    }
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
  // record the distributor deliberately dismissed.
  protected abstract upsertCacheRecord(connection: AccountingConnection, record: TExternal): Promise<TCached>;

  // Reconcile cache rows absent from a full fetch (e.g. Xero Items are hard
  // deleted upstream, so absence is the only deletion signal). Default: no-op
  // for providers/record types with an explicit archived flag.
  protected async handleStaleRecords(_connection: AccountingConnection, _fetched: TCached[]): Promise<void> {
    // no-op by default
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
