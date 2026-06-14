# ADR-036 — Price List Rules Engine: Ordered DB Rows, First-Match-Wins

**Status**: Accepted  
**Date**: 2026-06-13  
**Deciders**: Rick Walsh

---

## Context

Distributors need to offer different prices to different trade customers — for example a Retail price list at full margin and a Wholesale price list at reduced margin. Within a price list, a distributor may also offer **quantity break pricing**: the unit price drops when a customer orders more than a minimum threshold (e.g. £12 per bottle for 1–5 units, £10 per bottle for 6+).

This requires a rules evaluation layer that sits between the stored price lists and the price the customer is charged. The key design questions were:

1. How should rules be stored and structured?
2. How should the resolution algorithm work (which rule wins)?
3. Should an existing open-source rules engine library be used?
4. When should the price be resolved — at catalogue display, cart add, or order submission?
5. Where should the resolution logic live in the codebase?

We studied Odoo's pricelist implementation (v19.0) as a reference, given its maturity and widespread use in wholesale distribution. Odoo does not use an external rules engine library; it stores pricelist items as ordered database rows and evaluates them in application code.

---

## Decision

### 1. No external rules engine library

We do not use an open-source rules engine library (e.g. `json-rules-engine`, `nools`, SpEL). The rule types in Wholo's price list model are **bounded and fixed** for Iteration 1:

| Selector type | Meaning |
|---|---|
| `ALL_PRODUCTS` | Applies to every product in the distributor's catalogue |
| `PRODUCT` | Applies to a single specific product |

The resolution algorithm for these two types is simple enough to express in a handful of lines of TypeScript. An external library would introduce a dependency, a learning curve, and a mapping layer between its rule DSL and our domain objects — without providing any meaningful capability that the bounded problem actually requires.

The rule set may grow in future iterations (e.g. product type rules, promotional rules, date-bounded rules). At that point the algorithm complexity should be re-evaluated. The current implementation is designed to be easy to extend without requiring a library: adding a new selector type is an enum value + a sort key + a guard in the in-process loop.

### 2. Two-model schema: `PriceList` + `PriceListRule`

Price lists are stored as two Prisma models:

- **`PriceList`** — the named container (e.g. "Wholesale"). Belongs to one distributor. One price list per distributor may be marked `isDefault`.
- **`PriceListRule`** — an individual pricing rule within a list. Stores `selectorType`, optional `productId`, `minQuantity`, and `unitPrice`.

The `isDefault` flag determines the fallback when a trade customer has no explicit price list assigned. Only one price list per distributor may be default; this is enforced transactionally (clear all, set one) rather than with a partial unique index, as Prisma does not generate partial index migrations.

Customers are assigned a price list via `TraderCustomerSettings.priceListId`. If null, resolution falls back to the distributor's default price list.

### 3. Resolution algorithm: specificity + quantity-break sort, first-match-wins

Price resolution for a given `(distributorId, customerId, productId, quantity)` proceeds as follows:

1. Resolve the active price list for this customer (explicit assignment → distributor default → null).
2. Load all candidate active rules for that price list in a single query, filtered to: `selectorType = PRODUCT AND productId = X` OR `selectorType = ALL_PRODUCTS`, where `minQuantity ≤ quantity`.
3. Sort in-process by **specificity first, then descending `minQuantity`**:
   - `PRODUCT` rules sort before `ALL_PRODUCTS` rules (more specific wins).
   - Within the same selector type, the rule with the highest `minQuantity` that is still ≤ the requested quantity wins (largest applicable quantity break wins).
4. Return the first rule after sorting, or `null` if no rules match.

This is a direct implementation of the Odoo model. A single DB round-trip loads all candidates; the sort and selection happen in application memory. For practical catalogue sizes (hundreds to low thousands of rules per distributor) this is efficient and straightforward to reason about.

### 4. Price resolved at cart-add time and snapshotted

The price is resolved when an item is added or updated in the cart (`CartService.upsertItem`), **not** at catalogue display time and not deferred to order submission.

The resolved `unitPrice`, `priceListId`, and `priceListRuleId` are written to `CartOrderLine` immediately. When the order is submitted, these are copied verbatim to `OrderLine` as snapshot fields (`priceListIdSnapshot`, `priceListRuleIdSnapshot`).

This means:
- If the distributor changes a rule after a customer has added an item to their cart, the customer's cart price is **not retroactively updated**. The price in the cart is the price at add-time.
- The snapshot fields on `OrderLine` provide a permanent audit trail: which price list and rule produced each line's price.
- If no matching rule exists at cart-add time, the item cannot be added. The API returns `422 Unprocessable Entity`.

### 5. `PriceResolutionService` as a shared injectable

Resolution logic lives in `apps/api/src/price-lists/PriceResolutionService`, exported from `PriceListsModule`. It is imported by `CartModule` and `CatalogueModule`.

This centralises the resolution algorithm in one place. Future modules (e.g. a quoting module, a standing order module) can import and reuse the same service without duplicating logic.

### 6. Catalogue display: batch resolution, not per-product calls

The catalogue service resolves prices for the full product list returned by a page query in a single pass:

1. Call `resolvePriceListId` once to determine the customer's active price list.
2. Load **all** active rules for that price list in one query.
3. For each product in the result set, run the in-process selector logic with `quantity = 1`.
4. Exclude products for which no matching rule exists (they have no displayable price).

This avoids N+1 database queries (one `resolvePrice` call per product). The trade-off is that the `total` count in the paginated response is computed before price-list filtering and may slightly overstate the number of visible products. This is documented as a known Iteration 1 limitation and will be addressed in a future iteration.

---

## Consequences

### Positive

- **No library dependency** — the resolution algorithm is ~30 lines of TypeScript, fully readable, debuggable, and testable without a framework.
- **Single DB round-trip per resolution** — one query loads all candidate rules; sorting and selection are in-process.
- **Audit trail** — `priceListIdSnapshot` and `priceListRuleIdSnapshot` on `OrderLine` tell you exactly which rule produced any historical price.
- **Extensible** — adding a new selector type (product type, date range, promotional code) is additive: add an enum value, a sort key, and a guard clause. No schema change to the algorithm structure.
- **Centralised** — `PriceResolutionService` is the single source of truth; consistent with ADR-007 (Wholo as pricing authority).

### Negative / trade-offs

- **Cart price is point-in-time** — a customer who adds an item to their cart and leaves it there will not see updated prices if a rule changes. This is intentional (and standard e-commerce behaviour) but requires clear communication to customers if stale carts are a concern.
- **No `resolvePrice` in-flight caching** — resolution hits the DB on every cart-add. Given cart operations are low-frequency, this is acceptable for Iteration 1. Caching can be added per ADR-020 if profiling shows it is needed.
- **Pagination `total` overstates count** — when a customer has a price list, the catalogue total count includes products that have no matching rule and will be filtered out before display. This will be fixed in a future iteration.
- **No uniqueness constraint on `(priceListId, selectorType, productId, minQuantity)`** — creating two identical rules is permitted at the data layer. The application validates at create-time but duplicate detection is not enforced by the database. A future migration should add a partial unique index.

---

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| External rules engine library (`json-rules-engine`, `nools`, etc.) | Adds a dependency and a mapping layer with no material benefit. Rule types are bounded; the algorithm is trivial to express in TypeScript. Revisit if rule complexity grows significantly. |
| Resolve price at catalogue display (not cart-add) | Display-time resolution cannot be snapshotted to the cart; the price would need to be re-resolved at cart-add anyway, making display-time resolution redundant. Snapshot-at-add is the Odoo standard. |
| Resolve price at order submission only | Cart display would have no price to show the customer. Unacceptable UX. |
| Store rules as JSONB on `PriceList` | Querying and indexing individual rules (by selector, product, quantity) is impractical in JSONB. Row-per-rule is standard relational design and allows the DB to filter candidates efficiently. |
| Partial unique index on `(priceListId, selectorType, productId, minQuantity)` | Prisma does not generate partial unique index migrations directly. Application-level validation was chosen for Iteration 1; a raw SQL migration to add the index is deferred. |
| Per-distributor default via NULL `priceListId` on customer | Requires a nullable FK with special NULL semantics. Explicit `isDefault` flag on `PriceList` is clearer and query-friendly (`WHERE isDefault = true`). |
