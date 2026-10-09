import { describe, expect, it } from 'vitest';
import {
  evaluate,
  formatPct,
  overall,
  pct,
  readPackageSummary,
  renderMarkdown,
  resolveThresholds,
  toOutputs,
} from './report.mjs';

const NO_THRESHOLDS = { lines: 0, branches: 0, functions: 0, statements: 0 };

/** A package where every metric has the same covered/total. */
function pkg(name, covered, total) {
  const counts = { covered, total };
  return {
    name,
    status: 'ok',
    metrics: { lines: counts, branches: counts, functions: counts, statements: counts },
  };
}

describe('readPackageSummary', () => {
  it('reads covered and total counts from the summary total', () => {
    const summary = {
      total: {
        lines: { total: 10, covered: 8, skipped: 0, pct: 80 },
        branches: { total: 4, covered: 1, skipped: 0, pct: 25 },
        functions: { total: 3, covered: 3, skipped: 0, pct: 100 },
        statements: { total: 12, covered: 9, skipped: 0, pct: 75 },
      },
      '/repo/src/a.ts': {},
    };
    expect(readPackageSummary(summary)).toEqual({
      lines: { covered: 8, total: 10 },
      branches: { covered: 1, total: 4 },
      functions: { covered: 3, total: 3 },
      statements: { covered: 9, total: 12 },
    });
  });

  it.each([
    ['null', null],
    ['no total', {}],
    ['a missing metric', { total: { lines: { total: 1, covered: 1 } } }],
    [
      'non-numeric counts',
      {
        total: {
          lines: { total: 'x', covered: 1 },
          branches: { total: 1, covered: 1 },
          functions: { total: 1, covered: 1 },
          statements: { total: 1, covered: 1 },
        },
      },
    ],
    [
      'more covered than total',
      {
        total: {
          lines: { total: 1, covered: 2 },
          branches: { total: 1, covered: 1 },
          functions: { total: 1, covered: 1 },
          statements: { total: 1, covered: 1 },
        },
      },
    ],
  ])('rejects %s', (_label, summary) => {
    expect(readPackageSummary(summary)).toBeNull();
  });
});

describe('pct and formatPct', () => {
  it('is N/A when there is no executable code', () => {
    expect(pct({ covered: 0, total: 0 })).toBeNull();
    expect(formatPct(null)).toBe('N/A');
  });

  it('rounds down, so a value just under a minimum never reads as meeting it', () => {
    expect(formatPct(pct({ covered: 79999, total: 100000 }))).toBe('79.99');
    expect(formatPct(pct({ covered: 1, total: 1 }))).toBe('100.00');
  });
});

describe('overall', () => {
  it('divides summed covered by summed total rather than averaging percentages', () => {
    // 90% of 1000 and 10% of 10: the mean of percentages would be 50%.
    const totals = overall([pkg('big', 900, 1000), pkg('small', 1, 10)]);
    expect(totals.lines).toEqual({ covered: 901, total: 1010 });
    expect(formatPct(pct(totals.lines))).toBe('89.20');
  });

  it('ignores packages without a report', () => {
    const totals = overall([pkg('a', 5, 10), { name: 'b', status: 'missing' }]);
    expect(totals.statements).toEqual({ covered: 5, total: 10 });
  });
});

describe('resolveThresholds', () => {
  it('uses the file values when no environment variable is set', () => {
    expect(resolveThresholds({ lines: 80, branches: 70, functions: 75, statements: 80 }, {})).toEqual({
      lines: 80,
      branches: 70,
      functions: 75,
      statements: 80,
    });
  });

  it('lets an environment variable override the file, per metric', () => {
    const thresholds = resolveThresholds({ lines: 80, branches: 70 }, { COVERAGE_MIN_LINES: '90' });
    expect(thresholds).toEqual({ lines: 90, branches: 70, functions: 0, statements: 0 });
  });

  it('treats a blank environment variable as unset (an undefined GitHub variable)', () => {
    expect(resolveThresholds({ lines: 80 }, { COVERAGE_MIN_LINES: '' }).lines).toBe(80);
  });

  it('defaults every metric to no minimum', () => {
    expect(resolveThresholds(undefined, {})).toEqual(NO_THRESHOLDS);
  });

  it.each(['abc', '-1', '101'])('rejects the invalid value %s', (value) => {
    expect(() => resolveThresholds({}, { COVERAGE_MIN_BRANCHES: value })).toThrow(/COVERAGE_MIN_BRANCHES/);
  });
});

describe('evaluate', () => {
  it('is report-only with no thresholds, however low the coverage', () => {
    const report = evaluate({ packages: [pkg('a', 1, 100)], thresholds: NO_THRESHOLDS, testsPassed: true });
    expect(report.mode).toBe('reporting');
    expect(report.result).toBe('report-only');
    expect(report.belowThreshold).toEqual([]);
  });

  it('does not fail reporting mode on a missing report, but names it', () => {
    const report = evaluate({
      packages: [pkg('a', 5, 10), { name: 'b', status: 'missing' }],
      thresholds: NO_THRESHOLDS,
      testsPassed: true,
    });
    expect(report.result).toBe('report-only');
    expect(report.unreported).toEqual(['b']);
  });

  it('fails when tests failed, even in reporting mode', () => {
    const report = evaluate({ packages: [pkg('a', 10, 10)], thresholds: NO_THRESHOLDS, testsPassed: false });
    expect(report.result).toBe('fail');
  });

  it('passes when every package meets every minimum', () => {
    const report = evaluate({
      packages: [pkg('a', 80, 100), pkg('b', 9, 10)],
      thresholds: { ...NO_THRESHOLDS, lines: 80 },
      testsPassed: true,
    });
    expect(report.mode).toBe('enforcing');
    expect(report.result).toBe('pass');
  });

  it('fails a weak package even when a strong one lifts the overall figure above the minimum', () => {
    const report = evaluate({
      packages: [pkg('strong', 990, 1000), pkg('weak', 1, 10)],
      thresholds: { ...NO_THRESHOLDS, lines: 80 },
      testsPassed: true,
    });
    expect(pct(report.overall.lines)).toBeGreaterThan(80);
    expect(report.result).toBe('fail');
    expect(report.belowThreshold).toEqual(['weak']);
  });

  it('checks only the metrics that have a minimum', () => {
    const mixed = {
      name: 'a',
      status: 'ok',
      metrics: {
        lines: { covered: 90, total: 100 },
        branches: { covered: 10, total: 100 },
        functions: { covered: 90, total: 100 },
        statements: { covered: 90, total: 100 },
      },
    };
    const linesOnly = evaluate({ packages: [mixed], thresholds: { ...NO_THRESHOLDS, lines: 80 }, testsPassed: true });
    expect(linesOnly.result).toBe('pass');

    const withBranches = evaluate({
      packages: [mixed],
      thresholds: { ...NO_THRESHOLDS, lines: 80, branches: 50 },
      testsPassed: true,
    });
    expect(withBranches.result).toBe('fail');
    expect(withBranches.packages[0].failures).toEqual(['branches']);
  });

  it('never fails a metric that has no executable code', () => {
    const report = evaluate({
      packages: [pkg('types-only', 0, 0)],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
      testsPassed: true,
    });
    expect(report.result).toBe('pass');
  });

  it.each(['missing', 'invalid'])('fails on a %s report once thresholds are set', (status) => {
    const report = evaluate({
      packages: [pkg('a', 10, 10), { name: 'b', status }],
      thresholds: { ...NO_THRESHOLDS, lines: 1 },
      testsPassed: true,
    });
    expect(report.result).toBe('fail');
    expect(report.unreported).toEqual(['b']);
  });

  it('does not count a package left out of a filtered run as missing', () => {
    const report = evaluate({
      packages: [pkg('a', 10, 10), { name: 'b', status: 'skipped' }],
      thresholds: { ...NO_THRESHOLDS, lines: 1 },
      testsPassed: true,
    });
    expect(report.result).toBe('pass');
    expect(report.unreported).toEqual([]);
  });
});

describe('renderMarkdown', () => {
  it('shows one row per package and a weighted overall row', () => {
    const report = evaluate({
      packages: [pkg('@wholo/big', 900, 1000), pkg('@wholo/small', 1, 10)],
      thresholds: NO_THRESHOLDS,
      testsPassed: true,
    });
    const markdown = renderMarkdown(report, { generatedAt: '2026-10-09T00:00:00.000Z', commit: 'abc1234' });
    expect(markdown).toContain('| @wholo/big | 90.00% (900/1000) |');
    expect(markdown).toContain('| @wholo/small | 10.00% (1/10) |');
    expect(markdown).toContain('| **Overall** | **89.20% (901/1010)** |');
    expect(markdown).toContain('reporting only');
    expect(markdown).toContain('Generated 2026-10-09T00:00:00.000Z · commit abc1234');
  });

  it('shows N/A for metrics with no executable code', () => {
    const report = evaluate({ packages: [pkg('@wholo/empty', 0, 0)], thresholds: NO_THRESHOLDS, testsPassed: true });
    expect(renderMarkdown(report)).toContain('| @wholo/empty | N/A | N/A | N/A | N/A | ok |');
  });

  it('names the failing metric and the minimums when a package is below one', () => {
    const report = evaluate({
      packages: [pkg('@wholo/weak', 1, 10)],
      thresholds: { ...NO_THRESHOLDS, lines: 80 },
      testsPassed: true,
    });
    const markdown = renderMarkdown(report);
    expect(markdown).toContain('enforcing, per package — lines ≥ 80%');
    expect(markdown).toContain('below minimum: lines');
    expect(markdown).toContain('**Result:** ❌ fail');
  });

  it('flags failed tests and missing or invalid reports', () => {
    const report = evaluate({
      packages: [pkg('@wholo/a', 5, 10), { name: '@wholo/b', status: 'missing' }, { name: '@wholo/c', status: 'invalid' }],
      thresholds: NO_THRESHOLDS,
      testsPassed: false,
    });
    const markdown = renderMarkdown(report);
    expect(markdown).toContain('Unit tests failed');
    expect(markdown).toContain('No usable coverage report for:** @wholo/b, @wholo/c');
    expect(markdown).toContain('| @wholo/b | — | — | — | — | ⚠️ no report |');
    expect(markdown).toContain('| @wholo/c | — | — | — | — | ⚠️ invalid report |');
  });
});

describe('toOutputs', () => {
  it('exposes the result and overall percentages', () => {
    const report = evaluate({
      packages: [pkg('big', 900, 1000), pkg('small', 1, 10)],
      thresholds: { ...NO_THRESHOLDS, lines: 50 },
      testsPassed: true,
    });
    expect(toOutputs(report)).toEqual({
      result: 'fail',
      mode: 'enforcing',
      lines: '89.20',
      branches: '89.20',
      functions: '89.20',
      statements: '89.20',
    });
  });

  it('reports N/A when nothing was measured', () => {
    const report = evaluate({ packages: [], thresholds: NO_THRESHOLDS, testsPassed: true });
    expect(toOutputs(report).lines).toBe('N/A');
  });
});
