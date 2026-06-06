# ADR-010: Multi-tenancy via application-level distributorId scoping

## Status
Accepted

## Context
Wholo hosts multiple distributors in a single shared Postgres database. Data belonging to one distributor must never be accessible to another. Two approaches were considered:

- **Postgres Row-Level Security (RLS)** — the database enforces tenant isolation by rejecting queries that violate tenant boundaries. Strong guarantee but requires a Postgres session variable to be set on every connection, which conflicts with connection pooling and is difficult to combine with Prisma.
- **Application-level scoping** — every tenant-owned table includes a `distributorId` column, and the application service layer includes a tenant filter on every query.

## Decision
Multi-tenancy is enforced at the **application layer**. Every table that belongs to a distributor carries a `distributorId` foreign key. All service-layer queries against tenant-scoped tables must include a `WHERE distributor_id = ?` condition. This is enforced by convention and code review, with Postgres RLS considered as a future defence-in-depth measure.

Trade customer access to distributor data is always gated by an active trade relationship record between the customer's organisation and the distributor.

## Consequences
- Simpler to implement and debug than Postgres RLS, particularly with Prisma.
- Tenant scoping correctness depends on application code discipline — a missing `distributorId` filter is not caught by the database.
- Testing must include tenant isolation assertions to catch accidental cross-tenant data leakage.
- Postgres RLS can be layered on top later as an additional safety net without changing the application query structure.
