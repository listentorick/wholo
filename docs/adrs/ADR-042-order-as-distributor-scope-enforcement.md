# ADR-042 — Order-As Distributor Scope Enforcement

**Status**: Accepted  
**Date**: 2026-06-27  
**Deciders**: Rick Walsh  
**Related**: ADR-041 (order-as architecture), ADR-010 (multi-tenancy scoping), ADR-030 (server-side price authority)

---

## Context

ADR-041 established the order-as architecture. It correctly scopes the **customer identity** (`customerId`) on every API request — the interceptor resolves `customerId` from the session and controllers substitute it for `req.user.organisationId`. This prevents an admin acting as Customer A from inadvertently placing an order for Customer B.

However, a separate attack surface was not addressed: a distributor admin in an order-as session could navigate to a **different distributor's portal**, add that distributor's products to the cart, and submit an order against that distributor — effectively placing an order outside the session's authorised distributor boundary.

The order-as session already stores `distributorId` (the distributor the admin has a trade relationship with), but neither `CartService.upsertItem` nor `OrdersService.submitOrder` verified that the operation's target distributor matched the session's `distributorId`.

---

## Decision

Enforce the order-as distributor boundary at the service layer for the two write operations that can cross distributor lines:

### `CartService.upsertItem`

When `orderAsDistributorId` is present, validate that the product being added belongs to the session's authorised distributor:

```typescript
const product = await this.prisma.product.findFirst({
  where: { id: dto.productId, distributorId: distributor.id, deletedAt: null },
  select: { id: true, price: true, distributorId: true },
});

if (!product) throw new NotFoundException('Product not found');

if (orderAsDistributorId && product.distributorId !== orderAsDistributorId) {
  throw new ForbiddenException('Order-as session is not authorised for this distributor');
}
```

The `distributorId` is read from the already-fetched product record — **not** from the request DTO. This makes the check tamper-proof: the controller resolves `orderAs.distributorId` from the session (server-side, via `OrderAsInterceptor`) and the product's distributor is read from the database. Neither value comes from the client.

### `OrdersService.submitOrder`

When `orderAsDistributorId` is present, validate that the cart being submitted belongs to the session's authorised distributor:

```typescript
const cart = await this.prisma.cartOrder.findFirst({ ... });

if (!cart) throw new UnprocessableEntityException('No active cart found for this distributor');

if (orderAsDistributorId && cart.distributorId !== orderAsDistributorId) {
  throw new ForbiddenException('Order-as session is not authorised for this distributor');
}
```

Again, `cart.distributorId` is read from the database, not from the client request.

### Controller wiring

Both controllers extract `orderAs?.distributorId` from the interceptor context and forward it to the service:

```typescript
const orderAs = (req as any)[ORDER_AS_CONTEXT_KEY] as OrderAsContext | undefined;
// CartController:
return this.cartService.upsertItem(dto, customerId, req.user.sub, orderAs?.distributorId);
// OrdersController:
return this.ordersService.submitOrder(dto, req.user.sub, customerId, orderAs?.sessionToken, orderAs?.distributorId);
```

When no order-as context is present (`orderAs` is `undefined`), the parameter is `undefined` and the guard is skipped. Normal (non-order-as) requests are unaffected.

---

## Why validate against DB records rather than the request DTO

The DTO carries `distributorSlug` (a routing identifier, not a trust boundary). Comparing `dto.distributorSlug` against `orderAs.distributorSlug` would rely on a client-supplied value being trustworthy, and introduces a dependency on the slug being correctly denormalised to the session. Using UUIDs from already-loaded database records (`product.distributorId`, `cart.distributorId`) means:

1. The comparison is between two server-derived values — no client input is trusted.
2. The check reuses data already fetched for the operation, adding no extra DB round-trips.
3. UUID comparison has no normalisation edge cases (slugs can theoretically be renamed).

---

## Consequences

- An admin in an order-as session can only add products belonging to the session's distributor. Attempting to add a product from a different distributor returns HTTP 403.
- Submitting a cart assembled against a different distributor returns HTTP 403. This is a defence-in-depth layer: the cart itself would also be empty for that distributor (the add-item guard fires first), but the submit-order guard independently enforces the same boundary.
- Normal (non-order-as) requests are unaffected — the guard is conditional on `orderAsDistributorId` being set.
- The enforcement is invisible to well-behaved clients. The homepage UI (ADR-043) locks non-matching distributor cards, so a legitimate admin never encounters the 403 through normal navigation.

---

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Validate `dto.distributorSlug` against session slug at controller layer | Client-supplied value in the comparison; slug dependency is fragile |
| Validate at BFF (`apps/portal-api`) before forwarding | BFF does not have direct DB access; would require an extra round-trip to `apps/api`; enforcement belongs in the service that owns the data |
| Rely solely on UI locking (ADR-043) | Client-side controls are not a security boundary; they can be bypassed with direct API calls |
