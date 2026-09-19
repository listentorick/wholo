# ADR-067 — Distributor Staff Invitations and Team Removal

**Status**: Accepted
**Date**: 2026-09-19
**Deciders**: Rick Walsh
**Related**: ADR-027 (customer invitations — the pipeline this extends), ADR-034/047 (outbox and queue-per-concern), ADR-052 (avoid Prisma-unsupported constructs), ADR-053 (admin-api organisation-type gate — its "two paths create a Membership" claim is updated by this ADR), ADR-054 (audit log), ADR-055 (in-app admin notifications), ADR-066 (multi-role RBAC)

---

## Context

A distributor Owner needs to bring employees into their organisation and manage them afterwards: invite, choose roles, resend, revoke, change roles, remove. Until now the only way a `Membership` on a `DISTRIBUTOR` organisation came to exist was the founder's own onboarding; the only invitation flow (ADR-027) is for trade customers and is bound to a `TradeRelationship`.

## Decision

### 1. A sibling model, on the same pipeline

`StaffInvitation` is a new model rather than a generalised `CustomerInvitation`: that model requires a `tradeRelationshipId`, which has no meaning for staff, and it records no inviter or roles. Everything downstream is reused unchanged: `InvitationStatus`, the transactional outbox (`StaffInviteSent`) → notifications queue → `Notification`/`NotificationDelivery` → `EmailChannelSender` → `MailService` with the shared MJML header/footer partials. Resend is revoke-plus-create in one transaction, exactly as ADR-027: the earlier link stops working.

The raw invitation token exists only in the emailed link; the table stores its sha256 (`tokenHash`). The token still travels in the outbox payload and the delivery `Notification` payload — the same exposure customer invitations have — because the link must be built at send time.

### 2. The Owner is `DISTRIBUTOR_ADMIN`; assignable roles are a whitelist

No new OWNER role. `DISTRIBUTOR_ADMIN` is the Owner and is never assignable by invitation or role edit. The assignable set (`ASSIGNABLE_STAFF_ROLES` in `@wholo/types`) is `OPERATIONS_MANAGER` (new) and `WAREHOUSE_STAFF`. `DRIVER` is excluded until driver onboarding is designed (drivers belong in the driver app). The whitelist is enforced server-side (400), independent of the UI. A new permission `team:manage` is held only by `DISTRIBUTOR_ADMIN`.

`OPERATIONS_MANAGER` runs the business day to day: orders, customers, catalogue, price lists, suppliers, delivery, asset images, analytics, admin notifications, tax types (read and manage), order-as, and accounting read + import (sync, import, match, retry exports). It deliberately lacks company settings, the accounting *connection* (`accounting:manage`: connect, connection settings, disconnect) and team management — those stay Owner-only. See ADR-066 for the per-integration `read`/`import`/`manage` convention.

### 3. Acceptance is bound to the invited address

Same rule as customer invitations: the verified Keycloak identity's email must equal the invited email (case-insensitive). A different address gets 403 and — because the check runs before any user row is created — leaves no trace. A different-registration-email flow was considered and dropped. `KeycloakIdentityGuard` already rejects unverified emails. An address that already has a Stocdup account (including a removed user's) cannot be invited. A person who already has a membership cannot accept (one identity, one company; customer and distributor access through one identity is out of scope).

Acceptance claims the invitation with a compare-and-set (`PENDING → ACCEPTED`) inside the same transaction that creates the Membership, so two simultaneous accepts of one link produce exactly one membership. The Membership's legacy `role` scalar carries the first role and `MembershipRole` rows carry them all (ADR-066 unions both; role edits keep them in step). The invitee landing page is deliberately generic — no unauthenticated lookup exists, and the link is a bearer token — so company and roles appear only after accepting.

### 4. Removal: revoke access now, keep the data, block the login

In one transaction: an `AuditLog` row snapshots who the person was (email, name, roles — `AuditLog` has no foreign keys, so it survives), the `Membership` and its role rows are deleted, and — only if that was the person's *only* membership — the `User` is soft-deleted (`deletedAt`, already honoured by every lookup) and their refresh tokens are cleared. Authorisation reads `Membership` on every request, so a still-valid JWT stops working on the next call. The `User` row stays (orders, sessions, invitations still reference it) and their address stays taken.

Keycloak login is blocked by an outbox event (`StaffKeycloakDisableRequested`) consumed by the worker, which disables the Keycloak user and ends its sessions via the Admin API. It goes through the outbox, like every other trigger, so a Keycloak outage delays the disable (retried ~30 minutes with backoff) instead of failing the Owner's click. The processor re-reads the user and only disables one who is still removed, and uses the Keycloak id on record rather than the event's.

The worker authenticates as a dedicated service-account client, `wholo-api-admin`, holding only `realm-management: manage-users` — never the master admin. Realm import runs only on first boot, so existing realms get it from `scripts/setup-keycloak-api-admin-client.sh` (see `docs/deployment/live-k3s.md`).

The Owner and the caller cannot be edited or removed through Team (this doubles as the last-owner guard).

### 4b. Notifications

When an invitation is accepted, `AdminNotificationsService.notifyOrganisationAdmins` writes a bell notification for every Owner ("<Name> joined your team"), after the accept commits and last (ADR-055); a failure there does not fail the accept. Sending an invitation creates none — the sender is the actor and sees the new Pending row.

## Consequences

- Every `Membership` now comes from three paths, not two: `PortalInvitationsService.acceptInvite`, `DistributorsService` onboarding, and `StaffInvitationAcceptService.accept`. ADR-053's organisation-type gate is unaffected (staff memberships are always on a `DISTRIBUTOR` organisation).
- Removing someone from Stocdup cannot lock them out of an unrelated organisation they also belong to.
- Until the Keycloak client exists on an environment, removal still locks the person out at the API, but the queued Keycloak disables retry and then sit failed; the worker logs say why.
- A removed person's history reads with their name (audit snapshots, retained `User` row). Re-adding them means a new invitation from a new address, because their old address stays taken.
