import { classifyComparison } from './comparison';

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
