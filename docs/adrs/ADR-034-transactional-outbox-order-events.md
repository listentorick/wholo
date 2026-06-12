# ADR-034 — Transactional Outbox for Order Domain Events

**Status**: Accepted  
**Date**: 2026-06-12  
**Deciders**: Rick Walsh

---

## Context

Order state changes (submitted, accepted, rejected, cancelled) need to be communicated to downstream systems — most immediately the Xero integration (ADR-006), but also future systems such as delivery scheduling and notifications (ADR-017).

The naive approach is to publish to a message queue (BullMQ, ADR-005) inside the same API request that writes the order state change. This creates a dual-write problem: if the application crashes after writing to the database but before publishing to the queue, the event is silently lost. The reverse (published but database write failed) would cause ghost events with no matching order.

---

## Decision

Order domain events are written to an `outbox_events` table **within the same database transaction** as the order state change. A separate, asynchronous publisher process reads pending outbox rows and dispatches them to the message queue (or directly to downstream APIs), then marks them as `PUBLISHED`.

The `outbox_events` table:

```
id              TEXT PRIMARY KEY (CUID)
aggregateType   TEXT          -- e.g. "Order"
aggregateId     TEXT          -- the order ID
eventType       TEXT          -- e.g. "OrderSubmitted", "OrderAccepted"
payload         JSONB         -- full event data at the time of the state change
status          ENUM          -- PENDING | PUBLISHED | FAILED
createdAt       TIMESTAMP
publishedAt     TIMESTAMP
failedAt        TIMESTAMP
retryCount      INTEGER
errorMessage    TEXT
```

Events emitted per state transition:

| State change | Events written |
|---|---|
| Cart submitted, mode = MANUAL | `OrderSubmitted` |
| Cart submitted, mode = AUTO_ON_SUBMISSION | `OrderSubmitted` + `OrderAccepted` |
| Distributor accepts | `OrderAccepted` |
| Distributor rejects | `OrderRejected` |
| Customer or distributor cancels | `OrderCancelled` |

The `OutboxService.writeEvent()` method takes a Prisma transaction client (`tx`) as its first argument, enforcing that it can only be called within an open transaction.

---

## Consequences

### At-least-once delivery

If the publisher process crashes between reading and marking an event as published, it will be retried on restart. Downstream consumers must be idempotent (handle receiving the same event twice).

### No lost events

Because the outbox write is in the same transaction as the order state change, a crash cannot produce an order with no events or events with no matching order. The database guarantees atomicity.

### Decoupled from Xero timing

Xero integration is not in the critical path of order placement. The customer gets an immediate response; Xero sync happens asynchronously via the outbox publisher.

### Phase 1 publisher is not yet implemented

The `outbox_events` table exists and is populated, but the publisher process that reads and dispatches events is not yet built. PENDING events will accumulate. This is acceptable for Phase 1 — the table provides the foundation; the publisher is the next increment.

### Snapshot in payload

Each outbox event payload includes a snapshot of the relevant data at the time of the event (orderId, distributorId, traderCustomerId, orderNumber, status, etc.). Downstream consumers do not need to query back to the orders table to process the event.

---

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Publish to queue directly in request handler | Dual-write risk; event loss on crash |
| Publish after the transaction commits (in-process hook) | Still a dual-write — DB commit and queue publish are not atomic |
| Change Data Capture (Debezium / logical replication) | Infrastructure complexity not warranted at this scale; adds a Kafka/Kinesis dependency |
| Skip events for Phase 1 | Xero integration requires knowing when orders are placed/accepted; retrofitting events later is harder than adding the table now |
