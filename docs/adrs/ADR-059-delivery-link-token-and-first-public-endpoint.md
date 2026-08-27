# ADR-059 — Delivery link token design and the first genuinely public endpoint in apps/api

**Status**: Accepted
**Date**: 2026-08-25
**Deciders**: Rick Walsh
**Related**: ADR-056 (native delivery planning domain model), ADR-054 (application-level audit log), ADR-052 (avoid Prisma-unsupported schema constructs)

---

## Context

The Driver PWA's QR-code delivery workflow (`apps/driver/PRODUCT.md`, `docs/Stocdup_Driver_Delivery_App_PRD.docx`) requires a URL printed on a driver manifest that opens directly to one order's delivery page with no login, and lets the holder record exactly one delivery outcome for that order. The manifest QR code previously encoded the bare order number (`qr-code.util.ts`), with the actual destination explicitly deferred by the manifest-generation PBI (`docs/Stocdup_Driver_Manifest_PBI.docx`).

Two things distinguish this from every existing access pattern in `apps/api`:

1. **It has no prior authenticated context to draw from.** Every other bearer-token pattern in this codebase (`order-as.service.ts`'s delivery token, `RefreshToken`) is minted by, or on behalf of, an already-authenticated principal, and is validated behind `JwtAuthGuard`. A driver cold-opening a printed QR code has no session at all — the token itself is the only credential.
2. **It must be durable, not single-use.** A driver in the field cannot obtain a replacement QR code — the manifest is printed paper, and reprinting is an office/admin action. The link must keep resolving to the same order indefinitely, for as long as no outcome has been recorded, surviving a closed browser tab, a dead battery overnight, or a driver returning the next day.

## Decision

### 1. Signed pointer, not a stored secret

The token is `${orderId}.${base64url(hmacSha256(orderId, DELIVERY_TOKEN_SIGNING_KEY))}` (`DeliveryTokenSigner`, `apps/api/src/delivery-links/`). It is never minted, stored, or expired — verification just recomputes the HMAC and compares in constant time. This means:

- The same order always produces the same URL, so a reprinted manifest reproduces an identical QR code with no "get-or-create" bookkeeping.
- Forgery is infeasible without the signing key; the signed payload is the internal `Order.id` (already a non-sequential `cuid()`), not the human-facing `orderNumber`.
- "Single-use" is not a property of the token at all — it falls out of a plain `@unique` constraint on `OrderDeliveryOutcome.orderId`. The token can be presented any number of times; only the *first* outcome-write succeeds (enforced by the DB, with a `P2002`-catch idempotent-retry path for a same-body resubmission — see `DeliveryLinksService.submitOutcome`).

This deliberately does not reuse `order-as.service.ts`'s pattern (random token, hash-only storage, short TTL, single admin-recoverable use) — that fits an ephemeral, admin-initiated exchange where the credential can always be re-minted by the still-logged-in admin. A driver in the field has no equivalent recovery path, so the token cannot expire and there is nothing to look up by hash.

### 2. Public by omission — the first such controller in `apps/api`

`DeliveryLinksController` carries no `@UseGuards(JwtAuthGuard, ...)` at all. Confirmed before adding this: no `@Public()`/`SkipAuth()` decorator pattern exists anywhere in this codebase, and no global `APP_GUARD` is registered — every other controller opts *in* to guarding via `@UseGuards`, so a controller that simply omits it is public by construction. This is the correct and only mechanism available today, and is the precedent a future public endpoint should follow rather than reinventing.

Rate limiting (`@nestjs/throttler`, `ThrottlerGuard`) is registered and applied narrowly inside `DeliveryLinksModule` only — not at `AppModule` level, and never via an `APP_GUARD` provider, which would rate-limit every route in the service rather than just this deliberately-public one.

### 3. Token travels as a header, in a URL fragment on first load — a mitigation, not the security boundary

The QR encodes the token as a URL **fragment** (`https://<driver-host>/d#<token>`), which browsers never transmit to the server at all (a hard guarantee, independent of what sits in front of the origin). After the page loads, the client sends the token as an `X-Delivery-Token` header, never a URL path or query param, on both `GET /delivery-links` and `POST /delivery-links/outcome` — no `:token` route parameter exists anywhere. This reduces, but does not eliminate, the token's exposure to request logging (a sufficiently-configured edge proxy/WAF/CDN can still log headers).

That is a deliberate, accepted trade-off, not an oversight: the actual security boundary is narrow blast radius plus detectability, not concealment —

- the token can only ever view one order's limited delivery details and write **at most one** outcome for that order; it can never change a recorded result and can never touch another order;
- in normal operation the manifest paperwork stays in the driver's own hands;
- every successful `submitOutcome` writes an `AuditLog` row (`DELIVERY_OUTCOME_RECORDED`, `actorType: SYSTEM`) in the same transaction as the outcome (per ADR-054's discipline), so a submission from an unexpected party is a distributor-side investigation matter, not something the token scheme needs to prevent outright;
- correcting a wrong result always requires genuine authentication — see below — so the worst a leaked token can do is contribute one audited, non-reversible-by-itself outcome record.

### 4. Correction requires authentication — reserved, not built here

`OrderDeliveryOutcome` reserves nullable `correctedAt`/`correctedByUserId` columns, unpopulated by this PBI. The anonymous QR link can never update a recorded outcome — that guarantee is absolute and permanent. A driver who needs to correct a mistake must do so through the authenticated digital-manifest surface (PRD Increment 4, not built in this PBI), self-service, with no admin/distributor-staff mediation. This resolves the PRD's open question ("Can authorised distributor staff correct a submitted delivery result?") in favor of driver self-correction rather than admin-mediated correction, and the reserved columns let that increment extend this schema rather than rework it.

## Consequences

- No token/session table exists for this flow at all — `OrderDeliveryOutcome`'s existence is the only state, which keeps the design simpler than `order-as`'s at the cost of being a fundamentally different trust model (durable capability vs. ephemeral exchange) that a future reader must not conflate with it.
- `DELIVERY_TOKEN_SIGNING_KEY` is a new secret (base64, 32 bytes) that must never be reused across environments — rotating it invalidates every outstanding, unsubmitted delivery link at once (an intentionally coarse revocation lever if the key is ever compromised).
- `apps/admin-api/prisma/schema.prisma` was updated by hand to keep enum/model types in sync, per existing convention (CLAUDE.md, ADR-026) — `admin-api` does not use these models directly this round.
- If a future public endpoint is added, it should follow this same shape (no `@UseGuards`, `ThrottlerGuard` scoped locally, never an `APP_GUARD`) rather than establishing a second convention.
