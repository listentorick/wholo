# ADR-040 — Cart Scoped to User, Not Just Company

**Status**: Accepted  
**Date**: 2026-06-18  
**Deciders**: Rick Walsh  
**Amends**: ADR-031

---

## Context

ADR-031 scoped `CartOrder` to `(distributorId, customerId, status: DRAFT)` — one active cart per company per distributor. The `customerId` is the trade customer's organisation, not the individual user.

A trade customer organisation can have multiple staff members, each with their own `Membership` and therefore their own JWT (`sub`). Under the original scoping, any staff member logging in would share the same cart. This creates two problems:

1. **Concurrent interference** — User A adds products, User B (same company) opens the portal and sees A's selections. If B adds different products or adjusts quantities, they silently overwrite A's work.
2. **Order ownership confusion** — When B submits the cart, A's intended order is placed under B's name (`placedByUserId`), but the cart contents were A's.

---

## Decision

Add `userId` as a third scoping dimension on `CartOrder`:

```
@@unique([distributorId, customerId, userId, status])
```

Each staff member of a company gets their own independent draft cart per distributor. The `userId` is the authenticated user's `sub` claim from the JWT, already present on `req.user` in both the cart controller and the order submission controller.

**What changes:**
- `cart_orders` gains a `userId TEXT NOT NULL` column and a FK to `users(id)`
- The unique constraint becomes four-field: `(distributorId, customerId, userId, status)`
- `CartService.getCart` and `CartService.upsertItem` accept `userId` and pass it to `findOrCreateDraft`
- `OrdersService.submitOrder` looks up the cart using `placedByUserId` (already available), ensuring it consumes only the submitting user's cart and leaves other staff members' carts intact
- No changes to the portal, portal-api, or api-client — `userId` flows through the existing JWT

**Migration:** Existing DRAFT cart rows are cleared before the column is added. Carts are ephemeral (deleted on submission) so this is safe.

---

## Consequences

### Each employee shops independently

Staff members can build their own orders simultaneously without seeing or disrupting each other's selections.

### Order submission is correctly isolated

`submitOrder` clears only the submitting user's cart. Other staff members' carts are unaffected.

### No shared "company cart" concept

There is intentionally no mechanism for one user to view or modify another user's cart. If a shared-cart workflow is needed in future it would be a distinct feature (e.g., saved lists or collaborative drafts).

### Unique constraint on four fields

The Prisma composite key becomes `distributorId_customerId_userId_status`. The `status` dimension is still retained — it prevents duplicate DRAFT carts for the same user/distributor/company triple and leaves room for future non-DRAFT cart states.

---

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Keep company-scoped cart, add per-user view | Does not prevent concurrent writes; schema complexity with no clear ownership |
| Allow multiple DRAFT carts per company, no userId | Ambiguous which cart to submit; no way to associate a cart with the logged-in user |
| Soft-lock cart on first access | Operational friction; lock expiry logic adds significant complexity for minimal gain |
