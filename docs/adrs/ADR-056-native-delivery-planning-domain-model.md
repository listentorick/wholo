# ADR-056 — Native Delivery Planning: domain model, DeliveryProfile separation, free-text driver, provider-neutral schema without an adapter

**Status**: Accepted
**Date**: 2026-08-21
**Deciders**: Rick Walsh
**Related**: ADR-051 (accounting integration provider-neutral pattern), ADR-052 (avoid Prisma-unsupported schema constructs)

---

## Context

Native Delivery Planning (`docs/delivery-planning-pbi-plan.md`) was a greenfield feature: distributor staff define reusable **Delivery Routes** (named customer groupings with a usual drop order), orders auto-allocate into a lazily-created dated **Delivery Run** for the customer's route, and staff work a daily board — move deliveries, override a driver, mark a run **READY** (locking it until an explicit, audited **Reopen**).

The closest prior art in the schema is `DeliveryProfile`, which governs *when* a customer may be delivered to (days/cutoffs). This feature deliberately does not extend or fold into `DeliveryProfile`.

The PBI explicitly excludes building a delivery-provider integration (e.g. SolBox) — but the domain model carries nullable provider-compatibility columns anticipating one, mirroring how the Xero/accounting integration was kept provider-agnostic (ADR-051: a generic connection model plus an adapter/registry, so a second provider is "write one adapter," not a rewrite). No driver directory or roster exists anywhere in the product.

## Decision

### 1. `DeliveryProfile` and `DeliveryRoute`/`DeliveryRun` stay separate models, never merged

`DeliveryProfile` answers "may this customer be delivered to, and when (days/cutoffs)?" `DeliveryRoute` / `DeliveryRun` / `DeliveryRunOrder` answer "who's grouped together, in what order, on what dated run, with what driver?" These are orthogonal questions about the same customer, and a feature needing both composes them rather than merging tables. Day-of-week/cutoff logic never migrates into `DeliveryRoute`; route/run grouping never migrates into `DeliveryProfile`.

### 2. Provider-neutral schema shape, but no adapter/registry layer built

The schema carries reserved, nullable provider-compatibility columns: `DeliveryRunSource {STOCDUP}` (future provider values append here only), and on `DeliveryRun`/`DeliveryRunOrder`: `externalProvider`, `externalId`, `vehicleId`/`vehicleName`, `providerStatus` (a plain `String?`, deliberately not an enum — no known values yet), and `providerData`. `DeliveryAllocationSource` includes `EXTERNAL_PROVIDER` alongside `DEFAULT_ROUTE`/`MANUAL` for the same reason.

This mirrors ADR-051's generic-connection-model shape **at the schema level only**. The `AccountingConnectionAdapter`/registry abstraction that ADR-051 builds is *not* built here, because there is exactly one provider today (native Stocdup) — an adapter/registry for a single implementation is the speculative generality this project's principles reject (root `CLAUDE.md`: minimal training and operational simplicity over engineered-ahead complexity).

If a real delivery-provider integration is built later, it should follow ADR-051's pattern properly — connection model, adapter interface, registry — with its own ADR at that time. This ADR's job is only to guarantee the reserved columns already exist, so that day's migration is additive rather than a retrofit.

### 3. Driver is free-text, no `Driver` entity or FK

`DeliveryRun.driverName` is a plain nullable string. No `Driver` directory/roster model exists, because none exists anywhere else in the product yet, and building one now — before any other part of the system needs it — is speculative. This is accepted debt, stated explicitly: a future Driver directory feature will need a migration to backfill/normalize these free-text values into FK references.

## Consequences

- The reserved provider-compatibility columns are additive-only for a future adapter — no retrofit migration is expected for the columns themselves. This is *not* integration-readiness; a second provider is still a real build (connection model, adapter, registry, its own ADR), just not a schema migration on top of everything else.
- `DeliveryProfile` and `DeliveryRoute`/`DeliveryRun` must keep evolving independently. A reviewer should treat any PR that adds day/cutoff logic to `DeliveryRoute`, or grouping/sequencing logic to `DeliveryProfile`, as a boundary violation of this decision.
- Driver free text is unvalidated and can drift (e.g. "Dave Walsh" vs. "D. Walsh" across runs). Accepted because it is descriptive metadata only — nothing in permissions, routing, or allocation logic keys off it — but a Driver directory, when built, must plan for backfilling this drift, not just adding a new FK column.
