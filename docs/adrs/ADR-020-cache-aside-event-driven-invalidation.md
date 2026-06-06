# ADR-020: Cache-aside pattern with event-driven invalidation

## Status
Accepted

## Context
Several data types are read frequently but written infrequently: distributor catalogue listings, resolved customer pricing and public distributor profiles. Serving these directly from Postgres on every request is unnecessary and adds latency. A caching layer reduces database load and improves response times for high-read paths.

Two caching patterns were considered:
- **TTL-only caching** — data expires after a fixed time. Simple but results in stale data being served until the TTL expires.
- **Cache-aside with event-driven invalidation** — the application populates the cache on read miss and explicitly invalidates affected keys when the underlying data changes.

## Decision
The **cache-aside** pattern is used with Redis. On a read, the application checks Redis first; on a cache miss, it queries Postgres and populates the cache. On a write that affects cached data, the relevant cache keys are explicitly deleted.

TTL is configured as a fallback safety net to prevent unbounded cache growth, not as the primary invalidation mechanism.

**What is cached:**
- Catalogue product listings (per distributor, per customer price context)
- Resolved pricing for customer/product combinations
- Public distributor profiles

**Invalidation triggers:**
- Price list or customer pricing update → invalidate affected pricing cache keys
- Product create/update/archive → invalidate catalogue cache for that distributor
- Distributor profile update → invalidate distributor profile cache key

## Consequences
- Customers see up-to-date pricing and product availability shortly after a distributor makes changes.
- Cache invalidation logic must be maintained alongside write operations; missed invalidations result in stale data being served.
- Cache key design must be deliberate — keys should be granular enough to allow targeted invalidation without flushing unrelated data.
- Redis memory usage should be monitored; catalogue data per distributor can grow large.
