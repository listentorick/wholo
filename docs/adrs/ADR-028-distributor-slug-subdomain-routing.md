# ADR-028: Distributor slug and subdomain-to-path routing

## Status

Accepted

## Context

The customer portal (`apps/portal`) serves trade customers on behalf of a specific distributor. A single deployed portal instance must present the correct distributor's catalogue, branding, and product data depending on which distributor the customer is accessing.

Two properties define the challenge:

**Distributor isolation.** A trade customer at "Vine & Co" must only see Vine & Co's products. Leaking products, pricing, or customer data across distributor boundaries is a hard requirement.

**Human-readable, bookmarkable URLs.** A trade customer should be able to navigate to their distributor's portal directly. Using an internal database ID (`/cm3x9...`) is unfriendly and opaque. A stable, readable identifier is preferable.

### Options considered

**Option A — Subdomain per distributor, server-side tenant lookup.**  
Each distributor gets a subdomain: `vine-and-co.wholo.com`. The Next.js app reads the `Host` header from the incoming request (or a forwarded header set by the ingress) and maps it to a distributor at runtime.

Rejected for v1 because:
- Reading `Host` headers in Next.js App Router requires server components or middleware; the portal is currently client-rendered for simplicity.
- Wildcard TLS certificate provisioning (`*.wholo.com`) and per-tenant DNS records add operational overhead before the product is validated.
- Local development requires `/etc/hosts` entries or a local DNS resolver for each distributor slug.

**Option B — Path prefix, resolved from the URL.**  
The URL carries the distributor slug as the first path segment: `wholo.com/vine-and-co`. In production, nginx rewrites requests from `vine-and-co.wholo.com/*` to `wholo.com/vine-and-co/*` before they reach the Next.js server. The Next.js app sees only path-based routing and never inspects the `Host` header.

Chosen. Reasons:
- Next.js dynamic segments (`[distributorSlug]`) resolve the identifier without any server-side header inspection.
- The rewrite is a single nginx `proxy_pass` rule; no per-tenant DNS or wildcard certificates are required until the product needs them.
- Local development works without any DNS configuration — developers access `localhost:3010/vine-and-co` directly.
- The same URL structure works if the subdomain rewrite is never deployed: public-facing URLs remain valid as plain paths.

**Option C — Auth-token-derived distributor (implicit routing).**  
After login the JWT contains the customer's `organisationId`. The app looks up which distributor(s) they have an active `TradeRelationship` with and renders that distributor's catalogue automatically, with no distributor identifier in the URL.

Rejected because:
- A trade customer may have relationships with multiple distributors; there is no single distributor to infer from the token.
- The URL no longer identifies the resource. Bookmarks and shared links break if the user later gains or loses a relationship.
- It conflates authentication (who are you?) with routing (which portal are you visiting?).

## Decision

### 1. Distributor slug on `Organisation`

A `slug` field is added to the `Organisation` model:

```prisma
model Organisation {
  slug  String?  @unique
  ...
}
```

**Format rule:** lowercase alphanumeric and hyphens only (`/^[a-z0-9-]+$/`), 3–63 characters. This matches DNS label constraints so the same value works as both a URL path segment and a subdomain.

**Assignment:** The slug is set when the distributor is created. Existing distributors receive a backfill migration that derives the slug from the organisation name via:

```sql
lower(trim(both '-' from regexp_replace(name, '[^a-z0-9]+', '-', 'gi')))
```

The slug is immutable after creation in v1 — changing it would invalidate any bookmarks or external links customers have saved.

Only `Organisation` records of type `DISTRIBUTOR` are assigned slugs. Trade customer organisations do not receive slugs and the field remains `NULL` for them.

### 2. Portal URL structure

| URL | Page |
|---|---|
| `/<slug>` | Distributor home — welcome dashboard, action tiles |
| `/<slug>/products` | Product catalogue — browsable product list |
| `/login` | Login (distributor-agnostic; `?returnUrl=/<slug>` preserves context) |

The Next.js App Router uses a `[distributorSlug]` dynamic segment as the root of all distributor-scoped pages. The slug is available via `useParams()` in every child route without prop-drilling.

### 3. Nginx subdomain rewrite (production)

In production, the ingress rewrites subdomain requests to the path-prefix form before they reach the portal:

```nginx
# vine-and-co.wholo.com/* → wholo.com/vine-and-co/*
server {
    server_name ~^(?<slug>[^.]+)\.wholo\.com$;

    location / {
        proxy_pass http://portal-service/$slug$request_uri;
        proxy_set_header Host wholo.com;
    }
}
```

The Next.js application has no awareness of subdomains. From its perspective every request is a plain path-routed request — `/$slug/...`. This keeps the frontend simple and makes the subdomain rewrite a pure infrastructure concern that can be added, changed, or removed without touching application code.

### 4. Catalogue API

The public catalogue endpoint resolves the distributor from the slug before returning products:

```
GET /api/v1/catalogue/:slug/products
```

No authentication is required to browse the catalogue. The slug identifies the distributor; the API returns only `ACTIVE` products scoped to that distributor. This endpoint intentionally does not require a JWT so that future unauthenticated browsing (discovery portal, QR-code menus) is possible without a schema change.

## Consequences

- **Slug stability matters.** Once a distributor is live, changing their slug invalidates all customer bookmarks and any external links (e.g. from printed marketing material). Slug changes should be treated as a breaking change and require a redirect to be configured.
- **Slug uniqueness is enforced at the database level** via a `UNIQUE` constraint. A `409 Conflict` is returned if a duplicate slug is requested at creation time.
- **No per-distributor DNS in development.** Developers access portals via `localhost:3010/<slug>`. The nginx rewrite layer only applies in staging and production.
- **Multi-distributor customers navigate by URL.** A trade customer who buys from two distributors has two separate URLs. There is no unified cross-distributor home page in v1.
- **The root `/` route is not distributor-scoped.** It remains a distributor-agnostic dashboard. In practice, users always arrive via `/<slug>` because of the nginx rewrite; the root page is a fallback for direct portal access.
