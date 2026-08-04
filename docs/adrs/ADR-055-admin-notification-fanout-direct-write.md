# ADR-055 — In-App Admin Notification Fan-Out: Direct Write, Not Outbox

**Status**: Accepted
**Date**: 2026-08-04
**Deciders**: Rick Walsh
**Related**: ADR-034 (transactional outbox for order domain events), ADR-047 (event distribution — BullMQ per-concern queues), ADR-017 (push notifications, no websockets)

---

## Context

`AdminNotification` (the admin header bell inbox) was introduced with a single producer (bulk-import completion). Extending it to order-submitted and invoice-export success/failure raised two questions that weren't yet settled by precedent:

1. **How does a system-driven event (an order placed by a trade customer, an async export job finishing) reach *every* `DISTRIBUTOR_ADMIN` at an organisation**, when the existing `create()` method took a single `userId` and most of these events have no single triggering admin user?
2. **Should this go through the transactional outbox** (ADR-034) or `NotificationDelivery`/BullMQ pipeline (ADR-047), which are the two existing precedents in this codebase for "a domain event needs to reach someone," or be written directly?

The codebase already has a superficially similar system — `Notification`/`NotificationDelivery` (`apps/api/src/notifications`) — which is organisation/email-keyed, queued through BullMQ, and drives outbound email. `AdminNotification` looks adjacent enough to invite conflating the two, but it is a different thing: an in-app, per-admin-user, read-tracked inbox row, not an outbound delivery attempt. Routing it through the same outbox-and-queue machinery as order events or emails would add an async hop and at-least-once/idempotency handling to solve a problem this table doesn't have — the same reasoning ADR-054 applies to the audit log applies here.

## Decision

1. **`notifyOrganisationAdmins(organisationId, input)`** is added to `AdminNotificationsService`. It looks up every `Membership` with `role: DISTRIBUTOR_ADMIN` at the organisation and `createMany`s one `AdminNotification` row per admin. This is the fan-out primitive for any producer that has an organisation but no single acting admin user; `create()` remains for the single-user case (e.g. the user who kicked off a bulk import).
2. **Both `create()` and `notifyOrganisationAdmins()` write directly** — no outbox row, no queue job. The in-app notification row *is* the terminal write; nothing downstream needs to be triggered from it (no email, no retry, no external call), so there is nothing for an outbox or queue to buy here. This mirrors ADR-054's reasoning for the audit log and is now the second instance of the same pattern in this codebase, worth naming explicitly so a future producer doesn't reach for the outbox out of habit.
3. **Reads and writes on the inbox (`list`, `unreadCount`, `markRead`, `markAllRead`) are scoped by `organisationId` in addition to `userId`**, and `organisationId` is taken only from the JWT-derived principal (`req.user.organisationId`, resolved server-side via `Membership` lookup — never a client-supplied param). This closes a latent cross-org gap: `userId` alone happens to be sufficient today because no code path creates more than one `Membership` per user, but that's the same "correct by construction, not by current absence of a case" reasoning ADR-053 used for `AuthService.getProfile` — a future multi-membership user (or a bug elsewhere) wouldn't get a free pass into another org's notification inbox.

## Consequences

- Adding a new producer (a future order-rejected admin ping, a delivery-exception alert, etc.) is a call to `notifyOrganisationAdmins()` from inside the same transaction as the state change it's reporting — no new infrastructure required.
- If a future requirement needs *retry* or *external* delivery from one of these events (e.g. "also email the admins," or "this must survive the API process dying mid-fan-out"), that is a signal to route that specific concern through the outbox or `NotificationDelivery`/BullMQ, not to retrofit async machinery onto `AdminNotificationsService` itself — the two systems should stay separate, per the distinction already called out in the service's own code comments.
- `notifyOrganisationAdmins()` takes no transaction client — it always runs against `this.prisma` directly, so it cannot be made atomic with the state change it's reporting. Every current call site (order-placed, invoice-export completed/failed) therefore calls it *after* the triggering transaction has committed, deliberately last, so that a retry of the surrounding job (BullMQ, at-least-once) only risks duplicating `AdminNotification` rows — which have no dedupe key, unlike `Notification`/`NotificationDelivery` — rather than replaying already-committed work. If a future call site needs the fan-out to be transactional with its state change, `AdminNotificationsService` would need to grow a `tx`-accepting variant (as `AuditService`, ADR-054, already has) rather than assuming one exists today.
- No schema change beyond what already existed; this ADR documents a service-layer pattern and an authorization-scoping fix, not new persisted state.
