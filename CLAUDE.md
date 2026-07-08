# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wholo is a **mobile-first wholesale commerce and operations platform** connecting wholesalers/distributors with trade customers. The initial target vertical is wine distribution, but the platform must remain industry-agnostic.

## Core Domain Model

Three primary actor types:

- **Distributor / Wholesaler** — the primary operational user; owns inventory, pricing, customer management, purchasing, deliveries, and fulfilment workflows.
- **Trade Customer** — a business buying from a distributor (restaurants, bars, hotels, retailers). Uses the platform to browse catalogues, place orders, view invoices, and track deliveries.
- **Producer / Supplier** — upstream supplier to distributors; used for purchasing, incoming stock, and purchase orders.

## Key Product Modules

| Module | Notes |
|---|---|
| Distributor Discovery Portal | Marketplace for trade customers to find and request access to distributors |
| Customer Portal | Catalogue browsing, ordering, reorder, favourites, invoice visibility, payments, credit |
| Commerce & Merchandising | Product recommendations, promotional content, rich media and video |
| Product & Pricing Management | Products with SKU/stock/vintage metadata; price lists with hierarchy: customer-specific override → assigned price list → default pricing |
| Producer / Supplier Management | Supplier records, contacts, payment terms, lead times |
| Purchase Orders | PO lifecycle: Draft → Ordered → Partially Received → Fully Received → Cancelled |
| Inventory Management | Stock states: Available / Reserved / Incoming / Delivered / Damaged; reservation on order placement |
| Delivery Management | Delivery statuses, geographic availability rules, driver workflow, signature capture |
| Xero Integration | Xero is system of record for invoices/payments/balances; Wholo is pricing authority — prices must not be overridden by Xero |

## Application Ports

| App | Port | Notes |
|---|---|---|
| `apps/api` | 3001 | Central domain API — all business logic |
| `apps/admin-api` | 3002 | BFF for admin UI — proxies to apps/api |
| `apps/portal-api` | 3003 | BFF for customer portal — proxies to apps/api |
| `apps/admin` | 3020 | Admin Next.js frontend |
| `apps/portal` | 3010 | Customer portal Next.js frontend |

**Auth architecture**: `apps/api` is the single auth authority. BFFs proxy login to apps/api and forward the issued JWT. BFFs validate inbound JWTs locally using a shared `JWT_SECRET`. Future: dedicated auth service + client credentials for BFF→API calls.

## Primary API layout — known debt (being reshaped slowly)

The current route layout of `apps/api` is acknowledged as messy and is being incrementally brought into shape. Do **not** mass-refactor it unprompted, but do not entrench the current patterns when adding endpoints either.

- **The `admin/...` route prefix concept is wrong.** Whether a caller may invoke an endpoint is an authn/authz concern (roles/scopes on the credential), not a URL-namespace concern. Existing `admin/distributors/:distributorId/...` routes stay for now; new endpoints should not extend this admin-namespace pattern.
- **Target shape**: resource-oriented paths that address resources fully and explicitly by ID (e.g. a customer contextualised to a distributor is `distributors/:distributorId/customers/:customerId`). `apps/api` is designed to service applications and agents (eventually via client credentials), not just user-JWT browser sessions.
- **No identity-relative aliases (`me`) in `apps/api`.** "Me" semantics belong at the user edge — the BFFs (`portal-api`, `admin-api`) adapt user context into explicit resource calls. The server always enforces that a path id matches what the credential is authorized for; client-supplied ids are claims, never trusted.
- **Prefer coarse resources over fine-grained field endpoints** (e.g. return the customer-in-context resource, not a `/delivery-address` micro-endpoint).

## Architecture Principles (from PRD)

- **Mobile-first**: all core workflows (ordering, stock receiving, delivery confirmation, signature capture) must work well on mobile.
- **Xero integration-first**: invoices flow Wholo → Xero; pricing authority stays in Wholo.
- **Industry-agnostic core**: no wine-specific assumptions in data models or workflows.
- **Minimal training**: operational simplicity over ERP complexity.

## Out of Scope (v1)

Advanced warehouse management, route optimisation, procurement forecasting, barcode scanning, multi-warehouse, BI/reporting, AI recommendations, EDI integrations.

## Testing

Unit tests are **required** for all new code. Every service method, controller, and utility must have a corresponding `.spec.ts` (backend) or `.spec.tsx` (frontend) file alongside it.

### Frameworks

| App | Framework | Run |
|---|---|---|
| `apps/api` | Jest + `@nestjs/testing` | `pnpm --filter @wholo/api test` |
| `apps/admin-api` | Jest + `@nestjs/testing` | `pnpm --filter @wholo/admin-api test` |
| `apps/admin` | Vitest + Testing Library | `pnpm --filter @wholo/admin test` |
| `apps/portal` | Vitest + Testing Library | `pnpm --filter @wholo/portal test` |

### Running all tests

**All unit tests (from repo root):**
```bash
turbo test
```

**Individual app unit tests:**
```bash
pnpm --filter @wholo/api test
pnpm --filter @wholo/admin-api test
pnpm --filter @wholo/admin test
pnpm --filter @wholo/portal test
```

**Integration tests** (requires a running database — start the port-forward first):
```bash
# Terminal 1 — keep this running
kubectl port-forward svc/wholo-postgresql 5432:5432

# Terminal 2 — run integration tests
DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo pnpm --filter @wholo/api test:integration
```

**Everything (unit + integration) in one shot:**
```bash
# Start port-forward first, then:
turbo test
DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo pnpm --filter @wholo/api test:integration
```

### NestJS unit test conventions

- Use `Test.createTestingModule` from `@nestjs/testing`
- Mock all dependencies with `{ provide: ServiceName, useValue: mockObject }`
- Never import `PrismaModule` or `ApiClientModule` in tests — mock the service directly
- Test the service in isolation; controller tests are optional unless routing logic is non-trivial

### What to test

- All service methods: happy path + error cases (NotFoundException, ForbiddenException, etc.)
- Input validation edge cases (null, empty, boundary values)
- Auth guard coverage is asserted by checking `@UseGuards` presence, not re-testing NestJS internals

### Integration tests (required for ownership and multi-tenancy)

Unit tests with mocked Prisma cannot verify that a real database query actually enforces a distributor boundary — they only confirm that the code *passes the right arguments* to the mock. Integration tests are therefore **required** for any feature that involves:

- Ownership checks (a distributor can only access their own records)
- Multi-tenancy isolation (distributor A cannot read, modify, or delete distributor B's data)
- Cross-entity constraints that span multiple tables

**Location**: `apps/api/test/*.integration-spec.ts`  
**Config**: `apps/api/jest.integration.config.ts`  
**Run**: `pnpm --filter @wholo/api test:integration`

**Prerequisites** (integration tests hit a real database):
```bash
kubectl port-forward svc/wholo-postgresql 5432:5432
# DATABASE_URL is read from the environment — see apps/api/.env.example
```

**Test structure**: Use `beforeAll` to create fixed-ID test organisations (`upsert` for idempotency), `beforeEach` to clean child records between tests, and `afterAll` to tear everything down. Use `supertest` to drive the HTTP layer — these tests exercise the full stack from controller to database.

## Deployment

### Local dev (Docker Desktop Kubernetes)

Local dev runs on Kubernetes via Helm (`helm/wholo`, `pnpm helm:install`), not Docker Compose. Images are built locally and loaded straight into Docker Desktop's cluster — pods use `imagePullPolicy: Never`, so nothing is pulled automatically:

```bash
# build one image
docker build -t wholo/<service>:local -f apps/<service>/Dockerfile .
# or build all five in one go
pnpm k8s:build

# after every build, restart the deployment so pods pick up the new image
kubectl rollout restart deployment/wholo-<service>
```

- The image tag must be `wholo/<service>:local` — **slash**, not hyphen. The Helm chart references that exact name; a hyphenated tag (`wholo-<service>:local`) silently builds an image the pods never see, and the old code keeps running.
- `portal-api` and `admin-api` bake their Next.js frontend (`portal`/`admin` respectively) into the same image at build time — rebuild `portal-api`/`admin-api` (not `portal`/`admin`) to pick up frontend-only changes.

#### Local URLs

Docker Desktop exposes each `LoadBalancer` service directly on Windows/WSL `localhost` — no port-forward needed for normal use:

| Service | URL |
|---|---|
| Admin app (frontend + BFF) | `http://localhost:3020` |
| Portal app (frontend + BFF) | `http://localhost:3010` |
| API (central domain API) | `http://localhost:3001` |
| Keycloak | `http://localhost:8080` |
| MailHog UI | `http://localhost:30825` |

#### Local HTTPS (for real Xero OAuth testing only)

Xero requires an HTTPS redirect URI even for local testing. A second, HTTPS-only entry point for the admin app exists purely for this:

```
https://admin.localhost:8443
```

This routes through the Traefik ingress controller already running in the local cluster (Helm's `ingress.yaml`, enabled only for the `admin` host in `values.local.yaml` — `apps/api` is never given a public ingress route, on principle: it must stay reachable only via internal cluster DNS, exactly like every other BFF→`apps/api` call). Setup is one-shot via `scripts/setup-local-xero-https.sh` (self-signed cert, k8s TLS secret, and an additive — not overwriting — update to the Keycloak `wholo-admin` client's allowed redirect URIs/web origins/post-logout-redirect-uris).

To use it:
1. Keep `kubectl port-forward svc/traefik -n traefik 8443:443` running — Docker Desktop does not auto-expose Traefik's `LoadBalancer` ports the way it does for the `wholo-*` services.
2. Browse to `https://admin.localhost:8443` and accept the one-time self-signed-cert warning.
3. **This is a different browser origin than `localhost:3020`** — no shared login session. Log in fresh here rather than expecting a `localhost:3020` session to carry over. Use `localhost:3020` for everyday work; only switch to this URL to click "Connect Xero" and complete a real consent flow.
4. `XERO_REDIRECT_URI` (`apps/api` env) must match this exactly: `https://admin.localhost:8443/api/v1/accounting/xero/callback` — this is what gets registered as the redirect URI in the Xero developer app, and it's `admin-api`'s route even though the env var lives on `apps/api` (see `xero-connection.adapter.ts`).

### Live (self-hosted k3s)

Full runbook, one-time setup, and troubleshooting: `docs/deployment/live-k3s.md` (see also [ADR-048](docs/adrs/ADR-048-live-environment-k3s.md)). Pushing to `master` does **not** deploy to live by itself — the day-to-day promote-to-live loop is:

1. Push to `master` (or run the workflow manually) — this triggers `.github/workflows/build-images.yml`, which builds and pushes `ghcr.io/listentorick/wholo/{api,portal-api,admin-api,keycloak}` tagged `sha-<shortsha>` (and `latest` — never deploy `latest`).
2. Bump the `sha-` tags in `helm/wholo/values.live.yaml` (gitignored, not committed) to the new sha.
3. Deploy: `pnpm helm:install:live` (`helm upgrade --install wholo helm/wholo -n wholo -f helm/wholo/values.live.yaml`).

`portal-api`/`admin-api` images are environment-specific: `NEXT_PUBLIC_KEYCLOAK_*` is baked into the Next.js bundle at Docker build time, so the CI-built live images are never reused for local dev (which builds its own `:local` images from the same Dockerfiles with local defaults).

## Reference

Full product requirements are in `prd.md`.
