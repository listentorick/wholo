# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Mobile-first Next.js PWA, matching the primary tech stack of `apps/admin` and `apps/portal` (Next.js frontend, service-worker-based PWA, BFF pattern proxying to `apps/api`) — an explicit user constraint, not decided here. Not a native/React Native app.

## Users

Drivers making deliveries for a Stocdup distributor. They use a personal or company-owned phone, one-handed, on foot or in a cab, between stops — not at a desk. Connectivity is unreliable or absent for stretches of a run. Digital confidence varies; the workflow must not assume comfort with apps beyond the basics. Two related but distinct usage moments:

- **In the field, mid-delivery**: scanning the QR code printed on an order's paperwork/manifest and recording what happened at that stop, often offline.
- **Before leaving, or reviewing after**: an authenticated driver checking which runs are Ready, downloading a run for offline use, or browsing its stops/orders on the digital manifest.

## Product Purpose

The Driver PWA lets a driver scan the QR code printed against an order and record that delivery's outcome and proof of delivery — delivered, partially delivered, or unable to deliver — even when the device has no connectivity. It replaces a paper-only manifest process where distributors and customers currently get no timely, structured record of what actually happened at the door (partial acceptance, damaged/missing product, refusals, who signed). A supporting authenticated "digital manifest" lets a driver download a Ready run before leaving connectivity, so the offline QR workflow has data to work against.

## Positioning

Unlike a typical driver/logistics app, the primary action requires no login: each order's QR code is a durable, non-guessable bearer link — it does not expire and stays reusable for viewing indefinitely (a driver can't get a replacement QR code in the field), but it is good for recording exactly one delivery outcome for that one order, then it goes read-only. This is deliberate — it keeps the core workflow usable by any driver on any device with zero setup, at the cost of not being able to claim the submission is identity-verified (Stocdup can only say it's associated with the driver assigned to the run). Authentication (Keycloak) is reserved for the secondary, higher-trust surface: viewing/downloading Ready runs, and — resolving an open PRD question — correcting a mistaken submission. A driver who taps the wrong outcome fixes it themselves, self-service, by logging in; the anonymous QR link can never be used to change a result once recorded, by anyone, including the original driver.

## Operating Context

- **Two access modes**, materially different in trust level and screen scope:
  - *Unauthenticated QR delivery*: opens directly to one order's delivery page. No login. No visibility into other orders, the rest of the run, or any admin function. Becomes a read-only confirmation after submission.
  - *Authenticated digital manifest*: normal Keycloak auth, Stocdup RBAC scoped to the driver's distributor. Lists Ready runs, lets the driver accept/download a run, browse its stops/orders, and open an individual delivery from there (same delivery page as the QR route).
- **Offline-first**: the app shell is service-worker cached; accepted run/order data lives in IndexedDB; delivery outcomes (including signature/photo/location) can be fully captured offline and are queued for sync. The app must always make clear whether a given piece of work is *Not completed / Saved on this device / Synchronising / Synchronised / Synchronisation failed* — never implying server receipt before the server has actually accepted it.
- **Distributor-branded**, on the same mechanism as `apps/portal`: each distributor's logo/branding renders over the shared Stocdup shell. Visual system is inherited from the established Stocdup design language (see `apps/portal/DESIGN.md`) — Deep Navy / Cobalt Blue / Amber, Inter, hard square corners, flat-by-default elevation — not a new visual world.
- Capture surfaces needed: camera (photo evidence, QR scanning), on-screen signature, device geolocation (best-effort — must degrade gracefully and record "location unavailable" rather than block).
- Distributor-side (existing order-management UI) and customer-portal visibility of delivery results, and the delivery-location map, are real parts of the wider PRD but are **out of scope for this Driver PWA surface** — they extend already-established admin/portal surfaces separately.

## Capabilities and Constraints

- A delivery outcome is one of exactly three: **Delivered**, **Partially delivered**, **Unable to deliver** — each with its own required fields (reason codes for anything not delivered; recipient name/signature/photo/notes/location are optional evidence, never blocking submission).
- Photo and location capture must never be mandatory — camera/location permission can be refused and the app must still let the driver complete and submit.
- Submission is single-use and idempotent: once a result is accepted by the server, the QR page becomes a limited read-only confirmation (order number, outcome, date/time, driver) and no further edits are possible through the anonymous QR link — that guarantee is absolute. Correcting a mistaken submission is only ever possible through the authenticated digital manifest (a driver logging in and finding the order again), never through the QR page itself and never mediated by admin/distributor staff on the driver's behalf.
- A driver cannot download a Ready run's data until download completes successfully; the app must not claim a run is available offline before that.
- Explicitly out of scope for this app: route optimisation, turn-by-turn navigation, in-manifest maps, vehicle/depot management, delivery time windows, collections/returns, product variants, editing/reordering a run, corrections after submission, payment collection.
- Full functional detail lives in `docs/Stocdup_Driver_Delivery_App_PRD.docx` (Increment 1: experience design covers this surface; later increments are phased implementation, not scope changes).

## Brand Commitments

- Product/commercial name: **Stocdup** (this surface: **Stocdup Driver PWA**). "Wholo" is the internal codebase name only.
- Inherits the existing Stocdup visual identity documented in `apps/portal/DESIGN.md` (Deep Navy / Cobalt Blue / Amber, Inter, hard square corners, flat elevation with shadow-as-lift) as current design authority — this app does not invent a new visual world.
- Per-distributor branding overlay (logo, banner, dominant color rendered over the shared shell) — same mechanism as `apps/portal`.

## Evidence on Hand

- Pilot distributor: **Winos**, a wine wholesaler — the only confirmed real distributor at this time (shared with `apps/portal`).
- No named drivers, real delivery photos/signatures, or usage metrics exist yet; future design/copy work must not fabricate any beyond Winos.

## Product Principles

1. Offline is not a degraded mode — the primary workflow (scan, record outcome, capture proof, save) must work fully without connectivity; only sync is deferred.
2. Never claim server receipt before the server has it — locally saved work is visibly distinct from synchronised work, and notifications only fire after real server acceptance.
3. Unauthenticated does not mean unverifiable-by-design: the QR token proves possession of one specific order's link, not the driver's identity — the product must never overstate what it can attest to.
4. Evidence capture is opportunistic, never a gate: a driver who can't get a signature, photo, or GPS fix must still be able to finish and submit.
5. Same trade tool, new context: this is the Stocdup design system operating one-handed, outdoors, under time pressure — not a separate product identity.

## Accessibility & Inclusion

WCAG 2.1 AA (same binding target as `apps/portal`), plus PRD-stated usability requirements that go beyond the baseline: large touch targets, plain unambiguous language, no assumption of high digital literacy, and explicit confirmation before any irreversible action (submission).
