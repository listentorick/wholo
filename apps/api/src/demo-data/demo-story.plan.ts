// The demo story behind the local dashboards (Delivery | Customers | Sales):
// 60 customers buying on fixed rhythms for 26 weeks, exactly three of them at
// risk, and a delivery day that is part-way through — 3 runs, 30 drops.
//
// Pure and I/O-free: everything is derived from `today`/`now` and the inputs,
// with a hash in place of randomness, so the same calendar order comes out the
// same on every run and the story can be rebuilt around any date. Writing it
// to the database is scripts/seed-demo-dashboards.ts.
//
// The numbers here are shaped against the customer-health rules
// (customer-health.logic.ts): the spec feeds this plan through those rules and
// fails if a rhythm or basket drifts a healthy customer into a flag.

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const DEMO_CUSTOMER_COUNT = 60;
export const HISTORY_DAYS = 182;
/** The two 30-day windows the spend and range rules compare, as day offsets from today. */
const CURRENT_WINDOW_START = -29;
const PREVIOUS_WINDOW_START = -59;

/** Today's runs, by route: how many drops and how many of them the driver has got to. */
export const TODAY_RUNS = [
  { drops: 12, attempted: 10, failedAt: 6 as number | null, lastDropMinutesAgo: 6 },
  { drops: 9, attempted: 5, failedAt: null, lastDropMinutesAgo: 14 },
  { drops: 9, attempted: 1, failedAt: null, lastDropMinutesAgo: 31 },
];
const TODAY_DROP_SPACING_MINUTES = 22;
export const TODAY_TO_ACCEPT = 3;

/** Which customers (by position in the input) carry the story. The positions fix each one's buying rhythm — see rhythmFor. */
export const STORY = {
  /** At risk: a twice-weekly buyer who stopped ordering. */
  stoppedOrdering: 56,
  /** At risk: spend roughly halved, and buying fewer products. */
  spendCollapsing: 47,
  /** At risk: 3 of their last 8 deliveries late or failed. */
  lateDeliveries: 44,
  /** Watch: 2 of their last 8 deliveries late or failed. */
  watchLateA: 31,
  watchLateB: 52,
  /** Watch: spend down about a fifth. */
  watchSpend: 38,
  /** Watch: same spend, fewer products per order. */
  watchRange: 49,
} as const;
const STOPPED_ORDERING_DAYS = 24;
const STORY_INDEXES = new Set<number>(Object.values(STORY));
const REJECTED_FOR = [10, 23];
const CANCELLED_FOR = [20, 33];

const UNABLE_REASONS = ['CUSTOMER_CLOSED', 'UNABLE_TO_ACCESS_PREMISES', 'CUSTOMER_REFUSED', 'INCORRECT_ADDRESS'] as const;
export type DemoUnableReason = (typeof UNABLE_REASONS)[number];
export type DemoOrderStatus = 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'DELIVERED' | 'DELIVERY_FAILED';

export interface DemoCustomerInput {
  organisationId: string;
  /** 0–2: which of the three routes delivers to them. */
  routeIndex: number;
  /** Their usual place in the route's drop order. */
  dropPosition: number;
}

export interface DemoProductInput {
  id: string;
  pricePence: number;
}

export interface DemoStoryInput {
  /** The distributor's calendar day, as a UTC-midnight Date. */
  today: Date;
  now: Date;
  customers: DemoCustomerInput[];
  products: DemoProductInput[];
}

export interface DemoLine {
  id: string;
  productId: string;
  quantity: number;
  unitPricePence: number;
  subtotalPence: number;
}

export interface DemoOutcome {
  outcome: 'DELIVERED' | 'UNABLE_TO_DELIVER';
  unableReason: DemoUnableReason | null;
  recordedAt: Date;
}

export interface DemoOrder {
  id: string;
  customerIndex: number;
  organisationId: string;
  routeIndex: number;
  /** Day offsets from today (0 = today, negative = past). */
  placedDay: number;
  deliveryDay: number;
  deliveryDate: Date;
  submittedAt: Date;
  acceptedAt: Date | null;
  /** When it was rejected or cancelled. */
  closedAt: Date | null;
  status: DemoOrderStatus;
  lines: DemoLine[];
  subtotalPence: number;
  runId: string | null;
  sequence: number | null;
  outcome: DemoOutcome | null;
}

export interface DemoRun {
  id: string;
  routeIndex: number;
  deliveryDay: number;
  deliveryDate: Date;
  status: 'OPEN' | 'READY';
  readyAt: Date | null;
  orderIds: string[];
}

export interface DemoStory {
  orders: DemoOrder[];
  runs: DemoRun[];
}

/** Deterministic stand-in for Math.random(): the same keys always give the same number in [0, 1). */
export function rand(...keys: number[]): number {
  let h = 0x9e3779b9;
  for (const k of keys) {
    h = Math.imul(h ^ (k | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

// Orders are placed Sunday–Friday and delivered the next day (Monday–Saturday).
// Every rhythm keeps its longest gap under 1.5× its median gap once today's
// order is in, so a customer buying normally never trips the missed-order
// rule; together they put the same 25 orders on every delivery day.
const THREE_A = [1, 3, 5];
const THREE_B = [0, 2, 4];
const TWICE = [[1, 4], [2, 5], [0, 3]];
const WEEKLY = [1, 2, 3, 4, 5, 0];

/** Weekdays (0 = Sunday) a customer places orders on: 36 buy three times a week, 18 twice, 6 weekly. */
export function rhythmFor(customerIndex: number): number[] {
  const slot = customerIndex % 10;
  if (slot <= 5) return slot % 2 === 0 ? THREE_A : THREE_B;
  if (slot <= 8) return TWICE[slot - 6];
  return [WEEKLY[Math.floor(customerIndex / 10) % WEEKLY.length]];
}

const sum = (values: number[]): number => values.reduce((total, v) => total + v, 0);
const isQualifying = (o: DemoOrder): boolean => o.status !== 'REJECTED' && o.status !== 'CANCELLED';

export function buildDemoStory(input: DemoStoryInput): DemoStory {
  const { today, now, customers, products } = input;
  if (customers.length !== DEMO_CUSTOMER_COUNT) throw new Error(`The demo story needs exactly ${DEMO_CUSTOMER_COUNT} customers, got ${customers.length}`);
  if (products.length < 12) throw new Error('The demo story needs at least 12 products to build baskets from');

  const todayMs = today.getTime();
  const todayEpochDay = Math.round(todayMs / DAY_MS);
  const at = (day: number, minutes: number): Date => new Date(todayMs + day * DAY_MS + minutes * MINUTE_MS);
  const weekdayOf = (day: number): number => new Date(todayMs + day * DAY_MS).getUTCDay();
  const isStory = (i: number): boolean => STORY_INDEXES.has(i);

  // ── Baskets ────────────────────────────────────────────────────────────────
  // A customer buys the same core products every time (so their range is
  // stable), in sizes that suit the product and the size of the venue.
  const baseQuantity = (customerIndex: number, productIndex: number): number => {
    const price = products[productIndex].pricePence;
    const options = price < 300 ? [12, 24, 24, 48] : price < 1000 ? [6, 12] : price < 2000 ? [6, 6, 12] : [2, 3, 6];
    return options[Math.floor(rand(customerIndex, productIndex, 3) * options.length)];
  };
  const coreProducts = (customerIndex: number): number[] => {
    const narrows = customerIndex === STORY.spendCollapsing || customerIndex === STORY.watchRange;
    const size = narrows ? 6 : 4 + Math.floor(rand(customerIndex, 1) * 4);
    return products
      .map((_, productIndex) => productIndex)
      .sort((a, b) => rand(customerIndex, a, 2) - rand(customerIndex, b, 2))
      .slice(0, size);
  };
  const venueScale = (customerIndex: number): number => 0.4 + rand(customerIndex, 4) * 0.9;
  /** Trade grows a little under 1% a week over the six months. */
  const growth = (day: number): number => 1 + 0.007 * (day / 7);

  const buildLines = (orderId: string, customerIndex: number, placedDay: number): DemoLine[] => {
    const epochDay = todayEpochDay + placedDay;
    let chosen = coreProducts(customerIndex);
    const inCurrentWindow = placedDay >= CURRENT_WINDOW_START;
    if (inCurrentWindow && customerIndex === STORY.spendCollapsing) chosen = chosen.slice(0, 3);
    else if (inCurrentWindow && customerIndex === STORY.watchRange) chosen = chosen.slice(0, 4);
    else if (customerIndex !== STORY.spendCollapsing && customerIndex !== STORY.watchRange && rand(customerIndex, epochDay, 5) < 0.25) {
      // Now and then, one extra product on top of the usual.
      const extras = products.map((_, productIndex) => productIndex).filter((productIndex) => !chosen.includes(productIndex));
      chosen = [...chosen, extras[Math.floor(rand(customerIndex, epochDay, 6) * extras.length)]];
    }
    return chosen.map((productIndex, n) => {
      const wobble = 0.9 + 0.2 * rand(customerIndex, epochDay, productIndex);
      const quantity = Math.max(1, Math.round(baseQuantity(customerIndex, productIndex) * venueScale(customerIndex) * growth(placedDay) * wobble));
      const unitPricePence = products[productIndex].pricePence;
      return { id: `${orderId}-l${n + 1}`, productId: products[productIndex].id, quantity, unitPricePence, subtotalPence: quantity * unitPricePence };
    });
  };

  const orders: DemoOrder[] = [];
  const placedOn = new Set<string>();
  const placeOrder = (customerIndex: number, placedDay: number): DemoOrder => {
    const customer = customers[customerIndex];
    const epochDay = todayEpochDay + placedDay;
    const id = `demo-order-${String(customerIndex).padStart(2, '0')}-${epochDay}`;
    // Placed in working hours and accepted within the hour, before the next day's runs are marked ready at 17:30.
    const submittedAt = at(placedDay, 8 * 60 + Math.floor(rand(customerIndex, epochDay, 7) * 8 * 60));
    const acceptedAt = new Date(submittedAt.getTime() + (5 + Math.floor(rand(customerIndex, epochDay, 8) * 55)) * MINUTE_MS);
    const lines = buildLines(id, customerIndex, placedDay);
    const order: DemoOrder = {
      id,
      customerIndex,
      organisationId: customer.organisationId,
      routeIndex: customer.routeIndex,
      placedDay,
      deliveryDay: placedDay + 1,
      deliveryDate: at(placedDay + 1, 0),
      submittedAt,
      acceptedAt,
      closedAt: null,
      status: 'ACCEPTED',
      lines,
      subtotalPence: sum(lines.map((l) => l.subtotalPence)),
      runId: null,
      sequence: null,
      outcome: null,
    };
    orders.push(order);
    placedOn.add(`${customerIndex}:${placedDay}`);
    return order;
  };
  const hasPlaced = (customerIndex: number, placedDay: number): boolean => placedOn.has(`${customerIndex}:${placedDay}`);

  // ── Six months of buying, up to and including today ────────────────────────
  for (let i = 0; i < customers.length; i++) {
    const rhythm = rhythmFor(i);
    for (let day = -HISTORY_DAYS; day <= 0; day++) {
      if (!rhythm.includes(weekdayOf(day))) continue;
      if (i === STORY.stoppedOrdering && day > -STOPPED_ORDERING_DAYS) continue;
      placeOrder(i, day);
    }
  }

  // ── Today's deliveries: exactly the planned drops per route ────────────────
  // Yesterday's orders are due today. A route with too many pushes the surplus
  // to tomorrow; one with too few gets extra orders placed yesterday (an extra
  // order only ever shortens a customer's gap, so it cannot raise a flag).
  const todayByRoute: DemoOrder[][] = TODAY_RUNS.map((run, routeIndex) => {
    const due = orders
      .filter((o) => o.deliveryDay === 0 && o.routeIndex === routeIndex)
      .sort((a, b) => Number(isStory(a.customerIndex)) - Number(isStory(b.customerIndex)) || customers[a.customerIndex].dropPosition - customers[b.customerIndex].dropPosition);
    for (const surplus of due.splice(run.drops)) {
      surplus.deliveryDay = 1;
      surplus.deliveryDate = at(1, 0);
    }
    for (let i = 0; i < customers.length && due.length < run.drops; i++) {
      if (customers[i].routeIndex !== routeIndex || isStory(i) || hasPlaced(i, -1)) continue;
      due.push(placeOrder(i, -1));
    }
    if (due.length < run.drops) throw new Error(`Route ${routeIndex} has too few customers for ${run.drops} drops today`);
    // Story customers go to the back of the van, so the drops done so far are ordinary ones.
    return due.sort((a, b) => Number(isStory(a.customerIndex)) - Number(isStory(b.customerIndex)) || customers[a.customerIndex].dropPosition - customers[b.customerIndex].dropPosition);
  });

  // ── Today's orders: everyone due to order today has; the latest await acceptance ──
  for (let i = 0; i < customers.length && orders.filter((o) => o.placedDay === 0).length < TODAY_TO_ACCEPT; i++) {
    if (!isStory(i) && !hasPlaced(i, 0)) placeOrder(i, 0);
  }
  const placedToday = orders.filter((o) => o.placedDay === 0).sort((a, b) => rand(a.customerIndex, todayEpochDay, 9) - rand(b.customerIndex, todayEpochDay, 9));
  const elapsedMs = Math.max(0, now.getTime() - todayMs);
  placedToday.forEach((order, n) => {
    order.submittedAt = new Date(todayMs + Math.floor((elapsedMs * (n + 1)) / (placedToday.length + 1)));
    const waiting = n >= placedToday.length - TODAY_TO_ACCEPT;
    order.status = waiting ? 'SUBMITTED' : 'ACCEPTED';
    order.acceptedAt = waiting ? null : new Date(order.submittedAt.getTime() + Math.min(20 * MINUTE_MS, Math.floor((now.getTime() - order.submittedAt.getTime()) / 2)));
  });

  // ── A few orders we turned down or cancelled, three months back ────────────
  // Old enough to sit outside both spend windows, recent enough to show as "our mistakes".
  const firstOrderFrom = (customerIndex: number, day: number): DemoOrder | undefined =>
    orders.filter((o) => o.customerIndex === customerIndex && o.placedDay >= day).sort((a, b) => a.placedDay - b.placedDay)[0];
  for (const customerIndex of REJECTED_FOR) {
    const order = firstOrderFrom(customerIndex, -85)!;
    order.status = 'REJECTED';
    order.acceptedAt = null;
    order.closedAt = new Date(order.submittedAt.getTime() + 40 * MINUTE_MS);
  }
  for (const customerIndex of CANCELLED_FOR) {
    const order = firstOrderFrom(customerIndex, -85)!;
    order.status = 'CANCELLED';
    order.closedAt = new Date(order.acceptedAt!.getTime() + 30 * MINUTE_MS);
  }

  // ── Spend: settle each customer's last 30 days against the 30 before ───────
  // A 30-day window holds one order more or fewer depending on where the
  // weekdays fall, which alone can read as a 20% drop for a weekly buyer. So
  // the recent orders are resized to land each customer where the story wants
  // them: steady for most, down a fifth for one, roughly halved for another.
  const windowSpend = (customerIndex: number, from: number, to: number): number =>
    sum(orders.filter((o) => o.customerIndex === customerIndex && isQualifying(o) && o.placedDay >= from && o.placedDay <= to).map((o) => o.subtotalPence));
  for (let i = 0; i < customers.length; i++) {
    if (i === STORY.stoppedOrdering) continue;
    const previous = windowSpend(i, PREVIOUS_WINDOW_START, CURRENT_WINDOW_START - 1);
    const current = windowSpend(i, CURRENT_WINDOW_START, 0);
    let target: number | null = null;
    if (i === STORY.spendCollapsing) target = 0.55;
    else if (i === STORY.watchSpend) target = 0.79;
    else if (i === STORY.watchRange) target = 1;
    else if (current < previous * 0.93) target = 0.98;
    if (target === null || previous === 0) continue;

    const recent = orders.filter((o) => o.customerIndex === i && o.placedDay >= CURRENT_WINDOW_START);
    for (let pass = 0; pass < 4; pass++) {
      const factor = (previous * target) / windowSpend(i, CURRENT_WINDOW_START, 0);
      for (const order of recent) {
        for (const line of order.lines) {
          line.quantity = Math.max(1, Math.round(line.quantity * factor));
          line.subtotalPence = line.quantity * line.unitPricePence;
        }
        order.subtotalPence = sum(order.lines.map((l) => l.subtotalPence));
      }
    }
  }

  // ── Runs: one per route per delivery day ───────────────────────────────────
  const runs: DemoRun[] = [];
  const runsByKey = new Map<string, DemoRun>();
  const allocate = (order: DemoOrder): void => {
    const key = `${order.routeIndex}:${order.deliveryDay}`;
    let run = runsByKey.get(key);
    if (!run) {
      const delivered = order.deliveryDay <= 0;
      run = {
        id: `demo-run-${order.routeIndex}-${todayEpochDay + order.deliveryDay}`,
        routeIndex: order.routeIndex,
        deliveryDay: order.deliveryDay,
        deliveryDate: order.deliveryDate,
        status: delivered ? 'READY' : 'OPEN',
        readyAt: delivered ? at(order.deliveryDay - 1, 17 * 60 + 30) : null,
        orderIds: [],
      };
      runsByKey.set(key, run);
      runs.push(run);
    }
    order.runId = run.id;
    order.sequence = run.orderIds.length + 1;
    run.orderIds.push(order.id);
  };
  const onARun = (o: DemoOrder): boolean => o.status === 'ACCEPTED';
  orders
    .filter((o) => onARun(o) && o.deliveryDay !== 0)
    .sort((a, b) => a.deliveryDay - b.deliveryDay || customers[a.customerIndex].dropPosition - customers[b.customerIndex].dropPosition)
    .forEach(allocate);
  todayByRoute.flat().forEach(allocate);

  // ── What happened at the door ──────────────────────────────────────────────
  const deliver = (order: DemoOrder, recordedAt: Date): void => {
    order.status = 'DELIVERED';
    order.outcome = { outcome: 'DELIVERED', unableReason: null, recordedAt };
  };
  const fail = (order: DemoOrder, recordedAt: Date): void => {
    order.status = 'DELIVERY_FAILED';
    const reason = UNABLE_REASONS[Math.floor(rand(order.customerIndex, order.deliveryDay + todayEpochDay, 10) * UNABLE_REASONS.length)];
    order.outcome = { outcome: 'UNABLE_TO_DELIVER', unableReason: reason, recordedAt };
  };
  /** The time a past drop was made: out at 07:30, a drop every twenty-odd minutes. */
  const onTheDay = (order: DemoOrder): Date => at(order.deliveryDay, 7 * 60 + 30 + order.routeIndex * 7 + (order.sequence! - 1) * 23 + Math.floor(rand(order.customerIndex, order.deliveryDay + todayEpochDay, 11) * 9));
  /** A late drop: it went out the following morning instead. */
  const theDayAfter = (order: DemoOrder): Date => at(order.deliveryDay + 1, 9 * 60 + Math.floor(rand(order.customerIndex, order.deliveryDay + todayEpochDay, 12) * 120));

  const past = orders.filter((o) => onARun(o) && o.deliveryDay < 0);
  const lastDeliveryDay = Math.max(...past.map((o) => o.deliveryDay));
  for (const order of past) deliver(order, onTheDay(order));

  // Today, working backwards from now. Very early in the day the drops are squeezed into the time there has been.
  const failedToday = new Set<number>();
  TODAY_RUNS.forEach((run, routeIndex) => {
    const longest = run.lastDropMinutesAgo + (run.attempted - 1) * TODAY_DROP_SPACING_MINUTES;
    const squeeze = Math.min(1, Math.max(0, elapsedMs / MINUTE_MS - 1) / longest);
    todayByRoute[routeIndex].slice(0, run.attempted).forEach((order, n) => {
      const minutesAgo = (run.lastDropMinutesAgo + (run.attempted - 1 - n) * TODAY_DROP_SPACING_MINUTES) * squeeze;
      const recordedAt = new Date(Math.max(todayMs, now.getTime() - Math.round(minutesAgo * MINUTE_MS)));
      if (n === run.failedAt) {
        fail(order, recordedAt);
        failedToday.add(order.customerIndex);
      } else deliver(order, recordedAt);
    });
  });

  // Mostly on time: about 4% a day late and 2% failed, never two close together for one customer (two in
  // their last eight would flag them), and none on the most recent day so "failed in the last 24h" is today's.
  const attemptsOf = (customerIndex: number): DemoOrder[] =>
    orders.filter((o) => o.customerIndex === customerIndex && o.outcome !== null).sort((a, b) => a.deliveryDay - b.deliveryDay);
  const reset = (order: DemoOrder): void => deliver(order, onTheDay(order));
  const makeLate = (order: DemoOrder): void => deliver(order, theDayAfter(order));
  const makeFailed = (order: DemoOrder): void => fail(order, onTheDay(order));
  const wentWrong = (order: DemoOrder): boolean => order.status === 'DELIVERY_FAILED' || order.outcome!.recordedAt.getTime() >= order.deliveryDate.getTime() + DAY_MS;

  for (let i = 0; i < customers.length; i++) {
    const attempts = attemptsOf(i);
    const settled = attempts.filter((o) => o.deliveryDay < lastDeliveryDay);
    let sinceLastProblem = 8;
    for (const order of settled) {
      const roll = rand(i, order.deliveryDay + todayEpochDay, 13);
      if (roll < 0.06 && sinceLastProblem >= 8) {
        if (roll < 0.02) makeFailed(order);
        else makeLate(order);
        sinceLastProblem = 0;
      } else sinceLastProblem++;
    }

    const lastEight = attempts.slice(-8).reverse();
    const forced = i === STORY.lateDeliveries ? [0, 2, 4] : i === STORY.watchLateA || i === STORY.watchLateB ? [1, 3] : null;
    if (forced || failedToday.has(i)) {
      for (const order of lastEight) if (order.deliveryDay < 0 && wentWrong(order)) reset(order);
    }
    if (forced) {
      const eligible = lastEight.filter((o) => o.deliveryDay < lastDeliveryDay);
      forced.forEach((position, n) => {
        // One of each customer's problems is a failed delivery; the rest arrived a day late.
        if (n === 1) makeFailed(eligible[position]);
        else makeLate(eligible[position]);
      });
    }
  }

  // One of yesterday's drops was never attempted: still accepted, now overdue.
  const overdue = past.find((o) => o.deliveryDay === lastDeliveryDay && !isStory(o.customerIndex) && !failedToday.has(o.customerIndex))!;
  overdue.status = 'ACCEPTED';
  overdue.outcome = null;

  orders.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  return { orders, runs };
}
