# ADR-037 — Price Lists Are Deactivated, Not Deleted

**Status**: Accepted  
**Date**: 2026-06-13  
**Deciders**: Rick Walsh

---

## Context

When a distributor removes a price list they no longer need, the intuitive expectation is deletion. However, price list and rule identifiers are snapshotted onto order lines at the time each order is submitted:

- `OrderLine.priceListIdSnapshot` — the price list that was active when the line was priced
- `OrderLine.priceListRuleIdSnapshot` — the specific rule that produced the unit price

These snapshots are permanent audit records. They establish exactly which pricing configuration produced every historical price — information required for dispute resolution, invoice reconciliation, and Xero audit trails. Hard-deleting a price list would orphan those references.

Additionally, trade customers may be directly assigned to a price list via `TraderCustomerSettings.priceListId`. Deleting a price list without first migrating those customers would silently remove their pricing.

---

## Decision

Price lists (and their rules) are **deactivated**, not deleted. The `remove` operation sets `active = false` on the `PriceList` row; the record is retained in the database.

Deactivated price lists are:
- **Excluded** from price resolution, catalogue display, and all admin UI selectors
- **Retained** for historical queries and audit purposes
- **Visible** in admin only if an explicit inactive filter is applied

This is consistent with the platform-wide soft-delete policy (ADR-019) and follows directly from the order snapshot design (ADR-032). The admin UI labels the action "Deactivate" rather than "Delete" to make the distinction clear.

---

## Consequences

### For distributors

Distributor admins cannot permanently remove a price list from the database. The "Deactivate" action is the closest equivalent. Any customers still assigned to a deactivated list will have no active price list until manually reassigned — this will result in their being unable to add items to cart or see prices in the catalogue until reassignment occurs.

### For the database

Deactivated price lists accumulate over time. Price lists are low-volume entities (distributors typically maintain a handful, not thousands), so unbounded growth is not a practical concern.

### For future hard-delete support

A conditional hard-delete — allowed only when no order lines reference the price list — is technically feasible and may be added in a future iteration if distributor demand justifies it. It would require a `COUNT` check across `OrderLine.priceListIdSnapshot` before proceeding, and a migration of any `TraderCustomerSettings` rows still referencing the list.

---

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| Hard delete unconditionally | Orphans `OrderLine.priceListIdSnapshot` / `priceListRuleIdSnapshot` references; destroys the pricing audit trail for historical orders |
| Hard delete with cascade-null on snapshot fields | Actively destroys audit information — worse than orphaned references. Snapshots must be immutable once written (ADR-032) |
| Hard delete only when no order lines reference the list | Sound approach but adds complexity; deferred until there is demonstrated distributor demand for permanent removal |
| Tombstone row (keep row, wipe name/description) | More destructive than `active = false` with no benefit; audit queries still need the name to be readable |
