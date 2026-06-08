# ADR-027: Trade customer domain model

## Status

Accepted

## Context

A trade customer in Wholo is a business entity — a restaurant, bar, hotel, or retailer — that buys from one or more distributors. Two properties drive the data modelling challenge:

**Multi-distributor membership.** The same business may source from multiple distributors. Distributor A should not see distributor B's account number, credit terms, or delivery addresses for the same customer. Yet the business itself — its trading name, primary email, portal login — is a single shared identity.

**Portal login sharing.** A trade customer has one or more staff members who log in to the portal. Those logins belong to the business, not to a distributor relationship. A staff member with portal access at distributor A should not need a separate account to place orders at distributor B once approved.

A flat customer model — all fields on a single `Customer` table scoped to `distributorId` — would duplicate identity data, prevent shared portal logins, and force a customer to re-register with every new distributor.

Alternatives considered:

**Option A — Flat customer, duplicated per distributor.** A single `Customer` table where every row is scoped to one distributor. Simple to query; trivial to implement. Rejected because portal login cannot be shared (the same person would need separate credentials per distributor), and there is no canonical identity to link discovery-portal requests to an existing account.

**Option B — Two-layer model (chosen).** Separate the canonical business identity (`Organisation`) from the per-distributor operational record (`TradeRelationship`). An `Organisation` of type `TRADE_CUSTOMER` carries the stable, cross-distributor identity. A `TradeRelationship` joins a distributor `Organisation` to a customer `Organisation` and carries the distributor-specific fields.

**Option C — Polymorphic customer table with shared identity column.** A `customers` table with a `sharedIdentityId` foreign key to a separate `customer_identities` table. Functionally equivalent to Option B but with weaker semantics — `Organisation` already models the concept of a named business entity, and introducing a new identity table alongside it would create two competing representations of the same concept.

## Decision

### Two-layer identity model

```
Organisation (TRADE_CUSTOMER)          — canonical identity
  id, name, email, phone, type

TradeRelationship                      — distributor-scoped record
  id, distributorId → Organisation
  customerId        → Organisation
  status, accountNumber, creditLimit,
  paymentTerms, notes,
  delivery address (6 fields inline),
  billing address (6 fields inline)
```

`Organisation` with `type = TRADE_CUSTOMER` represents the business entity. Its `id` is the stable, cross-distributor identity — the "shared ID" that survives the customer joining additional distributors. It carries only fields that are truly shared: trading name, primary email, and phone.

`TradeRelationship` is the distributor-specific record. One row exists per (distributor, customer) pair — enforced by `@@unique([distributorId, customerId])`. It holds everything a distributor owns about a customer: account number, credit limit, payment terms, notes, and both delivery and billing addresses.

The `TradeRelationship.id` is the admin API's primary handle on a customer (`GET /api/v1/customers/:id` resolves to a `TradeRelationship`). The `Organisation.id` is exposed as `organisationId` in the response for cases where the caller needs the cross-distributor identity (e.g. to link a portal login).

### Addresses on TradeRelationship, not Organisation

Each distributor maintains its own delivery and billing addresses for a customer. The same restaurant may receive wines at a cellar door address for distributor A and at a city venue for distributor B. Addresses are therefore inline fields on `TradeRelationship` rather than a shared `Address` model.

A separate polymorphic address table was considered and rejected: the address fields are few, are always fetched with the relationship, and the polymorphic join complexity is not justified for this use case.

### Portal staff via existing Membership model

Staff members who log in to the portal are modelled as `User` rows with a `Membership` linking them to the `Organisation (TRADE_CUSTOMER)` with role `TRADE_CUSTOMER`. This reuses the existing identity infrastructure without modification.

All customer logins are equal — there is no admin-vs-staff distinction within a customer's portal account. The first user is created during invitation acceptance; subsequent staff are added by existing members via the portal (future slice).

### Invitation flow

When a distributor creates a customer and provides an email address, the system immediately generates a `CustomerInvitation`:

- **Token**: 32 bytes of cryptographically random data, hex-encoded (`crypto.randomBytes(32).toString('hex')`). Stored plain — it is short-lived (7-day expiry) and does not grant persistent access.
- **Not a JWT**: A JWT would be self-verifiable and could be decoded to reveal metadata. A random token has no structure to exploit and is invalidated server-side when accepted or revoked.
- **Revocation**: Resending an invitation marks all prior `PENDING` invitations as `REVOKED` before creating a new one. At most one active invitation exists per relationship at any time.
- **Email sending deferred**: The invite URL is returned in the API response (`POST /api/v1/customers` and `POST /api/v1/customers/:id/invite`) and displayed in the admin UI. Sending the email is deferred to the notification infrastructure slice.

`CustomerInvitation` carries a denormalised `distributorId` column for efficient per-distributor filtering without joining through `TradeRelationship`.

### TradeRelationship status lifecycle

```
PENDING_INVITE   — distributor created, invitation not yet accepted
PENDING_REQUEST  — customer requested via discovery portal (future slice)
ACTIVE           — invitation accepted / relationship approved
SUSPENDED        — temporarily blocked by distributor
INACTIVE         — relationship ended
```

`PENDING_REQUEST` is defined in the schema now to allow the discovery-portal slice to create that state without a migration, but no API code produces it yet.

## Consequences

- A trade customer business has a single `Organisation` record regardless of how many distributors it trades with. Adding a second distributor creates a new `TradeRelationship` row, not a new `Organisation`.
- The admin API exposes `TradeRelationship.id` as the customer resource identifier. The `Organisation.id` is also returned as `organisationId` for cross-distributor lookups.
- Portal logins (`Membership → Organisation`) are shared across distributor relationships. A single set of credentials grants access to all distributors the customer is approved with.
- Distributor A cannot read distributor B's `TradeRelationship` fields (credit limit, account number, addresses) — each row is scoped to one distributor and every query filters by `distributorId` from the JWT claim (see ADR-010).
- The soft-delete (ADR-019) on `TradeRelationship` removes the customer from a distributor's list but does not delete the `Organisation` — the shared identity and portal login remain intact.
- Customer invitation acceptance (portal user sets password, `Membership` is created) is a separate slice and is not implemented here.
