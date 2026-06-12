# ADR-032 — Data Snapshots on Order Submission

**Status**: Accepted  
**Date**: 2026-06-12  
**Deciders**: Rick Walsh

---

## Context

When a customer submits an order, the system converts a live `CartOrder` into an immutable `Order`. The question is which data should be copied (snapshotted) onto the order versus left as a live reference to the current state of other entities.

Three categories of data are at risk of changing after an order is placed:

1. **Product data** — a distributor may rename a product, change its SKU, or reprice it.
2. **Address data** — a trade customer's billing or delivery address may be updated on the `TradeRelationship`.
3. **Acceptance mode** — a distributor may change their default acceptance mode (or customer-specific override) between when the order was placed and when it is reviewed.

---

## Decision

At the moment `submitOrder` is called, the following data is snapshotted onto the `Order` and `OrderLine` records:

**Per order line (`order_lines`):**
- `productNameSnapshot` — `Product.name` at submission time
- `skuSnapshot` — `Product.sku` at submission time
- `unitPriceSnapshot` — price from the `CartOrderLine` (locked at cart add-time per ADR-030)
- `subtotalAmount`, `taxAmount`, `totalAmount` — computed and locked at submission

**Per order:**
- `billingAddressSnapshot` — JSON copy of the billing address from `TradeRelationship`
- `deliveryAddressSnapshot` — JSON copy of the delivery address from `TradeRelationship`
- `acceptanceModeSnapshot` — the `OrderAcceptanceMode` that was resolved at submission (see ADR-033)
- `acceptanceModeSourceSnapshot` — whether the mode came from a customer override or the distributor default
- `subtotalAmount`, `taxAmount`, `totalAmount` — aggregated from line totals
- `currency` — locked at submission (default `GBP`)

The `Order` also retains live foreign keys (`distributorId`, `traderCustomerId`, `placedByUserId`) for ownership and access control, but those entities are not considered mutable in ways that would affect the order's meaning.

---

## Consequences

### Immutable order record

An `Order` once submitted is a faithful record of exactly what was ordered, at what price, to what address, under what acceptance rules. Downstream systems (Xero, delivery, audit logs) can rely on the snapshotted data without querying back through the product or customer tables.

### Distributor self-service

Distributors can freely rename products, update pricing, and change customer addresses after orders are placed, with no risk of corrupting historical orders.

### Snapshot at cart add vs at submission

Unit price is snapshotted at cart add-time (ADR-030), not at submission. `submitOrder` reads the price from `CartOrderLine.unitPrice` (which was locked when the item was added) rather than re-reading from `Product.price`. This means the submitted price matches what the customer saw in their cart, not the current catalogue price.

### Address may be null

If no `TradeRelationship` exists, `billingAddressSnapshot` and `deliveryAddressSnapshot` are stored as `null`. This is acceptable for Phase 1 where address capture is not mandatory.

### Tax Phase 1

`taxAmount` is always `0` and `taxRateSnapshot` defaults to `'0'` for Phase 1. The snapshot columns are present so that tax can be added in a future migration without changing the order schema.

---

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Live references only (no snapshots) | Order display would change silently as product data is edited; Xero invoices could mismatch the order |
| Snapshot only price, not name/SKU | Name/SKU changes affect invoice readability and customer support; cheap to snapshot |
| Re-snapshot on every read | Defeats the purpose — the order would reflect current state, not submission-time state |
