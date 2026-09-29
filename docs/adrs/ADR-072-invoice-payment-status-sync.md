# ADR-072: Invoice payment status sync-back

## Status
Accepted (2026-09-29).

## Context
ADR-006 made the accounting system (Xero today) the system of record for invoices,
payments and balances, and promised that status would flow back to Stocdup. It never
did: `AccountingInvoiceExport.externalInvoiceStatus` was written once, at creation.
Distributors need an order to show as paid when the customer pays in the accounting
system, and want to know which invoices are unpaid or overdue and how promptly
customers pay.

## Decision

### Polling, through the existing sync machinery
A fourth accounting resource type, `invoice`, runs through the ADR-061 scheduler,
dedupe and cursor rules and the ADR-071 call budget / Retry-After / error handling:

- Every 15 minutes, **only for connections with at least one exported invoice not yet
  known to be settled** (never synced, or not PAID / VOIDED / DELETED). Other
  connections make no provider call; their slot just moves on.
- A manual Sync also refreshes invoice status. The invoice sync has nothing to review,
  so it is not shown in the sync progress panel (`getStatus` returns mapping pulls only).
- Webhooks are deliberately out of scope; if added later they only trigger this sync.

### Provider-neutral port
`listInvoiceStatuses(tokenSet, orgId, cursor)` returns `AccountingExternalInvoiceStatus`
records (neutral `state`, amounts as decimal strings, calendar dates `YYYY-MM-DD`,
`providerUpdatedAt`) plus the next opaque cursor; `hasInvoiceReadScope` gates it.
Invoices the application didn't create are never read.

Xero (`XeroAccountingAdapter`): `getInvoices` with `where Type=="ACCREC"`,
`createdByMyApp=true`, `pageSize=1000`, If-Modified-Since from the cursor. Status
mapping DRAFT→DRAFT, SUBMITTED→AWAITING_APPROVAL, AUTHORISED→AWAITING_PAYMENT, PAID /
VOIDED / DELETED as-is. `Date` / `DueDate` / `FullyPaidOnDate` arrive from xero-node 18
as raw `/Date(ms+0000)/` strings; `parseXeroCalendarDate` takes the UTC date part and
never shifts time zones. `summaryOnly` is not used — Xero doesn't document whether it
keeps the payment fields. The existing `accounting.invoices` scope covers reading, so
no reconsent. The full reconcile (null cursor, at least daily) exists because Xero
documents that some edits to part-paid invoices (e.g. DueDate) don't move
`UpdatedDateUTC`.

### State lives on the export row; payment status is derived
`AccountingInvoiceExport` (the external-reference row per connection + order) gains
`invoiceState`, `invoiceTotal`, `amountPaid`, `amountCredited`, `amountDue`,
`issueDate`, `dueDate`, `fullyPaidOn`, `providerUpdatedAt`, `stateSyncedAt`, plus
`@@unique([accountingConnectionId, externalInvoiceId])` for the lookup. Nothing is
added to `Order`.

`derivePaymentStatus` (`accounting/invoice-payment-status.ts`) is the one definition:
NOT_SYNCED / UNPAID (incl. draft or awaiting approval) / PART_PAID / PAID / VOID.
`isOverdue(facts, today)` is true when awaiting payment, money is due and the due date
is before the distributor's local today. Overdue is never stored — it depends on the
date.

### Applying a snapshot
`AccountingInvoiceSyncProcessor` matches fetched invoices to export rows on the
syncing connection only, skips unchanged rows, never lets an older
`providerUpdatedAt` overwrite a newer one, and in one transaction updates the row and,
when the derived payment status changed, writes an `InvoicePaymentStatusChanged`
outbox event (export, order, distributor, customer, from → to, amounts, dates,
`occurredAt` = provider update time).

### Payment facts and stats
- `InvoicePaymentStatusChanged` routes to `analytics-facts`. `InvoiceFactsService`
  appends `invoice_facts` (a Timescale hypertable on `occurredAt`; the migration is the
  generated SQL plus the one `create_hypertable` statement) and projects
  `invoice_analytics_state` (one row per export) with Prisma queries only —
  `createMany({ skipDuplicates })` then an `updateMany` guarded by `lastEventAt`, so a
  replay is idempotent and an older event arriving late never regresses the row.
- Per the stats taxonomy: "right now" figures are live queries on the synced export
  rows; "how they pay" comes from the facts.
- `GET distributors/:distributorId/customers/:customerId/payments` (`CUSTOMERS_READ`;
  customerId is the organisation id) returns outstanding and overdue totals, the open
  invoices (payment status, due date, days overdue) and, over the last 90 days, how
  many invoices were paid, the mean days from invoice date to fully paid, and the
  share paid on or before the due date. Every query is scoped by distributorId, so a
  customer shared by two distributors has separate figures with each.
- Customer health gains an `OVERDUE_INVOICES` reason (customer behaviour: watch when
  anything is overdue, at risk when an invoice is over 30 days late) and
  `overdueBalance` / `overdueInvoiceCount` tiles.

## Consequences
- "Order shows as paid" lags payment by up to ~15 minutes plus queue wait; the
  `accounting-invoice-sync` queue's oldest-waiting-age gauge measures it.
- Existing exported invoices pick up their current state on the first sync after
  deploy — live data, not a backfill.
- Unverified until tested against a real Xero organisation: whether recording a
  payment moves an invoice's `UpdatedDateUTC` (Xero's rule implies it does, since a
  payment posts a journal). If not, payments surface via the daily full reconcile
  instead of within 15 minutes.

## References
ADR-006, ADR-047, ADR-051, ADR-061, ADR-064, ADR-071.
