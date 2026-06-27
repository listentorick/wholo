# ADR-043 — Order-As Client-Side Distributor Context and Homepage Locking

**Status**: Accepted  
**Date**: 2026-06-27  
**Deciders**: Rick Walsh  
**Related**: ADR-041 (order-as architecture), ADR-042 (distributor scope enforcement)

---

## Context

The order-as session is scoped to a single distributor (recorded in `OrderAsSession.distributorId` on the server and resolved per-request by `OrderAsInterceptor`). ADR-042 enforces this boundary at the API layer.

On the client, the portal's `AuthContext` stored only `{ sessionToken, customerName, returnUrl }` when an order-as exchange completed. The `distributorId` from the exchange response was discarded. This created two problems:

1. **Homepage distributor cards** — A trade customer may have relationships with multiple distributors. When an admin acts on behalf of that customer, all their distributors appear on the homepage. Without `distributorId` on the client, the portal could not distinguish the authorised distributor from others, so all cards were equally clickable.

2. **General client-side context gap** — Any future UI that needs to adapt to the current order-as distributor (e.g., navigation, deep-link guards) would have to re-derive this from an API call rather than reading it from the already-established client state.

The `OrderAsExchangeResponse` (in `packages/api-client/src/order-as.ts`) already includes `distributorId` from the exchange endpoint — it was simply not being persisted.

---

## Decision

### Store `distributorId` in `OrderAsState`

Extend the `OrderAsState` interface in `auth-context.tsx` with `distributorId: string` and persist it when `setOrderAsSession` is called:

```typescript
interface OrderAsState {
  sessionToken: string;
  customerName: string;
  returnUrl: string;
  distributorId: string;
}
```

`OrderAsHandler` passes `data.distributorId` (from the exchange response) into `setOrderAsSession`. No additional API call is required — the value arrives as part of the exchange that already happens.

### Expose `orderAsDistributorId` from `AuthContext`

`AuthContextValue` gains `orderAsDistributorId: string | null`, set to `orderAsState?.distributorId ?? null`. `useAuth()` and `useRequireAuth()` both surface this field.

### Lock non-matching distributor cards on the homepage

The homepage (`apps/portal/src/app/(main)/page.tsx`) passes a `locked` boolean to each `DistributorCard`:

```typescript
<DistributorCard
  key={d.id}
  distributor={d}
  locked={orderAsMode && d.id !== orderAsDistributorId}
/>
```

`d.id` is the distributor's database UUID from `PortalDistributorSummary`. `orderAsDistributorId` is the UUID stored in auth context. Both are UUIDs — no slug comparison.

### `DistributorCard` locked state

When `locked={true}`:
- Renders a `<div>` (not `<button>`) — no click handler, not keyboard-reachable
- `opacity-40` and `cursor-not-allowed`
- Lock icon (SVG) in the top-right corner
- Same inner layout (avatar, name, contact, order count) as the unlocked card

When `locked={false}` (default): unchanged behaviour.

---

## Why use `distributorId` rather than `distributorSlug`

`PortalDistributorSummary` carries `id` (UUID). Comparing UUIDs is unambiguous and requires no normalisation. Slugs are routing identifiers: they appear on `PortalDistributorSummary` but comparing them would introduce a dependency on slug values staying in sync with session data, and would deviate from the project convention of using database IDs for entity equality checks.

---

## Why store `distributorId` in auth context rather than fetching it separately

The exchange response already contains `distributorId`. Discarding it and re-fetching it later (e.g., by calling a `/me/session` endpoint) would add latency, an extra round-trip, and an additional code path that could fail or race. The exchange is the authoritative moment at which the client learns the session's distributor; storing the value at that moment is the natural and lowest-cost approach.

---

## Consequences

- UI components can determine whether they are in an order-as session and, if so, which distributor is authorised, without an API call.
- The homepage correctly locks all distributor cards except the one associated with the active order-as session. Clicking a locked card has no effect.
- The backend enforcement (ADR-042) remains the true security boundary. The UI locking is UX — it prevents accidental navigation, not malicious access.
- `orderAsDistributorId` is available to any future component that needs it (navigation guards, deep-link checks, etc.) via `useAuth()` or `useRequireAuth()`.
- On page refresh, the order-as session token is recovered from `sessionStorage` but `distributorId` (and other `OrderAsState` fields beyond the token) are **not** persisted. This means `orderAsDistributorId` returns `null` after a refresh — the session token is still sent to the API, so the order-as context functions server-side, but the client-side UI (homepage locking, banner name) is lost until the user navigates to re-trigger the exchange or the session is explicitly restored. This is an acceptable v1 limitation; a future ADR may address full client-state recovery on refresh.

---

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Compare `d.slug` against a stored `distributorSlug` | Slugs are routing aids, not identity keys; UUID comparison is preferred throughout the codebase |
| Fetch the authorised distributor from a `/me/order-as` endpoint on homepage load | Extra round-trip, race condition risk, more code; the data is already in the exchange response |
| Hide all non-matching distributors instead of locking them | Hiding creates confusion (why is my supplier list shorter?); a locked card communicates the constraint while preserving context |
| Disable navigation at the router level | Would require intercepting every `router.push` or link; the card-level check is simpler and self-contained |
