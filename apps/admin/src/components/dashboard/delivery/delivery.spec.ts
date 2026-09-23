import { describe, it, expect } from 'vitest';
import { UnableToDeliverReason, type DeliveryOverviewQueueItem, type DeliveryOverviewRun } from '@wholo/types';
import { chartWindow, dayLabel, describeItem, formatWait, onTimeRate, outcomeBars, runStatus, shiftIsoDate, shortDate, timeOfDay } from './delivery';

const item = (over: Partial<DeliveryOverviewQueueItem>): DeliveryOverviewQueueItem => ({
  kind: 'TO_ACCEPT', orderId: 'o1', orderNumber: 'ORD-1', customerName: 'The Anchor Bar', since: null, dueDate: null, reason: null, runName: null, ...over,
});
const run = (over: Partial<DeliveryOverviewRun> = {}): DeliveryOverviewRun => ({
  runId: 'r1', name: 'R1', driverName: null, status: 'OPEN', stopCount: 10, attemptedCount: 0, lastDropAt: null, ...over,
});

describe('formatWait', () => {
  const now = '2026-09-18T12:00:00.000Z';
  it.each([
    ['2026-09-18T11:59:40.000Z', 'under a minute'],
    ['2026-09-18T11:15:00.000Z', '45m'],
    ['2026-09-18T09:50:00.000Z', '2h 10m'],
    ['2026-09-18T10:00:00.000Z', '2h'],
    ['2026-09-15T08:00:00.000Z', '3d 4h'],
    ['2026-09-15T12:00:00.000Z', '3d'],
  ])('%s -> %s', (from, expected) => expect(formatWait(from, now)).toBe(expected));

  it('never goes negative when the clocks disagree slightly', () => {
    expect(formatWait('2026-09-18T12:00:30.000Z', now)).toBe('under a minute');
  });
});

describe('dates', () => {
  it("shows a time in the distributor's timezone, not the viewer's", () => {
    expect(timeOfDay('2026-09-18T23:30:00.000Z', 'Europe/London')).toBe('00:30'); // BST
    expect(timeOfDay('2026-09-18T23:30:00.000Z', 'UTC')).toBe('23:30');
  });

  it('formats a calendar date without shifting it', () => {
    expect(shortDate('2026-09-18')).toBe('18 Sep');
  });

  it('labels a day with its weekday', () => {
    expect(dayLabel('2026-09-18')).toBe('Fri 18');
    expect(dayLabel('2026-09-13')).toBe('Sun 13');
  });

  it('shifts a calendar date across month, year and leap-day boundaries', () => {
    expect(shiftIsoDate('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftIsoDate('2026-01-03', -7)).toBe('2025-12-27');
    expect(shiftIsoDate('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('asks the chart for the seven completed days before today', () => {
    expect(chartWindow('2026-09-18')).toEqual({ from: '2026-09-11', to: '2026-09-17' });
  });
});

describe('describeItem', () => {
  const overview = { generatedAt: '2026-09-18T12:00:00.000Z', timezone: 'Europe/London' };

  it('says why a delivery failed and when', () => {
    expect(describeItem(item({ kind: 'FAILED', reason: UnableToDeliverReason.CUSTOMER_CLOSED, since: '2026-09-18T08:52:00.000Z' }), overview)).toBe('Customer closed · 09:52');
  });

  it('copes with a failure with no recorded reason', () => {
    expect(describeItem(item({ kind: 'FAILED', reason: null, since: null }), overview)).toBe('No reason recorded');
  });

  it('says how long an order has been waiting to be accepted', () => {
    expect(describeItem(item({ kind: 'TO_ACCEPT', since: '2026-09-18T09:50:00.000Z' }), overview)).toBe('Waiting 2h 10m');
  });

  it('says when an overdue order was due, and where it is', () => {
    expect(describeItem(item({ kind: 'OVERDUE', dueDate: '2026-09-16', runName: 'R3 South' }), overview)).toBe('Was due 16 Sep · on R3 South');
    expect(describeItem(item({ kind: 'OVERDUE', dueDate: '2026-09-16' }), overview)).toBe('Was due 16 Sep · not on a run');
  });

  it('says an unassigned order is due today', () => {
    expect(describeItem(item({ kind: 'NOT_ON_RUN' }), overview)).toBe('Due today · not on a run');
  });
});

describe('runStatus', () => {
  it.each([
    [run({ status: 'OPEN' }), 'Open', 'gray'],
    [run({ status: 'READY' }), 'Ready', 'blue'],
    [run({ status: 'READY', attemptedCount: 4 }), 'Delivering', 'green'],
    [run({ status: 'READY', attemptedCount: 10 }), 'Complete', 'green'],
  ])('%#', (r, label, tone) => expect(runStatus(r)).toEqual({ label, tone }));

  it('does not call an empty run complete', () => {
    expect(runStatus(run({ stopCount: 0, attemptedCount: 0 })).label).toBe('Open');
  });
});

describe('outcomeBars', () => {
  const days = [
    { date: '2026-09-16', onTime: 50, late: 3, failed: 2 },
    { date: '2026-09-17', onTime: 40, late: 0, failed: 1 },
  ];

  it("appends today from the live snapshot, so today's bar is delivered + failed + still to do", () => {
    const bars = outcomeBars(days, { date: '2026-09-18', progress: { planned: 51, delivered: 32, failed: 2, remaining: 17 } });

    expect(bars).toHaveLength(3);
    expect(bars[2]).toEqual({ date: '2026-09-18', onTime: 32, late: 0, failed: 2, todo: 17, total: 51, isToday: true });
    expect(bars[0]).toMatchObject({ total: 55, todo: 0, isToday: false });
  });

  it('never double-counts today when the series happens to include it', () => {
    const bars = outcomeBars([...days, { date: '2026-09-18', onTime: 9, late: 9, failed: 9 }], { date: '2026-09-18', progress: { planned: 0, delivered: 0, failed: 0, remaining: 0 } });
    expect(bars.filter((b) => b.date === '2026-09-18')).toHaveLength(1);
    expect(bars[bars.length - 1]).toMatchObject({ isToday: true, total: 0 });
  });

  it('still shows today on a first-ever day with no history', () => {
    expect(outcomeBars([], { date: '2026-09-18', progress: { planned: 5, delivered: 0, failed: 0, remaining: 5 } })).toHaveLength(1);
  });
});

describe('onTimeRate', () => {
  it('is the share of completed-day deliveries that were on time, rounded', () => {
    expect(onTimeRate([{ date: 'a', onTime: 90, late: 8, failed: 2 }])).toBe(90);
    expect(onTimeRate([{ date: 'a', onTime: 2, late: 1, failed: 0 }])).toBe(67);
  });
  it('is null when there is nothing to judge, rather than a misleading 0%', () => {
    expect(onTimeRate([])).toBeNull();
    expect(onTimeRate([{ date: 'a', onTime: 0, late: 0, failed: 0 }])).toBeNull();
  });
});
