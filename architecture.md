# Wholo Architecture

## 1. Technology Choices

Wholo will initially be built as a **web-based, mobile-first platform**. Native mobile applications may be introduced later, so the backend should expose stable APIs that are not tightly coupled to the web UI.

### Frontend

| Technology | Purpose |
|---|---|
| React | UI framework |
| Next.js | Web application framework |
| TypeScript | Type-safe application development |
| Tailwind CSS | Styling |
| shadcn/ui | Component foundation |
| React Hook Form | Form handling |
| Zod | Validation |
| TanStack Query | API data fetching and client-side server state |

### Backend

| Technology | Purpose |
|---|---|
| Node.js | Backend runtime |
| TypeScript | Type-safe backend development |
| NestJS | API/backend framework |
| REST APIs | Application API style |
| OpenAPI | API documentation and future client generation |
| Postgres | Primary relational database |
| Redis | Caching, queues, locks and short-lived state |
| BullMQ | Background job processing |
| Object storage | Product images, videos, signatures and documents |
| Prisma | ORM |

NestJS was chosen over Fastify because its built-in dependency injection and module system maps directly to the domain modules in this codebase, supporting the modular monolith structure without additional scaffolding.

### Integrations

| Integration | Purpose |
|---|---|
| Xero | Accounting, invoices, payments, customer balances and product item synchronisation |
| Payment provider | Future invoice/card payment support |
| Email/notification provider | Customer invitations, order updates and operational alerts |
| Push notification provider | New order alerts and operational push notifications (e.g. Firebase Cloud Messaging) |
| LLM provider | Product type inference during ingestion and future metadata extraction (future) |

---

## 2. Design Goals

The architecture should support the product goals without becoming unnecessarily complex too early.

### Primary design goals

- **Web-first, mobile-first UX**  
  The first version will be web based, but the experience must work well on mobile devices for trade customers, warehouse users and delivery drivers.

- **API-ready for future mobile apps**  
  The web app should consume backend APIs that could also be used by future native mobile apps.

- **Modular monolith first**  
  The backend should start as a single deployable application with clear internal modules. This keeps delivery simple while allowing parts of the system to be separated later if needed.

- **Postgres as the source of truth**  
  Core business data should live in Postgres.

- **Asynchronous processing where appropriate**  
  Slow, unreliable or integration-heavy tasks should run through background jobs rather than blocking user requests.

- **Clear domain boundaries**  
  Pricing, ordering, inventory, fulfilment, delivery and invoicing should be separated internally so the codebase does not become tightly coupled.

- **Industry-agnostic product model**  
  The initial market may be wine distribution, but the product and catalogue model should support other wholesale sectors later.

- **Reliable integration with Xero**  
  Xero integration should be retry-safe, asynchronous and designed to avoid duplicate invoices or inconsistent financial state.

---

## 3. Authentication & Authorization

### Authentication approach

Authentication will be implemented in two phases:

1. **Phase 1 (initial):** Local email/password login using bcrypt password hashing.
2. **Phase 2 (future):** External identity provider (IDP) support via OAuth 2.0 / OIDC (e.g. Google, Microsoft, or a managed identity service such as Auth0 or Keycloak).

The auth layer must be built using NestJS Passport.js strategy pattern so that IDP strategies can be added without rewiring the authorization infrastructure.

### Token strategy

- **Access tokens:** Short-lived JWTs (e.g. 15 minutes), signed with a server secret, containing user claims (userId, organisationId, role).
- **Refresh tokens:** Longer-lived, stored in the database (allowing revocation), rotated on each use.
- A claims-based approach is used throughout: the JWT payload carries the user's role and organisation context so downstream services can make authorization decisions without additional database lookups.
- This approach is stateless for the API tier while retaining the ability to revoke sessions, and it supports future native mobile clients and IDP-issued tokens.

### Roles

The platform uses role-based access control (RBAC) with the following roles:

| Role | Description |
|---|---|
| Platform Admin | Wholo platform-level administration |
| Distributor Admin | Full access to a distributor's organisation |
| Warehouse Staff | Stock receiving and fulfillment workflows |
| Driver | Delivery workflows only |
| Trade Customer | Ordering, invoices and account management for their organisation |

Roles are scoped to an organisation. A user may hold different roles across different organisations (e.g. a person who manages two separate trade customer accounts).

### Multi-tenancy enforcement

Every distributor-owned resource carries a `distributorId`. The API layer must validate that the authenticated user belongs to the distributor being accessed on every request. This is enforced at the service layer, not only at the route level.

Trade customers access distributor data only through an approved trade relationship. The API must verify that an active trade relationship exists between the trade customer's organisation and the distributor before allowing catalogue or order access.

---

## 4. Multi-Tenancy & Data Isolation

Wholo is a multi-tenant platform. Multiple distributors and their customers share the same database.

### Strategy: application-level tenant scoping

All distributor-owned tables include a `distributor_id` foreign key. The application layer is responsible for applying tenant scoping on every query. There is no shared data access across distributors.

This approach is preferred over Postgres row-level security (RLS) for initial delivery because it is simpler to implement, debug and reason about in combination with Prisma. Postgres RLS may be introduced later as a defence-in-depth measure.

### Rules

- Every query against a tenant-scoped table must include a `distributorId` filter.
- No cross-distributor data access is permitted except at the platform admin level.
- Trade customer access to distributor data is always gated by an active trade relationship record.

---

## 5. What Needs to Scale

Not every part of the platform will need to scale in the same way. The architecture should identify likely pressure points early.

### User-facing web traffic

The web application must scale for:

- trade customers browsing catalogues
- product search
- basket and checkout flows
- distributor admin users
- warehouse workflows
- driver workflows

The web tier and API tier should be stateless where possible so they can be scaled horizontally.

### Product catalogue and search

Catalogue browsing and product search may become high-read areas.

This should scale through:

- good Postgres indexing
- pagination
- caching of common catalogue queries
- Postgres full-text search initially
- optional pgvector or a dedicated search service later

### Pricing lookups

Pricing may become complex and frequently accessed because customers can have:

- assigned price lists
- customer-specific overrides
- negotiated trade pricing
- promotional pricing

Pricing should be centralised in a pricing service and designed to support caching where safe. Cache invalidation must be triggered whenever a price list or customer-specific pricing record is updated.

### Order placement

Order placement is business-critical and must be reliable.

It needs to scale carefully because it touches:

- pricing
- stock availability
- stock reservation
- customer account rules
- order creation
- invoice creation triggers

Order creation should use database transactions and idempotency keys.

### Inventory updates

Inventory must handle concurrent updates from:

- customer orders
- stock receiving
- order dispatch
- delivery completion
- damaged/lost stock adjustments

Inventory should be movement-based, with stock movement records for auditability.

**Concurrency control:** Inventory updates use optimistic locking (a `version` column incremented on each write). If a write conflict is detected, the operation is retried. This keeps transactions short and avoids lock contention under concurrent order placement.

### Background jobs

The queue/worker layer needs to scale independently from the API because it will handle:

- Xero product imports
- invoice creation
- invoice/payment synchronisation
- email notifications
- media processing
- scheduled repeat orders
- search indexing

Workers should be horizontally scalable.

### Real-time updates & push notifications

WebSockets and server-sent events are out of scope for v1. The platform's workflows are asynchronous by nature and do not require a persistent connection. This decision will be revisited if warehouse coordination or live tracking needs emerge at scale.

**Push notifications** will be used for time-sensitive operational events. The primary use case is alerting distributor admins when a new customer order is placed. A push notification provider (e.g. Firebase Cloud Messaging) will handle delivery to both web browsers (Web Push API) and future native mobile apps (APNs / FCM). Push notification delivery is handled asynchronously via the worker queue, not in the order placement request path.

---

### Xero integration

Xero calls may be slow, rate-limited or temporarily unavailable.

Xero integration should scale through:

- queue-based processing
- retry policies
- idempotency
- stored external references
- webhook handling
- scheduled reconciliation jobs

### Media storage

Product imagery, videos, signatures and documents should not be stored in Postgres.

Media should scale through object storage, with Postgres storing metadata and references.

---

## 6. Component Responsibilities

### Web Applications

The frontend is split into four separate Next.js applications, each targeting a distinct persona. They share a common component library (`packages/ui`) and API client (`packages/api-client`) within the monorepo.

| App | Personas | Rendering | Notes |
|---|---|---|---|
| `app-discovery` | Public / prospective trade customers | SSR + ISR | SEO-indexable public site, no auth required |
| `app-portal` | Trade customers | CSR | Auth-gated mobile-first commerce experience |
| `app-admin` | Distributor admins | CSR | Desktop-oriented management tool |
| `app-ops` | Warehouse staff + drivers | CSR / PWA | Mobile task workflows, offline capability candidate |

All four applications share the same technology stack: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, React Hook Form, Zod, and TanStack Query.

Each application is responsible for:

- its own routing and page structure
- calling backend APIs via the shared API client
- presenting validation errors and workflow state

No application is responsible for:

- pricing authority
- stock reservation
- invoice creation
- Xero integration logic
- core business rules

#### State management

- **Server state:** TanStack Query (fetching, caching, invalidation of API data)
- **Client/UI state:** React context or state co-located with components; avoid a global store unless complexity demands it

---

### API Application

**Technology:** Node.js, TypeScript, NestJS

Responsible for:

- exposing versioned REST APIs
- authentication and authorisation
- validating requests
- enforcing permissions and tenant scoping
- orchestrating business workflows
- calling domain services
- returning data shaped for web and future mobile clients

The API should remain stateless where possible so it can scale horizontally.

#### API design conventions

- **Versioning:** URL path prefix — `/api/v1/`
- **Pagination:** Cursor-based pagination for lists (supports large datasets and consistent results under concurrent writes). Offset pagination only for fixed-size admin lists.
- **Error format:** RFC 7807 Problem Details (`application/problem+json`) for consistent error responses.
- **Idempotency:** Order creation and Xero-triggering endpoints must accept an `Idempotency-Key` header. Keys are stored in Redis with a short TTL to detect duplicate requests.
- **Rate limiting:** Applied at the API gateway or reverse proxy layer, not inside the application.

---

### Domain Modules

The backend should be organised into modules with clear responsibilities.

| Module | Responsibility |
|---|---|
| Auth & Users | Login, token issuance, refresh, users, memberships, roles and permissions |
| Organisations | Distributors, trade customers and platform-level organisation records |
| Trade Relationships | Links between distributors and trade customers, including account status and access |
| Discovery | Public distributor profiles and trade account requests |
| Catalogue | Products, categories, product types, product visibility and product metadata |
| Product Ingestion | Source connectors, field mappings, import jobs, product type inference and Xero item synchronisation |
| Pricing | Price lists, customer-specific pricing and price calculation |
| Basket & Orders | Basket, checkout, order creation, order status and order history |
| Inventory | Stock balances, reservations, adjustments and stock movements |
| Purchasing | Producer/supplier records, purchase orders and stock receiving |
| Fulfilment | Picking, packing and warehouse task workflows |
| Delivery | Driver assignments, delivery status, issues and signatures |
| Invoicing | Local invoice records, invoice status and invoice visibility |
| Xero Integration | Product import, invoice creation and invoice/payment synchronisation |
| Media | Images, videos, documents and signatures |
| Notifications | Emails, push notifications, alerts and customer invitations |
| Search | Product and distributor search indexing/querying |

---

### Postgres Database

Responsible for storing core business data, including:

- users
- organisations
- trade relationships
- products
- price lists
- customer pricing overrides
- orders
- order lines
- inventory balances
- stock movements
- purchase orders
- deliveries
- invoices
- Xero references
- audit history

Postgres is the source of truth for business data.

#### Soft deletes

Entities where audit history or operational integrity matters (orders, invoices, inventory movements, price lists) should use soft deletes (`deletedAt` timestamp) rather than hard deletes. Hard deletes are acceptable for entities with no audit significance (e.g. draft basket items).

---

### Redis

Responsible for:

- queue backing store (BullMQ)
- short-lived caching (catalogue queries, pricing results)
- rate limiting
- idempotency keys
- distributed locks (stock reservation, Xero job deduplication)
- temporary workflow state where appropriate

Redis should not be the source of truth for business data.

#### Caching strategy

- **Pattern:** Cache-aside. The application checks Redis before querying Postgres and populates the cache on miss.
- **What is cached:** Catalogue queries (product lists per distributor), resolved pricing for customer/product combinations, distributor public profiles.
- **Invalidation:** Event-driven. When a price list, product, or distributor profile is updated, the relevant cache keys are explicitly deleted. TTL is a fallback safety net, not the primary invalidation mechanism.

---

### Queue Workers

**Technology:** BullMQ with Redis

Responsible for asynchronous work, including:

- importing products from Xero
- creating invoices in Xero
- synchronising invoice/payment status
- sending notifications
- processing webhooks
- processing media
- refreshing search indexes
- running scheduled repeat-order jobs

Workers should be deployable and scalable separately from the API.

---

### Scheduler

**Implementation:** A separate `wholo-scheduler` process using BullMQ's repeatable job feature (not a process running inside the worker).

Responsible for recurring jobs, such as:

- periodic Xero synchronisation
- invoice status reconciliation
- payment status reconciliation
- scheduled repeat orders
- overdue invoice reminders
- low-stock alerts
- search index refreshes

---

### Object Storage

**Upload strategy:** Presigned URLs. The API issues a short-lived presigned upload URL; the client uploads directly from the browser to object storage. This avoids routing large media files (especially video) through the API tier.

Responsible for storing binary assets, including:

- product images
- product videos
- distributor branding
- delivery signatures
- uploaded documents
- generated PDFs

Postgres should store metadata and storage references only.

---

### Product Ingestion Pipeline

Wholo is the source of truth for all product data. Products may be bootstrapped from external sources but once in Wholo, Wholo owns them.

#### Xero product relationship

The Xero integration operates in two directions for products:

1. **Initial import (one-time bootstrap)** — Xero items are imported into Wholo to seed the initial catalogue. The distributor reviews and confirms before committing. The Xero `ItemID` is stored on each product as an external reference.

2. **Ongoing sync (Wholo → Xero)** — when products are created, updated or archived in Wholo, the corresponding Xero item is updated asynchronously via the worker queue. This keeps Xero's item list current so invoice line items can reference valid Xero item codes.

Other future ingestion sources (Excel, CSV, documents) are **ingestion only** — data flows into Wholo; Wholo does not write back to those sources.

#### Pipeline stages

```
Source trigger / file upload
        ↓
[Source Connector]      normalise source into raw records
        ↓
[Field Mapper]          apply stored mapping rules
        ↓
[Validator]             required fields, types, SKU uniqueness
        ↓
[Type Classifier]       infer product type (rule-based → LLM for unmatched)
        ↓
[Review Step]           distributor confirms before committing
        ↓
[Loader]                write to catalogue in a single transaction
        ↓
[Import Report]         per-record success / failure / warning
```

#### Source connectors

Connectors are pluggable; the interface is defined from day one. Only `XeroConnector` is implemented in v1. Excel, CSV and document connectors follow later.

#### Product type inference

Xero items have no product type concept. During import, product types are inferred using rule-based keyword matching first, then an LLM classification call for unmatched items. The distributor confirms or corrects during the review step.

#### Import job lifecycle

Import jobs are tracked in the database: `Pending → Processing → AwaitingReview → Committed / Failed / Cancelled`. The review step is optional per source — trusted sources (e.g. scheduled Xero syncs) can auto-commit.

---

### Xero

Responsible for:

- invoices
- invoice status
- payments
- customer balances
- credit notes
- accounting records
- product item list (kept in sync by Wholo)

Wholo remains responsible for:

- product catalogue (source of truth)
- ordering
- customer-specific pricing
- stock availability
- merchandising
- fulfilment and delivery workflows

---

## 7. Observability

Observability is provided by the **Grafana stack**, deployed via Helm charts alongside the application services.

| Tool | Role |
|---|---|
| Prometheus | Metrics collection from all services |
| Loki | Log aggregation |
| Tempo | Distributed tracing |
| Grafana | Dashboards and alerting across metrics, logs and traces |

### Logging

- Structured JSON logs from all services are shipped to Loki.
- Log levels: `error`, `warn`, `info`, `debug`.
- All HTTP requests logged with method, path, status code, duration and `distributorId` where applicable.
- Sensitive fields (passwords, tokens) must never be logged.

### Distributed tracing

- OpenTelemetry instrumentation in the API and worker processes, with traces sent to Tempo.
- Trace IDs propagate into BullMQ job metadata so async job chains (e.g. order → Xero invoice creation) are traceable end-to-end.

### Metrics & alerting

- Prometheus scrapes metrics from all services.
- Key metrics: API response times, queue depths, job failure rates, Xero sync lag, Postgres connection pool utilisation.
- Grafana alerts are configured for critical thresholds (error rate spikes, queue backlog, job failures).

### Health checks

- Each service exposes a `/health` endpoint covering its critical dependencies (Postgres, Redis).
- Kubernetes liveness and readiness probes point to `/health`.

---

## 8. Local Development

### Repository structure

All services live in a **monorepo** using pnpm workspaces, structured as:

```
apps/
  discovery/     # app-discovery — public SEO site
  portal/        # app-portal — trade customer ordering
  admin/         # app-admin — distributor management
  ops/           # app-ops — warehouse + driver workflows
  api/           # wholo-api — NestJS REST API
  worker/        # wholo-worker — BullMQ job processor
  scheduler/     # wholo-scheduler — recurring jobs
packages/
  ui/            # shared component library (shadcn/ui base)
  api-client/    # shared typed API client
  types/         # shared TypeScript types
```

### Containerisation

All application services are containerised (Docker). Each service (`app-discovery`, `app-portal`, `app-admin`, `app-ops`, `wholo-api`, `wholo-worker`, `wholo-scheduler`) has its own `Dockerfile`.

Deployment to Kubernetes is managed via **Helm charts**. The Helm chart covers all services, configuration, secrets references, ingress and scaling rules.

### Local environment

All services including infrastructure (Postgres, Redis) run via Docker Compose for local development.

```
docker compose up           # starts all services (Postgres, Redis, API, all web apps, worker)
pnpm dev:api                # alternatively, run the NestJS API locally in watch mode
pnpm dev:discovery          # alternatively, run app-discovery locally in watch mode
pnpm dev:portal             # alternatively, run app-portal locally in watch mode
pnpm dev:admin              # alternatively, run app-admin locally in watch mode
pnpm dev:ops                # alternatively, run app-ops locally in watch mode
pnpm dev:worker             # alternatively, run the BullMQ worker locally in watch mode
```

### Environment variables

- Local: `.env` files per package (not committed).
- Shared secrets for local dev: `.env.example` files with placeholder values committed.
- Production: managed via the deployment platform's secrets manager.

### Database migrations

Managed by Prisma Migrate.

- `pnpm db:migrate:dev` — applies pending migrations in development.
- `pnpm db:migrate:deploy` — applies migrations in CI/production (no interactive prompt).
- Migrations run as a pre-deployment step before the new API version starts.

---

## 9. Initial Deployment Shape

The initial deployment should be simple:

```text
app-discovery
app-portal
app-admin
app-ops
wholo-api
wholo-worker
wholo-scheduler
postgres
redis
object-storage
```

All services are containerised and deployed to Kubernetes via Helm charts.

### app-discovery

Public distributor discovery site. SSR + ISR, SEO-indexable, no auth required.

### app-portal

Trade customer ordering portal. Mobile-first, auth-gated.

### app-admin

Distributor admin and management tool. Desktop-oriented, auth-gated.

### app-ops

Warehouse and driver workflows. Mobile-first, PWA candidate for offline support.

### wholo-api

Hosts the REST API used by all web apps and future mobile apps.

### wholo-worker

Processes background jobs. Horizontally scalable — multiple replicas can be run safely.

### wholo-scheduler

Runs recurring jobs via BullMQ repeatable tasks. Runs as a single replica to avoid duplicate job scheduling.

### postgres

Stores core business data.

### redis

Supports queues, cache, locks and short-lived state.

### object-storage

Stores media and documents.

---

## 10. Key Architectural Decisions

1. Wholo will start as a web-based platform.
2. The UI will be mobile-first and responsive.
3. Native mobile apps may be added later.
4. The backend will expose APIs that can support both web and future mobile clients.
5. The backend will start as a modular monolith using NestJS, not microservices.
6. Postgres will be the primary database and source of truth.
7. Redis will be used for queues, caching, locks and temporary state.
8. Background jobs will be used for Xero integration, imports, notifications and media processing.
9. Product search will start in Postgres and evolve only when necessary.
10. Xero will be the accounting system of record.
11. Wholo will be the source of truth for catalogue, pricing, ordering, stock and merchandising.
12. Pricing logic will be centralised in the backend.
13. Inventory will be movement-based with optimistic locking (version column) for concurrent update safety.
14. Object storage will be used for media and documents, with presigned URL uploads.
15. Authentication will use local email/password initially, with the Passport.js strategy pattern enabling future IDP support.
16. A claims-based JWT approach: short-lived access tokens carrying user claims (userId, organisationId, role), plus database-backed refresh tokens (revocable).
17. Multi-tenancy will be enforced at the application layer via `distributorId` scoping on every tenant-owned query.
18. The frontend is split into four separate Next.js apps (`app-discovery`, `app-portal`, `app-admin`, `app-ops`) sharing a common component library and API client.
19. All services are managed in a pnpm monorepo with `apps/` and `packages/` structure.
20. All application services are containerised (Docker) and deployed to Kubernetes via Helm charts.
