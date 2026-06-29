# ADR-044 — Portal Frontend and BFF Colocation

**Status**: Accepted  
**Date**: 2026-06-29  
**Deciders**: Rick Walsh  
**Related**: ADR-026 (BFF architecture)

---

## Context

The customer portal was originally deployed as two separate services:

| Service | Port | Role |
|---|---|---|
| `apps/portal` | 3010 | Next.js frontend |
| `apps/portal-api` | 3003 | NestJS BFF |

The frontend made cross-origin requests to the BFF. This required CORS configuration, an absolute `NEXT_PUBLIC_API_URL` environment variable baked into the Next.js build, separate Docker images, two K8s deployments, and two K8s services.

The BFF's role will grow over time — it will aggregate multiple calls to `apps/api` and apply portal-specific response shaping. Keeping it as NestJS (rather than Next.js Route Handlers) is already established policy (ADR-026).

---

## Decision

Merge `apps/portal` and `apps/portal-api` into a single deployable unit. NestJS acts as a custom Next.js server: one process, one port (3010), one Docker image, one K8s deployment.

### Request routing

An Express middleware registered **before** `NestFactory.create()` inspects every inbound request:

- Path starts with `/api/` → pass through to NestJS (controllers handle it)
- All other paths → delegate to Next.js's `getRequestHandler()`

```typescript
expressServer.use((req, res, nextFn) => {
  if (req.path.startsWith('/api/')) return nextFn();
  return nextHandler(req, res);
});

const app = await NestFactory.create(AppModule, new ExpressAdapter(expressServer));
```

The middleware must be registered before `NestFactory.create` so it runs before NestJS's internal not-found handler.

### Next.js configuration

`output: 'standalone'` is removed from `apps/portal/next.config.ts`. Standalone mode creates its own HTTP server; that role belongs to NestJS.

`dynamicParams = true` (Next.js default) is retained — new distributor slugs are served immediately without a rebuild.

### API client base URL

`packages/api-client` uses a same-origin relative URL (`''`) rather than an absolute `NEXT_PUBLIC_API_URL`. Browser requests hit the current origin; server-side Next.js rendering (if any) uses an empty string which resolves correctly. No CORS, no build-time URL baking.

### Docker image

The combined Dockerfile builds the portal Next.js app first, then the NestJS BFF, and copies both outputs into the runner stage. `NEXT_APP_DIR=/app/portal` tells the NestJS process where the Next.js build lives at runtime.

### TypeScript requirements

- `esModuleInterop: true` — `require('next')` returns the factory function directly (not `{ default: fn }`); without this flag the compiled output calls `next_1.default(...)` which is `undefined`.
- `tsBuildInfoFile: ./dist/tsconfig.build.tsbuildinfo` — the incremental cache must live inside `dist/` so NestJS CLI's `deleteOutDir` clears it on each build, preventing stale cache from producing an empty output directory.
- `import express from 'express'` (default import) — namespace imports (`import * as express`) cannot be called as a constructor with `esModuleInterop` enabled.

---

## Consequences

- **One subdomain, one service**: `portal.wholo.com` is served entirely by `wholo-portal-api`. No separate `wholo-portal` K8s deployment or service.
- **No CORS**: frontend and API are same-origin; the `enableCors` call in NestJS is retained only for future external clients.
- **No build-time URL env var**: `NEXT_PUBLIC_API_URL` is no longer needed.
- **New distributor slugs work immediately**: dynamic routing is handled at runtime by Next.js, not pre-rendered at build time.
- **BFF remains NestJS**: consistent with ADR-026; the BFF will grow to aggregate `apps/api` calls without introducing Next.js Route Handlers.
- **Dev mode on WSL2/NTFS is slow**: `nextApp.prepare()` with `dev: true` triggers webpack's file-watching over NTFS, which can appear to hang. Local testing uses `NODE_ENV=production` against a pre-built `apps/portal/.next/`.
- **Single image is larger**: the Docker image now contains both the Next.js build artefacts and the NestJS dist. This is acceptable given the reduction in operational complexity.

---

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Keep two separate services | Two deployments, two images, CORS config, absolute URL baked into Next.js build at image creation time |
| Use Next.js Route Handlers as the BFF | Rejected per ADR-026 — BFF logic stays in NestJS |
| Next.js `output: 'standalone'` with its own HTTP server | Standalone mode starts its own server; NestJS must be the single HTTP entry point |
| Register Next.js catch-all after `app.init()` | NestJS's internal not-found handler intercepts unmatched requests before the catch-all fires; middleware must precede `NestFactory.create` |
