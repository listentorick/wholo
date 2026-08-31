# ADR-060 — Marketing site (`apps/www`): standalone Next.js app, email-only lead capture, self-hosted analytics

**Status**: Accepted
**Date**: 2026-08-31
**Deciders**: Rick Walsh
**Related**: ADR-026 (BFF architecture), ADR-048 (live environment k3s), ADR-058 (PWA over native), ADR-059 (first public endpoint in apps/api)

---

## Context

Stocdup needs a public marketing surface at `www.stocdup.com` — a
demand-validation landing page aimed at independent UK food & drink
wholesalers. It has a single conversion action ("Register interest"), two
hero-message experiments, and a confirmation state. It is not part of any
authenticated product surface: no login, no domain data, no `apps/api` call.

The questions this ADR settles:

1. Where does this code live and how is it built/served?
2. How are lead submissions handled without a database?
3. How is it instrumented, given the product's cost and privacy posture?

## Decision

### 1. A new standalone workspace `apps/www` (`@wholo/www`), not a route in an existing app

Next.js 15 App Router / React 19 / Tailwind 3.4, matching `apps/portal`'s
toolchain (copied config — there is still no shared `ui`/`config`/`tsconfig`
package in this repo). Unlike every other frontend, `www` has **no BFF
wrapper**: it re-enables `output: 'standalone'` and ships as its own image
`ghcr.io/listentorick/wholo/www`, `CMD ["node", "apps/www/server.js"]`, port
**3040**.

Rationale: the marketing site has a different release cadence, a different
audience, zero shared code with the product, and must not be able to reach
`apps/api` even by accident. A separate deployable with its own ingress
(`ingress.hosts.www` → a Traefik `IngressRoute`) keeps that boundary
physical. It sits behind the same Cloudflare → WAF → Traefik chain as the
rest (ADR-048); the bare apex is a Cloudflare Redirect Rule to `www.`
because the WAF's origin cert is `*.stocdup.com` and does not cover the
apex.

### 2. Lead capture is email-only, with its own mail code — no database, no reuse of `apps/api`'s mail module

`POST /api/register` (a Next route handler, `runtime = 'nodejs'`) validates
with zod and sends one email per submission via a bare
`nodemailer.createTransport` in `apps/www/src/lib/email.ts`, reading its own
`WWW_SMTP_*` env. Same PurelyMail account as the rest of the stack, ideally
a dedicated `leads@stocdup.com` sender; local dev points at in-cluster
MailHog.

Rationale: there is no CRM requirement yet — a human reads the inbox. A
database (and the schema, migration, ownership and backup weight it brings)
is not justified for "email me the form". `apps/api`'s mail module was
deliberately **not** imported: pulling it in would couple the marketing
image to the domain API's dependency graph and config surface for no
benefit. If lead volume ever warrants persistence, that is a future ADR.

Anti-spam is a hidden honeypot field plus a minimum time-to-submit trap;
both failure modes return a fake `200`. Cloudflare Turnstile is the
reserved next step if spam appears. Per-instance in-memory rate limiting
only (no shared store) — acceptable for a single low-traffic replica.

### 3. Analytics is self-hosted Plausible, proxied first-party; cookieless

Plausible Community Edition runs in-cluster (`plausible.enabled`) with its
own `plausible` database on the shared Postgres and a new
`wholo-clickhouse` event store (its own PVC). **No ingress** — the
dashboard is reached by `kubectl port-forward`. The `www` app proxies
`/js/script.js` and `/api/event` to it via `next.config.ts` rewrites, so
analytics is served first-party from `www.stocdup.com` (ad-blocker
resistant, and Plausible never needs to be public).

Rationale: £0 marginal cost, no third-party data processor, cookieless so
no consent banner. ClickHouse is the one heavy new dependency (~1 GiB RAM);
that cost was accepted explicitly as the price of self-hosting rather than
using Plausible Cloud or GA4.

Analytics only records anything when the `www` **image** was built with
`WWW_PLAUSIBLE_ENABLED=1` (the flag is baked into the bundle at Docker build
time, like `NEXT_PUBLIC_KEYCLOAK_URL` for the other frontends); the Helm
`plausible.enabled` flag only runs the server.

### 4. Hero A/B split is cookie-bucketed in middleware, behind a build flag

`middleware.ts` assigns a `hero_variant` cookie (even split) only when
`WWW_EXPERIMENT_HERO_VARIANTS` names two or more variants; otherwise `/`
stays fully static and renders a single hero. The variant travels as a prop
on every analytics event.

### 5. Motion: GSAP + Lenis, no React animation library

Scroll/parallax scenes use GSAP + ScrollTrigger driven by Lenis smooth
scroll (dynamic-imported, client-only). Component-level reveals and hover
are plain CSS transitions + one `IntersectionObserver` — Framer Motion was
trialled and removed (it was 34 KB for effects that are cheap in CSS once
the earlier custom-cursor idea was dropped). Everything is gated behind
`prefers-reduced-motion` and coarse-pointer detection.

## Consequences

- Fifth CI image (`www`) in the `build-images` matrix; fifth `sha-` tag to
  bump in `values.live.yaml` each promote.
- New in-cluster stateful component (ClickHouse) with the same node-local
  storage backup caveat as Postgres (ADR-048). `plausible.secretKeyBase` /
  `totpVaultKey` are new stable secrets — rotating them drops sessions/2FA.
- `apps/www` deliberately duplicates a small amount of config and the mail
  transport rather than sharing. This is consistent with the repo's current
  no-shared-package reality and the desire to keep the marketing image's
  dependency graph minimal; revisit if a third consumer of "send an email"
  appears.
- The site presents the product as complete (no pilot / early-access
  framing) per the approved copy direction — a product/marketing decision,
  recorded here only so a later reader does not "fix" it back.
- Deployment specifics (DNS, Cloudflare redirect rule, GitHub build vars,
  Plausible dashboard access) live in `docs/deployment/live-k3s.md`;
  routing in `docs/deployment/url-map.md`.
