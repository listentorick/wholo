import { describe, it, expect } from 'vitest';
import { buyingTrendsSummary, escapeHtml, formatShare, hasExpectedOrders, healthTierSummary, reasonText, salesConcentrationSummary, shortDate } from './customer-health';
import type { CustomerHealthReason } from '@wholo/types';

describe('shortDate', () => {
  it('formats a YYYY-MM-DD date as "18 Sep"', () => {
    expect(shortDate('2026-09-18')).toBe('18 Sep');
  });
});

describe('reasonText', () => {
  it('passes a customer-driven reason through unchanged', () => {
    const reason: CustomerHealthReason = { code: 'SPEND_DOWN', category: 'customer_behaviour', severity: 'watch', text: 'Spend down 20%' };
    expect(reasonText(reason)).toBe('Spend down 20%');
  });

  it('prefixes an our_fault reason so it reads as our failure, not the customer\'s, without relying on colour', () => {
    const reason: CustomerHealthReason = { code: 'OUR_MISTAKES', category: 'our_fault', severity: 'watch', text: '1 order rejected or cancelled' };
    expect(reasonText(reason)).toBe('Us: 1 order rejected or cancelled');
  });
});

describe('healthTierSummary', () => {
  it('names every tier and the total, for the tier bar\'s accessible label', () => {
    expect(healthTierSummary({ healthy: 178, watch: 52, at_risk: 18 })).toBe('178 of 248 customers healthy, 52 watch, 18 at risk');
  });
});

describe('buyingTrendsSummary', () => {
  it('reports no data yet when there are no weeks', () => {
    expect(buyingTrendsSummary([])).toBe('No buying-trend data yet.');
  });

  it('gives the value range across both series, for the chart\'s accessible label', () => {
    const weeks = [
      { weekStart: '2026-08-03', expectedOrders: 120, placedOrders: 98 },
      { weekStart: '2026-08-10', expectedOrders: 120, placedOrders: 165 },
    ];
    expect(buyingTrendsSummary(weeks)).toBe('Weekly expected vs. placed orders for the last 2 weeks, values ranging from 98 to 165');
  });
});

describe('buyingTrendsSummary without a baseline', () => {
  const weeks = [
    { weekStart: '2026-08-03', expectedOrders: null, placedOrders: 4 },
    { weekStart: '2026-08-10', expectedOrders: null, placedOrders: 9 },
  ];

  it('knows there is nothing to expect', () => {
    expect(hasExpectedOrders(weeks)).toBe(false);
    expect(hasExpectedOrders([{ weekStart: '2026-08-03', expectedOrders: 0, placedOrders: 1 }])).toBe(true);
  });

  it('describes only the placed orders, and does not count a missing expectation as 0', () => {
    expect(buyingTrendsSummary(weeks)).toBe('Weekly placed orders for the last 2 weeks, values ranging from 4 to 9');
  });
});

describe('formatShare', () => {
  it('formats a share to one decimal place', () => {
    expect(formatShare(0.2789)).toBe('27.9%');
  });

  it('shows an em dash when there is nothing to share out', () => {
    expect(formatShare(null)).toBe('—');
  });
});

describe('salesConcentrationSummary', () => {
  it('names the customers with their health, for the chart\'s accessible label', () => {
    const summary = salesConcentrationSummary({
      periodDays: 90, totalValue: 1000, top5Share: 0.6, otherValue: 400, otherShare: 0.4,
      topCustomers: [{ customerId: 'r1', customerName: 'Alpha', tier: 'at_risk', value: 600, share: 0.6 }],
    });
    expect(summary).toBe('Top 1 customers by sales in the last 90 days, 60.0% of the total: Alpha (At risk)');
  });

  it('says so when nothing was sold', () => {
    expect(salesConcentrationSummary({ periodDays: 90, totalValue: 0, top5Share: null, otherValue: 0, otherShare: null, topCustomers: [] })).toBe('No sales in the last 90 days.');
  });
});

describe('escapeHtml', () => {
  it('neutralises markup in a tenant-typed name before it goes into a tooltip\'s HTML', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('escapes ampersands first, so an already-escaped-looking name is not double-decoded', () => {
    expect(escapeHtml('Fish & Chips &lt;')).toBe('Fish &amp; Chips &amp;lt;');
    expect(escapeHtml("O'Brien")).toBe('O&#39;Brien');
  });

  it('leaves ordinary names alone', () => {
    expect(escapeHtml('Marlowe Hotel')).toBe('Marlowe Hotel');
  });
});
