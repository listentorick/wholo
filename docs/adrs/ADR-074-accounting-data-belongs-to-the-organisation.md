# ADR-074: Accounting data belongs to the provider organisation, not the connection

## Status
Accepted (2026-10-04). Amends ADR-051 (connection rows) and supersedes the
organisation-matching workaround in ADR-072.

## Context

A distributor whose Xero connection dropped, or who disconnected and connected
again, lost every link they had made: Xero contacts to customers, Xero items to
products, Xero tax rates to tax types. All of it had to be matched again by hand.
The same reconnect also reset the "send invoices as Draft/Authorised" setting.

The cause: ADR-051 creates a new `AccountingConnection` row on every connect and
keeps the old ones as history, and every table of accounting data was keyed on
`accountingConnectionId`. That covered cached records, links, suggestions,
bulk-import jobs, invoices sent and the setting. The new row started empty, and
the old data sat on a DISCONNECTED row that nothing read.

This was never decided. ADR-051 predates contacts, products and tax types (Phases
2–3, commits `1179602`, `dc5ee2c`, `1d649f0`), and none of them discusses
reconnecting. The same bug had already been found once, for invoices only (commit
`d27b38e`, ADR-072). It was fixed with a workaround that matched export rows by
`(distributorId, provider, externalOrganisationId)` across connection rows
(`exportsForOrganisation`, `organisationKey`). Contacts, products and tax types
were left keyed on the connection.

## Decision

**Everything a distributor builds up against an accounting provider belongs to
the provider organisation, the company they connected to. A connection is only
the login.**

- New table `AccountingOrganisation`: one row per `(distributorId, provider,
  externalOrganisationId)` (unique). `externalOrganisationId` is the id the
  adapter's `listAvailableOrganisations` returns: a Xero tenant, a QuickBooks
  realm, and so on. It also holds the organisation `name` (refreshed on every
  connect) and `invoiceExportTargetStatus`. `distributorId` is part of the key,
  so two distributors connecting the same provider company each get their own
  record and never share data.
- `AccountingConnection` gains `accountingOrganisationId` and loses
  `externalOrganisationId`, `externalOrganisationName` and
  `invoiceExportTargetStatus`. It keeps the tokens, status, errors and
  timestamps. One row per connect is unchanged, so ADR-051's history stays.
- Cached contacts, products and tax rates, their links and suggestions,
  bulk-import jobs and invoice exports all reference `accountingOrganisationId`,
  with every unique constraint re-keyed the same way.
- The OAuth callback upserts the organisation, retires the current connection
  and creates the new connection pointing at it. Reconnecting to a company seen
  before picks all of its data back up, whether after an error, a disconnect, or
  as a different user of the same company. A company never connected before
  starts empty, and switching back to an earlier company restores that company's
  data.
- One rule, one place: every query over organisation-owned data scopes itself
  with `organisationScope(connection)` (`accounting/accounting-organisation.ts`),
  which carries both `accountingOrganisationId` and `distributorId`.
- **Sync bookkeeping stays per connection.** `IngestionRun.sourceRef` is still
  the connection id. Runs, schedules and the incremental cursor describe a
  login's position, so a new connection's first pull is a full pull. That pull
  reconciles the organisation's cache, adding anything the previous login could
  not see and marking what has gone.
- The invoice-export "already exported" guard still checks the order across all
  organisations, so switching company does not re-invoice an order. The per-
  organisation unique `(accountingOrganisationId, orderId)` now also stops a
  reconnect to the same company from creating a second export row.

Links made under an earlier login are kept as they are, including any that were
wrong (for example, made while that user could only see part of the data). They
are fixed by unlinking, like any other mistake. A "start over" action that
discards an organisation's links was considered and deferred.

### Rollout: clear down, then a plain Prisma migration

There was no live data worth keeping, so existing accounting data is cleared
rather than converted. Prisma cannot add the required columns to non-empty
tables, so the clear-down (`apps/api/scripts/clear-accounting-data.js`, plain JS
so it can be piped into a running api pod — see `docs/runbook/deploy.md`) must run
**before** the
`accounting_data_per_organisation` migration is deployed, in every environment.
Without `--yes` it only prints counts. The migration itself is exactly what
`prisma migrate dev --create-only` generates (ADR-052); it has no hand edits and
no data steps.

After it, every distributor reconnects their accounting provider and maps again,
and existing orders show no accounting invoice.

## Consequences

- A dropped or disconnected connection no longer costs the distributor their
  mappings or settings.
- `exportsForOrganisation` / `organisationKey` (ADR-072's workaround) are gone.
  The invoice status sync and the scheduler's "anything unsettled?" check match
  on `accountingOrganisationId` directly.
- The framework stays provider-neutral. Every provider has a notion of "the
  company you connected to", already exposed through `listAvailableOrganisations`.
  New tables of provider data must reference `AccountingOrganisation`.
- The scheduler and pull processors load a connection together with its
  organisation (`CONNECTION_WITH_ORGANISATION`) and read the provider's
  organisation id from there.
- Verified by `test/accounting-connection.integration-spec.ts`
  ("reconnecting (ADR-074)"), which runs the real OAuth callback through a fake
  provider. It covers links kept across a disconnect and across an ERROR,
  the setting kept, a different company starting empty and then restored, and
  distributor isolation for the same company.
