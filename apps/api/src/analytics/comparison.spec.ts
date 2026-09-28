import { classifyComparison, classifyShareComparison } from './comparison';

const RANGE_END = new Date('2026-02-28T00:00:00.000Z');

describe('classifyComparison', () => {
  it('classifies insufficient_history when the distributor has no data at all yet', () => {
    const result = classifyComparison(500, 0, null, RANGE_END);
    expect(result.status).toBe('insufficient_history');
    expect(result.comparison).toBeNull();
    expect(result.absoluteChange).toBeNull();
    expect(result.percentageChange).toBeNull();
  });

  it('classifies insufficient_history when the earliest order is after the comparison range ends', () => {
    const earliestOrder = new Date('2026-03-05T00:00:00.000Z'); // after RANGE_END
    const result = classifyComparison(500, 0, earliestOrder, RANGE_END);
    expect(result.status).toBe('insufficient_history');
  });

  it('classifies "new" when history exists but this metric was genuinely zero last period', () => {
    const earliestOrder = new Date('2026-01-01T00:00:00.000Z'); // well before RANGE_END
    const result = classifyComparison(500, 0, earliestOrder, RANGE_END);
    expect(result.status).toBe('new');
    expect(result.comparison).toBe(0);
    expect(result.absoluteChange).toBe(500);
    expect(result.percentageChange).toBeNull();
  });

  it('classifies as a plain zero-to-zero "value", not "new", when both periods are zero', () => {
    const earliestOrder = new Date('2026-01-01T00:00:00.000Z');
    const result = classifyComparison(0, 0, earliestOrder, RANGE_END);
    expect(result.status).toBe('value');
    expect(result.percentageChange).toBeNull();
  });

  it('computes a normal absolute and percentage change', () => {
    const earliestOrder = new Date('2026-01-01T00:00:00.000Z');
    const result = classifyComparison(1300, 1000, earliestOrder, RANGE_END);
    expect(result.status).toBe('value');
    expect(result.absoluteChange).toBe(300);
    expect(result.percentageChange).toBe(30);
  });

  it('computes a negative percentage change for a decline', () => {
    const earliestOrder = new Date('2026-01-01T00:00:00.000Z');
    const result = classifyComparison(750, 1000, earliestOrder, RANGE_END);
    expect(result.absoluteChange).toBe(-250);
    expect(result.percentageChange).toBe(-25);
  });
});

describe('classifyShareComparison', () => {
  const HISTORY = new Date('2026-01-01T00:00:00.000Z');

  it('reports the change in percentage points, not a percentage of a percentage', () => {
    const result = classifyShareComparison({ part: 7, total: 10 }, { part: 5, total: 10 }, HISTORY, RANGE_END);
    expect(result).toEqual({ current: 0.7, comparison: 0.5, status: 'value', pointChange: expect.closeTo(20, 10) });
  });

  it('reports a fall as negative points', () => {
    const result = classifyShareComparison({ part: 1, total: 4 }, { part: 3, total: 4 }, HISTORY, RANGE_END);
    expect(result.pointChange).toBeCloseTo(-50);
  });

  it('has no current share, and no change, when the current period has no orders', () => {
    const result = classifyShareComparison({ part: 0, total: 0 }, { part: 3, total: 4 }, HISTORY, RANGE_END);
    expect(result).toEqual({ current: null, comparison: 0.75, status: 'value', pointChange: null });
  });

  it('is "new" when history exists but the comparison period had no orders', () => {
    const result = classifyShareComparison({ part: 2, total: 4 }, { part: 0, total: 0 }, HISTORY, RANGE_END);
    expect(result).toEqual({ current: 0.5, comparison: null, status: 'new', pointChange: null });
  });

  it('a share rising from zero is a normal points change, not "new"', () => {
    const result = classifyShareComparison({ part: 3, total: 6 }, { part: 0, total: 5 }, HISTORY, RANGE_END);
    expect(result).toEqual({ current: 0.5, comparison: 0, status: 'value', pointChange: 50 });
  });

  it('is insufficient_history when no data could have existed in the comparison window', () => {
    const result = classifyShareComparison({ part: 2, total: 4 }, { part: 0, total: 0 }, null, RANGE_END);
    expect(result).toEqual({ current: 0.5, comparison: null, status: 'insufficient_history', pointChange: null });
  });
});
