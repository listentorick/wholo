# ADR-073: Invoice export never raises a second invoice for an order

## Status
Accepted (2026-10-02). Refines ADR-006 (the accounting system is the system of
record for invoices) and ADR-071 (provider calls and errors).

## Context

**Raising a second invoice for the same order in a distributor's accounting system
is unacceptable.** A late invoice, or one that needs a person to press "retry", is
recoverable. A duplicate is not: it may already have been sent to the customer,
paid, or included in a VAT return before anyone notices, and only the distributor
can clean it up.

Invoice export (`accounting-invoice-export.processor.ts`) creates one sales invoice
per accepted order. A review on 2026-10-02 found it could create two. The guard
against duplicates was the provider's idempotency key, and it was not a guard:

- a retry of a FAILED export deliberately used a **new** key
  (`<exportId>:<retryCount>`, "fresh attempt, fresh key"), because a provider
  rejects a replayed key that carries a different request (e.g. after a mapping was
  fixed);
- Xero remembers a key for **6 minutes** ("Idempotent requests", Xero developer
  documentation, read 2026-10-02), while a stale claim is only resumed after
  **15 minutes** (`PROCESSING_STALE_MS`).

Nothing ever asked the provider whether the order already had an invoice. Four
paths led to a duplicate:

| # | Path | Since |
|---|---|---|
| 1 | The provider creates the invoice but the call fails (5xx, dropped connection) → export FAILED → retry with a fresh key | `82561a5`, 2026-07-12 |
| 2 | The invoice is created, then our own save (or the notification) throws → the same catch marks the export FAILED → retry with a fresh key | `82561a5`, 2026-07-12 |
| 3 | The worker dies after the provider created the invoice → resumed 15+ minutes later with the same key, which Xero forgot after 6 | `82561a5`, 2026-07-12 |
| 4 | The 60 s client timeout added by ADR-071 abandons a call Xero may still complete → path 1, far more often | `119a906`, 2026-09-29 (never released) |

Paths 1–3 existed from the day invoice export shipped.

## Decision

### The rule
`createInvoice` is **never called without first asking the provider** whether the
order already has an invoice. If it has, the export adopts that invoice — records
its id and completes — and creates nothing.

This holds for **every** attempt, including an order's first. Our own export row is
written before the provider is called, so in normal running a first attempt cannot
have a predecessor — but a database restore (backups are six-hourly, ADR-069) or a
manual fix can lose that row while the invoice still exists at the provider. The
guarantee must not depend on our own records being complete.

### Three layers
1. **Look up before create — the guarantee.** A new port method,
   `findInvoiceByReference(tokenSet, organisation, reference)`, returns the live
   (not voided, not deleted) sales invoice *this application* created with that
   reference, or `null`. The reference is the Stocdup order number, which is unique
   across Stocdup and was already sent on every invoice. It must answer from the
   provider's live data, and throw — never return `null` — when it cannot tell.
   Voided and deleted invoices are excluded on purpose: after a distributor voids
   an invoice, exporting the order again is a deliberate new invoice.
2. **A stable idempotency key — protection for a call still in flight.** The key
   is `<exportId>:<hash of the request>`: unchanged request, same key, so a
   provider that honours keys will not act twice while it still remembers the
   first call; changed request, new key, as providers require. It is a
   short-lived second net, never the guard.
3. **Unknown outcomes wait.** `AccountingProviderError` gains `outcomeUnknown`,
   set by the adapter when a failed write may have gone through (no response,
   timeout, provider 5xx, or a success response with no invoice in it) — as
   opposed to a definite "not created" (validation, authorisation, rate limit, our
   own call budget). The queue backoff waits at least two minutes after such a
   failure, so the retry's lookup does not race a request the provider is still
   working on.

### Our own failures are not export failures
Once the provider has handed back an invoice, nothing may mark the export FAILED.
If the result cannot be saved, the claim is released, the error is logged
(`accounting.invoice_export.persist_failed`, with the provider's invoice id) and
rethrown; the retry finds the invoice by reference and completes. The "invoice
created" notification is best-effort.

When the export cannot tell whether the invoice exists — the lookup itself fails —
it stops and retries later. It never creates on a guess.

### The tests are part of the decision
- `test/accounting-invoice-export-no-duplicates.integration-spec.ts` drives the
  real processor against a real database and a fake provider through every
  sequence of failures (provider created-then-failed, our save failed, rejected,
  never sent, worker died, export row lost), with the provider's idempotency keys
  expired, and asserts the provider never holds two live invoices for an order.
- `accounting-invoice-export.processor.spec.ts` has one named test per path above.
- `accounting-framework.arch.spec.ts` fails if `createInvoice` is called anywhere
  but the one place in the export processor, or if the lookup stops preceding it.

Removing the lookup must fail the build.

## Designs considered and rejected

1. **Rely on the provider idempotency key** (reuse one key across all retries).
   Xero forgets a key after 6 minutes and rejects a reused key when the request
   has changed. It protects against a glitch lasting seconds, not a retry an hour
   later.
2. **Shorten our stale-claim window below the provider's key lifetime.** Narrows
   path 3 only. Does nothing for retries after a failure, a manual retry hours
   later, or a restore, and ties our timing to one provider's undocumented-for-us
   internals.
3. **Look up only when our records show an earlier attempt.** Saves one provider
   call per invoice, but trusts our database to be complete; a restore or manual
   fix breaks it silently.
4. **Set the provider's invoice number ourselves from the order number**, so the
   provider itself refuses or absorbs a repeat. This takes over the distributor's
   own invoice numbering, which is theirs (ADR-006). (How Xero treats a repeated
   number — reject, or update the existing invoice — was not verified, as the
   option was rejected on the numbering ground alone.)
5. **Never retry automatically after an unknown outcome; require a person to
   check the accounting system first.** Safe, but turns every provider blip into
   manual work and moves the risk to whether the person checks correctly.
6. **Allow duplicates and detect/void them afterwards.** The duplicate may have
   reached the customer first. Detection stays worthwhile as a backstop —
   `findInvoiceByReference` logs `accounting.invoice.duplicate_detected` if it
   ever sees two — but it is not the control.

## Consequences

- One extra provider read per exported invoice. Under the ADR-071 budget of 50
  calls a minute per organisation, that is about 25 invoices a minute rather than
  50, and about 2,500 a day against the 5,000-call daily limit.
- Every provider adapter must implement `findInvoiceByReference`, including a way
  to tell its own invoices from the rest of the organisation's.
- An export whose outcome was unknown shows as failed-and-retrying, then completes
  with "found from an earlier attempt" in the order's audit trail, instead of
  creating a second invoice.
- **One order, one invoice, fixed at acceptance.** The lookup adopts whatever live
  invoice carries the order's reference; it does not compare or update its
  contents. That is sound today because an order's lines, quantities and prices
  cannot change once it is placed (only whole-order accept / reject / cancel
  exist). If orders become editable after acceptance, the change must reach the
  accounting system by its own designed route (amend the invoice, or a credit
  note) — never by exporting the order again, which under this ADR would simply
  find the original invoice. Likewise a mapping fixed between two attempts does
  not alter an invoice the first attempt already created.
- Cancelling an accepted order does not void an invoice already raised for it;
  that was true before this ADR and is unchanged by it.
- `retryCount` is now only a counter of attempts.
- Duplicates that may already exist in a provider from before this change are not
  found or fixed by it.
- Verified against a real Xero organisation on 2026-10-03: with the export forced
  to FAILED after Xero had created `INV-0051`, the retry found it through the
  `Reference` + "created by this app" filter, adopted it and created nothing.

## References
- Xero developer documentation, "Idempotent requests".
- ADR-006, ADR-069, ADR-071.
- Commits `82561a5` (invoice export), `119a906` (provider call timeout).
- `apps/api/src/accounting/adapters/accounting-connection-adapter.interface.ts`
  (the port), `apps/api/src/accounting-invoice-export/accounting-invoice-export.processor.ts`.
