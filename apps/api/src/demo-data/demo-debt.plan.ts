/**
 * A customer paying off a backlog of overdue invoices over three months, for
 * the customer Dashboard's Overdue balances and Payment behaviour cards
 * (ADR-077). Pure: dates are days before `today`, amounts are pence, and
 * scripts/seed-demo-customer-debt.ts writes the result.
 *
 * Six invoices are raised three and a half to six months ago on 30-day terms
 * and go unpaid, so the overdue balance builds and ages. From twelve weeks ago
 * the customer pays a fixed amount every week, oldest invoice first, until the
 * last one is cleared a week ago; every invoice is paid late.
 *
 * Before that the customer paid well: five earlier invoices, paid a few days
 * late in the 90 days before the last 90, give the payment trend something to
 * compare against ("paying later than the 90 days before").
 */

export interface DebtInvoice {
  index: number;
  /** debt: part of the backlog paid off weekly; earlier: paid in one go, a few days late, before it. */
  kind: 'debt' | 'earlier';
  totalPence: number;
  raisedDaysAgo: number;
  dueDaysAgo: number;
}

/** One change to one invoice: its first sync as unpaid, or a payment against it. */
export interface DebtEvent {
  invoice: number;
  daysAgo: number;
  fromStatus: 'NOT_SYNCED' | 'UNPAID' | 'PART_PAID';
  toStatus: 'UNPAID' | 'PART_PAID' | 'PAID';
  amountPaidPence: number;
  amountDuePence: number;
}

export interface DebtPlan {
  invoices: DebtInvoice[];
  events: DebtEvent[];
  /** Days ago each invoice was paid in full. */
  paidDaysAgo: Map<number, number>;
}

const TERMS_DAYS = 30;
const INVOICES: Array<Omit<DebtInvoice, 'dueDaysAgo' | 'index' | 'kind'>> = [
  { totalPence: 74_000, raisedDaysAgo: 178 },
  { totalPence: 112_000, raisedDaysAgo: 160 },
  { totalPence: 86_050, raisedDaysAgo: 145 },
  { totalPence: 134_000, raisedDaysAgo: 130 },
  { totalPence: 59_000, raisedDaysAgo: 118 },
  { totalPence: 97_950, raisedDaysAgo: 104 },
];
// Earlier invoices: when each was paid, and how many days late. Paid 100–175
// days ago, so they fall in the 90 days before the last 90.
const EARLIER: Array<{ totalPence: number; paidDaysAgo: number; daysLate: number }> = [
  { totalPence: 68_400, paidDaysAgo: 175, daysLate: 4 },
  { totalPence: 91_200, paidDaysAgo: 160, daysLate: 6 },
  { totalPence: 54_000, paidDaysAgo: 140, daysLate: 2 },
  { totalPence: 77_500, paidDaysAgo: 120, daysLate: 8 },
  { totalPence: 63_300, paidDaysAgo: 100, daysLate: 5 },
];
export const FIRST_PAYMENT_DAYS_AGO = 84;
export const PAYMENT_EVERY_DAYS = 7;
export const PAYMENT_COUNT = 12;

export function buildDebtPlan(): DebtPlan {
  const debts: DebtInvoice[] = INVOICES.map((inv, index) => ({ ...inv, index, kind: 'debt', dueDaysAgo: inv.raisedDaysAgo - TERMS_DAYS }));
  const earlier: DebtInvoice[] = EARLIER.map((e, i) => ({
    index: debts.length + i,
    kind: 'earlier',
    totalPence: e.totalPence,
    dueDaysAgo: e.paidDaysAgo + e.daysLate,
    raisedDaysAgo: e.paidDaysAgo + e.daysLate + TERMS_DAYS,
  }));
  const invoices = [...debts, ...earlier];
  const events: DebtEvent[] = invoices.map((inv) => ({
    invoice: inv.index,
    daysAgo: inv.raisedDaysAgo,
    fromStatus: 'NOT_SYNCED',
    toStatus: 'UNPAID',
    amountPaidPence: 0,
    amountDuePence: inv.totalPence,
  }));

  const paidDaysAgo = new Map<number, number>();
  EARLIER.forEach((e, i) => {
    const inv = earlier[i];
    events.push({ invoice: inv.index, daysAgo: e.paidDaysAgo, fromStatus: 'UNPAID', toStatus: 'PAID', amountPaidPence: inv.totalPence, amountDuePence: 0 });
    paidDaysAgo.set(inv.index, e.paidDaysAgo);
  });

  // Equal weekly payments; the last one takes the remainder so the debt clears exactly.
  const totalPence = debts.reduce((sum, inv) => sum + inv.totalPence, 0);
  const weekly = Math.floor(totalPence / PAYMENT_COUNT);
  const paid = invoices.map(() => 0);
  for (let p = 0; p < PAYMENT_COUNT; p += 1) {
    const daysAgo = FIRST_PAYMENT_DAYS_AGO - p * PAYMENT_EVERY_DAYS;
    let payment = p === PAYMENT_COUNT - 1 ? totalPence - weekly * (PAYMENT_COUNT - 1) : weekly;
    for (const inv of debts) {
      if (payment === 0) break;
      const due = inv.totalPence - paid[inv.index];
      if (due === 0) continue;
      const applied = Math.min(due, payment);
      const before = paid[inv.index];
      paid[inv.index] += applied;
      payment -= applied;
      const cleared = paid[inv.index] === inv.totalPence;
      events.push({
        invoice: inv.index,
        daysAgo,
        fromStatus: before === 0 ? 'UNPAID' : 'PART_PAID',
        toStatus: cleared ? 'PAID' : 'PART_PAID',
        amountPaidPence: paid[inv.index],
        amountDuePence: inv.totalPence - paid[inv.index],
      });
      if (cleared) paidDaysAgo.set(inv.index, daysAgo);
    }
  }
  return { invoices, events, paidDaysAgo };
}
