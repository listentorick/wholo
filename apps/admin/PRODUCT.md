# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Distributor/wholesaler staff — the business operating the wholesale side of Stocdup. Two distinct personas, not one generic "staff" role:

- **Owners/managers**: run the business end — onboarding the business, pricing, catalogue and product management, customer relationships, settings (branding, orders, portal, discovery, notifications), integrations (Xero accounting sync), and business analytics/dashboard.
- **Operational staff**: run the physical fulfilment side day to day — order processing, delivery run planning and driver assignment, delivery route/profile management, driver manifests.

A single distributor account can have only one connected accounting integration and one set of catalogue/pricing data; this app is the operator side of the same tenant the portal's trade customers buy from (see `apps/portal/PRODUCT.md` for the customer-facing counterpart).

## Product Purpose

The admin app is where a distributor runs their wholesale operation on Stocdup day to day: onboard the business, manage products/pricing/catalogues, manage trade customers and their access, process and fulfil orders, plan and dispatch delivery runs, and keep accounting (Xero) in sync — all without a training-heavy ERP. Success is a distributor running their full order-to-delivery-to-invoice operation from this app with minimal onboarding.

## Positioning

One operational surface replaces the disconnected spreadsheets/phone/email/separate-systems distributors currently use to manage customers, pricing, orders, and deliveries — while Stocdup, not Xero, remains the pricing authority (root CLAUDE.md) and Xero stays system of record for invoices/payments only.

## Operating Context

- Mixed desktop and mobile/tablet use, not desktop-only: office-based workflows (pricing, catalogue, settings, customer management, analytics) are comfortable on desktop, but delivery-run planning, driver manifests, and route/profile work need to hold up on a tablet or phone in the warehouse or on the road.
- Onboarding is a guided multi-step flow (business details → branding → order-taking preferences → portal About page → notifications → discovery/marketplace visibility) before first real use.
- Settings is organised as tabs mirroring onboarding's steps: Business, Orders, Discovery, Portal, Branding, Notifications.
- Distributor branding (logo, banner, dominant colour) set here is what a trade customer sees rendered over the shared Stocdup UI shell in the portal (`apps/portal`).
- Accounting integration (currently Xero, kept provider-neutral in structure per root CLAUDE.md) syncs contacts, products, and tax types, and exports invoices; a distributor can review/manage sync state and mappings here.
- Delivery Runs is an active build area: board/list views, drag-and-drop run assignment, readiness controls, change-delivery-date, and driver manifest PDF generation (see recent commit history).

## Capabilities and Constraints

Current top-level routes: dashboard (order summary/trend/rankings/action items), catalogues, customers, delivery-profiles, delivery-routes, delivery-runs, integrations (accounting: contacts/products/tax-types/invoice-exports/settings), onboarding, orders, pricelists, products, settings, login, access-denied.

- No role-gating exists in the code yet (`auth-context`/`use-require-auth` have no role checks) — owner vs. operational-staff is a real distinction in how people use the product today, not yet a distinction the UI enforces or should be assumed to enforce.
- Industry-agnostic core is a hard constraint (root CLAUDE.md) even though the first real trial is a wine distributor: no wine-specific assumptions belong in data models, workflows, or copy.
- Advanced warehouse management, route optimisation, procurement forecasting, barcode scanning, multi-warehouse, BI/reporting, AI recommendations, and EDI integrations are explicitly out of scope for v1 (root CLAUDE.md).

## Brand Commitments

- Product/commercial name: **Stocdup** (page title "Stocdup Admin"). "Wholo" is the internal platform/codebase name, not customer-facing.
- Existing visual identity — Deep Navy (`#0B1D3A`) sidebar/text, Cobalt Blue (`#1565FF`) primary/CTA, Amber accent (`#F2864D`), Warm Off White/Pale Stone backgrounds — is already implemented in `src/styles/theme.css` (token-driven: `:root` values only, no component edits needed to rebrand) and is current design authority for this surface, matching the portal's confirmed identity.
- Logo assets: distributor-uploaded via Branding settings (`BrandingLogoUploader`, `BrandingBannerUploader`); no fixed Stocdup admin-specific logo file confirmed beyond the shared logos already recorded in `apps/portal/PRODUCT.md`.

## Evidence on Hand

- Pilot customer: **Winos**, a wine wholesaler (distributor), trialing the product as the distributor-side operator of this app. This is the only confirmed real distributor at this time.
- No other named customers, testimonials, case studies, or usage metrics exist yet — future design and copy work must not fabricate any beyond Winos.

## Product Principles

1. Stocdup owns pricing; Xero is invoicing/payments system of record only — nothing in settings or integrations should imply Xero can override a price (root CLAUDE.md, shared with `apps/portal`).
2. Two personas, one app: owner/manager workflows (pricing, settings, analytics) and operational-staff workflows (orders, delivery runs, driver manifests) coexist without role-gating today — design should stay legible to both rather than assuming a single "admin user."
3. Fulfilment work must hold up off the desktop: delivery-run planning and driver manifests are used on tablets/phones in the warehouse or on the road, not only in an office.
4. Industry-agnostic core, wine-first pilot: Winos being a wine wholesaler must not leak wine-specific assumptions into shared data models, workflows, or copy.
5. Minimal training over ERP complexity: prefer operational simplicity to feature completeness (root CLAUDE.md architecture principle).

## Accessibility & Inclusion

No admin-specific accessibility requirement has been confirmed yet; treat WCAG 2.1 AA (the portal's confirmed target) as the working baseline until stated otherwise.
