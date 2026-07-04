# ADR-047 — Event Distribution via BullMQ Per-Concern Queues

**Status**: Accepted  
**Date**: 2026-07-03  
**Deciders**: Rick Walsh

---

## Context

Order domain events written to the transactional outbox (ADR-034) must reach multiple independent consumers: order-placed notifications (email now, push later per ADR-017) and Xero invoice sync (ADR-006). More concerns will follow (delivery updates, invoice emails).

ADR-005 nominated BullMQ for background jobs, but at the time of this decision **no queue technology was actually implemented** — the outbox publisher was an uncalled logging stub. This ADR therefore re-evaluated the event distribution layer from a clean slate rather than treating BullMQ as incumbent.

Two distinct layers were identified:

1. **Event distribution** — each interested concern independently learns that a fact occurred. Pub/sub-shaped.
2. **Task execution** — sending an email or calling the Xero API, with retries, backoff, and rate limits. Work-queue-shaped.

BullMQ is a work-queue primitive with no pub/sub topics: a job is consumed exactly once. Using it for distribution requires explicit fan-out.

## Options Compared

| | A: Outbox + BullMQ + explicit routes | B1: Outbox + Redis Streams consumer groups | B2: Outbox + RabbitMQ topic exchange |
|---|---|---|---|
| Fan-out owner | Our publisher (`EVENT_ROUTES` map) | Broker (consumer groups) | Broker (exchange bindings) |
| Per-subscriber retry/backoff/DLQ | Per-queue attempts/backoff; retained failed set is a per-concern DLQ | Ack/pending-list primitives exist, but backoff, poison handling, DLQ and the consumer loop are hand-rolled; no mature NestJS library | Native acks and DLX; delayed retries need a plugin or TTL topologies |
| Partial fan-out failure | Deterministic jobIds make publish idempotent (see below) | N/A — single XADD | N/A — single publish |
| Task-execution layer | Same primitive; per-queue rate limiting serves Xero API caps | Still needs job machinery on top | Still wants a separate job queue |
| New infrastructure | None | None | New stateful service to operate indefinitely |

**Invariant across all options:** every candidate is at-least-once. Duplicate suppression — including the hard requirement that no duplicate Xero invoice is ever created — is Wholo's responsibility via database constraints in every design. The broker choice moves ergonomics, not correctness.

## Decision

**Option A**: the outbox publisher (running in the single-replica `wholo-worker` process) polls PENDING outbox rows and fans out to **one BullMQ queue per consuming concern**, driven by a static routing map:

```ts
EVENT_ROUTES = {
  OrderSubmitted: ['notifications'],
  OrderAccepted:  ['xero-sync'],
}
```

### Publish idempotency (partial fan-out recovery)

Every queue add uses `jobId = outboxEvent.id`. The outbox row is marked `PUBLISHED` only after **all** route adds succeed. On any failure, the row goes `FAILED` and the whole fan-out is retried; queues that already accepted the job reject the duplicate jobId. A crash mid-fan-out therefore cannot lose or double-deliver an event. `removeOnComplete` retention is bounded by count — never `true` — because completed jobs carry the jobId dedupe records.

### Subscription contract

A consumer of domain events consists of, shipped together in one PR:

1. A route entry in `EVENT_ROUTES`.
2. A dedicated queue and processor.
3. An **inbox table** whose unique constraint provides business idempotency — e.g. `Notification.dedupeKey` + `NotificationDelivery @@unique([notificationId, channel, recipient])` for notifications; `XeroInvoiceSync` with **`unique(orderId)`** for invoice sync (duplicate-invoice prevention).

Never activate a route before its processor exists — jobs would accumulate unconsumed. Events with no route are marked `PUBLISHED` without enqueueing.

"Has this been dealt with?" is always answered from the consumer's inbox/domain tables, never from queue internals. BullMQ job state (failed sets retained) is operational telemetry, surfaced via Grafana (ADR-015).

### Xero as first-class consumer

The `xero-sync` queue and `OrderAccepted` route are live from day one, consumed by a placeholder processor that logs and acknowledges. The real implementation adds the `XeroInvoiceSync` inbox table (status machine `PENDING → CREATING → CREATED/FAILED`, `xeroInvoiceId`, attempts, lastError) per the external-reference-table convention before making any Xero API call. Events acknowledged by the placeholder can be replayed from the outbox if backfill is required.

## Consequences

- The bespoke distribution code is a ~50-line pump whose worst failure mode (duplicate delivery) is absorbed by inbox constraints; correctness is anchored in Postgres, not in the relay.
- One primitive serves both distribution and execution; no new stateful infrastructure.
- Adding a consumer is a code change (route + processor + inbox table), not broker configuration.
- The worker must remain a single replica; scaling consumers means splitting processors into their own deployables (queues make this a deployment change, not a redesign).
- Relay latency is up to the polling interval (5s) — acceptable for notification and sync workloads.

## Revisit Triggers

Reassess toward broker-owned fan-out (durable pub/sub) when any of:

- More than ~5 subscribing concerns, or the event-type × consumer matrix grows fast.
- Consumers outside the modular monolith (separate services/teams).
- Native replay/ordering requirements.
- **Production lands on a cloud with managed pub/sub** (AWS SNS→SQS, GCP Pub/Sub, Azure Service Bus) — this removes the operational-cost argument that was decisive here. Confirmed at decision time: production target is self-managed Kubernetes / undecided.

Migration is deliberately cheap: consumers depend only on outbox events and their inbox tables, so swapping the transport touches the publisher and consumer wiring only.

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Redis Streams consumer groups | Broker-owned fan-out, but redelivery/backoff/DLQ/consumer loops all hand-rolled; trades library-backed machinery for bespoke code in the riskiest spot |
| RabbitMQ topic exchange | Best semantics, but a permanently operated stateful service for a one-operator monolith with two planned consumers; retry backoff still needs plugins/topology; a job queue would still be needed |
| Kafka / CDC | Rejected previously (ADR-034); scale does not warrant it |
| Single shared queue, chained handlers | Couples unrelated consumers: a Xero outage would retry jobs that also carry notification work; no independent pause/retry/monitoring |
