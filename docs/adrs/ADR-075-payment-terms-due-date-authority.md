# ADR-075 — Payment Terms: Stocdup Calculates Invoice Due Dates

**Status**: Accepted
**Date**: 2026-10-05
**Deciders**: Rick Walsh

---

## Context

The only payment-terms data was `TradeRelationship.paymentTerms`, a free-text note. Invoices exported to the accounting system (ADR-006) carried no due date, so the accounting system's contact or organisation defaults decided it. Stocdup only learned the due date when the payment sync pulled it back (ADR-072).

Distributors want Stocdup to set due dates: a distributor default with per-customer overrides, using one of these rules:

- due immediately
- N days after the invoice date
- N days after the end of the invoice month
- the next given weekday
- the next given day of the month

They also need an explicit "let the accounting software decide" option. As with prices (ADR-032/036), the calculated date must be frozen on the order.

## Decision

### Named terms, not a rules engine

A `PaymentTerm` is a named, reusable rule owned by a distributor (e.g. "Net 30", "30 EOM"). It has a `type` (`PaymentTermType`) and only the parameter that type uses: `days`, `dayOfWeek` (ISO 1–7) or `dayOfMonth` (1–31).

- The distributor default is `DistributorSettings.defaultPaymentTermId`. A single foreign key makes "one default" structural, unlike `PriceList.isDefault`.
- A customer override is `TraderCustomerSettings.paymentTermId`.
- Terms are never hard-deleted. Deactivating one moves its customers back to the default by clearing their override.

Price lists rank many rules by specificity (ADR-036). Terms have a single dimension (customer vs distributor), so resolution is "first match wins", the same shape as order acceptance mode (ADR-033):

1. The customer override, if it is active.
2. Otherwise the distributor default, if it is active.
3. Otherwise the built-in accounting-software rule.

### The accounting integration is one of the options

`ACCOUNTING_SYSTEM_DEFAULT` is a selectable term meaning "Stocdup does nothing — the accounting integration manages the due date". No due date is sent, and the provider's own terms apply. The UI names it after the connected integration, e.g. **"Xero manages due date"**.

- It is the default until the distributor makes one of their own terms the default. It can also be set on an individual customer (e.g. the default is Net 30, but one customer is left to Xero).
- It is only offered while an integration is connected. The term list returns `accountingProvider`; when that is null the UI hides the option.
- With no integration and no default of the distributor's own, nothing sets a due date. The order is accepted without one and the UI says "No payment terms set". Stocdup publishing its own invoices is not planned.
- Each distributor has one built-in row for it, identified by `systemKey`. It can't be edited or deactivated. `@@unique([distributorId, systemKey])` makes lazy creation safe under concurrency.
- The row is created when the term list is read, never as a side effect of accepting an order. Resolution is read-only. With no default chosen, an order snapshots the built-in rule with a null term id.

### A customer either follows the default or has terms set

The customer's options are the distributor's terms (the default marked "(default)"), then the integration. There is no separate "distributor default" entry. The field shows the terms in force and always states which case applies:

- **Using default**: nothing is set on the customer (`paymentTermId` null). They follow the default and change with it.
- **Set for this customer**: picking any option sets it on the customer, including the term that is currently the default, which pins them to it. "Use default instead" clears it.

### Calculated and frozen at acceptance

- The invoice date is the acceptance day in the distributor's timezone (`distributorLocalDate`).
- The due date is calculated from it by `calculateDueDate` (`apps/api/src/payment-terms/payment-terms.logic.ts`, pure calendar maths).
- "Next weekday" and "next day of month" mean strictly after the invoice date. Day 31 is clamped to the last day of shorter months.
- Both acceptance paths write the same snapshot: auto-accept on submission (`OrdersService.submitOrder`) and manual accept (`AdminOrdersService.acceptOrder`). The snapshot is `Order.invoiceDate`, `dueDate`, `paymentTermIdSnapshot`, `paymentTermSnapshot` (the rule as JSON) and `paymentTermSourceSnapshot`. `OrderAccepted` events carry the invoice and due dates.
- Editing a term afterwards never changes an accepted order.

### Sent to the accounting system; its answer wins for display

- The provider-neutral `AccountingInvoiceRequest` gains an optional `dueDate`. Adapters must omit the field entirely when it is absent.
- The invoice export uses the order's `invoiceDate` as the issue date, sends `dueDate`, and records `AccountingInvoiceExport.requestedDueDate`.
- The synced `AccountingInvoiceExport.dueDate` remains the accounting system's current value. The due date the integration reports is always trusted: the admin UI shows it whenever it is known, and overdue status is measured against it. If it differs from Stocdup's calculated date, the UI says the date was changed in the accounting system.

### Scope

- Admin only. The portal doesn't show terms or due dates yet.
- The free-text `TradeRelationship.paymentTerms` column is dropped.
- Payment terms use the `customers:read` / `customers:manage` permissions.

## Consequences

- Stocdup now decides due dates, but a distributor that never picks a default sees no change: the accounting system still decides.
- Orders accepted before this change have no snapshot. The UI shows no payment-terms card for them, and their export falls back to the UTC date of `acceptedAt`.
- Integration specs that delete a distributor must also delete its payment terms if they read the term list.
