# ADR-009: Claims-based JWT authentication with local login first and IDP extensibility

## Status
Accepted

## Context
The platform serves multiple distinct user types (distributor admins, warehouse staff, drivers, trade customers, platform admins) each with different roles and permissions. Authentication must work for the initial web app and future native mobile clients, and must be extensible to support external identity providers (Google, Microsoft, or a managed identity service) without a rewrite.

## Decision
Authentication uses **claims-based JWTs**:

- **Access tokens** are short-lived JWTs (15 minutes) signed with a server secret. The payload includes `userId`, `organisationId` and `role`, allowing downstream authorization decisions without additional database lookups.
- **Refresh tokens** are longer-lived, stored in the database (enabling revocation) and rotated on each use.

**Phase 1 (initial):** Local email/password login using bcrypt password hashing.  
**Phase 2 (future):** External IDP support via OAuth 2.0 / OIDC added as additional Passport.js strategies without changing the token issuance or authorization infrastructure.

NestJS Passport.js is used as the authentication strategy layer with the following strategies:

| Strategy | Package | Purpose |
|---|---|---|
| `passport-local` | `@nestjs/passport` + `passport-local` | Phase 1 — email/password login, validates credentials against the local user database |
| `passport-jwt` | `@nestjs/passport` + `passport-jwt` | Permanent — validates the JWT access token on every authenticated request |

Additional strategies (e.g. `passport-google-oauth20`, `passport-azure-ad`) can be added in phase 2 without changing the JWT validation or authorization infrastructure.

## Consequences
- The API tier is stateless with respect to authentication — access tokens are verified by signature without a database call.
- Token revocation applies to refresh tokens only; compromised access tokens remain valid until they expire (mitigated by the short 15-minute TTL).
- Adding an IDP later requires implementing a new Passport strategy but does not require changes to the authorization layer or token format.
- Mobile apps can use the same token-based flow without session cookies.
