# Native Delivery Planning PBI — Milestone Plan

## Context

`Stocdup_PBI_Native_Delivery_Planning.docx` defines a feature where distributor staff define reusable **Delivery Routes** (named customer groupings with a usual drop order, e.g. "Yorkshire": Blackbird, Old Mill, Hare & Hounds) once. When an order is accepted it auto-allocates into that day's **Delivery Run** for the customer's route (lazily created — a dated run only exists once it has a delivery). Staff then work a daily board: move deliveries between OPEN runs, override a run's driver, and mark a run **READY** (locking membership/sequence/driver until an explicit, audited **Reopen**).

This replaces today's reality — dispatch depends on a manager manually directing staff — with an exception-led daily workflow, while explicitly **not** building any delivery-provider (e.g. SolBox) integration. The domain model does carry nullable provider-compatibility columns (`source`, `externalProvider`, `externalId`, `vehicleId`/`vehicleName`, `providerStatus`, `providerData`, …), mirroring how the Xero/accounting integration was kept provider-agnostic (ADR-051: a generic connection model + adapter/registry, so a second provider is "write one adapter", not a rewrite). **No adapter/registry layer is built here** — there is only one "provider" (native Stocdup). If a real delivery-provider integration is built later it should follow the same ADR-051 pattern, with its own ADR at that time.

This was greenfield: no route/run/driver/manifest model existed. The closest prior art is `DeliveryProfile` (governs *when* a customer may be delivered to — days/cutoffs), which this feature deliberately stays separate from.

Two independent design-review passes on the PBI's own mockups (Figures 1–2, extracted from the docx) scored them 22/36 on Nielsen heuristics and surfaced gaps that are folded in as explicit design decisions, not deferred polish — see §Design.

## Status

| Milestone | State |
|---|---|
| **M1 — Schema + Route CRUD** | ✅ Done, merged, green |
| **M2 — Auto-allocation on order acceptance** | ✅ Done, merged, green |
| **M3 — Board + move + List view** | 📋 Planned in detail below |
| **M4 — Readiness + concurrency UX** | Outlined |
| **M5 — Change delivery date + missed/nearby** | Outlined |

Current test state: `apps/api` **1075 unit tests across 88 suites**, plus 24 delivery integration tests (14 route + 10 allocation). All green.

## Reconciliation notes (PBI's illustrative names → real codebase)

- "organisationId" → **`distributorId`** (a distributor is an `Organisation` with `type: DISTRIBUTOR`).
- "customerId" → **`traderCustomerId`** on `Order`, but **`customerId`** on `TradeRelationship`/the new join tables. There is no `Customer` model — a customer is an `Organisation` with `type: TRADE_CUSTOMER`.
- `Order` has **no plain `deliveryAddress`** — only `deliveryAddressSnapshot Json?` (frozen at placement). `scheduledDeliveryDate` did not exist and was added by M1.
- No fine-grained read/manage permission system exists; every admin-facing controller is gated by `@UseGuards(JwtAuthGuard, DistributorAccessGuard)` (any member of the org, no role check). **Reused as-is** — no new RBAC.
- No optimistic-concurrency `version` column existed anywhere. This feature introduces the first, scoped to `DeliveryRun` only — not a generic locking abstraction.
- The `admin/distributors/:distributorId/...` prefix is legacy debt CLAUDE.md says not to extend. New controllers use `distributors/:distributorId/...`, no `admin/` prefix, no `me`.
- **There is no "cases" concept in the schema.** `OrderLine.quantityOrdered Int` is the only quantity; `unitOfMeasureSnapshot String?` is nullable free text read by no business logic, and there is no pack-size field anywhere. The mockup's "18 cases" is not computable — see the totals decision below.

## Decisions log

Confirmed with the user across planning rounds:

1. **Permissions** — reuse the existing org-membership guard for everything including Reopen. Fine-grained split explicitly deferred.
2. **Board scaling** — Board stays the default view unconditionally; horizontal scroll accepted for many routes.
3. **Customer search** — client-side fetch-and-filter (the existing `MatchExistingCustomerDialog` pattern) is sufficient.
4. **Nearby-delivery window** — fixed default of 3 days, stored as a configurable column, no settings UI in this PBI.
5. **Driver representation** — free-text `driverName`; no `Driver` directory/FK, since none exists. A future directory would need a migration to backfill from these values.
6. **Allocation timing** — async via the existing outbox/queue, consistent with every other `OrderAccepted` consumer, accepting a ~5s-bounded visibility window.
7. **Within-run reordering is in M3 scope** alongside between-run moves; cards show a stop number.
8. **Missed deliveries** — amber badge in place on the card + an attention filter. No extra column.
9. **Totals are "N stops · M items"** (`items = SUM(quantityOrdered)`). The word **"cases" is banned** — it would be fabricated data.
10. **Next-week view** — a 7-day workload strip above the board showing each day's count, doubling as the date picker (replacing a calendar popover).

## Domain model (as built in M1)

`apps/api/prisma/schema.prisma`, copied byte-for-byte to `apps/admin-api/prisma/schema.prisma` per repo convention.

- **Enums**: `DeliveryRunStatus {OPEN, READY}`, `DeliveryRunSource {STOCDUP}` (future provider values append here only), `DeliveryAllocationSource {DEFAULT_ROUTE, MANUAL, EXTERNAL_PROVIDER}`, `DeliveryRunOrderStatus {PLANNED}`. `providerStatus` stays a plain `String?`, not an enum — no known values yet.
- **`Order`** gained `scheduledDeliveryDate DateTime? @db.Date` (set from `requestedDeliveryDate` on first allocation; `requestedDeliveryDate` is never mutated after).
- **`DeliveryRoute`** — `distributorId, name, code?, defaultDriverName?, active`.
- **`DeliveryRouteCustomer`** — soft-ended (`removedAt`/`removedByUserId`) with an **ADR-052 marker column** `activeDistributorCustomerId` encoding `${distributorId}:${customerId}` while active, `@@unique` on it, maintained by a `BEFORE INSERT OR UPDATE` trigger (never application code).
- **`DeliveryRun`** — `routeId?` (nullable for future provider runs), `deliveryDate @db.Date`, `name` (a **snapshot** of the route name so renaming a route never relabels past runs), `driverName?`, reserved provider columns, `version Int @default(0)`, and `@@unique([distributorId, routeId, deliveryDate])` as the find-or-create key.
- **`DeliveryRunOrder`** — `deliverySequence?`, `allocationSource`, reserved provider columns, soft-end, and marker column `activeOrderId` with `@@unique` + trigger, enforcing "an order has at most one active allocation" globally. `assignedByUserId` is **nullable** (system allocation has no actor, mirroring `Order.acceptedByUserId`).
- `DistributorSettings` gained `nearbyDeliveryWindowDays Int @default(3)`.

Migrations were generated with `--create-only`, read, then `deploy`ed; the two triggers were hand-appended (the one sanctioned exception per ADR-052).

## M1 — Schema + Route CRUD ✅

`apps/api/src/delivery-routes/` (CRUD + customer assignment/removal/bulk reorder), `apps/admin-api/src/delivery-routes/` BFF proxy, `adminDeliveryRoutesApi` + types, and the admin pages (`app/delivery-routes/{page,new,[id]/edit}`, `DeliveryRouteForm`, `RouteCustomerAssignmentPanel`, `CustomerSearchSelect`) with dnd-kit drag reordering **plus always-visible Move up/down buttons** as the real accessible path. `@dnd-kit/{core,sortable,utilities}` added as new dependencies. 12 unit + 14 integration tests, including raw-Prisma proofs that both ADR-052 constraints hold independent of app code.

## M2 — Auto-allocation on order acceptance ✅

`apps/api/src/delivery-run-allocation/` — a worker-only module (`WorkerModule` only; the HTTP process has no BullMQ wiring, by deliberate rule). `DELIVERY_RUN_ALLOCATION_QUEUE` added as a **third consumer of the existing `OrderAccepted` event** in `EVENT_ROUTES`, and injected into `OutboxPublisherService`. No new event mechanism.

`DeliveryRunAllocationProcessor` reloads the order fresh (never trusts the event payload) and re-validates status, then `DeliveryRunAllocationService.allocateOrder` resolves the customer's active route, upserts the dated run on the unique key (so concurrent orders settle on the constraint, not a check-then-create race), and allocates with `deliverySequence` seeded from `defaultDropPosition` — writing outbox + audit in the same transaction. Leaves the order unassigned with `NO_ROUTE` / `RUN_READY` / `NO_SCHEDULED_DATE`. Idempotent. 16 unit + 10 integration tests, including a concurrency test proving exactly one run is created.

---

# M3 — Delivery Runs board (detailed plan)

A dated board at `/delivery-runs`: one column per run plus an Unassigned column, cards that move between runs *and* reorder within a run, a Board/List toggle, date navigation, and the existing FilterBar convention.

Out of M3 scope (M4/M5): mark-ready/reopen, driver override, change-delivery-date, and the *logic* producing missed/nearby. But their **visual language is designed and rendered now** so nothing is retrofitted — the READY and MISSED branches exist and render defensively, they just have no producer yet.

## 3.1 Backend — `apps/api/src/delivery-runs/`

Module mirrors `delivery-routes/` (imports `PrismaModule`, `OutboxModule`, `AuditModule`; registered in `app.module.ts`), same guards and Swagger decorators. Two resource families — `delivery-days` is the coarse read resource, `delivery-runs` owns mutations:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `distributors/:distributorId/delivery-days?from=&to=` | 7-day workload strip |
| `GET` | `distributors/:distributorId/delivery-days/:date` | the whole board for one day |
| `POST` | `distributors/:distributorId/delivery-runs/:runId/orders` | assign / move **into** this run |
| `DELETE` | `distributors/:distributorId/delivery-runs/:runId/orders/:orderId?version=N` | move **out** to Unassigned |
| `PATCH` | `distributors/:distributorId/delivery-runs/:runId/orders/reorder` | within-run resequence |

**All three mutations return `@HttpCode(200)` + the full refreshed `DeliveryDayBoard`.** Most important API decision in M3: `ProblemDetailsFilter` flattens structured exception bodies (only `message`/`error` survive), so no *error* can carry `{currentVersion}`. Returning the whole day on *success* means the client never guesses new versions, stop numbers or totals, and a re-GET is only needed on the failure path. The DELETE therefore deliberately does **not** copy `@HttpCode(NO_CONTENT)` — the caller needs the body (`ApiClientService.parseResponse` only discards on a literal 204, so it proxies cleanly).

`GET delivery-days` returns `{ data: DeliveryDaySummary[] }` with **no `pagination` block** — a bounded window (capped at 31 days), not a cursor feed. `GET delivery-days/:date` returns a bare object, matching `GET /delivery-routes/:id`.

DTOs follow house style — single-valued `@IsEnum` (no multi-select precedent exists; the array precedent is `ReorderRouteCustomersDto`). `AssignOrderToRunDto = { orderId, version, sourceRunId?, position? }`; `ReorderRunOrdersDto = { version, orderedOrderIds }` (full set, exact-match validated).

**Drive-by fix**: `DeliveryRouteQueryDto.active` uses `@Type(() => Boolean)`, and `Boolean("false") === true`, so `?active=false` currently returns *active* routes. Replace with an explicit `@Transform` + a spec case. M3's run/route pickers are the first callers to pass `false`.

### Board read (`getDay`) — five queries, no N+1

Parse dates via a shared helper as `new Date(\`${date}T00:00:00.000Z\`)` (`@db.Date` round-trips as UTC midnight, matching how allocation writes).

1. Runs + active allocations, ordered `deliverySequence` then `assignedAt`. **Stop numbers assigned in JS as `index + 1`** — never echoed from `deliverySequence`, which allocation seeds from `defaultDropPosition` and is therefore sparse.
2. Unassigned candidates: `ACCEPTED` orders whose `scheduledDeliveryDate ?? requestedDeliveryDate` matches, with `deliveryRunOrders: { none: { removedAt: null } }`. The fallback mirrors `allocateOrder` exactly.
3. **Batched** route lookup — one `findMany` on `activeDistributorCustomerId: { in: keys }` into a Map, not a `findFirst` per order.
4. **Batched** run lookup — a plain `findMany`, **never `findOrCreateRun`** (it creates; a GET must not). Guard both `in` lists against empty arrays.
5. **One grouped `$queryRaw`** rollup, `SUM(quantityOrdered)::int AS itemCount, COUNT(*)::int AS lineCount GROUP BY orderId`, casts per `analytics.service.ts:202-217`. **Short-circuit when there are no order ids** — `Prisma.join([])` emits `IN ()`, a Postgres syntax error.

**Reason derivation** reproduces `UnallocatedReason` in the allocation service's exact sequential order: no date → `NO_SCHEDULED_DATE`; no route-customer *or* inactive route → `NO_ROUTE`; the route's run exists and is `READY` → `RUN_READY`; otherwise **`null`**. That `null` is load-bearing ("no blocker; moved out by hand, or the worker hasn't caught up"), and a *missing* run row is allocatable, not unallocated. Emit `suggestedRunId`/`suggestedRouteName` from the same Maps to pin the likely target first in the Move menu.

Cards carry `attention: 'NONE' | 'UNASSIGNED' | 'MISSED'`; M3 emits only the first two.

`stopCount` counts **cards, not distinct customers** — two orders for one customer are two stops, because a stop is a thing the driver hands over. Recorded so nobody "fixes" it.

`listDays` is one grouped `$queryRaw` over runs plus one over unassigned orders, merged and **padded so every day renders**, including zeros.

### Mutations — CAS, ordering, versions

**Two different CAS targets, deliberately.** The destination run is CAS'd on `version`; the source is CAS'd on **the allocation row itself** — hence no `sourceVersion`. "This delivery is still where you think it is" is the real invariant, and `updateMany({where:{activeOrderId, runId: sourceRunId}})` returning `count !== 1` tests it directly, which is strictly stronger than a version compare.

Pre-checks outside the transaction: destination missing → 404; destination `READY` → **422** ("right shape, wrong state", per `admin-orders.service.ts`); date mismatch → 422 naming both dates; **no-op guard** returns the board unchanged with no version bump and no event, so drag jitter doesn't spam the outbox.

Then one `$transaction`:

1. **CAS the destination `version` first** — `updateMany({where:{id, distributorId, version, status:'OPEN'}, data:{version:{increment:1}}})`; `count !== 1` → **409**. First position means a stale caller causes zero row churn, ownership folds into the predicate, and writers serialise through it.
2. **Soft-remove the source allocation *before* the create.** **Load-bearing, not stylistic**: `@@unique([activeOrderId])` is non-deferrable and checked per statement, and the trigger nulls `activeOrderId` the instant `removedAt` is set. Create-before-remove would have two rows claiming the slot → P2002. Needs a code comment; integration test 5 is the only guard.
3. Create with `DeliveryAllocationSource.MANUAL` + `assignedByUserId`, splice at `position ?? end`, renumber dense 1..n.
4. Blind-increment the source run's `version` (no CAS — increments commute; step 2 already CAS'd the real invariant).
5–6. `outbox.writeEvent` + `audit.record`, per the allocation service's template. Any throw after step 1 rolls the version bump back.

`unassignOrderFromRun` is the same minus the create, but **must densify remaining sequences**. `reorderRunOrders` CAS's, validates the exact set (400 on mismatch), renumbers.

New outbox events, `aggregateType: 'DeliveryRun'`: **`DeliveryRunOrderMoved`, `DeliveryRunOrderUnassigned`, `DeliveryRunOrdersResequenced`**. **No `EVENT_ROUTES` entries** — the publisher marks unrouted events published without fan-out, correct here (an append-only trail + future provider hook). Stated explicitly so nobody assumes a consumer exists.

## 3.2 BFF, types, client

`apps/admin-api/src/delivery-runs/` copies `delivery-routes/` 1:1 — forwarding only, zero business logic, and **no `@HttpCode(NO_CONTENT)` on the DELETE**.

`packages/types` gains `DeliveryCard`, `DeliveryRunColumn`, `DeliveryDayBoard`, `DeliveryDaySummary`, request/param types, and the shared `UnallocatedReason`/`DeliveryAttention` unions. `packages/admin-api-client/src/delivery-runs.ts` exports `adminDeliveryRunsApi`; read methods take `signal?: AbortSignal` (`apiFetch` already spreads `RequestInit`, so no change to `base.ts`).

## 3.3 Frontend — `apps/admin`

Page `src/app/delivery-runs/page.tsx`; nav entry after `/delivery-routes`. Components in `src/components/delivery-runs/`: `WorkloadStrip`, `BoardViewToggle`, `DeliveryRunBoard`, `RunColumn`, `UnassignedColumn`, `DeliveryCard`, `MoveToMenu`, `DeliveryRunList`, `DeliveryBoardFilters`, `attention.ts` (badge/copy maps shared by board, list and mobile).

Extract `toIso` (the local-time-safe formatter) from `DeliveryProfileForm.tsx` into `src/lib/date.ts`. **Do not extract `MonthGrid`** — the workload strip replaces the calendar popover.

### Data hook — `src/lib/hooks/use-delivery-day.ts`

`useCursorList` is the wrong shape (cursor-coupled, no `refetch`, no race guard), so this is purpose-built but modelled on it. Returns `{ board, isLoading, isRefreshing, error, refetch, mutate }`.

- A `requestIdRef` per load, response handler returning early unless current. **This kills today→next→next**, where a slow first response would otherwise land last and paint a stale day.
- An `AbortController` per load; `AbortError` swallowed, not surfaced.
- `isLoading` vs `isRefreshing` so navigation never blanks the board — the previous day stays, dimmed.
- `mutate()` swaps in the board a mutation already returned, no round trip.

### Mutation flow

Snapshot → optimistic update → call → success `mutate(returned board)`; **409** banner + `refetch()`; **422** show the server's `problem.detail` + `refetch()`; otherwise roll back. **Never auto-retry a 409** — the board the user acted on no longer exists.

### Layout — owning the horizontal scroll

`AdminLayout`'s `<main>` is `overflow-y-auto overflow-x-hidden` and `globals.css` pins `html,body{height:100dvh;overflow:hidden}`. The board scrolls inside itself: `flex h-full min-h-0 min-w-0 flex-col` page, fixed strip and filter bar, then `-mr-6 min-w-0 flex-1 overflow-x-auto overflow-y-hidden pr-6` wrapping `flex h-full gap-4` columns of `w-[300px] shrink-0 flex flex-col min-h-0` whose *bodies* are `flex-1 overflow-y-auto`.

Three load-bearing details: **`min-w-0` on every flex ancestor** (a flex item defaults to `min-width:auto`, so without it the scroller grows to content width and `<main>` clips — the symptom is columns silently missing with no scrollbar, which reads like a dnd bug); **per-column vertical scroll** (otherwise run headers scroll away and the metaphor breaks); **`-mr-6 … pr-6`** so cards bleed to the edge and the scroll affordance is unambiguous.

**Overlays must escape the scroller.** `MoveToMenu`'s popover sits inside `overflow-x-auto` and *will* be clipped — it must portal (as `Modal`/`Drawer` do) or use fixed positioning.

### dnd topology

**One `DndContext` wrapping all columns** — the structural difference from M1's panel, since per-column contexts make cross-column dragging impossible. One `SortableContext` per column. **Each column root also needs `useDroppable`** — a `SortableContext` with zero items registers no droppable, so an empty run could never be dropped into. Card ids are `orderId`, column ids `run:<runId>`/`unassigned`, both carrying `data: { type, columnId }` so `over.id` resolves whether the pointer landed on a card or empty space. `closestCorners` (not `closestCenter`, which misbehaves across columns of differing height). `DragOverlay` for the lifted card. Sensors identical to M1.

### Hard UX requirements, concretely

- **AC12 always-visible "Move to…"** — a plain `<button>` rendered unconditionally (**no `group-hover:`**), listing every run plus "Unassigned", `suggestedRunId` pinned first and labelled "Suggested", plus Move up/down. dnd-kit's keyboard sensor works, but its pick-up/arrow/drop flow isn't discoverable, so the menu is the *primary* path, not a fallback. Disabled with a title on a READY run.
- **Unassigned** — `StatusBadge tone="blue"` + a muted reason line: `NO_ROUTE` → "No delivery route", `RUN_READY` → "Run already marked ready", `null` → "Ready to assign". Informational blue, not a warning.
- **Missed** — inline amber chip (`border-amber-200 bg-amber-50 text-amber-800`) + clock icon + `border-l-2 border-l-amber-400`, copy deliberately distinct: **"Missed — was due 12 Aug"**.
- **READY run** — `StatusBadge tone="green"`, body tinted, controls disabled. Renders defensively though nothing sets it until M4.
- **Never repurpose the brand `accent` (#F2864D)** for warnings — it's the decorative `PageHeading` underline.
- **Totals copy** — "6 stops · 118 items" / "4 lines · 22 items". "cases" appears nowhere.
- **States** — `ListSpinner` first load only, `ListErrorBanner` for load *and* mutation errors, `ListEmptyState` linking to the next day with work.

### Mobile

Below `md` the view is **forced to List**. `DeliveryRunList` renders a desktop `<table>` and a `MobileCardList` sibling (root is `md:hidden` by construction), grouped by run. `renderPrimary/Secondary/Status` render inside a `<button>`, so `MoveToMenu` goes in **`renderMeta`** and detail in `renderExpanded`. Expansion state is internal, so the move flow must not assume a card collapses after.

## 3.4 Sequencing within M3

- **M3a — read path.** Both GETs, DTOs, rollup, batched derivation, types, client, BFF, integration tests 1 & 9, plus the `active=false` fix. Ships a useful read-only board.
- **M3b — mutations, buttons only.** The three endpoints with CAS/ordering/events/audit, `MoveToMenu`, mutation flow, 409/422 handling, integration tests 2–8 & 10. **Ships the whole feature accessibly, no dnd** — deliberately before dnd, because the accessible path is the one that's easy to defer and never build.
- **M3c — dnd.** Topology, `DragOverlay`, empty-column droppables, optimistic update + rollback.
- **M3d — list + mobile.**

## 3.5 Verification

**Unit**: dense stop numbers over sparse stored sequences; reason precedence including `null`; **assert `deliveryRun.create` is never called on the read path**; batching (one route query, one run query, one `$queryRaw` regardless of card count); empty-id short-circuit; 422/409/400 paths; both versions bumped; no-op short-circuits without an outbox write; outbox+audit inside the same `$transaction`. Frontend: the **stale-response guard** (resolve request #1 *after* #2, assert #1 discarded), `toIso` across DST and month ends, Move menu present **without hover**, 409→banner+refetch, 422→server copy, other→rollback.

**Integration** — `apps/api/test/delivery-runs.integration-spec.ts`, structured like `delivery-routes.integration-spec.ts`:
1. Tenancy read — A never sees B's runs or unassigned orders.
2. Tenancy write — B's run with A's token → **404, not 403** (don't leak existence).
3. Cross-entity — B's order into A's run never succeeds.
4. **Stale-version race (mandatory)** — two `POST`s, same version, via `Promise.all`: exactly one 2xx, one 409, one active allocation, version incremented once.
5. **Trigger/ordering proof (ADR-052's raw-Prisma pattern)** — a raw create can't produce a second active allocation, and soft-remove-then-create succeeds. **The only test that catches a reversal of the transaction ordering.**
6. 422 into a READY run, asserting `application/problem+json` and the house copy.
7/8. Reorder and unassign leave dense 1..n and bump version once.
9. **Read path creates nothing** — `deliveryRun.count()` unchanged after a GET.
10. Outbox + audit rows per mutation.

**Manual E2E** once M3b lands: accept an order for a routed customer, confirm it lands in the right run; move it via `MoveToMenu` **and** separately via drag, proving the non-drag path independently; navigate days rapidly and confirm no stale board paints. Then `turbo test` from the repo root.

## 3.6 Risks

- **Transaction ordering is the highest-risk item.** Invisible to unit tests, breaks every cross-run move when wrong. Integration test 5 is not optional.
- **The `min-w-0` chain.** Wrong → the board silently clips instead of scrolling, and it looks like a dnd failure. Build the static column layout with dummy data and confirm scroll *before* wiring the hook or dnd.
- **Date/timezone.** `@db.Date` is UTC midnight; `toISOString()` on a local `Date` shifts backwards west of GMT. One slip puts a board a day off, reproducing only in some timezones.
- **Version churn** — every move bumps two runs, so two people on different columns will 409 each other more than feels natural. Returning the full board keeps everyone fresh; if it grates, drop the source bump to a non-CAS'd touch — measure first.
- **Undated accepted orders are invisible on every dated board.** A real gap; needs an "Undated deliveries" surface in M4. Flagged rather than faked.

---

# M4 — Readiness + concurrency UX (outline)

Mark-ready / reopen endpoints with audit records, the READY-locked column treatment and `ReopenConfirm`, a `MarkReadyDialog` interstitial (it's a hard lock, so it needs confirmation), the per-run driver override labelled distinctly from the route's default ("Driver for this run — overrides the route default"), and end-to-end 409-conflict UX with a genuine concurrent-mutation integration test. Also the natural home for the **undated-deliveries** gap M3 surfaces.

# M5 — Change delivery date + missed/nearby (outline)

`PATCH .../scheduled-delivery-date` re-running the same route/run resolution **synchronously** (it's an interactive row action, not an acceptance-time trigger), retaining `requestedDeliveryDate`, warning on date drift, and surfacing — never auto-merging — same-address deliveries on the target date. Plus `ChangeDeliveryDateDialog`, the missed-delivery derivation feeding the `MISSED` attention state M3 already renders, and use of `nearbyDeliveryWindowDays` (no settings UI).

---

# Design references and critique

Two mockups are embedded in the source docx (Figure 1: route editor, Figure 2: dated runs board), extracted to `word/media/image{1,2}.png`. They are illustrative only — the fixes below go beyond what they show.

Two independent review passes scored them **22/36**. Findings, all folded into the plans above rather than deferred: no non-drag move affordance (P0 → always-visible `MoveToMenu`); no visible READY/locked state or Reopen (P0 → `RunColumn` lock treatment + M4 dialogs); no Unassigned reason text (P1 → reason line); no mobile treatment (P1 → forced List + `MobileCardList`); no confirmation on the hard "Mark ready" lock (P2 → M4 interstitial); ambiguous per-run driver vs route default (P2 → explicit label); undesigned missed/past-due state (→ amber badge, designed in M3, produced in M5). Also flagged: the mockups' route and run customer lists don't overlap, a cosmetic inconsistency not carried into the real allocation logic.
