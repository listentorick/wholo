# Accounting framework: how it works and how to add a provider

Stocdup connects to a distributor's accounting system through a
provider-neutral framework. Xero is the first provider and, today, the only
one. This guide explains the framework at a high level, lists what a second
provider has to supply, and records where the Xero implementation has leaked
into code that is meant to be neutral.

It is a companion to the component diagrams and does not repeat them:

| For | Read |
|---|---|
| The components and how they connect | [`c4-component-accounting.md`](c4-component-accounting.md) — diagram 1 (connection and inbound sync), diagram 2 (bulk import, invoice export, payment status), diagram 3 (the Xero implementation) |
| Classes, routes, queues and signatures | The five documents in [`code/`](code/) |
| The contract itself | The header of `apps/api/src/accounting/adapters/accounting-connection-adapter.interface.ts` — the authoritative statement of the rules; this guide summarises it |

Component names in **bold** below are the boxes on those diagrams.

## 1. How the framework works

### Who owns what

Stocdup owns products, prices and orders. The accounting system is the system
of record for invoices, payments and balances (ADR-006). Stocdup always starts
the conversation: it polls for data and pushes invoices. The provider never
calls in, apart from the browser redirect at the end of the OAuth consent,
which arrives through the admin app.

### One boundary

Everything that is specific to a provider sits behind one interface,
`AccountingConnectionAdapter` — the **Provider port and registry** on every
diagram. The SDK, OAuth details, field names, statuses, paging cursors, rate
limits, error codes and the provider's display name all stay on the far side
of it. The framework asks the registry for "the adapter for this connection's
provider" and calls the port; it never names a provider.

Data crosses the port in neutral shapes: decimals as strings, calendar dates
as `YYYY-MM-DD`, and the provider's own vocabulary only in fields kept for
that purpose (`raw`, `rawStatus`, `externalInvoiceStatus`).

### Two processes, one image

The accounting module loads in both the Central API and the Worker (the same
`apps/api` image). The split of work is:

| Process | Does |
|---|---|
| Central API | Answers the admin app: connect and disconnect, connection status and settings, the review screens for contacts, products and tax types, "Sync now", and retrying a failed invoice export. It writes an outbox row when work needs doing; it does not do the work. |
| Worker | Does the work: the schedulers, every pull from the provider, bulk imports, invoice export, and token refresh. |

The two never call each other. A line on the diagrams from an API component to
the **Outbox relay** means "writes an outbox row that the relay puts on a
queue" (ADR-034, ADR-047).

### The moving parts

| Concern | Component | What it guarantees |
|---|---|---|
| Logging in | **Connection and OAuth** | Starts the consent flow, handles the callback, stores the tokens encrypted, and records which company in the provider the distributor connected. |
| Identity of the data | (part of Connection and OAuth) | Everything the distributor builds up — cached records, links, suggestions, invoices sent, settings — belongs to the *accounting organisation* (distributor + provider + the provider's company id), not to the login. Reconnecting to the same company keeps it all (ADR-074). |
| A usable token | **Token gateway** | The only way to get a token. Refreshes when it is close to expiry, with a lock so two jobs never refresh at once, and marks the connection as needing a reconnect when the provider refuses. |
| Not overrunning the provider | **Provider call control** | A per-organisation call budget shared by every process and queue, a retry backoff that honours the provider's "retry after", and one place that decides whether a failure is retried or given up (ADR-071). |
| Deciding what to pull | **Sync scheduling** | Each record type has an interval. Scheduled pulls and "Sync now" both go through the outbox and the ingestion-run tracker, never straight onto a queue. |
| Reading provider data | **Inbound pull processors** | Contacts, products and tax rates: fetch, cache, detect changes, and offer matches for the distributor to review. One shared base class owns the lifecycle (claim, heartbeat, full vs incremental, failure handling); each pull supplies only what differs. |
| Suggesting links | **Matching** | Ranks which Stocdup record a provider record probably corresponds to. It only suggests; the distributor confirms. |
| Reviewing and linking | **Mapping review API** | The screens' endpoints: list cached records, link, unlink, import as new, and request a bulk import. |
| Bulk work | **Bulk import** | Imports or links many records in the background. |
| Sending invoices | **Invoice export processor** | One invoice per accepted order. Before every create it asks the provider whether that order's invoice already exists and adopts it if so, so an order is never invoiced twice (ADR-073). |
| Hearing about payment | **Invoice status pull** → **Payment state writer** | Reads status and payment facts for exported invoices that are not yet settled, and writes them through the single writer of invoice payment state (ADR-072). |

### The four flows

The step-by-step versions, naming the components at each step, are in the
component document under
[How the main flows cross the components](c4-component-accounting.md#how-the-main-flows-cross-the-components).
In one line each:

1. **Connect** — the admin app asks for a consent URL, the distributor approves
   in the provider, the redirect comes back through the admin app, and the
   tokens and organisation are stored.
2. **Scheduled sync** — the scheduler finds pulls that are due, the pull
   processor gets a token, calls the port page by page, caches the records and
   records suggestions.
3. **Invoice export** — accepting an order emits an event; the export processor
   checks the mappings it needs, looks the invoice up by the order reference,
   and creates it only if it is not there.
4. **Payment status** — a pull reads the status of unsettled invoices and the
   payment state writer updates the order's invoice state.

### What keeps it honest

Two tests fail when code drifts from these rules:

- `apps/api/src/accounting/accounting-framework.arch.spec.ts` reads the source
  and fails if anything outside the adapters imports a provider SDK, branches
  on a specific provider, or hard-codes a provider's name in user-facing text;
  if a pull does not extend the pull base; or if an invoice is created anywhere
  but the one sanctioned place.
- `apps/api/test/accounting-framework.integration-spec.ts` drives contact sync,
  invoice export and payment status end to end through a fake provider
  (`test/support/fake-accounting.adapter.ts`) that is not Xero.

Both cover `apps/api` only. Section 3 explains why that matters.

## 2. Implementing a new provider

The intent is that a provider is **one adapter class plus its entry points**,
and that nothing in sync, export, payment status, matching or scheduling
changes. Diagram 3 of the component document shows exactly which pieces Xero
supplies; a second provider supplies the same set.

### Step 1 — Add the provider to the enum

Add the value to `AccountingProvider` in `apps/api/prisma/schema.prisma`.
Generate the migration with `prisma migrate dev --create-only`, read it, then
apply it. Copy the schema to `apps/admin-api/prisma/schema.prisma` (it must
stay byte-for-byte identical), and add the value to the `AccountingProvider`
type in `packages/types/src/index.ts`.

### Step 2 — Write the adapter

Create `apps/api/src/accounting/adapters/<provider>-connection.adapter.ts`
implementing `AccountingConnectionAdapter`. `xero-connection.adapter.ts` is the
reference implementation.

| Method | What it must do |
|---|---|
| `displayName` | The provider's name for user-facing text. |
| `buildAuthorizationUrl(state)` | Return the consent URL, carrying `state`. |
| `exchangeCodeForToken(callbackUrl, expectedState)` | Turn the redirect into a token set, verifying the state. |
| `listAvailableOrganisations(tokenSet)` | The companies this login can access, each with a stable id and a name. |
| `refreshAccessToken(tokenSet)` | Return a fresh token set. |
| `listContacts`, `listProducts` | One page of records plus an opaque `nextCursor`; `null` when the provider cannot do incremental pulls (the framework then always pulls in full). |
| `listTaxRates` | All tax rates (always a full pull). |
| `hasInvoiceCreationScope`, `hasInvoiceReadScope` | Whether the granted scopes allow invoice export and status reads, so the framework can ask for a reconnect instead of hitting a 403. |
| `findInvoiceByReference` | The invoice whose reference is the Stocdup order number, or `null`. The never-duplicate guarantee depends on this being accurate. |
| `createInvoice` | Create the invoice from the neutral request, using the idempotency key. Send prices exactly as given; when `dueDate` is absent, send no due date so the provider's own terms apply (ADR-075). |
| `listInvoiceStatuses` | Status and payment facts for invoices, mapped onto the neutral invoice states. |

Obligations that apply to every method (from the interface header):

- **One call path.** Route every provider API call through one private method
  that takes a slot from the call budget first
  (`AccountingCallBudgetService.acquire(provider, orgId, perMinute)` with the
  adapter's own declared limit, set safely under the provider's published
  one), applies a timeout, and logs one structured line per call.
- **One error type.** Throw every failure as `AccountingProviderError`,
  classified the same way for every provider. *Transient* (retried): no
  response, rate limited (pass on the provider's retry-after), provider 5xx,
  expired or invalid access token. *Permanent* (needs the user): validation
  errors and other 4xx. Build messages only from the provider's own error
  text, never the raw response — it can carry tokens or personal data. Put the
  provider-specific parsing in its own file, as `xero-errors.ts` does.
- **Neutral shapes.** Decimals as strings, dates as `YYYY-MM-DD`, the
  provider's vocabulary only in `raw` / `rawStatus` / `externalInvoiceStatus`.
- **Opaque cursors.** Encode whatever the provider supports; the framework
  stores the string and hands it back.

Unit-test the adapter against a mocked SDK, covering the error classification
and the mapping in both directions.

> The Xero adapter does not fully meet the first two obligations: its
> `exchangeCodeForToken` and `listAvailableOrganisations` do not go through
> its common call path, and token refresh uses its own request with a timeout
> but no budget (a comment marks that one as deliberate). Follow the header,
> not the reference, on this point.

### Step 3 — Register it

- Add the adapter to the providers in
  `apps/api/src/accounting/accounting.module.ts`.
- Add it to `AccountingAdapterRegistry`
  (`adapters/accounting-adapter.registry.ts`). The constructor currently takes
  the Xero adapter by name; the header says to change it to take a list of
  adapters when the second provider lands.

### Step 4 — Add the OAuth entry points

Today these are Xero-named in four places and each needs a counterpart, or —
better, and what the header asks for — generalising to take the provider as a
parameter:

| Layer | Xero today |
|---|---|
| Central API, start | `POST …/accounting/connections/xero/authorization-url` in `accounting-connection.controller.ts` |
| Central API, callback | `POST accounting/xero/callback` in `xero-callback.controller.ts` with `dto/xero-callback.dto.ts` |
| Admin BFF | `connections/xero/authorization-url` and `accounting/xero/callback` in `apps/admin-api/src/accounting/` |
| Client package | `createXeroAuthorizationUrl()` in `packages/admin-api-client/src/accounting.ts` |

The service methods behind them (`createAuthorizationUrl(distributorId, userId,
provider)` and `handleCallback(callbackUrl, code, state)`) are already
provider-neutral: the provider is a parameter on the way in, and on the way
back it is read from the stored OAuth state row.

The redirect URI registered with the provider is the **admin BFF's** route,
because the Central API has no public route. Register
`https://admin.<domain>/api/v1/accounting/<provider>/callback` (or the
generalised path) in the provider's developer console.

### Step 5 — Configuration and secrets

The adapter reads its client id, client secret and redirect URI from config
(Xero: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`). Add the
new provider's variables to `apps/api/.env.example`,
`helm/wholo/templates/api/configmap.yaml`, `secret.yaml` and `values.yaml`, and
to the CI environment in `.github/workflows/build-images.yml` (the integration
job sets throwaway Xero values). The accounting module loads in both
processes, so both the API and the Worker need them.

### Step 6 — Admin app

- A connection card for the provider on the Integrations page
  (`XeroConnectionCard.tsx` is the existing one; `ComingSoonProviderCard.tsx`
  is the placeholder for providers not yet built).
- The items in section 3 under "Admin app" — they are hard-coded to Xero and
  will show the wrong name or logo for another provider until fixed.

### Step 7 — Prove nothing else changed

- `pnpm --filter @wholo/api test` — the architecture spec must pass **without
  adding to its `PROVIDER_EDGES` allow-list**. That list is the known debt;
  the spec's own comment says to generalise rather than extend it.
- `pnpm --filter @wholo/api test:integration` — the fake-provider spec must
  pass unchanged. In the header's words: if a new provider needs changes there,
  the port is leaking.

If the new provider cannot be expressed without changing the port, the sync
bases, the export processor or the schema, that is a finding about the
framework (see section 3, "Shape of the port"), not something to work around
inside the adapter.

## 3. Where Xero has bled into the framework

Found by searching for Xero references outside `accounting/adapters/` across
the API, the admin BFF, the shared packages and the admin frontend, and by
reading the port for assumptions that hold for Xero but not necessarily for
another provider. Grouped by how much they would cost a second provider.

### A. Acknowledged edges (allow-listed in the architecture spec)

These are known and named in the interface header as "generalise when the
second provider lands".

| Where | What |
|---|---|
| `accounting/accounting-connection.controller.ts` | Route `connections/xero/authorization-url`, handler `createXeroAuthorizationUrl`, passes `AccountingProvider.XERO`. |
| `accounting/xero-callback.controller.ts`, `dto/xero-callback.dto.ts` | Route `accounting/xero/callback`. Xero only in name and path: the body (`callbackUrl`, `code`, `state`) and the service call are generic. |
| `accounting/accounting.module.ts` | Imports and provides `XeroAccountingAdapter` and `XeroCallbackController`. |
| `adapters/accounting-adapter.registry.ts` | Constructor takes `XeroAccountingAdapter` and registers it under `AccountingProvider.XERO`. Its comment says the framework "never names a provider itself" while doing so. |

### B. Outside `apps/api` — not covered by any test

The architecture spec only reads `apps/api/src`. Everything below would pass
CI with a second provider half-supported.

| Where | What |
|---|---|
| `apps/admin-api/src/accounting/xero-callback.controller.ts` | Xero-named route; logs with the literal `provider: 'XERO'`. |
| `apps/admin-api/src/accounting/accounting.controller.ts`, `accounting.service.ts` | `createXeroAuthorizationUrl`, `handleXeroCallback`, and the Xero paths they proxy to. |
| `packages/admin-api-client/src/accounting.ts` | `createXeroAuthorizationUrl()`. |
| `packages/types/src/index.ts` | `AccountingProvider = 'XERO'` — a hand-kept copy of the enum. |
| `apps/admin/src/app/(app)/integrations/page.tsx` | Renders `XeroConnectionCard` directly. Every callback banner hard-codes the name: "Xero connected successfully", "Xero connection was cancelled", "No Xero organisation was authorised", and so on. |
| `apps/admin/src/components/integrations/IngestionProgressPanel.tsx` | Hard-codes `/logos/xero.png` in two places, whichever provider is connected. |
| `apps/admin/src/app/(app)/integrations/accounting/page.tsx`, `apps/admin/src/lib/payment-term-labels.ts` | Each keeps its own `PROVIDER_LABELS = { XERO: 'Xero' }`. The API's connection status returns the provider enum but not the adapter's `displayName`, so the frontend has had to duplicate it — twice. |
| `apps/admin/src/components/integrations/tax-types/CreateTaxTypeFromExternalDialog.tsx` | Copy: "Xero has no equivalent for classification". |

The API already uses `displayName` for its own user-facing text (the
"needs to be reconnected" notification and email). The frontend is where the
rule "adapters supply the name" stops being followed.

### C. Shape of the port

These are not Xero *names* but Xero-shaped *assumptions* in the neutral
contract. None matters until a provider differs on that point; each is a
judgement, not a defect.

| Assumption | Where | Why it is Xero-shaped |
|---|---|---|
| OAuth 2.0 authorization-code with refresh tokens | `buildAuthorizationUrl`, `exchangeCodeForToken(callbackUrl, expectedState)`, `refreshAccessToken`; `AccountingTokenSet` (`accessToken`, `refreshToken`, `expiresAt`, `idToken`, `scope`) | A provider using API keys, or OAuth without refresh tokens, has nothing sensible to return from half the connection methods. |
| Scopes are a space-separated string | `hasInvoiceCreationScope(grantedScopes: string)`, `hasInvoiceReadScope` | Fine for OAuth providers; meaningless for one whose permissions are not scope strings. |
| One login can see several companies; take the first | `handleCallback` in `accounting-connection.service.ts` uses `organisations[0]` and logs a warning when there is more than one | This is Xero's multi-organisation consent. It is framework behaviour, not adapter behaviour, and "multi-org selection is not yet supported" is stated in the log line. |
| A tax rate's key is a code called `taxType`, with no id and no modified time | `AccountingExternalTaxRate.taxType`; the `taxType` column and its unique constraint on the cached tax-rate table | The comment on the type calls this "one deviation" made for Xero. The field name is Xero's. A provider with real tax-rate ids fits, but under a misleading name. |
| An invoice is created as Draft, Submitted or Authorised | `AccountingInvoiceTargetStatus` (schema enum, port type, settings DTO, and the three options in `AccountingSettingsTab.tsx`) | Those are exactly Xero's three creatable statuses. The schema comment says each adapter maps them, but the choice the distributor is offered is Xero's. |
| Invoice lines carry an item code, a tax code and an account code | `AccountingInvoiceLineRequest` (`externalItemCode`, `taxCode`, `accountCode`), fed from the cached product's `accountCode` | Xero's line model. Providers that identify these by id, or require an account, need the cache and the request to carry something else. |
| Rate limits are "N calls per minute per organisation" | `AccountingCallBudgetService.acquire(provider, orgId, perMinute)` — a fixed 60-second window | Xero's primary limit. Xero's daily limit is already handled inside the adapter because the budget cannot express it; a provider with per-app or concurrency limits is in the same position. |

### D. Framework constants tuned to Xero

| Where | What |
|---|---|
| `REFRESH_BUFFER_MS` (5 min) in `accounting-connection.service.ts` | Chosen because "Xero access tokens live ~30 min". A framework constant, not something the adapter declares. |
| `DORMANCY_THRESHOLD_MS` (25 days) in `accounting-token-refresh.scheduler.ts` | Chosen because "Xero refresh tokens expire after 60 days of inactivity". A provider with a shorter refresh-token life would expire between sweeps. |

Both would be better as values the adapter supplies, alongside its per-minute
limit.

### E. Comments and tests

- Xero is named in comments throughout the neutral code — most heavily in
  `accounting-connection.service.ts`, the tax-type sync processor and service,
  and the schema comments on the accounting models. The architecture spec
  deliberately strips comments before checking, and the port's own comment
  says provider names appear "only as examples". Harmless, but several
  describe Xero behaviour as if it were the framework's (for example "the
  single place any Xero-API-calling code goes through").
- The fake-provider integration spec creates its connection with
  `AccountingProvider.XERO`, because the enum has no other value, and swaps
  the registry for one that always returns the fake. So the spec proves the
  processors are neutral, but not that the registry dispatches by provider.

### What this adds up to

The neutral core — sync, matching, export, payment status, scheduling, call
control — names no provider in code, and the tests enforce that. The leaks are
at the edges: the OAuth entry points (known and allow-listed), the whole path
from the admin BFF to the browser (unknown to any test), and a handful of
choices in the port's shape that were made with only Xero in view.

Sections A and B are mechanical to fix and are best done as the first commit of
a second provider, before its adapter is written. Section C can only be judged
against a real second provider's API; it is the list to read that API against.
