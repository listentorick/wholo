import { buildDebtPlan, FIRST_PAYMENT_DAYS_AGO, PAYMENT_COUNT, PAYMENT_EVERY_DAYS } from './demo-debt.plan';

describe('buildDebtPlan', () => {
  const plan = buildDebtPlan();

  const debts = plan.invoices.filter((inv) => inv.kind === 'debt');
  const earlier = plan.invoices.filter((inv) => inv.kind === 'earlier');

  it('raises every invoice on 30-day terms, and pays each one off only after it fell due', () => {
    expect(debts).toHaveLength(6);
    expect(earlier).toHaveLength(5);
    for (const inv of plan.invoices) {
      expect(inv.raisedDaysAgo - inv.dueDaysAgo).toBe(30);
      expect(plan.paidDaysAgo.get(inv.index)!).toBeLessThan(inv.dueDaysAgo);
    }
  });

  it('paid the earlier invoices a few days late, in the 90 days before the last 90', () => {
    for (const inv of earlier) {
      const paid = plan.paidDaysAgo.get(inv.index)!;
      expect(paid).toBeGreaterThan(90);
      expect(paid).toBeLessThan(180);
      expect(inv.dueDaysAgo - paid).toBeLessThanOrEqual(10);
    }
  });

  it('pays every debt off in full, oldest first, the last a week ago', () => {
    const order = [...plan.paidDaysAgo.entries()]
      .filter(([index]) => plan.invoices[index].kind === 'debt')
      .sort(([, a], [, b]) => b - a)
      .map(([index]) => index);
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
    expect(plan.paidDaysAgo.get(5)).toBe(FIRST_PAYMENT_DAYS_AGO - (PAYMENT_COUNT - 1) * PAYMENT_EVERY_DAYS);
  });

  it('keeps each invoice consistent: paid plus due is the total, and statuses follow on', () => {
    for (const inv of plan.invoices) {
      const events = plan.events.filter((e) => e.invoice === inv.index).sort((a, b) => b.daysAgo - a.daysAgo);
      expect(events[0]).toMatchObject({ fromStatus: 'NOT_SYNCED', toStatus: 'UNPAID', daysAgo: inv.raisedDaysAgo });
      for (const e of events) expect(e.amountPaidPence + e.amountDuePence).toBe(inv.totalPence);
      for (let i = 1; i < events.length; i += 1) expect(events[i].fromStatus).toBe(events[i - 1].toStatus);
      expect(events.at(-1)).toMatchObject({ toStatus: 'PAID', amountDuePence: 0 });
    }
  });

  it('pays the same amount each week, the last taking the remainder', () => {
    const total = debts.reduce((sum, inv) => sum + inv.totalPence, 0);
    const byWeek = new Map<number, number>();
    const lastPaid = new Map<number, number>();
    const debtEvents = plan.events.filter((e) => plan.invoices[e.invoice].kind === 'debt');
    for (const e of [...debtEvents].sort((a, b) => b.daysAgo - a.daysAgo)) {
      if (e.toStatus === 'UNPAID') continue;
      const step = e.amountPaidPence - (lastPaid.get(e.invoice) ?? 0);
      lastPaid.set(e.invoice, e.amountPaidPence);
      byWeek.set(e.daysAgo, (byWeek.get(e.daysAgo) ?? 0) + step);
    }
    const weeks = [...byWeek.values()];
    expect(weeks).toHaveLength(PAYMENT_COUNT);
    expect(new Set(weeks.slice(0, -1)).size).toBe(1);
    expect(weeks.reduce((a, b) => a + b, 0)).toBe(total);
  });
});
