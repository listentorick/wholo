export type ComparisonStatus = 'value' | 'new' | 'insufficient_history';

export interface Comparison {
  current: number;
  comparison: number | null;
  status: ComparisonStatus;
  absoluteChange: number | null;
  percentageChange: number | null;
}

/**
 * Classifies a current-vs-comparison metric pair into the three states the
 * dashboard PRD requires (§6.3, AC-03, AC-15) — never a bare number that
 * could be misread as "declined to zero" or "infinite growth":
 *
 * - `insufficient_history`: no data could have existed yet during the
 *   comparison window (the distributor's earliest-ever qualifying order is
 *   later than the comparison range's end) — maps to "Building history".
 * - `new`: history exists further back, but this specific metric's
 *   comparison value is genuinely zero (AC-03) — shown as "New", never a
 *   percentage (no divide-by-zero-as-infinity).
 * - `value`: a normal absolute + percentage change.
 */
export function classifyComparison(
  current: number,
  comparisonValue: number,
  earliestDataDate: Date | null,
  comparisonRangeEnd: Date,
): Comparison {
  if (!earliestDataDate || earliestDataDate.getTime() > comparisonRangeEnd.getTime()) {
    return { current, comparison: null, status: 'insufficient_history', absoluteChange: null, percentageChange: null };
  }

  const absoluteChange = current - comparisonValue;

  if (comparisonValue === 0) {
    return {
      current,
      comparison: 0,
      status: current > 0 ? 'new' : 'value',
      absoluteChange,
      percentageChange: null,
    };
  }

  return {
    current,
    comparison: comparisonValue,
    status: 'value',
    absoluteChange,
    percentageChange: (absoluteChange / comparisonValue) * 100,
  };
}

export interface ShareComparison {
  /** Share of the period's total, 0–1. Null when the period has nothing to take a share of. */
  current: number | null;
  comparison: number | null;
  status: ComparisonStatus;
  /** Change in percentage points (0.62 → 0.70 is +8), never a percentage of a percentage. */
  pointChange: number | null;
}

/**
 * The share counterpart of classifyComparison, for "part of the whole" metrics
 * (e.g. orders placed by customers themselves). Same three states: no history
 * for the comparison window → `insufficient_history`; history exists but the
 * comparison period had no total to take a share of → `new`; otherwise a
 * change in percentage points.
 */
export function classifyShareComparison(
  current: { part: number; total: number },
  comparison: { part: number; total: number },
  earliestDataDate: Date | null,
  comparisonRangeEnd: Date,
): ShareComparison {
  const currentShare = current.total > 0 ? current.part / current.total : null;

  if (!earliestDataDate || earliestDataDate.getTime() > comparisonRangeEnd.getTime()) {
    return { current: currentShare, comparison: null, status: 'insufficient_history', pointChange: null };
  }
  if (comparison.total === 0) {
    return { current: currentShare, comparison: null, status: currentShare != null ? 'new' : 'value', pointChange: null };
  }

  const comparisonShare = comparison.part / comparison.total;
  return {
    current: currentShare,
    comparison: comparisonShare,
    status: 'value',
    pointChange: currentShare == null ? null : (currentShare - comparisonShare) * 100,
  };
}
