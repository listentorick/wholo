# ADR-006: Xero as the accounting system of record

## Status
Accepted

## Context
Distributors need invoicing, payment tracking and customer balance management. Building a full accounting ledger within Wholo would be a significant scope addition and would duplicate functionality that mature accounting software already provides. Xero is widely used by the target distributor segment.

## Decision
Xero is the system of record for:
- invoices and invoice status
- payments
- customer balances and credit notes
- accounting records

Wholo creates invoices in Xero when orders are fulfilled. Invoice status and payment state are synchronised back to Wholo asynchronously so customers can view invoice status without Wholo querying Xero on every request.

The Xero integration runs entirely through the background job queue — no Xero API calls are made in the synchronous request path. This insulates the user experience from Xero's availability and rate limits.

## Consequences
- Distributors do not need a separate invoicing workflow outside Wholo.
- Xero rate limits and temporary unavailability are absorbed by the queue; users are not directly affected.
- Invoice state in Wholo may lag behind Xero by the queue processing delay; this is acceptable for the use case.
- Duplicate invoice prevention requires idempotency keys on Xero API calls (stored in Redis and as Xero external references in Postgres).
- If Xero's API changes or a distributor switches accounting software, the integration layer must be updated.
- Wholo is not a substitute for accounting software and does not maintain a general ledger.
