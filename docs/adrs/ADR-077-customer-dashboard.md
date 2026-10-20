# ADR-077 — Customer Dashboard: Metric Definitions and Where They Come From

**Status**: Accepted
**Date**: 2026-10-17
**Deciders**: Rick Walsh

---

## Context

Distributors need one view of each customer's account: what they owe, how overdue it is, how much of their credit limit they have used, how promptly they pay and how they order. It is the first and default tab of the customer page in the admin app (`/customers/:id`).

Most of the money figures already existed in the customer payment summary (ADR-072). Several did not: ageing bands, payments falling due soon, credit used, days paid late, trends, the sync time, and recency/frequency/monetary (RFM) figures with product breadth.

## Decision

### Two coarse resources, no new stored data

- `GET distributors/:distributorId/customers/:customerId/payments` (needs `customers:read`) is extended rather than duplicated. It used to feed a separate Payments tab on the customer page; the dashboard replaced that tab.
- `GET distributors/:distributorId/customers/:customerId/ordering-behaviour` is new. It needs **`analytics:read`**, like `customer-health` and `analytics/*`, because spend and order frequency are sales figures. Staff without it (warehouse staff) do not see the ordering card, and the API refuses the request.
- The admin BFF passes both through as `customers/:customerId/...`. The orders and unpaid invoices behind the figures sit on a separate "Orders & invoices" tab, which reads the existing orders list, now filterable by `customerId`.

Nothing new is stored. Following the stats taxonomy (facts for history, live queries for "right now"):

| Figure | Source |
|---|---|
| Owed, overdue, ageing, oldest overdue, next payment due, due in the next 7 days, unpaid orders, credit used | `AccountingInvoiceExport` (live) |
| Orders not yet invoiced | `Order` and its `AccountingInvoiceExport` rows (live) |
| Average days late, average terms given, % paid on time, payment trend | `invoice_analytics_state` |
| Overdue balances over time | `invoice_facts` |
| Recency, frequency, spend, ordering trend | `order_analytics_state` (qualifying orders only) |
| Distinct products | `order_line_facts` |
| Last accounting sync | `IngestionRun.lastSucceededAt` for `invoice` |

### Definitions

- **Ageing bands** are days past the due date: 1–30, 31–60, 61–90 and 90+. All four are always returned.
- **Overdue history** (`overdueHistory`, the Overdue balances chart): what was overdue at the end of each day of the last 90 days, by ageing band, in the distributor's currency only (a stacked area can't mix currencies).
  - Each invoice counts as its latest fact on or before the day, judged with the framework's `isOverdue`, the same as today's figures. A draft, a void or an invoice without the accounting system's due date is never aged.
  - Facts record every balance change (`InvoiceBalanceChanged`, ADR-072), so part-payments and edited due dates show on the day they were seen.
  - History starts the day the distributor's first fact was recorded; there is no backfill. With fewer than two days the card says "Not enough history".
  - It reads `invoice_facts` by distributor and customer, through an index on `(distributorId, customerId, occurredAt)`.
- **Payments due in the next 7 days**: unpaid invoices that are not yet overdue, due from today to today + 7, both days included, in the distributor's calendar.
- **Unpaid orders**: distinct orders behind the unpaid invoices.
- **Credit** is measured in the distributor's currency, because the limit has no other. `used` is what is owed in that currency, `available` never goes below 0, and `usedPercent` is null without a limit (or with a 0 limit).
- **Orders not yet invoiced** (`notYetInvoiced`, part of the exposure bar): the customer's orders with this distributor that are accepted (ACCEPTED, COMPLETED or DELIVERED), have no COMPLETED export with an invoice id, and were accepted on or after the day the current accounting organisation was first connected. Older orders were never going to be invoiced. Totals are per currency of the order total, tax included, like the invoices they will become. Empty when accounting is not connected; the screen says so.
- **Exposure bar**: what is owed, then orders not yet invoiced, in the distributor's currency, with anything past the credit limit drawn in red and the limit marked. The bar is as long as the larger of the limit and that total, with no rounding. Orders are invoiced as soon as they are accepted, so an uninvoiced one means the export failed or stalled: the bar's legend and the "Orders not invoiced" tile say to check the accounting integration, and the tile turns red.
- **Average terms given** (`averageDaysAllowed`, "Terms vs reality") is the mean of `dueDate − issueDate` over invoices paid in the last 90 days that have both dates, from the accounting system only (ADR-006). It is shown beside `averageDaysToPay`.
- **Paid on time, as a count** ("0 of 6") counts the paid invoices on the timeline that have a due date, so it agrees with the chart.
- **Next payment due**: the earliest due date among unpaid invoices not yet overdue, and what falls due on it.
- **Alert**: shown when over the credit limit or anything is overdue. Its "Raise limit" button opens the Account tab, and "Suspend ordering" is the page's own suspend action, with the same confirmation.
- **Average days late** is the mean of `max(0, fullyPaidOn − dueDate)` over invoices paid in the last 90 days. Paying early or on the day counts as 0, so the figure reads alongside "% paid on time". It is not the existing `averageDaysToPay`, which runs from the invoice date.
- **Payment trend** compares average days late in the last 90 days with the 90 days before. It needs at least 3 paid invoices with a due date in each period. A change of 3 days or more is "improving" or "worsening"; otherwise it is "steady".
- **Invoice timeline** (`invoiceTimeline`, drawn in "How do they pay?"): every raised invoice, paid in the last 90 days or still unpaid, with its order date (`distributorLocalDate`), due date and payment date. The due date is the accounting system's only (ADR-006), the same one the overdue figures use; an invoice without one shows "No due date". Each row shows:
  - the payment terms as a bar from the order date to the due date, ending in a "due by" tick;
  - the payment date as a green dot (on time) or a red dot (late);
  - time past the due date in red, whether paid late or still unpaid and overdue.

  `daysLate` is days paid after the due date for a paid invoice, and days overdue so far for an unpaid one.
  - Each row ends in words: "71d late", "On time", "9d overdue" or "Due 1 Dec". The tooltip gives each invoice's amount. The chart shows the 12 most recently ordered.
- **Ordering figures** cover the 30 days ending today, both days included. The response states the period (`periodStart`, `periodEnd`) so the screen can label it:
  - Recency: days since the last qualifying order.
  - Frequency: the number of qualifying orders.
  - Monetary: their net (pre-tax) subtotal.
  - Product breadth: distinct products across those orders.
- **Ordering trend** compares spend with the previous 30 days. It needs the customer's first qualifying order to be on or before the start of that previous period; otherwise a new customer would always look as if they were growing. A change of 20% or more is "up" or "down".
- **"Not enough history"** is shown wherever a trend returns `insufficient_history`.
- **Last synced** is the latest successful invoice-status pull across every connection to the distributor's accounting organisation (ADR-061, ADR-074). The screen says when accounting is not connected or has never synced.

### Layout

The tab answers three questions, top to bottom, each a full-width section: "How exposed are we?" (owed and to be invoiced against the credit limit, open invoices, next payment due, orders not yet invoiced, overdue now), "How do they pay?" (terms vs reality, days late, paid on time, the invoice timeline and overdue balances) and "How do they buy?" (needs `analytics:read`). The alert sits above them.

### No per-row customer risk

The orders on this dashboard all belong to one customer, so a risk column would repeat the same value on every row. A per-row risk indicator on the main Orders list was also considered and dropped.

## Consequences

- No migration for these figures, and no backfill. History-based figures start from whatever facts already exist.
- Credit-limit history is not kept, because the limit is overwritten in place. A future "credit used over time" chart would need a credit-limit-change fact.
- Predictive risk and seasonal adjustment are out of scope. The trends are plain period-on-period comparisons with fixed thresholds, which the logic files (`customer-payments.logic.ts`, `customer-ordering.logic.ts`) define in one place each.
