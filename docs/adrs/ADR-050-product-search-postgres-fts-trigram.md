# ADR-050: Product search via Postgres FTS + trigram over curated search documents

## Status
Accepted

## Context
The customer portal catalogue needs server-side product search: the catalogue endpoint is paginated (default 50), so client-side filtering would silently search only the loaded page. The workload is known-item lookup by trade customers — name fragments ("chard", "penfolds"), SKU fragments, and typos ("savignon") — over per-distributor catalogues of hundreds to low thousands of products.

Options considered:

1. **Plain ILIKE `contains`** — no ranking, no typo tolerance, no control over match quality. Rejected as a durable answer.
2. **Postgres full-text search only** (`tsvector`/`tsquery`) — stemming and ranking, but word-boundary tokenisation is weak on SKU fragments and offers no typo tolerance.
3. **Postgres FTS + pg_trgm** — FTS for word/stemmed matching plus trigram similarity for substring, SKU-fragment and typo matching. Both are stock Postgres (core + contrib); no new infrastructure.
4. **pgvector semantic/hybrid search** — embeddings enable semantic queries ("crisp dry white" → Sauvignon Blanc) but require an embedding model: external API calls at indexing time and on every search, a backfill pipeline, re-embedding whenever the model changes, and pgvector present in the Postgres image. Vector search is also poor at the dominant query type (exact-ish SKU/name lookup), so lexical search is needed regardless — vectors supplement, never replace. Adjacent to the v1 exclusion of AI-driven discovery.

## Decision
Option 3: Postgres FTS + pg_trgm, structured so option 4 can be added later without any API or caller changes.

- **Curated search document** per product (`product_search_documents`, 1:1 with `products`, kept off the domain model like `ProductExternalReference`): app-built `searchText` (name, SKU, description — extensible without schema change), normalised variants (`searchTextNormalised`, `nameNormalised`, `skuNormalised`: lowercased, accent-stripped, whitespace-collapsed), and `searchVector` as a **Postgres generated column** derived from `searchText` so it can never drift. Name/SKU stay as separate normalised columns because ranking must know *where* a match occurred.
- **Tiered ranking**: exact SKU → SKU prefix/fragment → exact name → name trigram/fuzzy → anything else in the document (description via FTS). Within a tier, ordered by trigram/`ts_rank` score.
- **`ProductSearchService`** (`apps/api/src/product-search/`) owns document building, indexing and the ranked raw-SQL query. Its contract — ranked product ids for a (distributor, query) — is the seam for a future pgvector hybrid; only `search()` internals would change.
- Documents are upserted **in the same transaction** as product create/update and removed on soft delete; `db:search:reindex` rebuilds them (backfill, re-curation).
- The catalogue endpoint exposes this as `GET /distributors/:slug/products?search=`; visibility rules (status, soft-delete, customer catalogue assignment) are applied by the existing catalogue query over the ranked ids, so authorisation logic stays in one place.

## Consequences
- No new infrastructure and no external model dependency; search works identically in dev and live.
- Search is lexical: it matches words and characters, not meaning. Semantic queries need the pgvector extension later — an `embedding` column and model metadata on the existing search-document table, an embedding pipeline, and result merging inside `ProductSearchService`.
- Relevance ordering is incompatible with the keyset cursor, so search-mode pagination is offset-based behind the same opaque cursor token; ranked candidates are capped (500) per query.
- The search document duplicates product text; the transactional upsert and the reindex script are the drift controls. Changing `buildProductSearchText` requires a reindex.
- `pg_trgm` becomes a required database extension (created by migration).
