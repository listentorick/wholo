# ADR-041 — Order on Behalf (Order-As) Architecture

**Status**: Accepted  
**Date**: 2026-06-21  
**Deciders**: Rick Walsh  
**Related**: ADR-009 (JWT auth), ADR-011 (RBAC), ADR-026 (BFF), ADR-029 (cart), ADR-040 (cart-user scoping)

---

## Context

Distributor admins frequently need to place orders for customers who are not yet onboarded to the portal, or for customers who call in an order verbally. Without a delegation mechanism, an admin must either:

- Log in as the customer (bad: credential sharing, no audit trail), or
- Manually recreate the order in the admin panel with no access to the customer's catalogue pricing, delivery profile, or address.

The **Order on Behalf** feature (internally called *order-as*) lets an authenticated distributor admin impersonate a specific trade customer on the customer portal for the purpose of placing a single order. The resulting order is indistinguishable from one the customer placed themselves, but carries additional metadata identifying it as a delegate action.

---

## Decision

### High-level flow

```
Admin portal                    Admin BFF (3002)           Central API (3001)
─────────────                   ────────────────           ──────────────────
Click "Order As"    ──POST──▶  /customers/:id/order-as ──POST──▶ /order-as/sessions
                               (JWT guard)                (x-header BFF auth)
                               ◀── { portalUrl + deliveryToken } ──────────────

Navigate to portalUrl
  localhost:3010/winos?orderAs={deliveryToken}

Customer portal (3010)          Portal BFF (3003)          Central API (3001)
──────────────────────          ─────────────────          ──────────────────
OrderAsHandler                  /auth/order-as/exchange ──POST──▶ /order-as/sessions/exchange
 exchanges token   ──POST──▶   (JWT guard)                (JWT guard, validates adminUserId)
                   ◀── { sessionToken, customerName, distributorSlug }

sessionStorage["orderAs_session"] = sessionToken
Banner: "Ordering as Blackbird Restaurant"

Add items, checkout
  All API calls include X-Order-As-Session header
                               ──GET/PUT/POST──▶          OrderAsInterceptor validates session
                                                          Controllers use orderAs.customerId

Place Order        ──POST──▶   /orders         ──POST──▶  Create order for customerId
                                                          DELETE orderAsSession (atomic)

clearOrderAsSession()
  sessionStorage["orderAs_session"] removed
  Redirect to returnUrl (admin portal or distributor slug)
```

---

## Data model

```prisma
model OrderAsSession {
  id                  String    @id   // crypto.randomBytes(24).toString('base64url')
  adminUserId         String          // FK to users(id) — who created this session
  tradeRelationshipId String          // FK to trade_relationships(id)
  customerId          String          // denormalised from tradeRelationship.customerId
  distributorId       String          // denormalised from tradeRelationship.distributorId
  expiresAt           DateTime        // now + 2 hours
  deliveryTokens      OrderAsDeliveryToken[]

  @@unique([adminUserId, tradeRelationshipId])
}

model OrderAsDeliveryToken {
  id        String    @id
  tokenHash String    @unique   // SHA-256 of the raw token; raw token never stored
  sessionId String
  expiresAt DateTime            // now + 5 minutes
  usedAt    DateTime?           // set on first use; subsequent use is rejected
}
```

**Why two records?** The delivery token is a short-lived, single-use bridge that hands off context from the admin portal tab to the customer portal tab. Once exchanged, it is consumed; the durable `OrderAsSession` takes over for the lifetime of the order-as flow.

---

## Security model

### 1 — Session creation (admin BFF → central API)

`POST /order-as/sessions` in `apps/api` is **not** JWT-guarded. It is protected by the BFF x-header pattern (same as all other admin-api → apps/api calls): the admin BFF attaches `x-distributor-id` and `x-user-id` headers. In v1 this relies on `NetworkPolicy` restricting direct access to `apps/api` from outside the cluster; a future iteration will use client-credentials mutual auth between BFFs and the central API.

The session is **upserted** on `(adminUserId, tradeRelationshipId)`. Only one active session exists per admin per customer relationship. A repeated "Order As" click refreshes `expiresAt` without changing the session ID; a token stored in the portal from a previous flow continues to work.

### 2 — Delivery token (one-time handoff)

```
rawToken = crypto.randomBytes(32).toString('hex')   // 256 bits of entropy
tokenHash = SHA-256(rawToken)                        // stored in DB
```

The raw token is returned to the admin BFF and embedded in the portal URL (`?orderAs={rawToken}`). The DB stores only the hash. If the `order_as_delivery_tokens` table is compromised, the raw token cannot be recovered.

The token expires in **5 minutes** and is **single-use** (`usedAt` is set on the first successful exchange and checked on every subsequent attempt). This window is intentionally tight: it is only needed for the initial browser redirect, not for the full order-as session.

### 3 — Token exchange (portal BFF → central API)

`POST /order-as/sessions/exchange` in `apps/api` is JWT-guarded. The caller must present a valid Keycloak JWT; `req.user.sub` is resolved to a Wholo user ID by the JWT strategy.

Validation:
1. `tokenHash` exists in DB.
2. `record.usedAt` is null (not already used).
3. `record.expiresAt > now` (not expired).
4. `record.session.adminUserId === req.user.sub` — the presenting user is the same admin who created the session. A delivery token cannot be exchanged by a different user, even if they intercept the URL.
5. `record.session.expiresAt > now` — the parent session itself has not expired.

On success: `usedAt` is set; the session's stable `id` is returned as `sessionToken`.

### 4 — Session resolution (per-request interceptor)

`OrderAsInterceptor` is registered as a global `APP_INTERCEPTOR` in `apps/api`. It runs after `JwtAuthGuard` on every authenticated request.

```typescript
if (sessionToken && request.user?.sub) {
  const resolved = await orderAsService.resolveSession(sessionToken, request.user.sub);
  request[ORDER_AS_CONTEXT_KEY] = { sessionToken, customerId, distributorId };
}
```

`resolveSession` checks:
1. Session exists in DB (not yet consumed by an order).
2. `session.expiresAt > now` (not expired).
3. `session.adminUserId === adminUserId` — the presenting JWT sub matches the session owner.

Any failure throws `UnauthorizedException`. Because the interceptor is global, a stale or stolen session token cannot be used by a different user or after session expiry.

### 5 — Controller context propagation

All portal-facing controllers in `apps/api` that operate on customer data follow the same pattern:

```typescript
const orderAs = (req as any)[ORDER_AS_CONTEXT_KEY] as OrderAsContext | undefined;
const customerId = orderAs?.customerId ?? req.user.organisationId;
```

Affected controllers: `CatalogueController`, `CartController`, `OrdersController`, `DeliveryAvailabilityController`. The fallback to `req.user.organisationId` is safe: when no order-as context is present the user acts for their own organisation.

### 6 — Session termination (atomic with order)

When an order is submitted, the `OrderAsSession` is deleted inside the same Prisma transaction as the order creation:

```typescript
await tx.orderAsSession.deleteMany({
  where: { id: orderAsSessionToken, adminUserId: placedByUserId },
});
```

This is atomic: if the order creation rolls back, the session is not deleted. If the order commits, the session is gone and cannot be reused. A second "Place Order" click (or browser retry) would find no session and receive a 401, preventing duplicate orders from the same delegation event.

### 7 — Client-side cleanup

After a successful order submission, the portal calls `clearOrderAsSession()`:

1. `sessionStorage.removeItem('orderAs_session')` — prevents subsequent `apiFetch` calls from sending the stale `X-Order-As-Session` header (which would 401 because the session was just deleted).
2. `setOrderAsStateInternal(null)` — hides the order-as banner.
3. `window.location.href = returnUrl` — navigates back to the admin portal (if opened from the same tab) or to the distributor slug root (if opened in a new tab).

Not clearing the session token from sessionStorage before navigation would cause any request made by the next page (e.g., fetching the order confirmation) to 401, because the interceptor finds no matching session.

---

## BFF interaction summary

| Step | From | To | Auth mechanism |
|---|---|---|---|
| Create session | `apps/admin-api` | `apps/api` | `x-distributor-id` + `x-user-id` headers (BFF pattern) |
| Exchange delivery token | `apps/portal-api` | `apps/api` | Bearer JWT (Keycloak, forwarded by portal BFF) |
| All order-as requests | `apps/portal-api` | `apps/api` | Bearer JWT + `X-Order-As-Session` header |
| Session resolution | `apps/api` global interceptor | DB | Internal |

The customer portal (`apps/portal`) sends `X-Order-As-Session` on **every** `apiFetch` call when `sessionStorage['orderAs_session']` is set. The portal-api BFF (`apps/portal-api`) forwards it to `apps/api` via `AsyncLocalStorage` (populated by `OrderAsContextMiddleware`, which is applied globally with `forRoutes('*')`).

---

## Audit trail

`Order` records written in order-as mode carry two additional fields:

```prisma
isOrderedByDelegate Boolean @default(false)
delegateAdminUserId String?
```

This records the fact of delegation and which admin acted, independently of `placedByUserId` (the customer's organisation context). These fields are written atomically with the order and are immutable after creation.

---

## Alternatives rejected

| Option | Reason rejected |
|---|---|
| Admin creates order directly in admin panel | Admin doesn't have access to the customer's catalogue, pricing, delivery profile, or address in the portal UX |
| Shared credentials (admin logs in as customer) | No audit trail, credential hygiene violation, violates RBAC |
| Long-lived delegation JWT embedded in URL | A JWT in a URL is stored in browser history and server logs; a short-lived one-time token is easier to contain |
| Session stored server-side in Redis | Adds a Redis dependency for a flow that is already DB-backed; PostgreSQL is sufficient for the TTLs involved |
| Keep session alive after order placement | Enables a second order from the same delegation event without the admin re-authorising; atomic deletion is the safest termination |

---

## Consequences

- A distributor admin can place any number of orders on behalf of any customer they have an active trade relationship with, subject to re-authorising each order (new "Order As" click per order).
- The delivery token TTL (5 min) must be sufficient for the admin to click the link and complete Keycloak SSO on the portal tab. This is adequate in practice; a new link can be generated if it expires.
- The session TTL (2 hr) sets a hard upper bound on how long an order-as session remains valid. If the admin leaves the portal tab open and returns after 2 hours, they must start a new session.
- Session IDs (`base64url`, 24 random bytes = 192 bits) are not guessable; brute-force enumeration of valid sessions is not practical.
