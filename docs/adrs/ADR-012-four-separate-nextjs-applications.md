# ADR-012: Four separate Next.js frontend applications

## Status
Accepted

## Context
The platform serves four distinct personas with fundamentally different UX requirements:

- **Public discovery** — SEO-indexable, no authentication, focused on converting prospective trade customers.
- **Trade customer portal** — mobile-first commerce experience, auth-gated, repeat ordering focused.
- **Distributor admin** — desktop-oriented management tool, data-dense, complex workflows.
- **Warehouse and driver (ops)** — mobile task apps, low-friction, offline capability required.

A single Next.js application could serve all personas via route groups, but mixing SSR, ISR and CSR rendering strategies and vastly different UX patterns in one app increases complexity and couples unrelated surfaces together. Separate apps allow each to be optimised, deployed and iterated on independently.

## Decision
The frontend is split into **four separate Next.js applications**:

| App | Persona | Rendering strategy |
|---|---|---|
| `app-discovery` | Public / prospective trade customers | SSR + ISR — SEO-indexable |
| `app-portal` | Trade customers | CSR — personalised, auth-gated |
| `app-admin` | Distributor admins | CSR — personalised, auth-gated |
| `app-ops` | Warehouse staff + drivers | CSR / PWA — mobile task workflows, offline candidate |

All four apps share a common component library (`packages/ui`) and typed API client (`packages/api-client`) via the monorepo.

## Consequences
- Each app can be developed, deployed and scaled independently.
- `app-ops` can be progressively enhanced toward a PWA with offline support without affecting other apps.
- Four deployments to manage instead of one; the Helm chart handles all four.
- Shared UI components and the API client must be versioned and kept in sync across apps.
- Onboarding a new engineer requires understanding which app covers which persona.
