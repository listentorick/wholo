# ADR-008: Movement-based inventory with optimistic locking

## Status
Accepted

## Context
Inventory is a critical domain that must handle concurrent updates from multiple sources: customer orders reserving stock, warehouse staff receiving stock, drivers completing deliveries and adjustments for damaged or lost goods. The inventory model must be auditable, accurate and safe under concurrent access.

Two approaches were considered:
- **Balance-only model** — a single quantity column updated in place. Simple but loses history and requires careful locking.
- **Movement-based model** — every stock change creates an immutable movement record; the current balance is derived from movements. Provides a full audit trail.

For concurrency, pessimistic locking (`SELECT FOR UPDATE`) and optimistic locking (version column) were considered.

## Decision
Inventory uses a **movement-based model**. Every stock change (order reservation, stock receipt, dispatch, delivery, adjustment) creates a stock movement record. Current balances are maintained as a derived aggregate and updated transactionally alongside each movement record.

**Optimistic locking** (a `version` column on the inventory balance record) is used to detect concurrent write conflicts. If a conflict is detected, the operation is retried. This keeps transactions short and avoids holding row locks across network calls.

## Consequences
- Full audit trail of all stock changes with timestamps and reasons.
- Optimistic locking means retries are needed on conflict; retry logic must be implemented in the inventory service.
- Under very high concurrent order volume, retry rates may increase; this should be monitored and pessimistic locking reconsidered if it becomes an issue.
- Movement records grow over time; archiving or partitioning of old movement data should be planned for long-running distributors.
