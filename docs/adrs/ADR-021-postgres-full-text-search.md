# ADR-021: Postgres full-text search as the initial search implementation

## Status
Accepted

## Context
The platform requires product search (within a distributor's catalogue) and distributor search (on the discovery portal). A dedicated search service (Elasticsearch, Typesense, Algolia) would provide richer relevance tuning, faceted filtering and faster indexing, but adds infrastructure complexity and cost that is not justified at the current stage.

## Decision
**Postgres full-text search** (`tsvector` / `tsquery`) is used for the initial implementation of both product search and distributor search. Appropriate GIN indexes are created on searchable fields. Prisma supports raw SQL for full-text queries where the ORM abstraction is insufficient.

The search implementation is isolated within the Search module so it can be replaced without affecting other modules.

Potential future evolution paths:
- **pgvector** — for semantic/vector search on product descriptions or recommendations.
- **Typesense or Algolia** — for richer relevance, typo tolerance and faceted filtering if Postgres search proves insufficient.
- **Dedicated search service** — if search query load creates unacceptable pressure on the primary Postgres instance (a read replica should be used for search queries before reaching this point).

## Consequences
- No additional infrastructure required for search in v1.
- Postgres full-text search has limited relevance tuning and no built-in typo tolerance; search quality may be noticeably lower than a dedicated search engine.
- Search queries should run against a read replica (when available) to avoid contention with the write path.
- Replacing the search backend later is low-risk because it is isolated in the Search module, but re-indexing historical data will require a migration job.
