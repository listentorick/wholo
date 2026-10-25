import { attentionReasons, fillDailySeries } from './platform-shaping';

describe('fillDailySeries', () => {
  it('zero-fills a continuous series ending today', () => {
    const series = fillDailySeries([{ date: new Date('2026-10-22T00:00:00Z'), orders: 5 }], new Date('2026-10-23T15:00:00Z'), 3);
    expect(series).toEqual([
      { date: '2026-10-21', orders: 0 },
      { date: '2026-10-22', orders: 5 },
      { date: '2026-10-23', orders: 0 },
    ]);
  });

  it('ignores rows outside the window', () => {
    const series = fillDailySeries([{ date: new Date('2026-09-01T00:00:00Z'), orders: 9 }], new Date('2026-10-23T00:00:00Z'), 2);
    expect(series.map((s) => s.orders)).toEqual([0, 0]);
  });
});

describe('attentionReasons', () => {
  const now = new Date('2026-10-23T12:00:00Z');

  it('flags a new wholesaler with no products', () => {
    expect(attentionReasons({ createdAt: new Date('2026-10-20T00:00:00Z'), products: 0, lastOrderAt: null }, now)).toEqual([
      'NEW_WITHOUT_PRODUCTS',
    ]);
  });

  it('does not flag an older wholesaler for having no products', () => {
    expect(attentionReasons({ createdAt: new Date('2026-08-01T00:00:00Z'), products: 0, lastOrderAt: null }, now)).toEqual([]);
  });

  it('flags a wholesaler whose last order is more than 21 days old', () => {
    expect(attentionReasons({ createdAt: new Date('2026-01-01T00:00:00Z'), products: 10, lastOrderAt: new Date('2026-09-30T00:00:00Z') }, now)).toEqual([
      'NO_RECENT_ORDERS',
    ]);
  });

  it('does not flag a wholesaler that has never had an order as quiet', () => {
    expect(attentionReasons({ createdAt: new Date('2026-01-01T00:00:00Z'), products: 10, lastOrderAt: null }, now)).toEqual([]);
  });
});
