# ADR-079 — Default Sales Account for Exported Invoices

**Status**: Accepted
**Date**: 2026-10-29
**Deciders**: Rick Walsh

---

## Context

In the accounting system, the account an invoice is posted to (e.g. Xero "200 Sales") is set on each invoice line. Before this change, a line got an account only when its product was linked to an accounting item that has a sales account (ADR-006 product mapping). Every other line was sent without one. Xero then rejected submitted and authorised invoices, and drafts needed fixing by hand.

Distributors want to choose the account those lines are posted to.

## Decision

### A default, not an override

The accounting organisation has one optional **default sales account**. At export, each line's account is:

1. the linked item's own sales account, if it has one;
2. otherwise the default sales account, if one is chosen and still active;
3. otherwise none, so the accounting system decides.

A linked item's own account always wins, so per-product revenue splits set up in the accounting system are kept.

### Synced and cached, like tax rates

Sales accounts are a pulled record type, like contacts, products and tax rates, not read live from the provider:

- `AccountingConnectionAdapter.listSalesAccounts` returns the accounts a sales line can use that have a code, archived ones included with `isActive: false`. Xero returns revenue-class accounts.
- `AccountingAccountSyncProcessor` extends `AccountingPullProcessorBase` directly (resource type `account`, queue `accounting-account-sync`, every 6 hours, and on every manual Sync). Nothing in Stocdup maps to an account, so it has no matching, suggestions or review screen, and it is not shown in the sync status panel.
- Every pull is full. An account missing from the fetch is marked inactive.
- Rows are keyed on the provider's account id (`ExternalAccountingAccount.externalAccountId`), not the code. The code can be changed in the accounting system; the next sync updates the row.

The settings screen reads the cache, so it works when the provider is down and does not use the provider call budget (ADR-071).

### Stored as a reference to the cached row

`AccountingOrganisation.invoiceDefaultAccountId` references an `ExternalAccountingAccount`. The setting belongs to the organisation, so it survives a reconnect to the same company (ADR-074).

- Choosing an account checks that the row belongs to this organisation and is active.
- At export, the code is read from the row, so it is always the code the last sync saw.
- If the account is archived or deleted in the accounting system, the next sync marks it inactive. Export then stops sending it, and the distributor's admins get one notification asking them to choose another. The settings screen shows it as "no longer active" until they do.

## Consequences

- Submitted and authorised invoices no longer fail for unlinked products once a default is chosen.
- A recoded account is picked up by the next account sync, at most 6 hours later (or straight away on a manual Sync). Until then, the previous code is sent.
- A new provider implements one more port method. `test/accounting-framework.integration-spec.ts` covers the default through a non-Xero provider.
