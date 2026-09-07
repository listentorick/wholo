# ADR-061: Track external-data ingestion as a generic, live-updating "run"

## Status
Accepted

## Context
Connecting Xero and pulling its contacts, products and tax types ("ingesting")
was fire-and-forget: `POST …/contacts/sync` wrote an `OutboxEvent` and returned
`{ queued: true }` with no id. Nothing recorded that a pull was in progress, so
the admin UI could not show progress, a "syncing" state, or a reliable "last
synced" — and the listing screens showed a misleading "No matching contacts —
adjust your filters" empty state before any data existed.

The **push** side (`AccountingBulkImportJob` + `AccountingBulkImportProcessor`)
already had a good model — a DB row with a status enum, progress counters, a
`results` JSON, an `updatedAt` heartbeat, and a `GET …/bulk-import-jobs/:jobId`
poll endpoint — but the **pull** side had no equivalent.

The team's next external-data integration is expected to be delivery / stock,
not another accounting provider. That is a different domain (no OAuth connection
model, no match-and-suggest pipeline) but it wants the same "tracked background
pull with live progress that survives navigation".

## Decision

### A generic `IngestionRun` row
A source-agnostic `ingestion_runs` table (`apps/api/src/ingestion/`), keyed on
opaque strings — `sourceType`, `sourceRef`, `resourceType` — with `status`
(`QUEUED | PROCESSING | COMPLETED | FAILED`), `trigger` (`MANUAL | SCHEDULED`),
`recordsTotal?` / `recordsProcessed` / `recordsFailed` / `detailCount`,
`errorMessage?`, and `queuedAt` / `startedAt` / `finishedAt` / `updatedAt`.
`IngestionRunService` owns the lifecycle and imports nothing from `accounting`.

Known values today: `sourceType = "accounting"`, `sourceRef =
AccountingConnection.id`, `resourceType ∈ {contact, product, tax_type}`. A new
source (delivery, stock) needs no migration — it picks new string values.

### One row per `(sourceType, sourceRef, resourceType)` — no history
`@@unique([sourceType, sourceRef, resourceType])`; the row is reset and reused
each run. Rationale:
- The UI only needs "current run" + "last succeeded". There is no per-item
  report worth keeping the way `AccountingBulkImportJob.results` is (a bulk
  import is a discrete user-chosen batch; a sync is idempotent full-refresh
  plumbing that runs every 30 min).
- A growing history table would need a pruning policy; a single upserted row
  needs none.
- The unique constraint makes the trigger-time upsert and the scheduled-vs-manual
  dedupe race-safe.
- "Has ever ingested" is derived from `EXISTS(run WHERE status = COMPLETED)`,
  *not* from a column on the connection — `AccountingConnection.lastSyncedAt`
  stays overloaded ("last successful provider round-trip", ADR-051) and is only
  a fallback for the "last synced" caption.

If a durations / failure-rate trail is ever needed: emit an `AuditLog` entry on
finalize (ADR-054), or add a child `IngestionRunAttempt` table without touching
the parent.

### Run created in the outbox transaction; payload carries `{ runId }`
`AccountingSyncService.requestSync` (used by the manual endpoint **and** all three
schedulers) does, in one `prisma.$transaction`: `IngestionRunService.requestRun`
(upsert the row to `QUEUED`) **and** `outbox.writeEvent(… , { runId })`, per
resource type. Both triggers write the byte-identical event. This closes the
orphan-row window that `requestBulkImport` still has (job row created in a
separate transaction from the outbox write).

`requestRun` also **escalates** a running `SCHEDULED` run to `MANUAL` when a user
clicks Sync mid-sweep, so the UI switches from the non-blocking strip to the
full-screen panel.

### `claim` is a conditional compare-and-set
`IngestionRunService.claim(runId)` is a single `updateMany({ where: { id,
status IN (QUEUED, stale-PROCESSING) }, data: { status: PROCESSING } })` acting
only if `count === 1`. `AccountingBulkImportProcessor.claim()` does
`findUnique`-then-`update`, which BullMQ's per-job lock hides today but which
breaks the moment a processor runs multi-replica. The conditional form costs
nothing now and is the prerequisite for scaling (below). Stale-`PROCESSING`
reclaim after `PROCESSING_STALE_MS` (5 min, via the `updatedAt` heartbeat) is the
crash-recovery mechanism — a `finalizeFailure` write that is itself lost still
gets cleaned up.

### Processor changes (`AccountingSyncProcessorBase`)
`process()` now: resolve `runId` from the payload (or `ensureRun` for a legacy
job) → `claim` (bail if unclaimable) → wrap the body so any throw calls
`finalizeFailure(runId, msg)` and rethrows (BullMQ backoff still applies) →
`setTotal` after the fetch → **chunked** upsert (25-wide batches instead of one
`Promise.all` over every record) with a heartbeat between batches → matcher loop
with a heartbeat → keep the existing `lastSyncedAt` write → `finalizeSuccess`.
The not-`CONNECTED` / missing-connection early returns now `finalizeFailure` the
run instead of leaving it stuck `QUEUED`.

### Frontend transport: polling
`IngestionSyncProvider` (an `(app)`-layout context, modelled on
`nav-badges-context`) polls `GET …/accounting/sync/status` — ~3s while a run is
active or was just triggered, ~30s idle. No SSE/websockets: the admin app has no
streaming transport and this stays consistent with `notification-context` /
`nav-badges-context`. State lives above the pages, so a running sync still shows
after navigating away and back.

### Screen behaviour: trigger-dependent
A `MANUAL` run (and the first-ever sync) replaces the tabs/listing with the full
progress panel. A `SCHEDULED` run only shows a non-blocking strip above the
retained listing — the schedulers fire every 30 min *and* on every worker
restart, so a background refresh must not yank the screen out from under a
distributor mid-review.

### Concurrency & throughput
- **No immediate `onModuleInit` sweep.** Each scheduler used to enqueue a sync
  for every CONNECTED connection the instant the worker booted — i.e. on every
  deploy. Replaced with a delayed first run (~90s) plus a per-connection random
  jitter, so the burst does not coincide with the deploy.
- **Chunked upsert** (above) bounds each job's DB footprint against the
  10-connection pool.
- **`@Processor(queue, { concurrency: 2 })`** on the three sync processors —
  documents intent (vs the implicit default of 1) and stays within the pool.
- **`attempts: 3, backoff exponential 30s`** on the three sync queues (fewer than
  invoice-export's 5 — every retry is a full provider re-fetch).
- Xero rate limits are *not* a concern: limits are per-tenant (~60/min,
  ~5000/day), so one connection's full sync is a handful of calls every 30 min,
  and the serial per-queue drain keeps the app-wide rate low.

### Scaling later (ADR-047)
Scaling sync throughput = split the three sync processors into their own
multi-replica deployment (`wholo-sync-worker`), leaving the singleton
`wholo-worker` with the outbox relay + schedulers. Queues make that a Helm
change, not a redesign; the conditional-update `claim()` is the one code
prerequisite and is already in place.

## Consequences
- The three per-resource `POST …/{contacts,products,tax-types}/sync` endpoints
  and their `admin-api` / client methods are removed; one `POST …/accounting/sync`
  fires all three. The `Accounting*SyncRequested` event types and `EVENT_ROUTES`
  entries stay (schedulers still use them).
- Between a `FAILED` finalize and the next BullMQ retry claiming the row, the
  panel briefly shows `FAILED` then `PROCESSING`. Accepted — the row cannot
  cheaply know "a retry is pending".
- One extra always-on poller for every admin user; the idle endpoint is a single
  `findFirst` on `accounting_connections`, polled at 30s (same as notifications).

## Extraction checklist for a non-accounting source
1. A `sourceRef` mapping (what identifies "one connection/config" for this source).
2. A trigger path that, in one transaction, calls `IngestionRunService.requestRun`
   and writes an outbox event — plus the new event type + `EVENT_ROUTES` entry
   and its processor (ADR-047 subscription contract).
3. A processor that calls `claim` / `setTotal` / `heartbeat` / `finalize*`.
4. A `GET …/<source>/ingestion/status` handler (connection lookup +
   `IngestionRunService.listRuns`).
5. A frontend label map for `IngestionProgressPanel`, and either a second
   provider instance or a multi-source `IngestionSyncProvider`.

Everything else — the table, `IngestionRunService`, `IngestionProgressPanel`, the
escalating poller — is reused unchanged.

## References
- ADR-034 — transactional outbox (run row committed with the event)
- ADR-047 — per-concern BullMQ queues, single-replica worker, "has it been dealt
  with?" answered from the consumer's own table (here `IngestionRun`)
- ADR-051 — provider-neutral accounting; `lastSyncedAt` overload
- ADR-023 — product ingestion pipeline (this is the run-tracking half of that
  vision, generalised)
