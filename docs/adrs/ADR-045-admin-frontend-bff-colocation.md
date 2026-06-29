# ADR-045 — Admin Frontend and BFF Colocation

**Status**: Accepted  
**Date**: 2026-06-29  
**Deciders**: Rick Walsh  
**Related**: ADR-044 (portal colocation), ADR-026 (BFF architecture)

---

## Context

Applies the same pattern established in ADR-044 to the admin surface. `apps/admin` (Next.js, port 3020) and `apps/admin-api` (NestJS BFF, port 3002) were separate services requiring CORS, a baked-in `NEXT_PUBLIC_ADMIN_API_URL` build-time env var, two Docker images, and two K8s deployments.

The Keycloak `wholo-admin` client already had redirect URIs configured for port 3020, so no Keycloak changes were required.

---

## Decision

Merge `apps/admin` and `apps/admin-api` into a single deployable unit on port 3020 using the identical NestJS custom Next.js server pattern from ADR-044.

All rationale, routing approach, TypeScript requirements (`esModuleInterop`, `tsBuildInfoFile`, default express import), and rejected alternatives are documented in ADR-044 and apply here without change.

Admin-specific notes:

- The combined service runs on port **3020** (the former admin frontend port), preserving the Keycloak redirect URI configuration.
- `packages/admin-api-client` base URL changed from `NEXT_PUBLIC_ADMIN_API_URL` to a same-origin relative URL (`''`), consistent with the `packages/api-client` change made in ADR-044.
- The Prisma client generation step (`npx prisma generate`) is retained in the Dockerfile builder stage, as admin-api uses Prisma directly.

---

## Consequences

- `wholo-admin-api` is the single K8s deployment serving both the admin UI and its BFF on port 3020. The `wholo-admin` deployment and service no longer exist.
- No CORS configuration required between the admin frontend and its BFF.
- `NEXT_PUBLIC_ADMIN_API_URL` is no longer needed as a ConfigMap entry or build argument.
- Memory limits for `adminApi` increased to 384Mi/768Mi to accommodate the Next.js runtime (consistent with `portalApi`).
