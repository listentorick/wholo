# ADR-013: pnpm monorepo

## Status
Accepted

## Context
The platform consists of seven deployable services (`app-discovery`, `app-portal`, `app-admin`, `app-ops`, `wholo-api`, `wholo-worker`, `wholo-scheduler`) and shared packages (component library, API client, types). Managing these as separate repositories would increase coordination overhead, make cross-cutting changes harder and complicate shared package versioning.

## Decision
All services and shared packages live in a **pnpm monorepo** using pnpm workspaces.

Structure:
```
apps/
  discovery/     # app-discovery
  portal/        # app-portal
  admin/         # app-admin
  ops/           # app-ops
  api/           # wholo-api (NestJS)
  worker/        # wholo-worker
  scheduler/     # wholo-scheduler
packages/
  ui/            # shared component library
  api-client/    # shared typed API client
  types/         # shared TypeScript types
```

pnpm is chosen over npm/yarn workspaces for its efficient disk usage (content-addressable store), strict dependency resolution and fast install times.

## Consequences
- Cross-cutting changes (e.g. a shared type or API client update) can be made atomically in a single PR.
- Shared packages are consumed directly from the monorepo without publishing to a registry.
- CI must be configured to detect which apps are affected by a change and only build/deploy those (e.g. using Turborepo or pnpm's `--filter` flag).
- A single lockfile (`pnpm-lock.yaml`) governs all dependencies across the monorepo.
