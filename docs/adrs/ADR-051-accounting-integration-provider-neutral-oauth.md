# ADR-051 — Accounting Integration: Provider-Neutral Model, OAuth Callback Placement, Token Lifecycle

**Status**: Accepted
**Date**: 2026-07-08
**Deciders**: Rick Walsh
**Related**: ADR-006 (Xero as accounting system of record), ADR-046 (admin-api JWT relay and distributor scoping), ADR-047 (event distribution), `docs/deployment/url-map.md`

---

## Context

Wholo needs accounting software integration, starting with Xero, but must not hard-code Xero's shape into the domain model — a second provider (MYOB, QuickBooks) must later be "write one adapter," not a rewrite. This ADR covers **Phase 1 only**: connecting a distributor's Xero organisation via OAuth 2.0 from the admin app. Contact/product sync and invoice export (Phases 2-4) are out of scope and deliberately not built yet.

Three design questions came up during implementation that weren't settled by precedent and are worth recording:

1. Where does the provider-neutral boundary sit, and what's on either side of it?
2. Where does Xero's OAuth redirect physically land — `apps/api` or a BFF?
3. How is the stored access token kept alive, given it's short-lived but the connection may sit unused for long periods?

## Decision

### 1. Provider-neutral abstraction

No Xero-specific field lives on any core domain table. All Xero-specific state lives in new tables named generically: `AccountingConnection` (one row per connection attempt; historical rows are kept, never deleted, when a distributor disconnects/reconnects — enforced to one *active* (`CONNECTED`) row per distributor via a partial unique index, `WHERE status = 'CONNECTED'`) and `AccountingOAuthState` (short-lived, single-use CSRF/correlation row for the connect handshake).

The only thing that knows `xero-node` exists is `XeroAccountingAdapter`, implementing a generic `AccountingConnectionAdapter` interface (`buildAuthorizationUrl`, `exchangeCodeForToken`, `listAvailableOrganisations`, `refreshAccessToken`). `AccountingAdapterRegistry` is a `Map<AccountingProvider, AccountingConnectionAdapter>` keyed lookup — `AccountingConnectionService` and its controllers depend only on the interface and the registry, never on the adapter directly. Adding a second provider is one adapter class plus one registry entry; nothing else in the service, controllers, or frontend changes. The frontend's Integrations page already renders other providers as disabled "Coming soon" cards to reflect this in the UI, not just the backend.

### 2. OAuth callback lands on `apps/admin-api`, not `apps/api`

`docs/deployment/url-map.md` (pre-existing) states the project's own rule of thumb: *"browsers only ever see the four public hostnames; pods only ever talk to each other via internal service DNS"* — and explicitly lists `api.<domain>` as unused by browser flows, reserved for future webhooks. An early version of this feature routed Xero's redirect straight to a public `apps/api` endpoint, reusing that reserved-but-dormant ingress rule. This was corrected: **`apps/api` must never be given a public ingress route**, on principle, even though the route existed and technically wasn't in use for anything else.

The callback instead lands on `apps/admin-api`, which is already one of the legitimately-public hostnames (it serves the admin frontend itself on the same origin/port — `main.ts` runs a combined Express server routing `/api/*` to NestJS and everything else to the embedded Next.js app). Concretely:
- `apps/admin-api`'s `GET /accounting/xero/callback` is the actual, unauthenticated public landing point (Xero's redirect carries only `code`/`state`, never a Wholo JWT, so it structurally cannot sit behind `JwtAuthGuard`).
- It forwards the payload server-to-server to `apps/api`'s `POST /accounting/xero/callback` — an internal, cluster-DNS-only endpoint, reachable only the way every other admin-api → apps/api call already is.
- `apps/api` still owns the actual OAuth mechanics (holds the Xero client secret, does the token exchange via `xero-node`) and returns plain JSON (`{status: 'connected'}` / `{status: 'error', reason}`); `admin-api` owns the browser-facing concern of turning that into a redirect, which is a **relative** `res.redirect('/integrations?...')` since it's already the same origin as the frontend — no cross-service absolute-URL config needed for it.
- Trust on both unauthenticated endpoints is anchored entirely in the `AccountingOAuthState` row: a `randomBytes(32)` value, single-use (deleted before any external call, so a retried/duplicate callback can't replay it), 10-minute TTL.

### 3. Token storage and two-tier refresh

The token set (access token, refresh token, expiry, granted scope) is stored as one AES-256-GCM encrypted blob (`AccountingConnection.encryptedCredentialData`, via `TokenEncryptionService`, fresh random IV per encryption, key from `ACCOUNTING_TOKEN_ENCRYPTION_KEY`) — never in plaintext, never logged.

Xero's access tokens live ~30 minutes; refresh tokens rotate on every use and expire after 60 days of *inactivity*. These are two different problems with two different solutions, deliberately not conflated into one mechanism:

- **Correctness at the point of actual use** (Phase 2+ calling Xero's API): `AccountingConnectionService.getValidTokenSet(distributorId, provider)` — the only path any future caller uses; nothing outside this method touches `encryptedCredentialData` or calls the adapter's `refreshAccessToken` directly. It re-reads the connection inside a transaction, takes a Postgres advisory lock (`pg_advisory_xact_lock(hashtext(connectionId))`, auto-released at transaction end) to serialize concurrent refreshes for the same connection — otherwise two racing callers could both submit the same about-to-be-invalidated refresh token — decrypts, refreshes only if expiring within 5 minutes, re-encrypts and persists the rotated token, and updates `lastSyncedAt`. A refresh failure (revoked/expired refresh token) marks the connection `ERROR` with `lastErrorMessage` and is not silently retried; `getConnectionStatus` surfaces `ERROR` distinctly (not indistinguishable from "never connected"), and the Integrations UI shows a reconnect prompt.
- **Business continuity against 60-day dormancy**: nothing above ever fires if a distributor genuinely has no invoices to sync for months, so a connection could quietly die between uses. `AccountingTokenRefreshScheduler` (worker process only, same structural pattern as `OutboxPublisherService`: plain `@Interval` tick + re-entrancy guard) runs once daily (plus once immediately via `OnModuleInit`, so a restart doesn't wait up to 24h for its first check), sweeping any `CONNECTED` row not synced in the last 25 days through `getValidTokenSet`. The 25-day threshold and daily cadence are deliberately coarse — this is insurance against a 60-day cliff, not a freshness mechanism, so it's untroubled by ordinary worker-pod restarts or brief downtime.

## Consequences

- No schema migration was needed for the refresh mechanism — `AccountingConnection.lastSyncedAt` (already present, originally intended for future sync-status display) is repurposed as "last time this connection successfully talked to the provider," serving both the on-demand primitive and the dormancy sweep.
- `apps/api` remains reachable only via internal cluster DNS for this feature, consistent with every other admin-api → apps/api call, with no exception carved out for the OAuth callback.
- Phase 2+ (contact/product sync, invoice export) can be built entirely against `getValidTokenSet` and the adapter interface without ever touching encrypted credentials or provider SDKs directly.
- The advisory lock intentionally holds a DB transaction open for the duration of a refresh network call (typically sub-second, low frequency per connection) — a deliberate trade-off favouring correctness (no double-submitted refresh token) over strict transaction-brevity hygiene.
- Local HTTPS testing against a real Xero developer app (Xero requires an HTTPS redirect URI, even for localhost) required standing up a local Traefik ingress for `admin.localhost` only — documented in `CLAUDE.md` and automated via `scripts/setup-local-xero-https.sh` — while deliberately leaving `apps/api` out of that ingress entirely, per point 2 above.
