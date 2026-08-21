# ADR-058 — Installable PWA Over Native Mobile Apps

**Status**: Accepted
**Date**: 2026-08-21
**Deciders**: Rick Walsh
**Related**: `CLAUDE.md` (mobile-first architecture principle), PBI "Make the Stocdup Admin and Portal apps installable PWAs"

---

## Context

The PRD's mobile-first principle requires core workflows — ordering, stock receiving, delivery confirmation, signature capture — to work well on mobile, and both `apps/admin` and `apps/portal` are already built as responsive Next.js web apps to satisfy that. Separately, there's a recurring product ask for users to be able to launch Wholo "like an installed app" from their phone's Home Screen, rather than through a browser bookmark.

The two ways to satisfy that ask are structurally very different:

1. **Native mobile apps** (React Native, or platform-native Swift/Kotlin) — a genuinely separate client, built and shipped through the App Store / Play Store, with its own release cadence, review process, and either a second UI codebase or a React Native rewrite of the existing screens.
2. **Installable Progressive Web App** — add a web app manifest and icon set to the *existing* Next.js apps. The browser (Safari/Chrome) handles "Add to Home Screen," and the installed icon launches the same web app in a standalone window, no address bar. Zero new codebase, no app-store account, no review cycle.

This PBI only needed the Home Screen-launch outcome, not offline support, push notifications, or app-store distribution — those are explicitly out of scope per the PBI itself.

## Decision

**Go with an installable PWA, not a native app**, for both `apps/admin` and `apps/portal`.

Concretely: each app gets its own `src/app/manifest.ts` (Next.js's native App Router metadata file convention — auto-served at `/manifest.webmanifest`, auto-injects the `<link rel="manifest">` tag) plus a generated icon set (192/512/maskable PNGs, `apple-icon.png`) and `appleWebApp`/`viewport.themeColor` metadata in each root `layout.tsx`. No `next-pwa`/Workbox dependency was added and no service worker was introduced — both would exist solely to support offline caching, which this PBI explicitly excludes; adding one now would be speculative infrastructure for a requirement that doesn't exist yet.

This was the obvious call, not a close one:
- The mobile-first responsive web app already exists and already meets the actual UX bar (works well on a phone browser). A native rewrite would duplicate that work in a second codebase for a UI that's already good, purely to get a Home Screen icon.
- Both apps run on Next.js App Router, which has first-class, dependency-free support for the manifest/icon file conventions used here — the entire feature was additive files plus a few metadata fields, no architecture change.
- Authentication is already Keycloak-via-browser-redirect (`keycloak-js`, `window.location.origin`-based redirect URIs) — this continues to work unchanged in a standalone PWA window, whereas a native app would need its own auth flow (in-app browser tab, custom URI scheme redirect, or a native OAuth SDK).
- App-store review cycles and platform-specific release management would slow down a fast-moving product where the two BFFs (`admin-api`, `portal-api`) and the domain API iterate together; a PWA ships the instant the web app deploys, same as today.

## Consequences

- No service worker exists yet, so there's no offline support and no push notifications — both would require adding one later if a future PBI needs them, at which point the manifest already in place needs no rework.
- No app-store presence: users install via each browser's own "Add to Home Screen" affordance (Safari's Share sheet on iOS, Chrome's install prompt/menu item on Android), not a store listing. There is no discoverability boost from app-store search, and no store-mediated update mechanism to reason about — updates are just the next page load, like the existing web app.
- If a future requirement genuinely needs OS-level capability a PWA can't provide (deep background sync, native push, camera/Bluetooth APIs beyond what the web platform exposes), that would call for a native wrapper (e.g. Capacitor around the existing Next.js apps, or a true native rewrite) — this ADR's decision covers the current Home Screen-launch requirement only, not a permanent rejection of native.
- Because `admin.<domain>` and `portal.<domain>` are distinct origins, each app's manifest is scoped independently (`scope: '/'` per app) with no shared installability surface to coordinate — installing one never affects the other.
