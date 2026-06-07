# ADR-026: Dual BFF per portal with shared central API

## Status
Accepted

## Context
Wholo has two distinct user-facing applications with different actors, different security boundaries, and different UX requirements:

- **Customer Portal** (`apps/portal`) — used by trade customers (restaurants, bars, hotels) to browse catalogues and place orders.
- **Admin Portal** (`apps/admin`) — used by distributor/wholesaler staff to manage products, inventory, orders, customers, and deliveries.

A naive approach would have both frontends call the single `apps/api` directly. This conflates authentication concerns (a trade customer token should never grant admin access), forces the shared API to handle two very different client contracts, and makes it harder to evolve each portal independently.

## Decision

Each frontend gets its own **Backend For Frontend (BFF)**:

| App | BFF | Central API |
|---|---|---|
| `apps/portal` | calls `apps/api` directly (simple; no separate BFF needed for v1) | `apps/api` |
| `apps/admin` | `apps/admin-api` on port 3002 | `apps/api` |

```
apps/portal  ────────────────────────────────▶  apps/api  (central API)
                                                      │
apps/admin  ──▶  apps/admin-api  (admin BFF)  ────────┘
```

**`apps/api` is the authoritative source for all business data** — products, inventory, orders, customers. Admin BFF authenticates the admin user, then proxies or aggregates business-data requests to the central API.

**Auth isolation**: each BFF issues JWTs signed with its own `JWT_SECRET`. Tokens issued by `apps/admin-api` are not valid on `apps/api` or vice versa, providing a hard credential boundary between portals.

**Role enforcement at the BFF**: `apps/admin-api`'s `LocalStrategy` rejects login attempts from users whose membership role is not `DISTRIBUTOR_ADMIN` or `PLATFORM_ADMIN`. A trade customer presenting valid credentials receives a 401 — they simply cannot obtain an admin-portal token.

**Schema ownership stays in `apps/api`**: `apps/admin-api` carries a copy of `schema.prisma` for Prisma client generation but has no `migrations/` directory. All schema migrations run from `apps/api`.

## Migration path to shared IdP

The local strategy in each BFF is a stepping stone. When a shared Identity Provider is introduced:

1. Each BFF becomes a confidential OAuth 2.0 client with its own `client_id` and `client_secret`.
2. Login is redirected to the IdP's Authorization Code Flow.
3. The BFF exchanges the code for tokens and manages the session — the rest of the architecture is unchanged.
4. Role-based access control moves to the IdP's token claims.

## Consequences
- Each portal has an independent deployment unit and can be scaled or updated without affecting the other.
- A bug or compromise in one BFF does not grant access to the other portal's resources.
- Two JWTs are in circulation; a developer must use the correct one for each portal.
- The `apps/api` central API must eventually accept machine-to-machine tokens from `apps/admin-api` for business data proxying (not implemented in v1 — the BFF stub routes return placeholder data).
- Adding a third portal (e.g. a supplier portal) follows the same pattern: new BFF, own JWT secret, own role filter, proxies to `apps/api`.
