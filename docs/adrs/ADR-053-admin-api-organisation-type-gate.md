# ADR-053 — Gate `apps/admin-api` to Distributor-Side Accounts by Organisation Type

**Status**: Accepted
**Date**: 2026-07-31
**Deciders**: Rick Walsh
**Related**: ADR-009 (JWT authentication), ADR-010 (multi-tenancy distributorId scoping), ADR-011 (role-based access control), ADR-026 (dual BFF architecture), ADR-046 (admin-api JWT relay and distributor scoping), ADR-049 (JWT validation — internal JWKS, no issuer check)

---

## Context

A full security review of the platform found that `apps/admin-api` accepts any Keycloak-issued JWT from the shared realm with no check on who the caller actually is: `wholo-admin` and `wholo-portal` are both public clients in the same realm, and none of the three backend services' JWT strategies validate token audience/`azp`, so a token minted for the customer portal is presented to `admin-api` and accepted as-is. Combined with `DistributorAccessGuard` checking organisation *membership* only (never organisation *type*), a trade customer's own account — using nothing but their normal portal login — reaches the admin surface scoped to their own organisation, including the platform-wide customer-directory search and customer/product/price-list write endpoints.

Two designs were considered to close this specific gap ("customers must not reach the admin UI"):

1. **Token audience (`aud`/`azp`) validation** on each JWT strategy, rejecting a token whose `azp` doesn't match the client the receiving service expects (`admin-api` → `wholo-admin`, `portal-api` → `wholo-portal`).
2. **Organisation-type gate resolved from Wholo's own data**, checked once at the point `apps/admin-api` resolves the caller's Wholo profile.

Audience validation was considered and rejected as the primary control, for a concrete reason specific to this realm's configuration: Keycloak does not restrict *which users* may obtain a token for *which client*. Both `wholo-admin` and `wholo-portal` are public clients with `directAccessGrantsEnabled: true`, and client boundaries in Keycloak are not an authorization mechanism by default — any realm user, including a trade customer, can request (via the normal browser login flow, or directly via the password grant) a token audienced to `wholo-admin` at will. An audience check only proves "this token was minted by the client I expect"; it does nothing against a caller who simply requests the audience they want. It has genuine but narrower value as defence-in-depth against *involuntary* token replay (e.g. a portal-side token exfiltrated via XSS and replayed against `admin-api` by someone who does not hold the victim's Keycloak credentials) — it does not, by itself, stop a trade customer's own account from reaching the admin surface, which was the actual exploit path found.

A related idea — pushing an authorization decision into Keycloak itself (a client-scoped role, a group tied to "which client you're allowed to log into", a conditional-access flow) — was also rejected. It would require Keycloak to independently track something Wholo's own `Membership`/`Organisation` tables already record authoritatively, creating a second source of truth for the same fact with a real drift risk, and contradicts the pattern already established in `apps/api/src/auth/strategies/jwt.strategy.ts`, where the JWT is trusted only for `sub`/`email` and every authorization-relevant fact (`role`, `organisationId`, `organisationIds`) is resolved by a DB lookup on every request, never read off the token or off which client issued it.

The organisation-type gate was chosen instead because it is decided entirely from data Wholo already owns and cannot be gamed by choosing a different Keycloak client: every `Membership` row in the system is created by exactly one of two code paths — `PortalInvitationsService.acceptInvite` (`role: TRADE_CUSTOMER`, always on a `TRADE_CUSTOMER`-type `Organisation`) or `DistributorsService.createForIdentity` (`role: DISTRIBUTOR_ADMIN`, always on a newly created `DISTRIBUTOR`-type `Organisation`). No other code path creates a `Membership`. A caller's organisation type is therefore an authoritative, DB-resolved fact, not an inference from token provenance.

The fix also had to preserve **order-as** ("order on behalf of" — ADR-041/042/043): a `DISTRIBUTOR_ADMIN`, while impersonating a customer, genuinely authenticates to the *portal* frontend and obtains a `wholo-portal`-audienced token for their own identity via Keycloak SSO (traced end-to-end: `admin-api` creates the session using the admin's `wholo-admin` token → a delivery token is embedded in a URL opened in a new tab on the portal origin → the portal's own Keycloak init silently mints a `wholo-portal` token for the same admin identity via the realm-wide SSO session → that token, plus the `X-Order-As-Session` header, is used for all subsequent portal-side calls). Any fix gating `apps/admin-api` must not touch `apps/portal-api`, or order-as breaks. The chosen design only adds a check at the `admin-api` edge, in one direction — it does not restrict who may use `apps/portal-api`.

## Decision

1. **`apps/api`'s `AuthService.getProfile`** (`apps/api/src/auth/auth.service.ts`) no longer picks an arbitrary `memberships[0]`. It now prefers a membership on a `DISTRIBUTOR`-type organisation when the user holds one, falling back to the first membership otherwise (a trade customer with only a `TRADE_CUSTOMER` membership is unaffected). The `/auth/me` response additionally includes `organisationType`, taken from that selected membership's organisation.

   This was necessary groundwork, not a separate concern: without it, a user who happened to hold more than one membership could have the gate below evaluated against an arbitrary one of them. Today no code path creates more than one membership per user, so this is currently a correctness fix rather than an active bug, but it makes the new gate correct by construction rather than by the current absence of multi-membership users.

2. **`apps/admin-api`'s `JwtStrategy.validate`** (`apps/admin-api/src/auth/strategies/jwt.strategy.ts`), after resolving the caller's profile via `apps/api`'s `/auth/me`, now rejects with `UnauthorizedException` unless `profile.organisationType === 'DISTRIBUTOR'`. This covers both a `TRADE_CUSTOMER` account and an account with no membership at all (`organisationType` absent).

3. **`apps/portal-api` is untouched.** The gate is one-directional: it keeps trade customers off `admin-api`, but does not restrict who may use the portal, so a `DISTRIBUTOR_ADMIN` using order-as continues to authenticate to `portal-api` exactly as before.

4. **Token audience/`azp` validation remains a separate, still-open item** (tracked from the same security review) for its narrower, genuine value against involuntary token replay — it is not superseded by this decision, just not relied upon as the fix for this specific gap.

## Consequences

- Closes the exploit path found in the security review: a trade customer's own portal login, or a stolen portal access token, is now rejected by `apps/admin-api` before any route executes — decided from Wholo's own `Membership`/`Organisation` data, not from which Keycloak client issued the token, so there is no "request the other client's token instead" bypass.
- `PLATFORM_ADMIN` is unaffected in the sense that it remains unimplemented (per ADR-046, no code path creates such a membership today); this gate only asserts organisation *type*, not role, so introducing `PLATFORM_ADMIN` later — provided it is still modelled as a membership on a `DISTRIBUTOR`-type organisation, or the gate is extended — will not require revisiting this decision. If a future `PLATFORM_ADMIN` needs cross-distributor access with no single-distributor membership, this gate will need to be revisited alongside that work.
- Does not implement role-based access control (ADR-011) or the organisation-type check inside `DistributorAccessGuard` itself (`apps/api/src/auth/guards/distributor-access.guard.ts`) — a caller who somehow reaches `apps/api` directly (bypassing `admin-api`) with a `DISTRIBUTOR`-typed membership in an org they don't otherwise have business acting as is not addressed here. Both remain open items from the same review.
- No schema change, no migration. Purely additive to the `/auth/me` response shape; `apps/portal-api`'s consumer of the same endpoint ignores the new field.
