# ADR-018: REST API design conventions

## Status
Accepted

## Context
The REST API is consumed by four frontend apps and will eventually support native mobile clients. Consistent conventions across all endpoints reduce integration friction, make the API predictable to consumers and simplify client code generation from the OpenAPI specification.

## Decision
The following conventions apply across all API endpoints:

**Versioning:** URL path prefix — `/api/v1/`. Breaking changes require a new version prefix.

**Pagination:** Cursor-based pagination for all list endpoints. Cursor pagination supports large datasets and produces consistent results under concurrent writes, unlike offset pagination which can skip or repeat records as data changes. Offset pagination is acceptable only for fixed, small admin lists.

**Error responses:** RFC 7807 Problem Details (`Content-Type: application/problem+json`). All error responses include `type`, `title`, `status` and `detail` fields. Validation errors include a `errors` array with field-level detail.

**Idempotency:** Order creation and any endpoint that triggers a Xero operation must accept an `Idempotency-Key` request header. The key is stored in Redis with a short TTL; duplicate requests within the TTL window return the original response without re-executing the operation.

**OpenAPI:** The NestJS application generates an OpenAPI specification at `/api/docs`. This is the authoritative API contract and should be used to generate typed clients for the frontend apps.

## Consequences
- Consistent conventions reduce the surface area for client-side bugs.
- Cursor pagination requires that list queries are ordered by a stable, indexed column (e.g. `createdAt`, `id`).
- Idempotency key handling must be implemented in the API middleware layer and tested explicitly.
- The OpenAPI specification must be kept up to date; breaking changes to the spec without a version bump are not permitted.
