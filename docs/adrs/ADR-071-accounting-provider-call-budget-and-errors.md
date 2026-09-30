# ADR-071: Accounting provider calls — per-organisation budget, Retry-After, safe errors

## Status
Accepted (2026-09-29). Extended by the invoice payment sync (planned).

## Context
Stocdup calls each distributor's accounting system (Xero today) from the worker:
contact, product and tax-rate syncs and invoice export, with invoice status sync to
follow. Designing for ~1000 connections exposed four gaps:

- Nothing enforced a provider call rate. Xero's published limits (verified
  2026-09-29) are **per organisation 60 calls/min, 5,000/day, 5 concurrent**, and
  10,000/min across the whole app; a 429 carries `Retry-After`, and every response
  reports `X-MinLimit-Remaining` / `X-DayLimit-Remaining` / `X-AppMinLimit-Remaining`.
- Retries used a fixed exponential backoff, ignoring `Retry-After`.
- xero-node 18.0.0 (as pinned) rejected every failed call with a JSON **string**
  that embedded the request headers **including `Authorization: Bearer <access
  token>`**, and crashed the process (unhandled `TypeError` in its `ApiError`) on a
  transport failure. Verified empirically against the SDK with a local HTTP server.
  Our error mapping read `err.response.statusCode` from that string, so every Xero
  error was classified transient and its raw text reached the export's
  `errorMessage`, audit summary, admin notification and logs.
- Only invoice creation mapped errors at all; sync list calls surfaced raw SDK
  errors.

## Decision

### Upgrade xero-node to 18.1.0
Same major; its `ApiError` redacts request headers to an allowlist and tolerates a
missing response (transport failures reject with `statusCode: 0`). Re-verified.

### One call path in the adapter
Every Accounting API call in `XeroAccountingAdapter` goes through a private
`call(op, orgId, fn)`:

1. **Budget.** `AccountingCallBudgetService.acquire(provider, orgId, perMinute)` — a
   Redis sliding-window log per `(provider, organisation)` scored by Redis `TIME`,
   guaranteeing no more than N calls in any rolling 60 s across every process. Xero
   declares 50/min (margin under 60). A wait over 20 s throws a transient
   `CALL_BUDGET_EXHAUSTED` error carrying `retryAfterMs`, giving the worker lane
   back. **Fails open** on a Redis error (the opposite of the refresh lock, which
   guards token integrity): the worst case is a provider 429, handled below.
2. **Timeout.** 60 s — xero-node sets none. A timed-out write is safe to retry: every
   write carries an idempotency key.
3. **Logging.** debug `accounting.provider.call` (op, status, duration, remaining
   minute/day/app limits, correlation id); warn `accounting.provider.day_limit_low`
   under 10% of the daily limit; warn `accounting.provider.call_failed` on failure.
4. **Errors.** `parseXeroSdkError` (`xero-errors.ts`) reduces any rejection shape to
   `{ statusCode?, validationMessages, xeroMessage, retryAfterMs, correlationId,
   transportMessage }`. The thrown `AccountingProviderError` has a message built
   only from Xero's validation/error text, `code` `HTTP_<status>` / `NETWORK`,
   `details { statusCode, retryAfterMs }`, and the *parsed* object as `cause` —
   nothing raw from the provider can reach storage, notifications or logs.
   429 / 5xx / transport → transient; other 4xx → permanent.

No per-organisation concurrency guard: the sync dedupe (ADR-061) allows one run per
(connection, resource type) and invoice export runs at concurrency 1, so at most 5
sequential call streams exist per organisation — Xero's limit. Raising export
concurrency would break that and needs a semaphore. No app-wide BullMQ limiter: our
lane count cannot approach 10,000/min.

### Retry-After-aware backoff
The four accounting queues use backoff type `accounting`
(`accounting-backoff.ts`), wired via each processor's `settings.backoffStrategy`:
wait exactly `retryAfterMs` (+ up to 5 s jitter) when the error carries it,
otherwise 30 s × 2^(attempt−1) as before.

## Consequences
- A failed Xero call is one clean, structured warn line; alerts in
  `helm/wholo/alerting/stocdup-accounting.yaml` (ADR-064 addendum) cover give-ups,
  `invalid_client`, error spikes and the daily limit.
- Budget exhaustion still uses up a BullMQ attempt (the backoff waits exactly
  `retryAfterMs`), but the invoice export does not report it as a failure while
  attempts remain: the call was never sent, so the export goes back to `PENDING`
  quietly (log `accounting.invoice_export.deferred`), with no FAILED status,
  timeline entry or admin notification. The final attempt is reported as a normal
  failure, so an export that never gets a slot stays visible and retryable. Xero
  429s and 5xx are real provider faults and are still reported on every attempt.
- Existing FAILED invoice exports created before this change may hold a raw SDK
  string (possibly an access token, 30-minute lifetime) in `errorMessage`; they are
  overwritten on the next retry.
- Adding a provider: declare its limits, route its calls through the same budget,
  and map its errors to `AccountingProviderError` with `details`.

## References
ADR-006, ADR-047, ADR-051, ADR-061 ("Scheduling"), ADR-064 (addendum).
