# ADR-022: Product attribute value storage — EAV vs JSONB

## Status

Deferred — dynamic product metadata is not in scope for v1. This decision will be made when the attribute metadata feature is built. The context and trade-offs are documented here so the analysis does not need to be reconstructed.

## Context

Wholo products carry flexible, distributor-defined metadata governed by attribute schemas (see ADR-024). The attribute definitions themselves are stored as relational rows. The question is how to store the **values** against each product.

Two approaches were evaluated.

---

### Option A: EAV (Entity-Attribute-Value)

A `product_attribute_values` table stores one row per product per attribute:

| Column | Type | Notes |
|---|---|---|
| `product_id` | FK | |
| `attribute_definition_id` | FK | |
| `value_text` | text nullable | |
| `value_number` | numeric nullable | for numbers, years |
| `value_boolean` | boolean nullable | |
| `value_option_id` | FK nullable | for select types |

**Strengths**
- Typed value columns — B-tree index on `value_number` handles range queries (vintage 2015–2020, bottle size ≥ 700ml) natively without casting.
- FK on `value_option_id` enforces valid select values at the database level.
- Postgres planner produces accurate cardinality estimates, leading to better query plans on large datasets.
- Standard SQL aggregations (AVG, MIN/MAX) over attribute values work naturally.

**Weaknesses**
- Multi-attribute filtering requires multiple self-joins. Filtering by three attributes simultaneously means three joins to the same table — complex SQL that Prisma cannot express in its query API, requiring `$queryRaw`.
- Loading products with all their attributes risks N+1 queries without careful query design.
- `$queryRaw` for catalogue filtering loses Prisma's type safety.

---

### Option B: JSONB

Attribute values stored as a single `metadata` JSONB column on the product row:

```json
{ "vintage": 2019, "bottle_size": 750, "wine_type": "Red" }
```

**Strengths**
- Simple multi-attribute filtering in a single WHERE clause — no joins.
- Attributes travel with the product row — no joins to read them.
- Prisma handles JSONB natively via the `Json` type; no `$queryRaw` needed for standard queries.
- Adding a new attribute requires no schema migration.
- Full-text search across all metadata values is possible via a `search_vector` tsvector column populated using `jsonb_each_text()`.

**Weaknesses**
- Range queries on JSONB require expression indexes and explicit casting. One expression index per filterable numeric attribute must be maintained.
- GIN index does not help with range queries — only containment and existence queries.
- No database-level FK enforcement on select option values — application must validate.
- Postgres planner cardinality estimates are poor for JSONB predicates on large tables.

---

### Use case clarification

Product attribute values in Wholo are used for:
- Rendering product entry forms and product detail pages
- Powering customer-facing catalogue filtering and sorting
- Full-text product search

They are **not** used for reporting or analytics. This eliminates the main scenarios where EAV holds an advantage (aggregations, accurate planner statistics for analytical queries).

---

### Dedicated search service

When catalogue filtering requirements mature, a dedicated search service (Typesense, Algolia) will index a denormalised product view. At that point the storage model becomes largely irrelevant for filtering performance. Both options reach this same end state.

---

## Recommendation (for when this decision is made)

**JSONB is recommended** for this use case because:

1. The attribute value use cases are rendering, filtering and search — not analytics.
2. Multi-attribute filter queries are expressible in Prisma without raw SQL.
3. At typical distributor catalogue scale (hundreds to low thousands of products), expression indexes on JSONB perform adequately.
4. A future dedicated search service supersedes the storage model for filtering.

EAV should be reconsidered if distributor catalogues are expected to reach tens of thousands of products, or if strong database-level enforcement of select option values becomes a hard requirement.

## Consequences (if JSONB is chosen)

- One expression index must be created per filterable numeric attribute in each attribute schema.
- Application layer must validate select option values against the attribute definition.
- JSONB filter queries should be encapsulated in a repository layer.
- A `search_vector` tsvector column (updated via trigger using `jsonb_each_text()`) enables full-text search across all metadata values.

## Consequences (if EAV is chosen)

- Multi-attribute catalogue filter queries must use `$queryRaw`, encapsulated in a repository layer.
- A query builder utility should construct EAV filter queries programmatically to reduce raw SQL surface area.
- FK constraints on `value_option_id` provide database-level select validation.
