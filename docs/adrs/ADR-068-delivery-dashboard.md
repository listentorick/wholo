# ADR-068: The Delivery dashboard — a live snapshot plus delivery facts

## Status
Accepted

## Context
Warehouse staff could not use the admin home page: it calls the analytics endpoints, which need `analytics:read` (Owner and Operations manager only). We needed a dashboard for "where are we at right now" that Warehouse staff can open, shown alongside the existing commercial dashboard for those who hold both.

The data falls into two kinds with different needs:

- **Current state** — what needs accepting, what is overdue, how far through today's runs are we. This changes when someone clicks a button, must add up (planned = delivered + failed + remaining) and must be right even if a background worker is behind.
- **History** — how the last few days went. This is what every later delivery-performance view will trend on, so it should be recorded as facts as events happen, not recomputed from whatever the orders table looks like later.

## Decision

### 1. Two reads, two resources, loaded independently
- `GET /distributors/:distributorId/delivery-overview` — a **live snapshot** read straight from the transactional tables in one pass, so every number on it comes from the same moment. Tiles, today's progress, today's runs and the work queue. Refreshed every minute by the client.
- `GET /distributors/:distributorId/delivery-outcomes?from&to` — a **per-day series** (on time / late / failed) read from `delivery_facts`. The client asks for the seven completed days before today and appends today's bar from the live snapshot, so nothing is counted twice and today never depends on the facts pipeline.

The UI loads them with independent hooks and independent loading/error state, so a failing history query never blanks the tiles. Both are open to anyone holding `orders:read` **and** `delivery:read` (`PermissionsGuard` requires all listed permissions): Warehouse staff, Operations manager, Owner. Drivers (no `orders:read`) and trade customers are refused. No role-map change.

The two are separate resources rather than one blob because they differ in freshness (a minute vs. days), failure domain (transactional tables vs. the facts pipeline) and reuse (the series takes a date range, so a Performance view can ask for 30 or 90 days from the same endpoint).

### 2. Definitions of the live buckets
"Today" is the **distributor-local** date (`DistributorSettings.timezone`), never UTC. The effective delivery date of an order is `scheduledDeliveryDate ?? requestedDeliveryDate`. The four buckets are disjoint by construction (they differ by status or by date-before vs date-equal), so a tile and its list never disagree and nothing is counted twice:

| Bucket | Rule |
|---|---|
| To accept | `SUBMITTED` |
| Overdue | `ACCEPTED` and effective date before today |
| Not on a run | `ACCEPTED`, effective date today, no active run allocation |
| Failed (24h) | `DELIVERY_FAILED` with an outcome recorded in the last 24 hours |

Undated `ACCEPTED` orders belong to the Delivery Runs page's undated panel and are not counted. Progress is derived from today's runs (delivered / failed / accepted stops) plus accepted orders due today that no run has picked up. Each bucket's count and its list use the same `where` builder, and the queue is capped per kind (tiles show the true total).

### 3. Delivery facts
- `OrderDelivered` / `OrderDeliveryFailed` were already written to the outbox in the same transaction as the delivery outcome, but routed only to notifications. They are now also routed to `ANALYTICS_FACTS_QUEUE`, and their payload carries what a fact needs: the committed date, requested date, route, run, drop method and outcome.
- A new `delivery_facts` table records each outcome with the day it happened in the distributor's timezone and the date the distributor had committed to. "On time" (delivered on or before the committed day) and "late" are **derived on read**, so the definition can change without rewriting facts. Facts have no foreign keys, like `order_facts`.
- The same events also move `order_facts` / `order_analytics_state` to `DELIVERED` / `DELIVERY_FAILED`. Previously the state stayed at `ACCEPTED` for a delivered order, which the reconciliation check reports as drift; consuming the delivery events removes that. Sales queries already count `DELIVERED` / `DELIVERY_FAILED` as qualifying, so they are unaffected.
- A self-healing backfill (`DeliveryFactsBackfillService`, every five minutes and at start-up) replays any outcome that has no delivery fact under a stable synthetic event id, so it is idempotent. It covers outcomes recorded before the events were routed and any event the consumer ever missed. Historic outcomes are attributed to the order's *current* scheduled date and allocation, which may since have changed — an approximation that applies only to what predates the live events.

### 4. `delivery_facts` is a Timescale hypertable, like the other fact tables
`order_facts` and `order_line_facts` are hypertables, and `delivery_facts` follows them: facts are append-only event logs partitioned by `occurredAt`. As in ADR-052, the migration is exactly what `prisma migrate dev --create-only` generated, plus **one** appended statement — `SELECT create_hypertable('delivery_facts', 'occurredAt', create_default_indexes => false)` — because Prisma has no hypertable concept. The primary key is `(eventId, occurredAt)` (Timescale requires every unique index to include the partitioning column) and `@@index([occurredAt])` is declared in `schema.prisma`, so Prisma knows about the index; `create_default_indexes => false` stops Timescale adding a second, undeclared one. Verified: `prisma migrate diff` reports no difference between the schema and the database.

## Consequences
- Warehouse staff get a home page that works for them; Owner and Operations manager get Delivery and Sales as tabs (Delivery first).
- Delivery history starts accumulating as soon as this is deployed, and is backfilled for existing outcomes.
- **Failed deliveries are terminal.** `DELIVERY_FAILED` cannot be rescheduled (`changeScheduledDeliveryDate` requires `ACCEPTED`), so failed rows on the dashboard link to the order rather than offering a reschedule. A re-delivery workflow is a separate feature.
- The live snapshot runs about ten small indexed queries per refresh. If polling volume grows, collapse the four counts into one aggregate query; the bucket definitions are already centralised. An index on `(distributorId, scheduledDeliveryDate)` would help the overdue count on very large order histories.
- The "not attempted" outcome (planned but never tried) is not in the series: it is the absence of a fact, and commitment history is not recorded. It can be added later by recording commitments, or approximated from live orders for the days still on screen.
- The Sales dashboard's "Needs attention" list has been removed: it was not about sales and duplicated the Delivery dashboard's work queue. Two things lived only there and are now shown nowhere: **failed invoice exports** and **customers who have never ordered**. The `action-items` endpoint (api, BFF, client and types) has no remaining caller and can be deleted, or repurposed if either of those is given a home.
