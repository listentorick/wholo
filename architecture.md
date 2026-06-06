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
| NestJS or Fastify | API/backend framework |
| REST APIs | Application API style |
| OpenAPI | API documentation and future client generation |
| Postgres | Primary relational database |
| Redis | Caching, queues, locks and short-lived state |
| BullMQ | Background job processing |
| Object storage | Product images, videos, signatures and documents |
| Prisma | ORM  | 

### Integrations

| Integration | Purpose |
|---|---|
| Xero | Accounting, invoices, payments and customer balances |
| Payment provider | Future invoice/card payment support |
| Email/notification provider | Customer invitations, order updates and operational alerts |

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

## 3. What Needs to Scale

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

Pricing should be centralised in a pricing service and designed to support caching where safe.

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

## 4. Component Responsibilities

### Web Application

**Technology:** Next.js, React, Tailwind CSS, shadcn/ui

Responsible for:

- public distributor discovery pages
- trade customer portal
- distributor admin portal
- warehouse mobile web workflows
- driver mobile web workflows
- responsive mobile-first user experience
- calling backend APIs
- presenting validation errors and workflow state

Not responsible for:

- pricing authority
- stock reservation
- invoice creation
- Xero integration logic
- core business rules

---

### API Application

**Technology:** Node.js, TypeScript, NestJS or Fastify

Responsible for:

- exposing versioned REST APIs
- authentication and authorisation
- validating requests
- enforcing permissions
- orchestrating business workflows
- calling domain services
- returning data shaped for web and future mobile clients

The API should remain stateless where possible so it can scale horizontally.

---

### Domain Modules

The backend should be organised into modules with clear responsibilities.

| Module | Responsibility |
|---|---|
| Auth & Users | Login, users, memberships, roles and permissions |
| Organisations | Distributors, trade customers and platform-level organisation records |
| Trade Relationships | Links between distributors and trade customers, including account status and access |
| Discovery | Public distributor profiles and trade account requests |
| Catalogue | Products, categories, product visibility and product metadata |
| Pricing | Price lists, customer-specific pricing and price calculation |
| Basket & Orders | Basket, checkout, order creation, order status and order history |
| Inventory | Stock balances, reservations, adjustments and stock movements |
| Purchasing | Producer/supplier records, purchase orders and stock receiving |
| Fulfilment | Picking, packing and warehouse task workflows |
| Delivery | Driver assignments, delivery status, issues and signatures |
| Invoicing | Local invoice records, invoice status and invoice visibility |
| Xero Integration | Product import, invoice creation and invoice/payment synchronisation |
| Media | Images, videos, documents and signatures |
| Notifications | Emails, alerts and customer invitations |
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

---

### Redis

Responsible for:

- queue backing store
- short-lived caching
- rate limiting
- idempotency keys
- distributed locks
- temporary workflow state where appropriate

Redis should not be the source of truth for business data.

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

Responsible for storing binary assets, including:

- product images
- product videos
- distributor branding
- delivery signatures
- uploaded documents
- generated PDFs

Postgres should store metadata and storage references only.

---

### Xero

Responsible for:

- invoices
- invoice status
- payments
- customer balances
- credit notes
- accounting records

Wholo remains responsible for:

- product catalogue
- ordering
- customer-specific pricing
- stock availability
- merchandising
- fulfilment and delivery workflows

---

## 5. Initial Deployment Shape

The initial deployment should be simple:

```text
wholo-web
wholo-api
wholo-worker
wholo-scheduler
postgres
redis
object-storage
```

### wholo-web

Hosts the responsive web application.

### wholo-api

Hosts the REST API used by the web app and future mobile apps.

### wholo-worker

Processes background jobs.

### wholo-scheduler

Runs recurring jobs. This can make use of BullMQ scheduled tasks

### postgres

Stores core business data.

### redis

Supports queues, cache, locks and short-lived state.

### object-storage

Stores media and documents.

---

## 6. Key Architectural Decisions

1. Wholo will start as a web-based platform.
2. The UI will be mobile-first and responsive.
3. Native mobile apps may be added later.
4. The backend will expose APIs that can support both web and future mobile clients.
5. The backend will start as a modular monolith, not microservices.
6. Postgres will be the primary database and source of truth.
7. Redis will be used for queues, caching, locks and temporary state.
8. Background jobs will be used for Xero integration, imports, notifications and media processing.
9. Product search will start in Postgres and evolve only when necessary.
10. Xero will be the accounting system of record.
11. Wholo will be the source of truth for catalogue, pricing, ordering, stock and merchandising.
12. Pricing logic will be centralised in the backend.
13. Inventory will be movement-based.
14. Object storage will be used for media and documents.
