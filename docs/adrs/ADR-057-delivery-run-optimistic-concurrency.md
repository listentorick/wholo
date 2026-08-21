# ADR-057 — Delivery Run optimistic concurrency: single-column CAS, dual CAS targets, return-full-state-on-success

**Status**: Accepted
**Date**: 2026-08-21
**Deciders**: Rick Walsh
**Related**: ADR-008 (movement-based inventory optimistic locking), ADR-018 (REST API design conventions), ADR-034 (transactional outbox for order events), ADR-052 (avoid Prisma-unsupported schema constructs)

---

## Context

The Delivery Runs board (`docs/delivery-planning-pbi-plan.md`, M3) is a shared resource that multiple distributor staff can edit concurrently in real time — dragging cards between runs, reordering within a run, on the same dated board at the same time. No optimistic-concurrency `version` column existed anywhere in the schema before this feature.

ADR-008 already established optimistic locking for inventory, but resolves conflicts via silent server-side retry, because inventory writes come from background/order-flow processes, not a human mid-gesture. A delivery-run conflict needs the opposite treatment: retrying an action blind against a board that changed underneath a human could move the wrong card to the wrong place, so a conflict must surface to the person, not be silently resolved for them.

ADR-018 mandates RFC 7807 Problem Details for all error responses, and this repo's global `ProblemDetailsFilter` flattens every error body down to `type`/`title`/`status`/`detail` — there is no way for an error response to carry structured recovery data such as a fresh `currentVersion`.

## Decision

### 1. `version Int @default(0)` scoped to `DeliveryRun` only

Not a generic optimistic-locking mixin or abstraction reused across tables. It is added to the one entity in the schema with real concurrent human-editing contention. The same shape should be added to other tables individually, if and when they need it — not spread speculatively now.

### 2. Two different CAS targets, deliberately not both `version`

Moving a card between runs CAS's the **destination** run on its own `version` (`updateMany({ where: { id, version, status: 'OPEN' }, data: { version: { increment: 1 } } })`; `count !== 1` → `409`). The **source** side is CAS'd on the allocation row's own active-uniqueness marker (`activeOrderId`, ADR-052) rather than a `sourceVersion` column — "is this delivery still where I think it is?" is exactly what that marker's presence already answers, and checking it directly is strictly stronger than a version compare would be.

The transaction's internal ordering is load-bearing and must be preserved by anyone touching this code: CAS the destination version first (cheapest failure, cleanest `409`); soft-remove the source allocation *before* creating the new one, because the marker's unique constraint is non-deferrable and checked per-statement — create-before-remove would race two rows for one slot; only then blind-increment the source run's version (no CAS needed there — increments commute, and the real invariant was already enforced via the marker in the previous step).

### 3. Every successful mutation returns the full refreshed `DeliveryDayBoard`

`200`, never `204` or a delta. Given (2)'s Problem Details constraint, the success body is the *only* place a new version, resequenced stop numbers, or updated totals can ever reach the client — a `409` triggers a plain re-`GET` instead of trying to recover state from the error. A no-op move (a card dropped back where it started) is detected before the transaction opens and returns the board unchanged, with no version bump and no outbox event, so UI drag jitter can't spam the audit trail with no-op writes.

### 4. Mutations still write an outbox event, deliberately unrouted

Every mutation writes an outbox event in the same transaction (`DeliveryRunOrderMoved`, `DeliveryRunOrderUnassigned`, `DeliveryRunOrdersResequenced`; `aggregateType: 'DeliveryRun'`), following ADR-034's pattern — but with no `EVENT_ROUTES` entry. Nothing consumes these events yet. They exist as an append-only audit trail and a future integration hook (e.g. for a real delivery-provider adapter, per ADR-056/ADR-051's pattern), stated explicitly here so a future reader does not mistake the missing consumer for a bug.

## Consequences

- Conflicts surface to the human as a "someone else changed this" banner plus a refetch — never silently retried. This is an intentional divergence from ADR-008's retry-on-conflict inventory model, driven by who the actor is (a person mid-gesture vs. a background write), not a claim that one approach is universally more correct.
- Returning the full board on every mutation costs more bandwidth than a delta but avoids a second round trip and keeps every client's version/sequence/totals fresh without extra client-side reconciliation logic. If this bandwidth cost ever proves material, the documented fallback is a lighter delta response plus an explicit re-`GET` — not pre-optimized here without evidence it's needed.
- Two people editing different columns of the same board will `409` each other more than feels intuitive, since every move bumps both the destination and source run's version. This is an accepted, previously-flagged trade-off; the documented escape hatch, if it proves to matter in practice, is to drop the source-side bump to a non-CAS'd touch (the real invariant is already protected by the marker check in step 2).
- This CAS-plus-full-state-return shape is the template for any future collaboratively-edited, board-style resource in this codebase — not something specific to delivery runs.
