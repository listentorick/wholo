# ADR-054 — Application-Level Audit Log for Order/Invoice Lifecycle Events

**Status**: Accepted
**Date**: 2026-08-03
**Deciders**: Rick Walsh
**Related**: ADR-034 (transactional outbox for order domain events)

---

## Context

The admin order detail page's Timeline needed to show who did what and when across an order's life (submitted, accepted, rejected, cancelled, invoice raised/failed) — not just the order's current denormalized fields (`acceptedAt`, `cancelledReason`, etc.), which can only ever show the *latest* transition, discard the actor for earlier ones, and don't cover related-entity events like an invoice export failing.

The event-sourcing-adjacent machinery already in the codebase for this class of problem is the transactional outbox (`outbox_events`, ADR-034): a table written in the same DB transaction as the state change, drained asynchronously by a publisher. That pattern exists to solve a dual-write problem for events that must reach an *external* consumer (Xero, notifications) without risk of the write succeeding and the publish being lost. An audit trail has no such external consumer — it is read back in-process, by the same API, for display. Routing it through the outbox would add a publish/consume hop (and the at-least-once, must-be-idempotent handling that implies) to solve a problem the audit log doesn't have, and would leave the row in a `PENDING` state that means nothing for something that's already fully written.

## Decision

A dedicated `AuditLog` table and `AuditService` are used instead, modeled on the outbox's core discipline (write inside the same transaction as the state change) but without its async publish stage:

```
model AuditLog {
  id            String    @id @default(cuid())
  distributorId String
  entityType    String    -- e.g. "ORDER"
  entityId      String
  action        String    -- e.g. "ORDER_SUBMITTED", "INVOICE_EXPORT_FAILED"
  actorType     ActorType -- USER | SYSTEM
  actorUserId   String?
  actorName     String?
  summary       String
  changes       Json?
  createdAt     DateTime  @default(now())

  @@index([distributorId, entityType, entityId, createdAt])
}
```

- `AuditService.record()` takes a `Prisma.TransactionClient` as its first argument (the same convention as `OutboxService.writeEvent()`) so a row can only be written from inside an open transaction — it lands or the whole state change rolls back together, with no separate publish step to fail or be delayed.
- `entityType`/`entityId` are generic (not `orderId`) so the same table can carry audit rows for other entities later without a schema change; `distributorId` is denormalized onto every row (not derived via a join through the entity) so the index can enforce the distributor boundary directly.
- `actorType: SYSTEM` (with `actorUserId`/`actorName` omitted) covers automated transitions — auto-accept on submission, invoice export success/failure from the background processor — so the Timeline can render "System" rather than requiring a fabricated user.
- Current writers: `OrdersService` (submit, cancel), `AdminOrdersService` (accept, reject, cancel), `AccountingInvoiceExportService` (retry requested), and `AccountingInvoiceExportProcessor` (export completed/failed) — all in `apps/api`.

## Consequences

- Timeline reads are a straightforward indexed query (`distributorId, entityType, entityId`, ordered by `createdAt`) with no eventual-consistency window — the row is visible the instant the transaction that wrote it commits, unlike outbox-published events which land after the async publisher drains them.
- Because `distributorId` is on every row directly, a broken or missing join can't leak another distributor's audit trail the way the pre-fix analytics query did (see the `TradeRelationship` id/`Organisation` id mixup fixed in the "broken links" commit, a different instance of the same join-boundary class of bug) — but this still relies on every future writer passing the correct `distributorId`, the same way every other multi-tenant query in this codebase does; there is no DB-level tenant enforcement (e.g. RLS).
- `admin-api`'s copy of `schema.prisma` was updated by hand to keep enum/model types in sync, per existing convention (CLAUDE.md, ADR-026) — `admin-api` does not own a migration or a live connection to this table.
- Not a general-purpose event bus: if a future consumer needs to *react* to one of these events (not just display it), that belongs on the outbox, not this table — `AuditService` has no publish/consumer story and should not grow one; a second write (outbox + audit log) from the same transaction is the correct shape if both needs exist for the same event.
- No dedicated audit integration test exists yet (writes are exercised indirectly via `admin-orders.integration-spec.ts`); a direct multi-tenancy isolation test for `AuditLog` — in the spirit of the Prisma-trigger tests mandated by ADR-052 — is an open item if this table grows more writers.
