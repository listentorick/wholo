# ADR-046 — Admin API: JWT Relay and Explicit Distributor Scoping

**Status**: Accepted
**Date**: 2026-07-01
**Deciders**: Rick Walsh
**Related**: ADR-009 (JWT authentication), ADR-010 (multi-tenancy distributorId scoping), ADR-026 (dual BFF architecture)

---

## Context

A security review found that `apps/api`'s 11 admin-only controllers (`admin-customers`, `admin-settings`, `admin-orders`, `admin-catalogues`, `admin-products`, `admin-product-types`, `admin-suppliers`, `asset-images`, `admin-delivery-profiles`, `admin-price-lists`, and the order-as session-creation endpoint) had **no authentication guard at all**. Tenant scoping was enforced only by trusting an `x-distributor-id` request header (plus `x-user-id` on `admin-orders`/order-as) asserted by `apps/admin-api` — never verified. Anything able to reach `apps/api:3001` inside the cluster could set an arbitrary `x-distributor-id` and read, modify, or delete any distributor's data. ADR-010's "application-level distributorId scoping" was therefore only enforced at the database-query level (does this row belong to distributor X), not at the request-authorization level (is this caller actually allowed to act as distributor X).

This is also the machine-to-machine token gap ADR-026 explicitly deferred ("`apps/api` must eventually accept machine-to-machine tokens from `apps/admin-api`... not implemented in v1").

Investigated and ruled out before deciding on the fix:

- `PLATFORM_ADMIN` (in the `Role` enum) and multi-organisation `Membership` support are both unimplemented today — every seeded user has exactly one membership, and no code path anywhere grants cross-distributor access. Building speculative support for an unused role was out of scope.
- A real, near-term need does exist, though: 3rd-party/system API access (e.g. a future Xero-style integration). A service credential isn't tied to a single membership the way a human admin's JWT is, so it genuinely needs to assert *which* distributor a given call concerns, explicitly — not infer it ambiently from "the one membership a human has."
- `apps/portal-api` already does the correct thing: its `JwtStrategy` doesn't resolve `organisationId` itself at all, and its `ApiClientService` forwards the customer's real bearer JWT to `apps/api` on every call. `apps/admin-api`'s own `JwtStrategy` already resolves `organisationId` via `apps/api`'s `/auth/me` endpoint, but then discarded the original token and re-asserted a bare header on every subsequent call instead of continuing to relay it — an avoidable inconsistency, not a different requirement.
- `x-order-as-session` (the "distributor admin acting as a customer" feature) is a separate, already-sound mechanism: it binds a session token to the caller's real JWT subject (`request.user.sub`) on every use, so a stolen/guessed token is inert without the original admin's live credential. It is unaffected by this change.

## Decision

Replace implicit header-based trust with explicit, verified authorization on the affected `apps/api` routes.

1. **Explicit `:distributorId` path parameter** on all 11 affected controllers (e.g. `GET /admin/customers` → `GET /admin/distributors/:distributorId/customers`), instead of an out-of-band header. This also gives the route shape a future M2M caller needs — explicitly declaring which distributor a call concerns — rather than relying on an ambient single membership the way a human JWT resolves today.

2. **`DistributorAccessGuard`** (new — `apps/api/src/auth/guards/distributor-access.guard.ts`) validates the path's `:distributorId` against the authenticated caller's `Membership` records, exposed on the JWT-derived principal as `organisationIds` (`JwtStrategy` was extended additively — existing `organisationId`/`role` fields are unchanged for the customer-facing routes that already depend on them). Applied together with `JwtAuthGuard`, so every affected route now requires a real, Keycloak-issued, RS256/JWKS-validated JWT.

3. **`apps/admin-api` relays the admin's real bearer token** to `apps/api` instead of synthesizing `x-distributor-id`/`x-user-id`. `ApiClientService` was collapsed to a single bearer-token-based request method across all verbs (including multipart uploads); the now-redundant `getAsBearer` special case was folded into the regular `get`.

4. **Audit-trail user identity** (`admin-orders` accept/reject/cancel) now comes from the JWT's verified subject (`req.user.sub`) rather than the unverified `x-user-id` header.

5. The M2M/service-principal case is deliberately **not** built yet. `DistributorAccessGuard` has a marked extension point (`// TODO: service-principal bypass`) for when a Keycloak confidential client with `client_credentials` is actually introduced — no such client exists today, so nothing was built against a still-hypothetical spec.

## Consequences

- Closes the cross-tenant data-access gap: a caller must hold a real JWT proving membership in the specific distributor named in the path. Header spoofing no longer works — the header is not read at all anymore.
- `apps/admin-api` no longer has "ambient" distributor authority (the power to act as any distributor just by constructing a string, with no credential proving it's allowed to). Every call now carries the original user's live, time-boxed, non-forgeable credential, matching how `apps/portal-api` already operates — this was a convergence onto an existing pattern, not a new one.
- Breaking internal contract change between `apps/admin-api` and `apps/api`; both must be deployed together. No external consumers of the old header-based contract existed.
- A K8s `NetworkPolicy` restricting which pods may reach `apps/api` directly remains valuable defence-in-depth (not yet implemented) but is no longer the only thing standing between an unauthenticated request and cross-tenant access — authorization is now enforced at the application layer regardless of network position.
- Partially resolves the M2M gap ADR-026 flagged for the `apps/admin-api` → `apps/api` leg specifically. The broader 3rd-party/service-client case is still future work, gated on an actual Keycloak confidential client being introduced.
- New `apps/api/test/admin-distributor-access.integration-spec.ts` and a reusable JWKS test-server helper (`apps/api/test/helpers/jwt-test-server.ts`) establish a pattern for testing JWT-guarded routes against a real RS256/JWKS validation pipeline in integration tests — used to fix several pre-existing integration tests that had been silently broken against an outdated HS256/shared-secret signing assumption.
