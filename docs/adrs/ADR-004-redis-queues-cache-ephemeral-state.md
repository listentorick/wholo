# ADR-004: Redis for queues, caching and ephemeral state

## Status
Accepted

## Context
The application requires several capabilities that are not suited to Postgres: a fast caching layer for high-read data (catalogue, pricing), a backing store for the background job queue, short-lived state for idempotency keys and distributed locking for concurrent operations.

## Decision
Redis is used for:
- **Queue backing store** — BullMQ requires Redis as its persistence layer.
- **Caching** — catalogue queries, resolved pricing and distributor profiles are cached in Redis using a cache-aside pattern.
- **Idempotency keys** — short-lived keys stored in Redis prevent duplicate order submissions and duplicate Xero job triggers.
- **Distributed locks** — Redis locks prevent race conditions in inventory operations and Xero job deduplication.
- **Rate limiting** — enforced at the infrastructure or API gateway level using Redis counters.

Redis is not the source of truth for any business data. Loss of Redis data (e.g. cache flush) must not cause data loss — only a temporary performance degradation.

## Consequences
- Fast reads for frequently accessed, cacheable data.
- BullMQ job reliability depends on Redis availability; Redis should be deployed with persistence enabled and appropriate replication.
- Cache invalidation must be handled explicitly when underlying data changes (see ADR-020).
- Redis memory must be monitored and sized appropriately as catalogue and pricing data grows.
