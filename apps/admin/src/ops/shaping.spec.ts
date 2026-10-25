import { describe, expect, it } from 'vitest';
import type { PlatformDistributor } from '@wholo/types';
import { distributorQuery, lastOrderText, ordersSeries, percentChange, toLookAt } from './shaping';

function distributor(id: string, createdAt: string, attention: PlatformDistributor['attention']): PlatformDistributor {
  return { id, name: id, slug: id, ownerEmail: null, createdAt, activeCustomers: 0, products: 0, ordersLast30Days: 0, lastOrderAt: null, attention, myActiveGrant: null };
}

describe('percentChange', () => {
  it('compares with the previous period', () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(50, 100)).toBe(-50);
  });

  it('has nothing to compare with when the previous period was empty', () => {
    expect(percentChange(10, 0)).toBeNull();
  });
});

describe('ordersSeries', () => {
  it('keeps the days in order, one bar each', () => {
    expect(ordersSeries({ ordersPerDay: [{ date: '2026-10-22', orders: 3 }, { date: '2026-10-23', orders: 0 }] })).toEqual({
      dates: ['2026-10-22', '2026-10-23'],
      orders: [3, 0],
    });
  });
});

describe('toLookAt', () => {
  it('lists only wholesalers needing attention, newest first', () => {
    const list = [
      distributor('old', '2026-01-01T00:00:00Z', ['NO_RECENT_ORDERS']),
      distributor('fine', '2026-10-20T00:00:00Z', []),
      distributor('new', '2026-10-21T00:00:00Z', ['NEW_WITHOUT_PRODUCTS']),
    ];
    expect(toLookAt(list).map((d) => d.id)).toEqual(['new', 'old']);
    expect(toLookAt(list, 1).map((d) => d.id)).toEqual(['new']);
  });
});

describe('lastOrderText', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  it('says never, today, or how long ago', () => {
    expect(lastOrderText(null, now)).toBe('Never');
    expect(lastOrderText('2026-10-23T09:00:00Z', now)).toBe('Today');
    expect(lastOrderText('2026-10-20T12:00:00Z', now)).toBe('3 days ago');
  });
});

describe('distributorQuery', () => {
  const search = (value: string) => ({ id: 'f1', field: 'search', operator: 'contains', value });

  it('asks for everyone when nothing is chosen', () => {
    expect(distributorQuery([], 'all')).toEqual({});
  });

  it('passes the name search, trimmed, and the view', () => {
    expect(distributorQuery([search('  vine ')], 'mine')).toEqual({ q: 'vine', filter: 'mine' });
  });

  it('ignores a blank name search', () => {
    expect(distributorQuery([search('   ')], 'attention')).toEqual({ filter: 'attention' });
  });
});
