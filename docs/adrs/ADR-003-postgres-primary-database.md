# ADR-003: Postgres as the primary database

## Status
Accepted

## Context
Wholo needs a reliable relational database that can model complex domain relationships (organisations, trade relationships, price lists, orders, inventory movements) with strong consistency guarantees. The platform handles financial data (invoices, payments, credit) and inventory state, where data integrity is critical.

## Decision
Postgres is the primary database and single source of truth for all core business data. Prisma is used as the ORM and manages schema migrations via Prisma Migrate.

Postgres was chosen because:
- Strong ACID transaction support is required for order placement and stock reservation.
- The relational model maps naturally to the domain (normalised pricing, multi-level relationships).
- Postgres full-text search is sufficient for initial product and distributor search without an additional service.
- pgvector is available as an extension if vector search is needed for future recommendations.
- Prisma provides type-safe query building and a structured migration workflow.

## Consequences
- All core business data is strongly consistent.
- Schema changes are managed through version-controlled Prisma migrations.
- Migrations must be run as a pre-deployment step before the new API version starts.
- As read volume grows, a read replica should be introduced for analytics and reporting queries to avoid contention with the write path.
- Postgres full-text search will eventually need to be replaced or supplemented for more advanced search requirements.
