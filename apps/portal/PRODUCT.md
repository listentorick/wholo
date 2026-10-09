# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Trade customers — businesses that buy from wholesale distributors (restaurants, bars, hotels, retailers). A trade customer's staff use the portal to browse a distributor's catalogue, place and reorder orders, track deliveries, and view invoices, payments, and credit — typically on mobile, in the middle of running a venue (bar, kitchen, loading dock), not at a desk.

A trade customer can hold relationships (pending or connected) with more than one distributor at once; the portal is not scoped to a single supplier.

## Product Purpose

Stocdup is the ordering and account-management portal a distributor's trade customers use day to day: discover and request access to a distributor, browse that distributor's catalogue at their own negotiated pricing, place/reorder orders, track delivery status, and see invoices/payments/credit — without phone or spreadsheet-based ordering. Success is a trade customer completing their ordering and account workflows entirely from their phone, with no training required.

## Positioning

One portal aggregates ordering across every distributor a trade customer buys from, instead of each distributor running its own siloed ordering channel (phone, email, spreadsheet, or a separate system per supplier).

Stocdup (the commercial product name; internal platform/codebase name is "Wholo") is the pricing authority — a customer's price is always the customer-specific override, assigned price list, or default pricing set in Stocdup. Xero is the system of record for invoices and payments only; it never overrides a price shown or charged in the portal.

## Operating Context

- Multi-tenant, white-label per distributor: each distributor has its own slug-scoped area (`/{distributorSlug}`) with its own branding (logo, banner image, dominant color) rendered over the shared Stocdup UI shell.
- A trade customer's relationship with a given distributor has a status (e.g. pending, connected) that gates what they can see/do there.
- "Order as" mode exists for support/admin users acting on behalf of a trade customer; it locks the UI to a single distributor context.
- Onboarding happens via an accept-invite flow; auth is via Keycloak-issued JWT (see root CLAUDE.md auth architecture).
- Distributor discovery/marketplace (browsing to find and request new distributors) is a named module but is currently a disabled "coming soon" affordance in the home view — not yet built out.

## Capabilities and Constraints

Current routes: home (my distributors + disabled marketplace CTA), per-distributor landing/profile, per-distributor product catalogue, checkout, order list, order detail, account settings, login, accept-invite.

- Mobile-first is a hard constraint (root CLAUDE.md): ordering, delivery tracking, and account workflows must work well on a phone, not just adapt from desktop.
- Industry-agnostic core is a hard constraint even though the first real trial is a wine distributor: no wine-specific assumptions belong in data models, workflows, or copy.
- Advanced warehouse management, route optimisation, procurement forecasting, barcode scanning, multi-warehouse, BI/reporting, AI recommendations, and EDI integrations are explicitly out of scope for v1 (root CLAUDE.md).

## Brand Commitments

- Product/commercial name: **Stocdup**. "Wholo" is the internal platform/codebase name, not customer-facing.
- Existing visual identity (Deep Navy / Cobalt Blue primary / Amber accent, sharp square-cornered UI, Inter typeface) is already implemented in `src/styles/theme.css` and `tailwind.config.ts` and is current design authority for this surface — not something decided in this init pass.
- Logo assets on hand: `public/logos/stocdup-logo.png`, `public/logos/stocdup-logo-only.png`.

## Evidence on Hand

- Pilot customer: **Winos**, a wine wholesaler (distributor), trialing the product with their trade customers. This is the only confirmed real distributor/customer at this time.
- No other named customers, testimonials, case studies, or usage metrics exist yet — future design and copy work must not fabricate any beyond Winos.

## Product Principles

1. Stocdup owns pricing; Xero is invoicing/payments system of record only — a price shown or charged here must never be silently overridden downstream.
2. Mobile-first for real: every core workflow must be comfortable one-handed on a phone in the actual environments customers use it (bars, kitchens, loading docks), not merely responsive-shrunk from desktop.
3. Multi-distributor by design: never assume a trade customer has exactly one supplier relationship; relationship status (pending/connected) and "order as" locking are first-class states, not edge cases.
4. Industry-agnostic core, wine-first pilot: Winos being a wine wholesaler must not leak wine-specific assumptions into shared data models, workflows, or copy.
5. Minimal training over ERP complexity: prefer operational simplicity to feature completeness (root CLAUDE.md architecture principle).

## Accessibility & Inclusion

WCAG 2.1 AA is the confirmed binding accessibility target for this surface.
