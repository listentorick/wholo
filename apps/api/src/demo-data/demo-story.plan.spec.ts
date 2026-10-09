import type { CustomerHealthReason, CustomerHealthTier } from '@wholo/types';
import {
  MISSED_ORDER_HISTORY_DATES,
  DELIVERY_WINDOW,
  evaluateDeliveryReliability,
  evaluateMissedOrder,
  evaluateRangeNarrowing,
  evaluateSpendTrend,
  rollUpTier,
} from '../customer-health/customer-health.logic';
import { DEMO_CUSTOMER_COUNT, DemoOrder, DemoStory, STORY, buildDemoStory } from './demo-story.plan';

const DAY_MS = 24 * 60 * 60 * 1000;

const customers = Array.from({ length: DEMO_CUSTOMER_COUNT }, (_, i) => ({
  organisationId: `customer-${i}`,
  routeIndex: i % 3,
  dropPosition: Math.floor(i / 3) + 1,
}));
const products = Array.from({ length: 42 }, (_, i) => ({ id: `product-${i}`, pricePence: [185, 1450, 2800, 165, 1200, 450, 1650, 3200][i % 8] }));

const build = (now: string): { story: DemoStory; today: Date } => {
  const nowDate = new Date(now);
  const today = new Date(`${now.slice(0, 10)}T00:00:00.000Z`);
  return { story: buildDemoStory({ today, now: nowDate, customers, products }), today };
};

const qualifying = (o: DemoOrder) => o.status !== 'REJECTED' && o.status !== 'CANCELLED';
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = (sorted.length - 1) / 2;
  return (sorted[Math.floor(mid)] + sorted[Math.ceil(mid)]) / 2;
};
const spend = (orders: DemoOrder[], from: number, to: number) =>
  orders.filter((o) => qualifying(o) && o.placedDay >= from && o.placedDay <= to).reduce((total, o) => total + o.subtotalPence, 0);

/** The reasons the real customer-health rules give a customer, from the same inputs the service derives in SQL. */
function reasonsFor(story: DemoStory, today: Date, customerIndex: number): CustomerHealthReason[] {
  const orders = story.orders.filter((o) => o.customerIndex === customerIndex);
  const placedDays = [...new Set(orders.filter(qualifying).map((o) => o.placedDay))].sort((a, b) => b - a).slice(0, MISSED_ORDER_HISTORY_DATES);
  const gaps = placedDays.slice(0, -1).map((day, n) => day - placedDays[n + 1]);

  const attempts = orders
    .filter((o) => o.outcome)
    .sort((a, b) => b.outcome!.recordedAt.getTime() - a.outcome!.recordedAt.getTime())
    .slice(0, DELIVERY_WINDOW);
  const lateOrFailed = attempts.filter((o) => o.outcome!.outcome === 'UNABLE_TO_DELIVER' || o.outcome!.recordedAt.getTime() >= o.deliveryDate.getTime() + DAY_MS).length;

  const range = (from: number, to: number) => {
    const inWindow = orders.filter((o) => qualifying(o) && o.placedDay >= from && o.placedDay <= to);
    const avg = inWindow.length ? inWindow.reduce((total, o) => total + new Set(o.lines.map((l) => l.productId)).size, 0) / inWindow.length : null;
    return { avg, orders: inWindow.length };
  };
  const currentRange = range(-29, 0);
  const baselineRange = range(-59, -30);

  return [
    ...evaluateMissedOrder({ medianGapDays: gaps.length ? median(gaps) : null, gapCount: gaps.length, currentGapDays: -placedDays[0] }),
    ...evaluateSpendTrend({
      current: spend(orders, -29, 0),
      comparisonValue: spend(orders, -59, -30),
      earliestDataDate: new Date(today.getTime() - 182 * DAY_MS),
      comparisonRangeEnd: new Date(today.getTime() - 30 * DAY_MS),
    }),
    ...evaluateDeliveryReliability({ attempted: attempts.length, lateOrFailed }),
    ...evaluateRangeNarrowing({ currentAvgSku: currentRange.avg, currentOrders: currentRange.orders, baselineAvgSku: baselineRange.avg, baselineOrders: baselineRange.orders }),
  ];
}

const tiers = (story: DemoStory, today: Date): CustomerHealthTier[] => customers.map((_, i) => rollUpTier(reasonsFor(story, today, i)));
const codes = (story: DemoStory, today: Date, customerIndex: number) => reasonsFor(story, today, customerIndex).map((r) => `${r.code}:${r.severity}`);

// A Tuesday mid-morning, a Monday (Friday's orders are the last before the weekend), a Sunday (no orders
// were placed the day before) and just after midnight (almost none of today has happened yet).
const MOMENTS = ['2026-10-06T10:40:00.000Z', '2026-10-05T14:05:00.000Z', '2026-10-11T09:15:00.000Z', '2026-10-08T00:04:00.000Z'];

describe.each(MOMENTS)('buildDemoStory at %s', (now) => {
  const { story, today } = build(now);
  const nowMs = new Date(now).getTime();
  const todays = story.runs.filter((r) => r.deliveryDay === 0);
  const todaysOrders = story.orders.filter((o) => o.runId && todays.some((r) => r.id === o.runId));

  it('has three runs out today carrying thirty drops between them', () => {
    expect(todays).toHaveLength(3);
    expect(todays.map((r) => r.status)).toEqual(['READY', 'READY', 'READY']);
    expect(todays.map((r) => r.orderIds.length).sort((a, b) => b - a)).toEqual([12, 9, 9]);
    expect(todaysOrders).toHaveLength(30);
  });

  it('is part-way through the day: 15 delivered, 1 failed, 14 still to do', () => {
    expect(todaysOrders.filter((o) => o.status === 'DELIVERED')).toHaveLength(15);
    expect(todaysOrders.filter((o) => o.status === 'DELIVERY_FAILED')).toHaveLength(1);
    expect(todaysOrders.filter((o) => o.status === 'ACCEPTED')).toHaveLength(14);
  });

  it("records today's drops today, in the past, in the order they were made", () => {
    for (const run of todays) {
      const times = run.orderIds.map((id) => story.orders.find((o) => o.id === id)!.outcome?.recordedAt.getTime()).filter((t): t is number => t !== undefined);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      for (const t of times) {
        expect(t).toBeGreaterThanOrEqual(today.getTime());
        expect(t).toBeLessThanOrEqual(nowMs);
      }
    }
  });

  it('leaves three orders awaiting acceptance and one of the last delivery day overdue', () => {
    expect(story.orders.filter((o) => o.status === 'SUBMITTED')).toHaveLength(3);
    expect(story.orders.filter((o) => o.status === 'ACCEPTED' && o.deliveryDay < 0)).toHaveLength(1);
  });

  it('has only today\'s failure inside the last 24 hours', () => {
    const recentFailures = story.orders.filter((o) => o.status === 'DELIVERY_FAILED' && o.outcome!.recordedAt.getTime() > nowMs - DAY_MS);
    expect(recentFailures).toHaveLength(1);
    expect(recentFailures[0].deliveryDay).toBe(0);
  });

  it('delivered the great majority on time on every previous delivery day', () => {
    const byDay = new Map<number, DemoOrder[]>();
    for (const o of story.orders.filter((x) => x.outcome && x.deliveryDay < 0)) byDay.set(o.deliveryDay, [...(byDay.get(o.deliveryDay) ?? []), o]);
    expect(byDay.size).toBeGreaterThan(150);
    for (const dayOrders of byDay.values()) {
      const onTime = dayOrders.filter((o) => o.status === 'DELIVERED' && o.outcome!.recordedAt.getTime() < o.deliveryDate.getTime() + DAY_MS).length;
      expect(dayOrders.length).toBeGreaterThanOrEqual(20);
      expect(onTime / dayOrders.length).toBeGreaterThan(0.75);
    }
  });

  it('never has anything happen in the future, or out of order', () => {
    for (const o of story.orders) {
      expect(o.submittedAt.getTime()).toBeLessThanOrEqual(nowMs);
      if (o.acceptedAt) {
        expect(o.acceptedAt.getTime()).toBeGreaterThanOrEqual(o.submittedAt.getTime());
        expect(o.acceptedAt.getTime()).toBeLessThanOrEqual(nowMs);
      }
      if (o.outcome) expect(o.outcome.recordedAt.getTime()).toBeGreaterThan(o.acceptedAt!.getTime());
    }
    for (const run of story.runs) if (run.readyAt) expect(run.readyAt.getTime()).toBeLessThanOrEqual(nowMs);
  });

  it('has all sixty customers buying in the last 90 days', () => {
    const active = new Set(story.orders.filter((o) => qualifying(o) && o.placedDay >= -89).map((o) => o.customerIndex));
    expect(active.size).toBe(DEMO_CUSTOMER_COUNT);
  });

  it('puts exactly three customers at risk and four on watch under the real health rules', () => {
    const result = tiers(story, today);
    const at = (tier: CustomerHealthTier) => result.map((t, i) => (t === tier ? i : -1)).filter((i) => i >= 0).sort((a, b) => a - b);
    expect(at('at_risk')).toEqual([STORY.lateDeliveries, STORY.spendCollapsing, STORY.stoppedOrdering].sort((a, b) => a - b));
    expect(at('watch')).toEqual([STORY.watchLateA, STORY.watchSpend, STORY.watchRange, STORY.watchLateB].sort((a, b) => a - b));
  });

  it('gives each flagged customer the reason the story intends', () => {
    expect(codes(story, today, STORY.stoppedOrdering)).toContain('MISSED_ORDER:at_risk');
    expect(codes(story, today, STORY.spendCollapsing)).toEqual(expect.arrayContaining(['SPEND_DOWN:at_risk', 'RANGE_NARROWING:at_risk']));
    expect(codes(story, today, STORY.lateDeliveries)).toEqual(['LATE_DELIVERY:at_risk']);
    expect(codes(story, today, STORY.watchLateA)).toEqual(['LATE_DELIVERY:watch']);
    expect(codes(story, today, STORY.watchLateB)).toEqual(['LATE_DELIVERY:watch']);
    expect(codes(story, today, STORY.watchSpend)).toEqual(['SPEND_DOWN:watch']);
    expect(codes(story, today, STORY.watchRange)).toEqual(['RANGE_NARROWING:watch']);
  });

  it('spreads sales across the customer base rather than a few big accounts', () => {
    const byCustomer = customers.map((_, i) => spend(story.orders.filter((o) => o.customerIndex === i), -89, 0));
    const total = byCustomer.reduce((a, b) => a + b, 0);
    const top5 = [...byCustomer].sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0);
    expect(top5 / total).toBeLessThan(0.25);
    expect(Math.min(...byCustomer)).toBeGreaterThan(0);
  });

  it('has a few rejected and cancelled orders, none of them on a run', () => {
    const closed = story.orders.filter((o) => !qualifying(o));
    expect(closed.map((o) => o.status).sort()).toEqual(['CANCELLED', 'CANCELLED', 'REJECTED', 'REJECTED']);
    for (const o of closed) {
      expect(o.runId).toBeNull();
      expect(o.outcome).toBeNull();
      expect(o.closedAt).not.toBeNull();
    }
  });

  it('keeps every order internally consistent', () => {
    const ids = new Set<string>();
    for (const o of story.orders) {
      expect(ids.has(o.id)).toBe(false);
      ids.add(o.id);
      expect(o.lines.length).toBeGreaterThan(0);
      expect(o.subtotalPence).toBe(o.lines.reduce((total, l) => total + l.quantity * l.unitPricePence, 0));
      expect(o.deliveryDate.getTime()).toBe(today.getTime() + o.deliveryDay * DAY_MS);
      expect(o.runId !== null).toBe(['ACCEPTED', 'DELIVERED', 'DELIVERY_FAILED'].includes(o.status));
    }
    for (const run of story.runs) {
      expect(run.orderIds.map((id) => story.orders.find((o) => o.id === id)!.sequence)).toEqual(run.orderIds.map((_, n) => n + 1));
    }
  });
});

describe('buildDemoStory', () => {
  it('produces the same historic order whichever day it is built on', () => {
    const tuesday = build(MOMENTS[0]).story.orders;
    const sunday = build(MOMENTS[2]).story.orders.filter((o) => o.placedDay < -40);
    const match = tuesday.find((o) => o.id === sunday[100].id)!;
    expect(match.submittedAt).toEqual(sunday[100].submittedAt);
    expect(match.lines.map((l) => l.productId)).toEqual(sunday[100].lines.map((l) => l.productId));
  });

  it('refuses to build without exactly sixty customers', () => {
    const today = new Date('2026-10-06T00:00:00.000Z');
    expect(() => buildDemoStory({ today, now: today, customers: customers.slice(0, 59), products })).toThrow('exactly 60 customers');
  });
});
