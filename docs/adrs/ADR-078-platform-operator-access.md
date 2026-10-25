# ADR-078 — Platform Operator Access: the Ops App, Support Grants and a Required Authenticator

**Status**: Accepted
**Date**: 2026-10-23
**Deciders**: Rick Walsh

---

## Context

Stocdup staff need to look at a wholesaler's configuration, change it, and sometimes set the account up for them. Until now the only way was to become a permanent member of the wholesaler's organisation. That access never expired, recorded no reason, and was audited as one of the wholesaler's own users. `PLATFORM_ADMIN` also held every permission, so a single role could do anything anywhere.

What we wanted, modelled on Azure PIM's time-bound assignments:

- operators act as **themselves**, never as a wholesaler's user (no impersonation);
- access to a wholesaler is **time-limited**, opened for a stated reason, and visible to the wholesaler;
- powers across all wholesalers need a **stronger sign-in** than the admin app.

## Decision

### A separate Ops app that requires an authenticator

- The Ops app is a second build of `apps/admin` + `apps/admin-api` (`NEXT_PUBLIC_APP_MODE=ops` at build time, `APP_MODE=ops` at run time), deployed as `ops-api` on its own address (local `http://localhost:3050`). No screen is reimplemented: inside a wholesaler the operator sees the normal admin UI.
- It signs in through its own Keycloak client, `stocdup-ops`, created by `scripts/setup-keycloak-ops-client.sh`. That client's browser flow uses Keycloak's levels of authentication: level 1 is the password, level 2 an authenticator-app code. The client requests and requires level 2. A user without an authenticator is asked to set one up. An existing admin-app session is not reused: the admin app's sign-in records no level, so Ops asks for the password again and then the code. **Direct access grants are off** on this client, because the password grant never runs the browser flow and would skip the authenticator.
- `apps/api` decides from the token, on every request, whether it is an **Ops session**: `azp` is the Ops client id (`OPS_KEYCLOAK_CLIENT_ID`, default `stocdup-ops`) **and** `acr` is at least 2. It checks this itself rather than trusting Keycloak's sign-in flow alone.

### Platform powers

`PLATFORM_ADMIN` is redefined. It now holds only `platform:distributors:read`, `platform:stats:read` and `support-grants:self-create`. These are honoured only:

- in an Ops session, and
- through a membership of an organisation of the new type `PLATFORM` (Stocdup itself).

`PlatformAccessGuard` enforces both and fails closed when a route declares no permissions. The routes are `GET /distributors`, `GET /platform/stats`, `POST /distributors/:distributorId/support-grants` and `GET /users/:userId/support-grants`.

### Support grants

A support grant (`support_access_grants`) gives one operator the `SUPPORT` role at one distributor for a limited time. `SUPPORT` holds what `DISTRIBUTOR_ADMIN` holds, minus `team:manage`, `accounting:manage` and `order-as:initiate`.

- **Created only by the operator, for themselves, in an Ops session.** `userId` must be the caller; the distributor must be a live `DISTRIBUTOR` the operator is not a member of; a reason is required; the length is clamped to 15 minutes–8 hours (default 4). There is no approver.
- **One active grant per person per distributor.** Opening again extends the current grant (never beyond 8 hours from now) instead of adding a row. This is enforced in a serializable transaction, not a partial index (ADR-052).
- **Read on every request.** `JwtStrategy` adds active grants to the caller's memberships, and only for an Ops session. A grant therefore does nothing through the admin address or without the authenticator, and stops working the moment it expires or is ended. A grant never becomes the default organisation.
- **Ended** by its holder (Leave), by the distributor's team managers, or by any platform admin. Grants are never deleted.
- **Visible to the distributor.** Every member sees a strip on every admin page while support is in. Team managers see the full history on the Team page, with a count of recorded changes.
- **Audited.** Opening, extending and ending a grant each write an audit row. The order audit log labels rows written by a grant holder during the grant's window as "Stocdup support". Holders are never members, so this is unambiguous.

### Choosing the wholesaler without trusting the client

The Ops app keeps the selected wholesaler per browser tab (sessionStorage) and sends it as `X-Organisation-Id`.

- `admin-api` reads that header **only in Ops mode** and passes it to `GET /auth/me?organisationId=`.
- `apps/api` accepts it only if it matches one of the caller's memberships or active grants; otherwise it returns 403. The id is a claim, never trusted.

ADR-053's organisation gate is extended:

- In the admin app, the organisation must be a `DISTRIBUTOR`, as before.
- In the Ops app with nothing selected, the user must be on the `PLATFORM` organisation.
- In the Ops app with a wholesaler selected, it must be a `DISTRIBUTOR` reached through **support access**, never through a membership.

`/auth/me` stays the one identity-relative route. No new `me` routes are added to `apps/api`.

### Keeping Ops code out of the admin app

- `/ops` pages are `*.ops.tsx` files, which Next treats as routes only when `next.config.ts` adds `ops.tsx` to `pageExtensions`, and it does so only in the Ops build. In the admin build `/ops` does not exist.
- Ops UI code lives in `apps/admin/src/ops`. Shared admin code reaches it only through `src/lib/ops-seam.tsx`, whose dynamic imports sit behind a build-time constant and are dropped from the admin bundle. ESLint (`no-restricted-imports`) forbids any other import.
- The admin build is checked in CI by `scripts/check-admin-build-has-no-ops.mjs`: no `/ops` route and no Ops marker in its output.
- `admin-api` registers its `/ops` endpoints only in Ops mode (`opsOnlyModules`).
- The BFFs stay thin and hold no secrets. Every rule above lives in `apps/api`.

## Consequences

- An operator can help a wholesaler within minutes, with a recorded reason, without standing access and without a role that reaches every tenant.
- Wholesalers can see and end support access themselves.
- **Not every change is attributable yet.** `AuditLog` covers orders, deliveries, accounting and support access. Catalogue, price-list and settings changes are not audited, so the change count only reflects audited actions.
- Each realm needs `scripts/setup-keycloak-ops-client.sh` run once, local and live. Until then nobody can sign in to Ops: the client does not exist, and a token without an authenticator-level `acr` is never an Ops session.
- Stocdup operators are created by hand: a Keycloak user, plus a `PLATFORM_ADMIN` membership on the Stocdup `PLATFORM` organisation.

## Alternatives rejected

- **Impersonation** (Keycloak's legacy impersonation, or token exchange): the operator would act as a wholesaler's user, which is the attribution problem we set out to fix. Keycloak's legacy impersonation is deprecated, and token-exchange delegation is still a preview feature.
- **Standing membership** for operators: never expires and is invisible to the wholesaler.
- **Roles held in Keycloak** with expiry: Keycloak has no expiring role assignments, and Stocdup's roles and permissions live in Stocdup (ADR-066).
- **A flag or scope the client asks for**: anything the browser can ask for is a claim. The decision rests on the token's `azp` and `acr`, which only Keycloak can set, and on grants in Stocdup's database.
