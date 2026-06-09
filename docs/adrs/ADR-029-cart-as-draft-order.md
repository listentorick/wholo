# ADR-029 — Cart as Draft Order

**Status**: Accepted  
**Date**: 2026-06-08  
**Deciders**: Rick Walsh

---

## Context

The customer portal needs a persistent shopping cart that:
- Survives page navigation within a session
- Is visible on any device the customer is logged in from
- Is scoped to a specific `(customer, distributor)` pair
- Can be promoted to a real order when the customer checks out

The question was how to model the cart: as a separate `Cart` entity, or as an `Order` in a pre-placed state.

---

## Decision

The cart **is** a `DRAFT` order. There is at most one `DRAFT` order per `(customerId, distributorId)` pair, enforced by a unique constraint:

```sql
UNIQUE (distributor_id, customer_id, status)
```

An `Order` with `status = DRAFT` is the live cart. When the customer confirms, the status transitions to `PLACED`.

---

## Consequences

### Why not a separate `Cart` model?

A dedicated cart table would duplicate the `Order`/`OrderItem` schema almost entirely. Every field needed on a cart — distributor, customer, items, quantities, prices — maps 1:1 to what an order needs. Two models would require synchronisation at checkout and introduce a seam where errors could cause price or quantity drift.

### Price snapshotting

When an item is added to the cart, `OrderItem.unitPrice` is written from `Product.price` at that moment (see ADR-030). This means the price is locked at add-time, not re-read at checkout. If the distributor changes a price after items are in the cart, the customer sees the price they added at. This matches standard e-commerce behaviour and prevents surprise price changes at payment.

### One DRAFT per pair

The unique constraint prevents duplicate carts being created by concurrent requests (e.g., two tabs racing). The `upsert` pattern (`findOrCreate`) is safe under this constraint.

### Multi-distributor customers

A customer dealing with multiple distributors will have one `DRAFT` order per distributor. The cart is always scoped by `distributorSlug` on every API call, so there is no cross-contamination.

### Checkout path

When transitioning a `DRAFT` → `PLACED`, the status update clears the constraint slot, allowing a new `DRAFT` to be created immediately for the next order without deleting the placed one.

---

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Separate `Cart` model | Schema duplication, checkout synchronisation risk |
| Client-side cart (localStorage) | Not cross-device; lost on logout or browser wipe |
| Session-based cart | Server-session storage not available in this stateless JWT architecture |
