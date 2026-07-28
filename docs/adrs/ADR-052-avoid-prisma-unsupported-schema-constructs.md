# ADR-052: Avoid database constructs Prisma's schema DSL can't express — use nullable marker columns instead of partial indexes

## Status
Accepted

## Context
Migrations failed repeatedly across multiple sessions, requiring manual recovery and, at times, a full database reset. A complete audit of all migration history (37 migrations) traced this to two categories of database object that exist in Postgres but have no representation in `schema.prisma`, so every `prisma migrate dev` mis-diffs them:

1. **TimescaleDB auto-created indexes.** `SELECT create_hypertable('order_facts', 'occurredAt')` (hand-appended SQL, since Prisma has no hypertable concept) creates an index on the partitioning column as a side effect. Undeclared in `schema.prisma`, so Prisma proposes dropping it on every unrelated migration.
2. **Partial (filtered) unique indexes.** Six indexes across four tables (`accounting_connections`, `trade_relationships`, `customer_accounting_mappings`, `product_accounting_mappings`) enforce "unique among active/current rows only" — e.g. one `CONNECTED` accounting connection per distributor, historical `DISCONNECTED`/`ERROR`/`REVOKED` rows exempt — via a hand-written `WHERE` clause on a `CREATE UNIQUE INDEX`, because Prisma's schema DSL has no syntax for a conditional unique constraint. Two of these six aren't declared in `schema.prisma` at all, meaning a future migration could **silently drop** a real production constraint rather than fail loudly.

Prisma 7 introduced a `partialIndexes` preview feature (7.4.0, Feb 2026) that looked like a direct fix. It was evaluated and rejected: as of the latest release at the time of writing (7.9.0), it has multiple **open** GitHub issues, including #29446 ("Prisma 7.7 Unique Partial Indexes still bugged"), and #29415/#29386 ("infinite migration drift" specifically triggered by a string/enum column in the `WHERE` clause) — which is exactly our `accounting_connections` case (`WHERE status = 'CONNECTED'`). Adopting a still-actively-buggy preview feature, on top of a major Prisma version upgrade, would trade one drift problem for a different, worse one.

## Decision
Never introduce a database construct that `schema.prisma` cannot fully and correctly describe. Concretely:

- **No hand-edited migration SQL to add anything schema.prisma doesn't know about as a schema/index/constraint** (partial/filtered indexes, etc.). If Postgres can do it but Prisma can't model it as a schema construct, don't rely on it — model the equivalent using constructs Prisma has always supported.
- **"Unique among active rows only"** is modeled with a **nullable marker column**, not a partial index. Postgres unique constraints never treat two `NULL`s as equal, so a column that mirrors the natural key only while the row is "active" (and is `NULL` otherwise) reproduces partial-index behavior with a plain, fully-native `@@unique`:

  | Table | Business rule | Marker column | Constraint |
  |---|---|---|---|
  | `accounting_connections` | one `CONNECTED` per distributor | `connectedDistributorId` (= `distributorId` while `CONNECTED`, else `null`) | `@@unique([connectedDistributorId])` |
  | `trade_relationships` | one live account number per distributor | `activeAccountNumber` (= `accountNumber` while not soft-deleted, else `null`) | `@@unique([distributorId, activeAccountNumber])` |
  | `customer_accounting_mappings` | one active link per pair (×2 pairs) | `linkedMarker` (`true` while linked, else `null`) | `@@unique([..., linkedMarker])` ×2 |
  | `product_accounting_mappings` | same, product-side | `linkedMarker` | same, ×2 |

  The original columns (`status`, `deletedAt`, `unlinkedAt`) are untouched — they keep carrying full history/detail on every row. The marker column's only job is the uniqueness rule.

- **The marker column is maintained by a Postgres trigger, not application code.** The first version of this fix had each service method hand-set the marker column alongside the real column (e.g. set `connectedDistributorId` wherever `status` is set to `CONNECTED`/`DISCONNECTED`/`ERROR`). Two integration tests — deliberately written to insert directly via raw Prisma, bypassing the service layer, to prove the constraint holds "at the database level, independent of app-level validation" — caught that this was **not actually bypass-proof**: a raw insert that didn't know to set the marker column left it `null`, silently defeating the uniqueness rule. This reproduced the exact failure mode the original partial indexes were built to prevent (they enforced the rule from the row's own real data, with no way to bypass them).

  The fix: a `BEFORE INSERT OR UPDATE` trigger per table that unconditionally recomputes the marker column from the real gating column, so it's correct regardless of what writes the row — restoring the original bypass-proof guarantee. Application code no longer sets these columns at all.

  Triggers are hand-written directly in a migration (via `migrate dev --create-only` against an empty diff, since there's nothing in `schema.prisma` to generate them from), but — verified against Prisma's own docs and issue tracker before relying on this — **triggers have zero footprint anywhere in Prisma's tooling**: no schema DSL attribute, no preview feature (not even an open one — a single stale 2022 feature request bundling it with unrelated work), and no introspection/diffing awareness. Prisma's introspection docs list the database features it explicitly warns about as unsupported (partitioned tables, row-level security, check/exclusion constraints, expression indexes, etc.) — triggers aren't on that list because Prisma doesn't look for them at all. That makes a trigger strictly safer than a partial index for this purpose: Prisma can never try to create, alter, or drop something it has no concept of, so this cannot become a new source of the drift this ADR exists to eliminate.

  Verified empirically (not just by reasoning about Prisma's docs) before trusting this in any migration meant for live: applied the trigger migration to local dev, then via raw `psql` — bypassing the app entirely — confirmed (a) a plain `INSERT` with no mention of the marker column gets it set correctly by the trigger, and (b) a second raw `INSERT` violating the business rule is rejected by the unique constraint. Also confirmed the dollar-quoted `plpgsql` function bodies execute correctly through `prisma migrate deploy` with no statement-splitting issues. Then re-ran the two integration tests that originally caught the gap — both pass.

- **TimescaleDB hypertable indexes**: declare a matching `@@index` in `schema.prisma` so Prisma knows about them (Prisma's default naming convention already matches what `create_hypertable()` produces).

- **Standing procedure**: never blind-confirm a migration. Use `prisma migrate dev --create-only` to generate the SQL without applying it, read the file, then `prisma migrate deploy` to apply exactly what was reviewed. This is the actual backstop against a future undeclared object causing a silent drop — independent of how thorough any one schema cleanup is.

## Consequences
- No preview features, no major-version Prisma upgrade required or planned.
- Every future `migrate dev` diff should be clean and noise-free for schema/index/column purposes — `schema.prisma` now describes 100% of the constructs it's capable of describing. Triggers are a permanent, deliberate exception: hand-written once, invisible to Prisma forever, documented here rather than in `schema.prisma` (which has no way to reference them).
- No application-code bookkeeping burden: the marker columns are entirely trigger-maintained, so service methods only ever touch the real column (`status`, `unlinkedAt`, `deletedAt`) and never need to remember the marker column exists.
- The four marker columns and four triggers are additive; existing queries/behavior are unaffected. Local dev data is backfilled in place (no wipe required). Live is being reset independently for other reasons, so schema is simply applied fresh there — the triggers apply to an empty table with nothing to backfill.
