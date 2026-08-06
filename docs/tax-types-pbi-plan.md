# Xero Tax Types PBI — Phase Plan

Resolves tax types end-to-end: Stocdup-native tax types, order/cart tax calculation, syncing and mapping tax rates from an accounting integration (Xero is the only implementation so far, but the framework — `AccountingConnectionAdapter`, `AccountingProvider`, `AccountingProductService`/`AccountingTaxTypeService` — is provider-neutral by design per ADR-051), and resolving tax on accounting product import/match and on invoice export.

## Status

| Phase | Description | Status |
|---|---|---|
| 1 | Stocdup `TaxType`s + publish-gating | ✅ Completed |
| 2 | Order/cart tax calculation | ✅ Completed |
| 3 | Accounting tax-rate sync + mapping UI | ✅ Completed |
| 4 | Accounting product import/match tax resolution | ✅ Completed |
| 5 | Invoice export tax resolution | ⬜ Not started |

---

## Phase 1 — Stocdup TaxTypes + publish-gating

Introduced Stocdup-native `TaxType` records and wired publish-gating so a product cannot go `ACTIVE` without a `taxTypeId` (`AdminProductsService.assertPublishable`).

## Phase 2 — Order/cart tax calculation

Order and cart totals calculate tax using the product's assigned `TaxType`.

## Phase 3 — Accounting tax-rate sync + mapping UI

Syncs tax rates from the active accounting connection into an `ExternalAccountingTaxType` cache, and provides a mapping UI to confirm links between external tax codes and Stocdup `TaxType`s (`TaxTypeAccountingMapping`, with suggestions surfaced via `AccountingTaxTypeMatchSuggestion`).

## Phase 4 — Accounting product import/match tax resolution

Resolves an imported/matched accounting product's tax code through the Phase 3 mapping.

- **`AccountingTaxTypeService.resolveTaxTypeForCode(accountingConnectionId, code)`** — resolves an external tax code to a confirmed Stocdup `TaxType`, or `null` if unresolved (no code, code not synced, or synced but unmapped).
- **Import (`importAsNewProduct`)** — auto-applies the resolved tax type if the code maps to a confirmed `TaxType`; otherwise leaves `taxTypeId: null` as before. No new UI: the existing "No tax type" flag on the main Stocdup Products page's Tax column already surfaces unresolved products — no separate "unmapped" indicator was added in the Integrations UI.
- **Match / confirm-suggestion (`matchToExistingProduct`, `confirmSuggestion`)** — auto-applies the resolved tax type unless the target product already has a *different* non-null tax type set, in which case it throws a `ConflictException` (`error: 'TAX_TYPE_CONFLICT'`, surfaced to the frontend via `ProblemDetailsFilter` as `problem.title`). The caller resubmits with `confirmTaxTypeOverride: true` to proceed. This introduced the codebase's first "conflict → 409 → resubmit-with-confirm" pattern.
- New `TaxTypeConflictModal.tsx` (built on the shared `Modal.tsx` primitive) shows the conflict and lets the user confirm the overwrite, wired into both `MatchExistingProductDialog.tsx` and `ProductRowActions.tsx`.
- DTO/type/client plumbing (`confirmTaxTypeOverride?: boolean`) threaded through `apps/api` → `apps/admin-api` → `packages/types`/`packages/admin-api-client` → `apps/admin`.
- Nothing in this phase touches `xero-connection.adapter.ts` or any provider-specific code — it all operates on the generic connection/cache/mapping layer.

**Verification (2026-08-06)**: full per-app suites now run clean — `apps/api` 972/972 (84 suites), `apps/admin` 288/288 (63 suites), `apps/admin-api` 112/112 (17 suites) — and typechecks are clean across `apps/api`, `apps/admin`, `apps/admin-api`, `packages/types`, `packages/admin-api-client`. `apps/api/prisma/schema.prisma` and `apps/admin-api/prisma/schema.prisma` are byte-identical per ADR-052.

The full-suite run caught three stale specs that individual/targeted spec runs had missed, because they weren't in the set of files touched for the `confirmTaxTypeOverride` DTO threading even though their subject under test now requires it — all fixed in this pass:
- `apps/api/src/accounting/accounting-product.controller.spec.ts` — `confirmSuggestion`/`matchToExistingProduct` calls updated for the new DTO param.
- `apps/admin-api/src/accounting/accounting.controller.spec.ts` and `accounting.service.spec.ts` — same pattern, one level up the BFF call chain.

**Known gap, not blocking Phase 4 but flagged for follow-up**: Phases 1–3 UI/BFF surfaces have **zero unit test coverage**, which is a departure from CLAUDE.md's "unit tests are required for all new code" policy and from this codebase's own established pattern (the equivalent product/contact integration surfaces each have `.spec.tsx`/`.spec.ts` coverage):
- `apps/admin-api/src/tax-types/` (CRUD controller + service for Stocdup `TaxType`s) — no `.spec.ts` at all.
- `apps/admin-api/src/accounting/accounting.controller.ts` / `accounting.service.ts` — the tax-type mapping-UI methods added in Phase 3 (`listTaxTypes`, `syncTaxTypes`, `importTaxType`, `confirmTaxTypeSuggestion`, `matchTaxType`, `ignoreTaxType`, `unlinkTaxTypeMapping`) have no test cases in the existing spec files (product/contact equivalents in the same files are tested).
- `apps/admin/src/components/tax-types/` and `apps/admin/src/components/integrations/tax-types/` (7 components, ~1000 lines: `TaxTypeForm`, `AccountingTaxTypesTable`, `CreateTaxTypeFromExternalDialog`, `MatchExistingTaxTypeDialog`, `SyncNowButton`, `TaxTypeRowActions`, `TaxTypesTab`) and the `apps/admin/src/app/tax-types/` pages — no `.spec.tsx` at all, versus full coverage for the analogous products/contacts components.

`apps/api`-side tax logic is covered (`tax-types.service.spec.ts`, `accounting-tax-type.service.spec.ts`, plus `apps/api/test/tax-types.integration-spec.ts` and `accounting-tax-types.integration-spec.ts` exercising the controllers over HTTP) — the gap is specifically the admin-api BFF layer and the admin frontend for tax types.

Nothing from Phase 4 has been built into Docker images, deployed, or committed yet.

## Phase 5 — Invoice export tax resolution

Resolve the tax code to send to the accounting integration when exporting an invoice (Wholo → Xero), the counterpart of Phase 4's import-direction resolution. Not yet designed — scope, resolution rules, and handling of unresolved/unmapped tax types on export still need a plan-mode pass before implementation starts.
