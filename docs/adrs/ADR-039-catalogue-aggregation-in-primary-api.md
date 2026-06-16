# ADR-039: Customer product list aggregation in the primary API

## Status

Accepted

## Context

A trade customer is assigned one or more catalogues by their distributor. The assignments are stored via a `CustomerCatalogue` join on the `TradeRelationship` record. The customer portal needs to show a unified, paginated product list containing every product available to that customer — the union of all products across all their assigned catalogues — with customer-specific pricing resolved and applied.

Two architectural options were considered for where this aggregation should happen:

**Option A — Aggregate in the BFF (`apps/portal-api`)**

The BFF would fetch the customer's assigned catalogue IDs, then call a per-catalogue product endpoint (`GET /distributors/:slug/catalogues/:catalogueId/products`) once per catalogue, and merge the results before returning them to the portal frontend.

**Option B — Aggregate in the primary API (`apps/api`)**

The primary API performs the full aggregation: it resolves the customer's trade relationship, collects all assigned catalogue product IDs, unions them, and returns a single paginated response. The BFF is a thin proxy.

## Decision

Aggregate in the primary API (Option B).

The `GET /api/v1/distributors/:slug/products` endpoint in `apps/api` is responsible for:

1. Resolving the customer's `TradeRelationship` with the distributor
2. Collecting all `CustomerCatalogue` assignments and unioning their product IDs
3. Returning a single, cursor-paginated product list scoped to those IDs
4. Resolving customer-specific pricing from `PriceListRule` in a single batch

The BFF (`apps/portal-api`) is a thin proxy — it forwards the JWT and returns the response unchanged.

## Rationale

### Pagination correctness

Cursor-based pagination requires a total ordering across the full product set at the database layer. With Option A, each BFF call to a per-catalogue endpoint would return a separate cursor-ordered page. Merging multiple paginated streams in the BFF would produce incorrect cursors, duplicate products (a product can appear in more than one catalogue), inconsistent sort order, and a meaningless `hasMore` flag. Correct pagination across a union is only achievable within a single query or a single service with full DB visibility.

### Price resolution efficiency

Customer-specific prices are resolved from `PriceListRule` records. The primary API resolves all prices for the full product set in a single rule fetch and a batched loop (`Promise.all`). Splitting into per-catalogue BFF calls would require either re-fetching and re-evaluating rules per catalogue (N fetches for N catalogues) or an additional price-resolution API call, both of which are less efficient and more complex.

### Single access control gate

The catalogue membership check (does this customer have a trade relationship? which catalogue IDs are they assigned?) is a single, consistent gate enforced at the DB layer. Centralising it in the primary API means one place to enforce, test, and audit. Distributing it across BFF orchestration calls would require the BFF to understand customer membership logic.

### BFF role

The BFF exists to adapt the primary API for a specific client surface — auth translation, response shaping, and orchestration where needed. In this case no orchestration is needed; the primary API already returns exactly what the portal needs. The BFF should not duplicate domain logic.

## Consequences

- `GET /api/v1/distributors/:slug/products` is a customer-specific, session-aware endpoint (requires JWT). It is not a generic "list all products in a catalogue" endpoint.
- The BFF does not have a concept of individual catalogues in the portal product flow. It only proxies the aggregated endpoint.
- The primary API does not expose a per-catalogue product list for the portal. If per-catalogue browsing is needed in future (e.g. a customer wants to see "Wine catalogue" vs "Beer catalogue" separately), a `?catalogueId=` filter parameter can be added to the existing aggregated endpoint without changing the architecture.
- Integration tests for the product list and product detail endpoints must verify the catalogue membership gate at the database layer, not via mock (see CLAUDE.md: integration tests required for multi-tenancy checks).
