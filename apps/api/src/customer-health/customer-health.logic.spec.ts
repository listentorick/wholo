import {
  DELIVERY_AT_RISK_COUNT,
  DELIVERY_MIN_ATTEMPTS,
  DELIVERY_WATCH_COUNT,
  MISSED_ORDER_AT_RISK_MULTIPLIER,
  MISSED_ORDER_MIN_GAP_COUNT,
  MISSED_ORDER_WATCH_MULTIPLIER,
  MISTAKES_AT_RISK_COUNT,
  MISTAKES_WATCH_COUNT,
  NEVER_ORDERED_GRACE_DAYS,
  RANGE_AT_RISK_DECLINE_PCT,
  RANGE_MIN_ORDERS,
  RANGE_WATCH_DECLINE_PCT,
  SPEND_AT_RISK_DECLINE_PCT,
  SPEND_WATCH_DECLINE_PCT,
  buildSalesConcentration,
  daysBetween,
  evaluateDeliveryReliability,
  evaluateMissedOrder,
  evaluateMistakes,
  evaluateNeverOrdered,
  evaluateRangeNarrowing,
  evaluateSpendTrend,
  rollUpTier,
} from './customer-health.logic';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('daysBetween', () => {
  it('counts whole days forward', () => {
    expect(daysBetween(day('2026-09-01'), day('2026-09-11'))).toBe(10);
  });
});

describe('evaluateMissedOrder', () => {
  it('is silent with too little history', () => {
    expect(evaluateMissedOrder({ medianGapDays: 7, gapCount: MISSED_ORDER_MIN_GAP_COUNT - 1, currentGapDays: 100 })).toEqual([]);
  });

  it('is silent with no median (never computed)', () => {
    expect(evaluateMissedOrder({ medianGapDays: null, gapCount: 10, currentGapDays: 100 })).toEqual([]);
  });

  it('is silent under the watch multiplier', () => {
    const gapDays = 7 * MISSED_ORDER_WATCH_MULTIPLIER - 1;
    expect(evaluateMissedOrder({ medianGapDays: 7, gapCount: 5, currentGapDays: gapDays })).toEqual([]);
  });

  it('flags watch exactly at the watch multiplier', () => {
    const [r] = evaluateMissedOrder({ medianGapDays: 7, gapCount: 5, currentGapDays: 7 * MISSED_ORDER_WATCH_MULTIPLIER });
    expect(r).toMatchObject({ code: 'MISSED_ORDER', category: 'customer_behaviour', severity: 'watch' });
  });

  it('flags at-risk exactly at the at-risk multiplier', () => {
    const [r] = evaluateMissedOrder({ medianGapDays: 7, gapCount: 5, currentGapDays: 7 * MISSED_ORDER_AT_RISK_MULTIPLIER });
    expect(r).toMatchObject({ code: 'MISSED_ORDER', severity: 'at_risk' });
  });
});

describe('evaluateSpendTrend', () => {
  const base = { earliestDataDate: day('2026-01-01'), comparisonRangeEnd: day('2026-08-01') };

  it('is silent when spend is flat or up', () => {
    expect(evaluateSpendTrend({ ...base, current: 100, comparisonValue: 100 })).toEqual([]);
    expect(evaluateSpendTrend({ ...base, current: 120, comparisonValue: 100 })).toEqual([]);
  });

  it('is silent when there is insufficient history', () => {
    expect(evaluateSpendTrend({ current: 10, comparisonValue: 100, earliestDataDate: day('2026-09-01'), comparisonRangeEnd: day('2026-08-01') })).toEqual([]);
  });

  it('flags watch exactly at the watch decline percentage', () => {
    const comparisonValue = 100;
    const current = comparisonValue * (1 - SPEND_WATCH_DECLINE_PCT / 100);
    const [r] = evaluateSpendTrend({ ...base, current, comparisonValue });
    expect(r).toMatchObject({ code: 'SPEND_DOWN', severity: 'watch' });
  });

  it('flags at-risk exactly at the at-risk decline percentage', () => {
    const comparisonValue = 100;
    const current = comparisonValue * (1 - SPEND_AT_RISK_DECLINE_PCT / 100);
    const [r] = evaluateSpendTrend({ ...base, current, comparisonValue });
    expect(r).toMatchObject({ code: 'SPEND_DOWN', severity: 'at_risk' });
  });
});

describe('evaluateDeliveryReliability', () => {
  it('is silent with too few attempts to judge', () => {
    expect(evaluateDeliveryReliability({ attempted: DELIVERY_MIN_ATTEMPTS - 1, lateOrFailed: DELIVERY_MIN_ATTEMPTS - 1 })).toEqual([]);
  });

  it('is silent under the watch count', () => {
    expect(evaluateDeliveryReliability({ attempted: 8, lateOrFailed: DELIVERY_WATCH_COUNT - 1 })).toEqual([]);
  });

  it('flags watch exactly at the watch count', () => {
    const [r] = evaluateDeliveryReliability({ attempted: 8, lateOrFailed: DELIVERY_WATCH_COUNT });
    expect(r).toMatchObject({ code: 'LATE_DELIVERY', severity: 'watch' });
  });

  it('flags at-risk exactly at the at-risk count', () => {
    const [r] = evaluateDeliveryReliability({ attempted: 8, lateOrFailed: DELIVERY_AT_RISK_COUNT });
    expect(r).toMatchObject({ code: 'LATE_DELIVERY', severity: 'at_risk' });
  });
});

describe('evaluateNeverOrdered', () => {
  const today = day('2026-09-24');

  it('is silent once the customer has ordered', () => {
    expect(evaluateNeverOrdered({ hasEverOrdered: true, activeSince: day('2026-01-01') }, today)).toEqual([]);
  });

  it('is silent inside the grace period', () => {
    const createdAt = new Date(today.getTime() - (NEVER_ORDERED_GRACE_DAYS - 1) * 86_400_000);
    expect(evaluateNeverOrdered({ hasEverOrdered: false, activeSince: createdAt }, today)).toEqual([]);
  });

  it('flags at-risk exactly at the grace period, forcing at-risk with no other signal', () => {
    const createdAt = new Date(today.getTime() - NEVER_ORDERED_GRACE_DAYS * 86_400_000);
    const [r] = evaluateNeverOrdered({ hasEverOrdered: false, activeSince: createdAt }, today);
    expect(r).toMatchObject({ code: 'NEVER_ORDERED', category: 'no_relationship_yet', severity: 'at_risk' });
  });
});

describe('evaluateMistakes', () => {
  it('is silent with none', () => {
    expect(evaluateMistakes({ rejectedOrCancelledCount: 0 })).toEqual([]);
  });

  it('flags watch exactly at the watch count, tagged our_fault', () => {
    const [r] = evaluateMistakes({ rejectedOrCancelledCount: MISTAKES_WATCH_COUNT });
    expect(r).toMatchObject({ code: 'OUR_MISTAKES', category: 'our_fault', severity: 'watch' });
  });

  it('flags at-risk exactly at the at-risk count, still tagged our_fault', () => {
    const [r] = evaluateMistakes({ rejectedOrCancelledCount: MISTAKES_AT_RISK_COUNT });
    expect(r).toMatchObject({ code: 'OUR_MISTAKES', category: 'our_fault', severity: 'at_risk' });
  });
});

describe('evaluateRangeNarrowing', () => {
  it('is silent with too few orders in either window', () => {
    expect(evaluateRangeNarrowing({ currentAvgSku: 2, currentOrders: RANGE_MIN_ORDERS - 1, baselineAvgSku: 5, baselineOrders: 5 })).toEqual([]);
    expect(evaluateRangeNarrowing({ currentAvgSku: 2, currentOrders: 5, baselineAvgSku: 5, baselineOrders: RANGE_MIN_ORDERS - 1 })).toEqual([]);
  });

  it('is silent with no baseline', () => {
    expect(evaluateRangeNarrowing({ currentAvgSku: 2, currentOrders: 5, baselineAvgSku: null, baselineOrders: 5 })).toEqual([]);
  });

  it('is silent when the range is flat or widening', () => {
    expect(evaluateRangeNarrowing({ currentAvgSku: 5, currentOrders: 5, baselineAvgSku: 5, baselineOrders: 5 })).toEqual([]);
    expect(evaluateRangeNarrowing({ currentAvgSku: 6, currentOrders: 5, baselineAvgSku: 5, baselineOrders: 5 })).toEqual([]);
  });

  it('flags watch exactly at the watch decline percentage', () => {
    const baselineAvgSku = 10;
    const currentAvgSku = baselineAvgSku * (1 - RANGE_WATCH_DECLINE_PCT / 100);
    const [r] = evaluateRangeNarrowing({ currentAvgSku, currentOrders: 5, baselineAvgSku, baselineOrders: 5 });
    expect(r).toMatchObject({ code: 'RANGE_NARROWING', severity: 'watch' });
  });

  it('flags at-risk exactly at the at-risk decline percentage', () => {
    const baselineAvgSku = 10;
    const currentAvgSku = baselineAvgSku * (1 - RANGE_AT_RISK_DECLINE_PCT / 100);
    const [r] = evaluateRangeNarrowing({ currentAvgSku, currentOrders: 5, baselineAvgSku, baselineOrders: 5 });
    expect(r).toMatchObject({ code: 'RANGE_NARROWING', severity: 'at_risk' });
  });
});

describe('rollUpTier', () => {
  it('is healthy with no reasons', () => {
    expect(rollUpTier([])).toBe('healthy');
  });

  it('is healthy with only an our_fault reason, even at at-risk severity', () => {
    expect(rollUpTier([{ code: 'OUR_MISTAKES', category: 'our_fault', severity: 'at_risk', text: 'x' }])).toBe('healthy');
  });

  it('is watch with exactly one watch-severity risk reason', () => {
    expect(rollUpTier([{ code: 'SPEND_DOWN', category: 'customer_behaviour', severity: 'watch', text: 'x' }])).toBe('watch');
  });

  it('escalates to at-risk when two watch-severity risk reasons co-occur', () => {
    const reasons: Parameters<typeof rollUpTier>[0] = [
      { code: 'SPEND_DOWN', category: 'customer_behaviour', severity: 'watch', text: 'x' },
      { code: 'LATE_DELIVERY', category: 'customer_behaviour', severity: 'watch', text: 'y' },
    ];
    expect(rollUpTier(reasons)).toBe('at_risk');
  });

  it('is at-risk with any single at-risk-severity risk reason', () => {
    expect(rollUpTier([{ code: 'RANGE_NARROWING', category: 'customer_behaviour', severity: 'at_risk', text: 'x' }])).toBe('at_risk');
  });

  it('never-ordered forces at-risk alone, with no other reason present', () => {
    expect(rollUpTier([{ code: 'NEVER_ORDERED', category: 'no_relationship_yet', severity: 'at_risk', text: 'x' }])).toBe('at_risk');
  });

  it('an our_fault reason alongside one watch reason does not push past watch', () => {
    const reasons: Parameters<typeof rollUpTier>[0] = [
      { code: 'OUR_MISTAKES', category: 'our_fault', severity: 'at_risk', text: 'x' },
      { code: 'SPEND_DOWN', category: 'customer_behaviour', severity: 'watch', text: 'y' },
    ];
    expect(rollUpTier(reasons)).toBe('watch');
  });
});

describe('buildSalesConcentration', () => {
  const roster = [
    { organisationId: 'org-a', customerName: 'Alpha' },
    { organisationId: 'org-b', customerName: 'Beta' },
    { organisationId: 'org-c', customerName: 'Gamma' },
  ];
  const tiers = new Map<string, 'healthy' | 'watch' | 'at_risk'>([['org-a', 'at_risk'], ['org-b', 'healthy']]);
  const build = (sales: Array<{ traderCustomerId: string; value: number }>, r = roster) =>
    buildSalesConcentration({ salesByOrganisation: sales, roster: r, tierByOrganisation: tiers, periodDays: 90 });

  it('ranks customers by sales, carries each one\'s tier and share, and puts the rest in other', () => {
    const result = build([
      { traderCustomerId: 'org-b', value: 300 },
      { traderCustomerId: 'org-a', value: 500 },
      { traderCustomerId: 'org-c', value: 200 },
    ]);

    expect(result.topCustomers.map((c) => c.customerName)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(result.topCustomers[0]).toEqual({ customerId: 'org-a', customerName: 'Alpha', tier: 'at_risk', value: 500, share: 0.5 });
    expect(result.totalValue).toBe(1000);
    expect(result.top5Share).toBe(1);
    expect(result.otherValue).toBe(0);
  });

  it('identifies a customer by organisation id — what /customers/:id addresses, so the link resolves', () => {
    const [top] = build([{ traderCustomerId: 'org-a', value: 10 }]).topCustomers;
    expect(top.customerId).toBe('org-a');
  });

  it('shows only the top five; the rest add up to other, and top + other is the whole', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ organisationId: `org-${i}`, customerName: `C${i}` }));
    const sales = many.map((c, i) => ({ traderCustomerId: c.organisationId, value: (i + 1) * 100 }));

    const result = build(sales, many);

    expect(result.topCustomers).toHaveLength(5);
    expect(result.topCustomers.map((c) => c.value)).toEqual([700, 600, 500, 400, 300]);
    expect(result.otherValue).toBe(300); // 100 + 200
    expect(result.topCustomers.reduce((n, c) => n + c.value, 0) + result.otherValue).toBe(result.totalValue);
    expect(result.top5Share).toBeCloseTo(2500 / 2800);
  });

  it('counts sales from a customer with no active relationship in the total, under other', () => {
    const result = build([
      { traderCustomerId: 'org-a', value: 400 },
      { traderCustomerId: 'org-gone', value: 600 },
    ]);

    expect(result.topCustomers.map((c) => c.customerName)).toEqual(['Alpha']);
    expect(result.totalValue).toBe(1000);
    expect(result.otherValue).toBe(600);
    expect(result.otherShare).toBe(0.6);
  });

  it('treats a customer with no computed tier as healthy', () => {
    const [top] = build([{ traderCustomerId: 'org-c', value: 10 }]).topCustomers;
    expect(top.tier).toBe('healthy');
  });

  it('has null shares and no customers when nothing was sold, rather than dividing by zero', () => {
    const result = build([]);
    expect(result).toEqual({ periodDays: 90, totalValue: 0, top5Share: null, topCustomers: [], otherValue: 0, otherShare: null });
  });
});
