# ADR-030 — Server-Side Price Authority on Order Items

**Status**: Accepted  
**Date**: 2026-06-08  
**Deciders**: Rick Walsh

---

## Context

When a customer adds a product to their cart, the system must record a unit price on the `OrderItem`. The question is whether that price should come from the client (sent in the request body) or from the server (read from the database at add-time).

This decision is upstream of ADR-007 (Wholo is the pricing authority; Xero must not override prices), which establishes that price data flows *out of* Wholo. ADR-030 closes the boundary on the way *in*: the client cannot influence what price is written to an order item.

---

## Decision

The `PUT /api/v1/cart/items` request body accepts only:

```json
{ "distributorSlug": "...", "productId": "...", "quantity": 0 }
```

There is **no `price` field**. The API:

1. Looks up the product in the database using the `productId` and the resolved `distributorId`.
2. Reads `Product.price`.
3. If `Product.price` is `null`, rejects the request with HTTP 422 (`Product has no price and cannot be added to a cart`).
4. Writes `Product.price` to `OrderItem.unitPrice`.

The client has no mechanism to influence the stored price.

---

## Consequences

### Security

A malicious client cannot manipulate order prices by sending a different price in the request body. The price stored on an order item is always the authoritative distributor price at the time of add.

### Consistency with ADR-007

Wholo owns pricing. Distributors set prices in the admin portal. Those prices flow to customers via the catalogue and are locked onto order items at add-time. Xero receives invoices derived from these locked prices and cannot alter them.

### Price-null products

Some products may be listed without a price (e.g., items sold on inquiry). These products are excluded from cart operations at the API boundary. The portal disables the Add button for products with `price === null` to prevent a wasted request.

### Price changes after add

If a distributor changes a product price after items are already in a cart, the in-cart price is **not** retroactively updated. The customer ordered at the price they saw. This is consistent with standard e-commerce practice. (A future "price changed" notification feature could flag stale cart prices, but that is out of scope for v1.)

---

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Client sends price, server accepts | Allows price manipulation; violates ADR-007 |
| Client sends price, server validates against DB price | Still requires trusting client input for the comparison; adds complexity with no benefit over just ignoring the client price |
| Re-read price at checkout, not at add-time | Causes price surprises at payment; non-standard UX |
