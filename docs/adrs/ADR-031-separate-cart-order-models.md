# ADR-031 — Separate CartOrder and Order Models

**Status**: Accepted  
**Date**: 2026-06-12  
**Deciders**: Rick Walsh  
**Supersedes**: ADR-029

---

## Context

ADR-029 modelled the cart as a `DRAFT` order: a single `Order` entity with a `DRAFT / PLACED / CONFIRMED` status lifecycle. That approach was sound when the cart was the primary concern, but as we built out the commercial order requirements the two models grew apart:

| Concern | Cart needs | Commercial order needs |
|---|---|---|
| Product data | Live product references | Immutable snapshots (name, SKU, price) |
| Totals | Recomputed from live prices | Locked subtotal / tax / total at submission |
| Address | None | Billing + delivery snapshot from TradeRelationship |
| Status lifecycle | DRAFT only | SUBMITTED → ACCEPTED / REJECTED / CANCELLED / COMPLETED |
| Acceptance workflow | N/A | Manual review or auto-accept |
| Audit trail | None | acceptedAt, rejectedByUserId, rejectionReason, etc. |
| Outbox events | None | OrderSubmitted, OrderAccepted, etc. |

Carrying all of those columns on a single table would mean the cart rows had ~15 nullable columns that are never populated, and the schema would become impossible to reason about.

---

## Decision

The `orders` table is split into two independent models:

**`CartOrder`** (table: `cart_orders`) — the live shopping basket:
- `distributorId`, `customerId`, `status` (always `DRAFT`)
- Unique constraint on `(distributorId, customerId, status)` — at most one active cart per pair
- Lines in `cart_order_lines`: `productId`, `quantity`, `unitPrice` (live, mutable)

**`Order`** (table: `orders`) — the submitted commercial order:
- Full snapshot columns (see ADR-032)
- Status lifecycle: `SUBMITTED → ACCEPTED / REJECTED / CANCELLED / COMPLETED`
- Acceptance mode columns (see ADR-033)
- Outbox events (see ADR-034)

On checkout, `submitOrder` reads the `CartOrder` + lines, snapshots all required data into a new `Order`, then deletes the `CartOrder` and its lines within a single transaction.

---

## Consequences

### Clean model boundaries

Each model only carries columns it actually uses. Neither has nullable placeholder columns for the other's lifecycle.

### Independent evolvability

The cart schema can change (e.g., adding saved-cart or wishlist states) without touching the commercial order schema, and vice versa.

### Atomic checkout

Deleting the cart and creating the order in one transaction means there is no window where neither exists. A crashed process cannot leave a customer with a submitted order and a dangling cart.

### No DRAFT orders

Orders no longer have a DRAFT state. An order in the system is always a submitted commercial document. This makes filtering, reporting, and Xero sync simpler.

---

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Single table with nullable columns | ~15 nullable columns on cart rows; schema confusion between cart and order semantics |
| Retain ADR-029, extend with an `Order` view | Cannot enforce NOT NULL on snapshot columns; no clean transition from cart to order |
| Separate service / microservice for orders | Premature — the modular monolith (ADR-002) remains the right boundary at this scale |
