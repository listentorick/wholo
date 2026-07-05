# ADR-049 — JWT Validation via Internal JWKS Without Issuer Verification

**Status**: Accepted
**Date**: 2026-07-05
**Deciders**: Rick Walsh

---

## Context

Keycloak is reachable under two names that can never agree:

- **Browsers** use the public hostname (`https://auth.<domain>`, via the
  Traefik ingress). Tokens are therefore issued with
  `iss = https://auth.<domain>/realms/wholo`.
- **Backends** (`apps/api`, `apps/portal-api`, `apps/admin-api`) reach
  Keycloak over cluster DNS (`KEYCLOAK_URL = http://wholo-keycloak:8080`)
  and fetch the realm's JWKS from there to verify token signatures.

Standard OIDC validation would also compare the token's `iss` claim against
the issuer the validator knows — which here would always fail, because the
backends know the internal name and the tokens carry the public one. This
split-horizon situation exists in every environment (local Docker Desktop
and live k3s alike).

This arrangement predates this ADR; it was discovered undocumented while
preparing the live environment (ADR-048). A well-meaning "fix" adding the
missing issuer check would break authentication everywhere, so the decision
is recorded explicitly.

## Decision

The JWT strategies in all three backends validate tokens by **signature
only**, against the JWKS fetched from the internal Keycloak service URL for
the `wholo` realm. **No `issuer` option is configured; the `iss` claim is
not verified.**

Keycloak's hostname configuration (`KC_HOSTNAME`) remains the public name,
so browser-facing URLs and token issuer values are consistent for clients;
only server-side validation ignores the issuer string.

## Why this is sound (today)

Signing keys are **per-realm**. The backends' trust anchor is not the `iss`
string but the key material itself: they fetch keys exclusively from
`/realms/wholo/protocol/openid-connect/certs` on Wholo's own private,
in-cluster Keycloak. Any token that passes the signature check was
necessarily signed by that exact realm — the issuer claim would be
redundant confirmation, not additional security.

Note the scope: Wholo's *business* multi-tenancy (many distributors and
trade customers) is irrelevant here. All of them are users in the single
`wholo` realm; tokens carry only `sub`, and organisation/role resolution
happens in Wholo's database (Membership lookup). Tenant growth does not
change the trust model of token validation.

## What it trades away

- No defence-in-depth if the trust anchor assumption ever breaks — i.e. if
  the JWKS endpoint the backends consult could serve keys for anything
  other than "Wholo's own realm on Wholo's own Keycloak".
- Tokens issued for the same realm via *different public hostnames* (e.g.
  an old domain still aliased to the ingress) are indistinguishable. With
  one canonical hostname per environment this is moot.

## Revisit Triggers

Re-enable issuer verification (validating against the public issuer URL, or
a configured expected-issuer value) if either:

- The backends ever validate against a Keycloak instance that is **not
  exclusively Wholo's** — e.g. consolidation onto a shared/company-wide SSO
  server or a managed identity service hosting realms for multiple
  products.
- The realm becomes deliberately reachable under **multiple public
  hostnames** (multi-domain or white-label auth).

Growth in distributors, trade customers, or realm users explicitly does
**not** trigger this.

## Alternatives Rejected

| Option | Reason rejected |
|---|---|
| Validate `iss` against the public URL while fetching JWKS internally | Works, but couples every backend deployment to the browser-facing domain for zero security gain under the current trust anchor; adds a per-environment config value that must never drift from `KC_HOSTNAME` |
| Backends fetch JWKS via the public URL | Hairpins auth-critical traffic through the ingress; couples backend availability to external DNS/TLS; slower and no safer |
| Terminate split-horizon DNS so one name works everywhere | Infrastructure complexity (cluster-internal DNS overrides) to solve a problem the signature check already solves |
