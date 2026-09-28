# ADR-070: Trade-relationship lifecycle facts

## Status
Accepted

## Context
We want to measure how distributors win and keep customers: new-business win rate (how many relationships opened become customers), activation (how quickly a new customer places a first order), and cohorts by the month a customer joined. None of that could be measured:

- Several relationship changes left no trace at all. Creating a customer, a customer requesting access, accepting an invite and removing a customer wrote no event. Only the admin status buttons (accept/decline request, activate, suspend, unsuspend) did, and only for notifications.
- `trade_relationships` holds the current status only. A re-request after a decline overwrites the earlier request, and nothing records when a customer first became active. Customer health had to approximate "became a customer" from the accepted invite or the row's creation.
- Nothing distinguished a customer typed in by staff, one imported from the accounting system (the distributor's existing book of business, which must not count as new business) and one who found the distributor and asked for access.

## Decision

### 1. Every relationship change writes an outbox event
Each change writes one outbox event in the same transaction as the change, using the shared `relationshipEventFields` helper (`apps/api/src/common/relationship-events.ts`). Every event carries `relationshipId`, `distributorId`, `customerId`, `fromStatus` (null when the event opens the relationship), `toStatus` and `occurredAt`.

| Event | When |
|---|---|
| `TradeRelationshipCreated` | Staff create a customer; `origin` is `MANUAL` or `ACCOUNTING_IMPORT` |
| `TradeRelationshipAccessRequested` | A customer requests access, including a re-request after a decline |
| `CustomerInviteSent` | An invite is sent (the invitation aggregate, naming the relationship) |
| `CustomerInviteAccepted` | An invite is accepted; `fromStatus` is read inside the transaction |
| `TradeRelationshipRequestAccepted` / `RequestDeclined` / `Activated` / `Suspended` / `Unsuspended` | The existing status buttons |
| `TradeRelationshipRemoved` | A customer is soft-deleted |

There is no event for invite revoke or expiry. Revoke only happens when an invite is superseded by a re-send, which is already visible as a second `CustomerInviteSent`. Expiry is implied by `expiresAt`. The funnel is measured per relationship, not per invite.

### 2. Facts plus a one-row-per-relationship projection
The analytics-facts consumer writes each event to `relationship_facts`, which is append-only, has no foreign keys and is a Timescale hypertable on `occurredAt`, following the rules in ADR-052. In the same transaction it upserts `relationship_analytics_state`, one row per relationship. This mirrors `order_facts` and `order_analytics_state`.

A status-history column or table written by the services was rejected. It would put analytics concerns into every write path and give no replayable log. The fact layer already exists, is idempotent on `eventId`, and is the agreed home for business history (see the stats taxonomy: facts for history, live queries for right-now counts).

### 3. Definitions
The rules live in `relationshipEventEffect`, a pure function in `relationship-facts.service.ts`.

- **Opened (origin, openedAt):**
  - `TradeRelationshipCreated` opens as `MANUAL` or `ACCOUNTING_IMPORT`.
  - A customer's *first* access request (`fromStatus` null) opens as `ACCESS_REQUEST`.
  - A re-request after a decline is recorded as a fact but does not reopen.
  - `UNKNOWN` only appears if a later event is consumed before the opening one; the opening event then corrects it.
- **Activated (activatedAt, activatedVia):** the first move into `ACTIVE` from anything other than `ACTIVE` or `SUSPENDED`.
  - Unsuspending is a return, not a new activation.
  - An extra user accepting an invite on an already-active relationship is not a new activation either.
  - `activatedAt` only ever moves earlier.
- **Status** follows the latest event in business time, using the same `lastEventAt` guard as `order_analytics_state`.
- **Removal** is terminal.

Out-of-order and replayed events are safe: first-opened and first-activated only move earlier, and status only moves forward.

### 4. No historic backfill
Facts start when this ships. The live system is still in test, so there is no backfill of earlier relationships. Consequences:

- Customer health's "became a customer" uses `activatedAt` when present and falls back to the old approximation (accepted invite, else creation) for relationships activated earlier.
- Reconciliation only expects a state row for relationships created since the first relationship fact. Any state row that does exist must agree with `trade_relationships` on status and removal.

## Consequences
- Win rate, activation and cohort views can be built on `relationship_analytics_state` and `relationship_facts`. Imported customers are excluded by `origin`.
- Every new relationship write path must write its event through `relationshipEventFields` in the same transaction. The integration test `relationship-events.integration-spec.ts` covers the current paths.
- One existing behaviour is recorded, not changed: accepting a pending invite on a suspended relationship makes it active again. The event shows `fromStatus: SUSPENDED`, and it does not count as an activation.
