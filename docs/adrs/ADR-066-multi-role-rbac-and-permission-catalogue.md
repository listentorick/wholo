# ADR-066 — Multi-Role RBAC and Central Permission Resolution

**Status**: Accepted
**Date**: 2026-09-18
**Deciders**: Rick Walsh
**Related**: ADR-010 (multi-tenancy distributorId scoping), ADR-011 (role-based access control — extended by this ADR), ADR-026 (dual BFF architecture), ADR-041/042 (order-as), ADR-052 (avoid Prisma-unsupported schema constructs), ADR-053 (admin-api organisation-type gate)

---

## Context

ADR-011 defined a single `Role` per `Membership`, but nothing in the code enforced role-based permissions. Authorization was:

- **Tenant scope** — `DistributorAccessGuard` checks that the `:distributorId` path param is one of the caller's organisations. It never looks at the role.
- **Organisation type** — `apps/admin-api` rejects any caller whose organisation is not a `DISTRIBUTOR` (ADR-053).
- **One inline role check** — `apps/admin-api`'s order-as controller compared `req.user.role` to `'DISTRIBUTOR_ADMIN'`. This lived in a BFF, not in `apps/api`, the authority (ADR-026).

A user could hold only one role per organisation, and every distributor-org member could call every admin endpoint.

## Decision

### 1. Multiple roles per membership

A new join table `MembershipRole { membershipId, role }` with `@@unique([membershipId, role])` stores the roles. A user still has exactly one `Membership` per organisation (`@@unique([userId, organisationId])`, unchanged).

A join table was chosen over a `Role[]` array column because "no duplicate role assignments" is then a database constraint that `schema.prisma` can fully describe. Array-element uniqueness cannot be expressed in Prisma's schema DSL and would fall back to application code (ADR-052).

The `Role` enum keeps its name and values: `PLATFORM_ADMIN`, `DISTRIBUTOR_ADMIN`, `WAREHOUSE_STAFF`, `DRIVER`, `TRADE_CUSTOMER`. Today only `DISTRIBUTOR_ADMIN` and `TRADE_CUSTOMER` are ever assigned; the others are defined so the taxonomy is coherent when they come into use.

### 2. Permissions are code, not data

Roles and permissions are stored and resolved by Stocdup — never in Keycloak. The role→permission mapping is a static table in code (`apps/api/src/auth/role-permissions.ts`). Custom roles, configurable mappings and per-user overrides are out of scope.

The permission enum lives in `packages/types/src/permissions.ts`. `apps/api` is the sole enforcement point; the BFFs (`admin-api`, `portal-api`) pass the resolved permission strings through and enforce nothing themselves.

### 3. Resolution rule (security invariant)

**Effective permissions are the union of the roles on the one membership in scope for the request — never a union across a user's memberships at other organisations.**

- `JwtStrategy` attaches every membership (`{ organisationId, roles[] }`) to `req.user`.
- `PermissionsGuard` picks the membership whose `organisationId` equals the `:distributorId` route param (falling back to `req.user.organisationId` when the route has none), unions `ROLE_PERMISSIONS[role]` over that membership's roles, and throws `403` if any required permission is missing.
- A user who is `DISTRIBUTOR_ADMIN` at org A and `WAREHOUSE_STAFF` at org B gets only `WAREHOUSE_STAFF` permissions on org B's resources. This is covered by `apps/api/test/permissions-cross-org-leak.integration-spec.ts`.
- Under an order-as session the guard still evaluates the **caller's own** membership, not the impersonated customer's. Guards run before the `OrderAsInterceptor` handler logic, and the impersonation context is stored separately from `request.user`.

### 4. Declaring permissions

```ts
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/delivery-routes')
export class DeliveryRoutesController {
  @Get()  @RequirePermissions(Permission.DELIVERY_READ)   findAll() {}
  @Post() @RequirePermissions(Permission.DELIVERY_MANAGE) create() {}
}
```

`@RequirePermissions()` works at class or method level; the method level wins. `PermissionsGuard` is opt-in: a route with no `@RequirePermissions` is not permission-checked. It is always listed **alongside** `DistributorAccessGuard`, never merged into it — tenant scope and permissions are separate concerns.

### 5. `/auth/me`

`GET /auth/me` now returns `roles: Role[]` and `permissions: Permission[]` for the selected membership, in place of the singular `role`. Membership selection is unchanged: a `DISTRIBUTOR`-organisation membership is preferred (ADR-053). The UI may use `permissions` for visibility; API enforcement remains mandatory.

### 6. Order-as initiation moved into `apps/api`

`POST /distributors/:distributorId/order-as/sessions` now requires `ORDER_AS_INITIATE` in `apps/api`. The inline `role !== 'DISTRIBUTOR_ADMIN'` check in `admin-api` was deleted. Only `DISTRIBUTOR_ADMIN` (and `PLATFORM_ADMIN`) hold it, so behaviour is unchanged.

---

## Permission catalogue

Naming is `resource:action`. `read` and `manage` are only split where a read-only role is plausible; everything else is manage-only for now.

| Permission | String | Guards |
|---|---|---|
| `ORDER_AS_INITIATE` | `order-as:initiate` | Start an order-on-behalf session: `POST D/order-as/sessions` |
| `ORDERS_READ` | `orders:read` | Admin order list, detail, audit log, delivery outcome, needs-attention count |
| `ORDERS_MANAGE` | `orders:manage` | Accept, reject, cancel an order |
| `CATALOGUE_READ` | `catalogue:read` | **Reserved** — no route requires it yet |
| `CATALOGUE_MANAGE` | `catalogue:manage` | Catalogues, products, product types (reads included), trade-relationship catalogue assignment |
| `CUSTOMERS_READ` | `customers:read` | Customer list, organisation search |
| `CUSTOMERS_MANAGE` | `customers:manage` | Create, update, remove, invite, accept/decline request, suspend, unsuspend, activate |
| `PRICE_LISTS_MANAGE` | `price-lists:manage` | Price lists, rules, set default, product pricing, trade-relationship price-list assignment |
| `SUPPLIERS_MANAGE` | `suppliers:manage` | Supplier list |
| `DELIVERY_READ` | `delivery:read` | Delivery profiles, cut-off rules, routes, route customers, delivery days, run manifest, reschedule preview (reads) |
| `DELIVERY_MANAGE` | `delivery:manage` | Create/update/delete profiles, cut-off rules, routes, route customers, runs, run orders; reschedule an order |
| `ACCOUNTING_READ` | `accounting:read` | Connection status, sync status, contact/product/tax-type lists, needs-attention counts, bulk-import job status |
| `ACCOUNTING_IMPORT` | `accounting:import` | Bring data in and link it: sync now, import as new, match, confirm/ignore/unlink/acknowledge mappings, bulk import, invoice-export retry |
| `ACCOUNTING_MANAGE` | `accounting:manage` | The connection itself: connect (Xero authorisation URL), update connection settings, disconnect |
| `SETTINGS_MANAGE` | `settings:manage` | Distributor settings (read and update) |
| `ASSET_IMAGES_MANAGE` | `asset-images:manage` | Upload, list, delete, reorder asset images |
| `ANALYTICS_READ` | `analytics:read` | Order summary/trend, customer and product rankings, action items |
| `TAX_TYPES_READ` | `tax-types:read` | List and view tax types (the product form reads them) |
| `TAX_TYPES_MANAGE` | `tax-types:manage` | Create, update and deactivate tax types (the controller's fail-closed default; the two GETs override it with `tax-types:read`) |
| `TEAM_MANAGE` | `team:manage` | Staff invitations and team members: invite, resend, revoke, change roles, remove (ADR-067) |
| `ADMIN_NOTIFICATIONS_MANAGE` | `admin-notifications:manage` | **Reserved** — notifications are self-scoped (`UserAccessGuard`), so no route uses it |

Integration permissions follow one shape per integration type: `<type>:read` (view), `<type>:import` (bring data in, link it, sync, retry exports) and `<type>:manage` (the connection itself). Accounting is the first; warehouse and ERP integrations will add `warehouse:*` and `erp:*` the same way. Each stronger permission is only ever granted together with its `read`, so read-only screens always load (asserted in `role-permissions.spec.ts`).

`D` = `/distributors/:distributorId`, all under `/api/v1`. The per-route mapping lives in the controllers; `grep -rn RequirePermissions apps/api/src` is the source of truth, and this table is the summary.

## Role → permission matrix

Source: `apps/api/src/auth/role-permissions.ts`.

| Permission | PLATFORM_ADMIN | DISTRIBUTOR_ADMIN | OPERATIONS_MANAGER | WAREHOUSE_STAFF | DRIVER | TRADE_CUSTOMER |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `order-as:initiate` | ✓ | ✓ | ✓ |  |  |  |
| `orders:read` | ✓ | ✓ | ✓ | ✓ |  |  |
| `orders:manage` | ✓ | ✓ | ✓ | ✓ |  |  |
| `catalogue:read` | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| `catalogue:manage` | ✓ | ✓ | ✓ |  |  |  |
| `customers:read` | ✓ | ✓ | ✓ | ✓ |  |  |
| `customers:manage` | ✓ | ✓ | ✓ |  |  |  |
| `price-lists:manage` | ✓ | ✓ | ✓ |  |  |  |
| `suppliers:manage` | ✓ | ✓ | ✓ |  |  |  |
| `delivery:read` | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| `delivery:manage` | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| `accounting:read` | ✓ | ✓ | ✓ |  |  |  |
| `accounting:import` | ✓ | ✓ | ✓ |  |  |  |
| `accounting:manage` | ✓ | ✓ |  |  |  |  |
| `settings:manage` | ✓ | ✓ |  |  |  |  |
| `asset-images:manage` | ✓ | ✓ | ✓ |  |  |  |
| `analytics:read` | ✓ | ✓ | ✓ |  |  |  |
| `tax-types:read` | ✓ | ✓ | ✓ |  |  |  |
| `tax-types:manage` | ✓ | ✓ | ✓ |  |  |  |
| `team:manage` | ✓ | ✓ |  |  |  |  |
| `admin-notifications:manage` | ✓ | ✓ | ✓ |  |  |  |

## Endpoints that do not use permissions

These are gated by other mechanisms and are intentionally outside `@RequirePermissions`:

| Surface | Gate |
|---|---|
| Portal/customer routes (`cart`, customer `orders`, `organisations/:id…`, customer catalogue, delivery availability) | JWT; ownership checked against the credential (`@ActingCustomerId()`) |
| `GET/POST /distributors/:distributorId/customers/:customerId` (self-view, request access) | JWT + inline check: the path id must be the caller's own customer, or the caller must be staff of the distributor. A trade customer has no membership at the distributor, so a `:distributorId`-scoped permission check would wrongly reject the self-view |
| `/users/:userId/notifications…` | JWT + `UserAccessGuard` (self-access) |
| `POST /order-as/sessions/exchange`, `/end` | JWT; session bound to the admin's user id |
| `POST /distributors`, `POST /portal/invitations/accept` | Keycloak identity (no Wholo user yet) |
| `/delivery-links…` | Delivery token (ADR-059) |
| `POST /accounting/xero/callback`, `/health`, `GET /distributors/:slug` | Public |

## Migration and rollout

- `Membership.role` (the legacy single role) is **kept** for now. Every write site writes it and a `MembershipRole` row; every read site reads `roles`.
- **Live-rollout safety net:** `JwtStrategy` and `AuthService.getProfile` union the legacy `role` column into each membership's roles. Correctness never depends on the backfill having run.
- `pnpm --filter @wholo/api db:membership-roles:backfill` (idempotent) creates a `MembershipRole` row for every existing membership. It is required only before the follow-up migration that drops `Membership.role`.
- The schema migration (`add_membership_roles`) is a pure Prisma diff with no hand-written SQL.

## Consequences

**Positive**
- One enforcement point in `apps/api`; BFFs stay pure proxies; the order-as check can no longer be bypassed by calling `apps/api` directly.
- Duplicate role assignment is impossible at the database level.
- Adding a role or permission is a code change to two files (`permissions.ts`, `role-permissions.ts`).

**Negative / known gaps**
- **Reads that require a manage permission.** Catalogue, products, product types, suppliers, price lists, settings, asset images, tax types and catalogue-assignment reads all require `*:manage`. A `WAREHOUSE_STAFF` user cannot list products in admin even though the role holds `catalogue:read`. Nothing assigns that role today; split these before it is used.
- `CATALOGUE_READ` and `ADMIN_NOTIFICATIONS_MANAGE` are unused by any route.
- **Runtime dependency on `@wholo/types`.** `apps/api` previously used the package for types only, which TypeScript erases. The `Permission` enum is a runtime value, so the `apps/api` image must ship the package and its workspace link (`apps/api/Dockerfile` runner stage). The package's `dist` must also be built before `apps/api` is compiled, tested or started (turbo `dependsOn: ["^build"]` covers CI). Jest, `tsc` and the integration tests do not catch a missing link; only the production image does.
- `Membership.role` is duplicated state until the follow-up drop migration.

## Out of scope

Custom roles; configurable role→permission mappings; per-user permission overrides; federated identity; storing roles or permissions in Keycloak; any change to tenant/resource ownership controls.
