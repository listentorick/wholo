// Pure reporting logic for `pnpm test:coverage` — no file or process access,
// so every rule here is unit-tested (report.spec.mjs). The I/O lives in cli.mjs.
// See docs/testing/coverage.md.

export const METRICS = ['lines', 'branches', 'functions', 'statements'];

const ENV_NAMES = {
  lines: 'COVERAGE_MIN_LINES',
  branches: 'COVERAGE_MIN_BRANCHES',
  functions: 'COVERAGE_MIN_FUNCTIONS',
  statements: 'COVERAGE_MIN_STATEMENTS',
};

const isCount = (n) => Number.isInteger(n) && n >= 0;

/**
 * Reads the `total` block of an istanbul `coverage-summary.json` (the format
 * both Jest and Vitest write). Returns `{ lines: { covered, total }, ... }`,
 * or `null` when the content is not a usable summary.
 */
export function readPackageSummary(json) {
  const total = json?.total;
  if (!total || typeof total !== 'object') return null;
  const metrics = {};
  for (const metric of METRICS) {
    const entry = total[metric];
    if (!entry || !isCount(entry.covered) || !isCount(entry.total) || entry.covered > entry.total) {
      return null;
    }
    metrics[metric] = { covered: entry.covered, total: entry.total };
  }
  return metrics;
}

/** Percentage covered, or `null` when there is nothing executable to cover. */
export function pct({ covered, total }) {
  return total === 0 ? null : (covered / total) * 100;
}

/**
 * Overall figures: covered and total counts summed across packages, so a large
 * package weighs more than a small one (never a mean of package percentages).
 */
export function overall(packages) {
  const totals = {};
  for (const metric of METRICS) {
    totals[metric] = { covered: 0, total: 0 };
    for (const pkg of packages) {
      if (!pkg.metrics) continue;
      totals[metric].covered += pkg.metrics[metric].covered;
      totals[metric].total += pkg.metrics[metric].total;
    }
  }
  return totals;
}

/**
 * Minimum percentages per metric. An environment variable overrides the file;
 * unset or blank falls through. 0 means "no minimum" for that metric.
 * Throws on a value that is not a number between 0 and 100.
 */
export function resolveThresholds(fileConfig = {}, env = {}) {
  const thresholds = {};
  for (const metric of METRICS) {
    const envName = ENV_NAMES[metric];
    const fromEnv = env[envName];
    const hasEnv = fromEnv !== undefined && String(fromEnv).trim() !== '';
    const raw = hasEnv ? fromEnv : (fileConfig?.[metric] ?? 0);
    const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      const source = hasEnv ? envName : `coverage.thresholds.json "${metric}"`;
      throw new Error(`Invalid coverage threshold ${source}=${JSON.stringify(raw)} (expected 0-100)`);
    }
    thresholds[metric] = value;
  }
  return thresholds;
}

/**
 * Applies the thresholds to each package separately and decides the result.
 *
 * `packages`: `[{ name, status: 'ok' | 'missing' | 'invalid' | 'skipped', metrics? }]`
 * — `skipped` is a package deliberately left out of a filtered local run.
 *
 * Result: `fail` when tests failed; with any threshold set, also `fail` when a
 * package is below a minimum or its report is missing/invalid, else `pass`.
 * With no threshold set (reporting mode) a passing test run is `report-only`.
 */
export function evaluate({ packages, thresholds, testsPassed }) {
  const enforcing = METRICS.some((metric) => thresholds[metric] > 0);
  const evaluated = packages.map((pkg) => {
    const failures = [];
    if (pkg.status === 'ok') {
      for (const metric of METRICS) {
        const value = pct(pkg.metrics[metric]);
        if (thresholds[metric] > 0 && value !== null && value < thresholds[metric]) {
          failures.push(metric);
        }
      }
    }
    return { ...pkg, failures };
  });

  const belowThreshold = evaluated.filter((pkg) => pkg.failures.length > 0).map((pkg) => pkg.name);
  const unreported = evaluated
    .filter((pkg) => pkg.status === 'missing' || pkg.status === 'invalid')
    .map((pkg) => pkg.name);

  let result;
  if (!testsPassed) result = 'fail';
  else if (!enforcing) result = 'report-only';
  else result = belowThreshold.length > 0 || unreported.length > 0 ? 'fail' : 'pass';

  return {
    result,
    mode: enforcing ? 'enforcing' : 'reporting',
    testsPassed,
    thresholds,
    packages: evaluated,
    overall: overall(evaluated),
    belowThreshold,
    unreported,
  };
}

/** `81.23`, rounded down so a value just under a minimum never displays as meeting it. */
export function formatPct(value) {
  return value === null ? 'N/A' : (Math.floor(value * 100) / 100).toFixed(2);
}

function cell(counts, failed) {
  const value = pct(counts);
  if (value === null) return 'N/A';
  const text = `${formatPct(value)}% (${counts.covered}/${counts.total})`;
  return failed ? `**${text}** ❌` : text;
}

function statusText(pkg) {
  if (pkg.status === 'missing') return '⚠️ no report';
  if (pkg.status === 'invalid') return '⚠️ invalid report';
  if (pkg.status === 'skipped') return 'not run';
  if (pkg.failures.length > 0) return `❌ below minimum: ${pkg.failures.join(', ')}`;
  return 'ok';
}

/** The Markdown shown in the terminal, `coverage/summary.md` and the workflow Summary. */
export function renderMarkdown(report, { generatedAt, commit } = {}) {
  const lines = ['## Unit test coverage', ''];

  if (report.mode === 'enforcing') {
    const minimums = METRICS.filter((metric) => report.thresholds[metric] > 0)
      .map((metric) => `${metric} ≥ ${report.thresholds[metric]}%`)
      .join(', ');
    lines.push(`**Mode:** enforcing, per package — ${minimums}`);
  } else {
    lines.push('**Mode:** reporting only — no minimum percentages are set, so coverage cannot fail this check');
  }
  const verdict = { pass: '✅ pass', fail: '❌ fail', 'report-only': 'report only' }[report.result];
  lines.push(`**Result:** ${verdict}`, '');

  if (!report.testsPassed) {
    lines.push(
      '> ❌ **Unit tests failed.** The figures below are incomplete: a package whose tests failed may have partial or no coverage.',
      '',
    );
  }
  if (report.unreported.length > 0) {
    lines.push(`> ⚠️ **No usable coverage report for:** ${report.unreported.join(', ')}`, '');
  }
  if (report.belowThreshold.length > 0) {
    lines.push(`> ❌ **Below a minimum:** ${report.belowThreshold.join(', ')}`, '');
  }

  lines.push('| Package | Lines | Branches | Functions | Statements | Status |', '|---|---|---|---|---|---|');
  for (const pkg of report.packages) {
    const cells = METRICS.map((metric) =>
      pkg.metrics ? cell(pkg.metrics[metric], pkg.failures.includes(metric)) : '—',
    );
    lines.push(`| ${pkg.name} | ${cells.join(' | ')} | ${statusText(pkg)} |`);
  }
  const overallCells = METRICS.map((metric) => `**${cell(report.overall[metric], false)}**`);
  lines.push(`| **Overall** | ${overallCells.join(' | ')} | covered ÷ total across packages |`, '');

  lines.push('Unit tests only. N/A means the package has no executable code for that metric.');
  const stamp = [generatedAt && `Generated ${generatedAt}`, commit && `commit ${commit}`].filter(Boolean).join(' · ');
  if (stamp) lines.push('', stamp);
  return lines.join('\n') + '\n';
}

/** Step outputs for GitHub Actions: the result and the overall percentages. */
export function toOutputs(report) {
  const outputs = { result: report.result, mode: report.mode };
  for (const metric of METRICS) {
    outputs[metric] = formatPct(pct(report.overall[metric]));
  }
  return outputs;
}
