# ADR-033 — Configurable Order Acceptance Mode

**Status**: Accepted  
**Date**: 2026-06-12  
**Deciders**: Rick Walsh

---

## Context

Different distributors have different operational models for handling incoming orders:

- Some want to **review every order** before confirming it (stock availability checks, credit checks, fraud prevention).
- Others trust their customers and want orders to be **automatically accepted** on submission, removing manual work from their workflow.

Additionally, within a single distributor some customers (e.g., high-volume accounts or pre-approved trade buyers) may warrant automatic acceptance even if the distributor's default is manual review.

---

## Decision

Order acceptance mode is determined at submission time via a two-level hierarchy:

1. **Customer-level override** (`trader_customer_settings.orderAcceptanceModeOverride`) — if set, this takes precedence for all orders from this customer to this distributor.
2. **Distributor default** (`distributor_settings.defaultOrderAcceptanceMode`) — applies to all customers that do not have an override.
3. **System fallback** — if no settings exist for the distributor, `MANUAL` is assumed.

The resolution happens in `resolveAcceptanceMode()` within the `submitOrder` transaction. Two values are written to the order:
- `acceptanceModeSnapshot` — the resolved mode (`MANUAL` or `AUTO_ON_SUBMISSION`)
- `acceptanceModeSourceSnapshot` — where the mode came from (`DISTRIBUTOR_DEFAULT` or `TRADER_CUSTOMER_OVERRIDE`)

If `AUTO_ON_SUBMISSION` is resolved, the order is created with `status = ACCEPTED` and `acceptedAt` / `acceptedByActorType = SYSTEM` set immediately. An `OrderAccepted` outbox event is emitted alongside the `OrderSubmitted` event in the same transaction.

If `MANUAL` is resolved, the order is created with `status = SUBMITTED` and awaits distributor action.

---

## Consequences

### Snapshot protects against setting changes

Snapshotting `acceptanceModeSnapshot` onto the order means that if a distributor changes their acceptance mode after an order was placed, the original intent is preserved. An order that was auto-accepted at submission is not retroactively treated as pending manual review.

### `acceptanceModeSourceSnapshot` aids support and audit

Knowing whether a mode came from a customer override or the distributor default simplifies debugging ("why was this order auto-accepted?") and is available to distributor admin UI.

### DistributorSettings is nullable

A distributor with no `DistributorSettings` row defaults to `MANUAL`. This means newly onboarded distributors are safe by default — they will see all orders in a pending state and will not miss orders due to unexpected auto-acceptance.

### Admin order management

The admin portal's order list and detail pages are built around the `SUBMITTED` state — this is the normal queue for distributors using `MANUAL` mode. Distributors using `AUTO_ON_SUBMISSION` will see orders arrive directly in `ACCEPTED` state.

---

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Single global setting | Does not support per-distributor or per-customer variation |
| Per-order selection by customer at checkout | Customers should not control whether their orders require distributor approval |
| Feature flag / environment variable | Cannot vary per distributor or customer at runtime |
| Acceptance mode not snapshotted | Setting changes after placement would alter the apparent history of why an order was auto-accepted |
