import { daysBetween, orderingPeriods, orderingTrend } from './customer-ordering.logic';

describe('orderingPeriods', () => {
  it('is the 30 days ending today, both ends included, and the 30 days before', () => {
    expect(orderingPeriods('2026-10-17', 30)).toEqual({
      periodStart: '2026-09-18',
      periodEnd: '2026-10-17',
      previousStart: '2026-08-19',
      previousEnd: '2026-09-17',
    });
  });

  it('crosses month and year ends', () => {
    expect(orderingPeriods('2026-01-05', 30)).toMatchObject({ periodStart: '2025-12-07', previousEnd: '2025-12-06' });
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-10-09', '2026-10-17')).toBe(8);
    expect(daysBetween('2026-10-17', '2026-10-17')).toBe(0);
  });
});

describe('orderingTrend', () => {
  const base = { firstOrderDate: '2026-01-01', previousStart: '2026-08-19' };

  it('has not enough history for a customer who has never ordered', () => {
    expect(orderingTrend({ ...base, firstOrderDate: null, currentSpend: 0, previousSpend: 0 })).toBe('insufficient_history');
  });

  it('has not enough history when the first order falls after the previous period began', () => {
    expect(orderingTrend({ ...base, firstOrderDate: '2026-08-20', currentSpend: 500, previousSpend: 100 })).toBe(
      'insufficient_history',
    );
  });

  it('compares a customer who ordered from the first day of the previous period', () => {
    expect(orderingTrend({ ...base, firstOrderDate: '2026-08-19', currentSpend: 100, previousSpend: 100 })).toBe('steady');
  });

  it('is up or down on a change of 20% or more, steady below that', () => {
    expect(orderingTrend({ ...base, currentSpend: 1200, previousSpend: 1000 })).toBe('up');
    expect(orderingTrend({ ...base, currentSpend: 800, previousSpend: 1000 })).toBe('down');
    expect(orderingTrend({ ...base, currentSpend: 1150, previousSpend: 1000 })).toBe('steady');
  });

  it('is up when spending again after nothing the period before, steady with nothing in either', () => {
    expect(orderingTrend({ ...base, currentSpend: 50, previousSpend: 0 })).toBe('up');
    expect(orderingTrend({ ...base, currentSpend: 0, previousSpend: 0 })).toBe('steady');
  });
});
