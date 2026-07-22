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
