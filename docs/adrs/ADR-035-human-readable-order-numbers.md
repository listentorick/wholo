# ADR-035 — Human-Readable Order Numbers via PostgreSQL Sequence

**Status**: Accepted  
**Date**: 2026-06-12  
**Deciders**: Rick Walsh

---

## Context

Every order needs two identifiers:

1. A **system ID** — used for foreign keys, API routes, and internal references. The system uses CUIDs (`cuid2`) for this, consistent with all other entity primary keys in the platform.
2. A **human-readable reference** — used in customer communications, invoices, and distributor/customer support. Something a person can read out, type, or search for.

CUIDs (`cm...`) are not human-readable and are unsuitable as a customer-facing reference. Options for generating a short, ordered, human-readable number include:

- **Auto-incrementing integer PK** — couples business numbering to the database PK, makes row count guessable, hard to change format later.
- **Application-layer UUID + format** — random; not sortable; not sequential.
- **Timestamp-based** — collisions possible under concurrent load; not guaranteed unique.
- **PostgreSQL sequence** — monotonically increasing, crash-safe, atomic, decoupled from the PK.

---

## Decision

A dedicated PostgreSQL sequence `order_number_seq` is used to generate the numeric component of order numbers:

```sql
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;
```

At submission time, `submitOrder` calls:

```sql
SELECT nextval('order_number_seq')
```

The result is formatted as:

```
ORD-{YYYY}-{NNNNN}
```

where `YYYY` is the four-digit year and `NNNNN` is the sequence value zero-padded to 5 digits (e.g., `ORD-2026-00001`).

`orderNumber` is stored as `TEXT NOT NULL UNIQUE` on the `orders` table. It is snapshotted into `outbox_events` payloads and will flow to Xero as the external reference.

---

## Consequences

### Decoupled from PK

The business reference is independent of the internal ID. The CUID PK can remain unchanged if order numbers need to be reformatted in a future schema migration.

### Cross-year non-uniqueness by number alone

`ORD-2026-00001` and `ORD-2027-00001` would share the same numeric suffix. The year prefix makes each number globally unique for communications purposes. The `UNIQUE` constraint on `orderNumber` enforces uniqueness at the database level regardless.

### Sequence gaps are acceptable

If a transaction is rolled back after calling `nextval`, the sequence value is consumed and the number is skipped. This is standard sequence behaviour in PostgreSQL and is not considered a problem — order numbers need only be unique, not gapless.

### Multi-distributor scope

In Phase 1, the sequence is global (not per-distributor). All orders across all distributors share one counter. This may be revisited in a future phase if distributors need their own numbering series (e.g., per-distributor prefix).

### Sequence is not part of the Prisma schema

Prisma does not model raw PostgreSQL sequences. The sequence creation is maintained in a dedicated migration (`add_order_number_seq`) as raw SQL. This migration must be included in every deployment artefact — it is bundled into the `wholo/api:local` image and run by `prisma migrate deploy` at startup.

---

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Use CUID as customer-facing reference | Not human-readable; customers cannot communicate it verbally |
| Auto-increment integer PK | Leaks row count; hard to add year/prefix formatting; couples PK to business ID |
| UUID v4 formatted as short string | Random; not ordered; collision probability non-zero |
| Application-layer counter (Redis INCR) | Redis is ephemeral state (ADR-004); not appropriate for a durable business reference |
