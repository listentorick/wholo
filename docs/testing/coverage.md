# Unit test coverage

Coverage shows which source code the **unit tests** execute. It does not show
whether the assertions are good enough or whether the UI looks right, and it
does not include the `apps/api` integration specs.

## Running it

After the normal setup (`pnpm install`, then `prisma generate` for `@wholo/api`
and `@wholo/admin-api`):

```bash
pnpm test:coverage
```

This deletes every earlier coverage report, runs every package's unit tests
once with coverage, prints a per-package table and exits non-zero if a test
failed or the coverage check failed. CI runs exactly this command.

Arguments are passed to turbo:

```bash
pnpm test:coverage --filter=@wholo/portal   # one package; the others show "not run"
pnpm test:coverage --concurrency=1          # one package at a time (kinder to WSL)
pnpm test:coverage --concurrency=1 -- --maxWorkers=3   # and cap each runner's workers
```

`pnpm turbo test` and each package's `test` script are unchanged and do not
collect coverage.

## Where the reports are

| Report | Location |
|---|---|
| Per-package HTML — open to see uncovered files and lines | `apps/<app>/coverage/index.html`, `packages/<pkg>/coverage/index.html` |
| Per-package totals (machine-readable) | `<package>/coverage/coverage-summary.json` |
| Combined table | `coverage/summary.md` |
| Combined result (machine-readable) | `coverage/summary.json` |

All of these are gitignored. In GitHub Actions the combined table is on the
run's **Summary** page and every report is in the `coverage-reports` artifact,
kept for 14 days. Both are published when tests fail too; the table then says
the results are incomplete and names any package with no report.

## What is measured

Every source file counts, whether or not a test imports it — an untested file
shows as 0%, it is not left out.

| Packages | Source measured |
|---|---|
| NestJS apps (`api`, `admin-api`, `portal-api`, `driver-api`) | `src/**/*.ts` |
| Next.js apps (`admin`, `portal`, `driver`, `www`) | `src/**/*.{ts,tsx}` |
| `apps/keycloak` | `themes/**/*.js` |
| `packages/*` | `src/**/*.ts` (`.mjs` for `coverage-report`) |

Excluded everywhere:

- tests (`*.spec.*`, `*.test.*`) and test setup (`src/test/**`)
- TypeScript declarations (`*.d.ts`)
- generated code (`**/generated/**`, `*.generated.*`, and `apps/www/src/lib/og-font.ts`)

Excluded in the NestJS apps only: `*.module.ts` and `main.ts`, which are wiring
with no logic to test.

The lists live in each package's `jest.config.ts` / `vitest.config.*`. Keep them
the same when changing one.

A metric shows **N/A** when a package has no executable code for it (for
example, no branches). N/A never fails a minimum.

The **Overall** row is covered ÷ total summed across packages, so a large
package weighs more than a small one. It is not an average of the package
percentages.

## Minimum percentages

There are four minimums: lines, branches, functions and statements. Each one is
applied to **every package separately**, so strong coverage in one package
cannot hide weak coverage in another. The Overall row is never checked.

Set them in `coverage.thresholds.json` at the repo root:

```json
{ "lines": 80, "branches": 70, "functions": 80, "statements": 80 }
```

`0` means no minimum for that metric. An environment variable overrides the
file for one run — `COVERAGE_MIN_LINES`, `COVERAGE_MIN_BRANCHES`,
`COVERAGE_MIN_FUNCTIONS`, `COVERAGE_MIN_STATEMENTS`:

```bash
COVERAGE_MIN_LINES=80 pnpm test:coverage
```

In GitHub Actions the same four names are read from **repository variables**
(Settings → Secrets and variables → Actions → Variables). A variable that is
not set leaves the file's value in place.

### Reporting mode (the current setting)

All four minimums are `0`. Results are shown, and a low percentage never fails
anything. A package with no report is flagged in the table but does not fail
the run on its own. A failed test still fails the run.

### With a minimum set

The coverage check fails when:

- a package is below a minimum, or
- a package's report is missing or unreadable, or
- a test failed.

A filtered local run (`--filter`) does not treat the packages it left out as
missing.

## Effect on builds

`pnpm test:coverage` is the unit-test step of the `test` job in
`.github/workflows/build-images.yml`, and the `build` job needs `test` and
`integration`. So:

- a failed unit or integration test blocks image builds, as before;
- once a minimum is set, a failed coverage check blocks them too;
- otherwise nothing changes: a push to any branch runs the tests and builds
  the images; only `master` (a push or a manual run) publishes them.

The `test` job exposes outputs for later workflow conditions:
`coverage_result` (`pass`, `fail`, or `report-only` when no minimum is set) and
`coverage_lines`, `coverage_branches`, `coverage_functions`,
`coverage_statements` (the Overall percentages).

## How it works

Each package has a `test:cov` script (`jest --coverage` or
`vitest run --coverage`). `pnpm test:coverage` runs
`packages/coverage-report/src/cli.mjs`, which runs those through turbo
(uncached, and continuing past a failing package so the rest still report),
then reads each `coverage-summary.json`. The rules — totals, minimums, missing
reports, the table — are plain functions in
`packages/coverage-report/src/report.mjs`, tested in `report.spec.mjs`.

A new workspace package is included automatically once it has a `test:cov`
script.
