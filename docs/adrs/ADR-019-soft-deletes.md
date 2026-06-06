# ADR-019: Soft deletes for auditable entities

## Status
Accepted

## Context
Several domain entities carry operational or financial significance beyond their active lifespan. Permanently deleting an order, invoice, price list or inventory movement would break audit trails, financial reporting and the ability to investigate historical issues. However, not every entity warrants this treatment — ephemeral data such as draft basket items has no audit value.

## Decision
Entities where history or integrity matters use **soft deletes** via a `deletedAt` timestamp column. A `deletedAt` value of `null` means the record is active; a non-null value means it has been soft-deleted. Queries against these tables must filter by `deletedAt IS NULL` by default.

Entities that use soft deletes include:
- Orders and order lines
- Invoices
- Price lists and pricing rules
- Inventory movements
- Products
- Trade relationships

Entities where hard deletes are acceptable:
- Draft basket items
- Temporary workflow state

## Consequences
- Full history is preserved for auditable entities; deleted records remain queryable by platform admins.
- All queries against soft-deleted tables must include the `deletedAt IS NULL` filter; Prisma middleware or a base repository pattern should enforce this globally to prevent accidental data leakage.
- Soft-deleted records consume database space indefinitely; archiving strategies should be considered for long-lived distributors with high order volumes.
- "Restore" functionality (undeleting a record) is straightforward to implement when needed.
