import { addCustomer, addOrder, addProducts, addRoute, addRun, nextWeekday } from '../lib/builders';
import { ScenarioSeed } from '../lib/types';
import { CUSTOMERS, PRODUCTS } from './fixtures';

// Starting data: next Tuesday has the City Centre run (The Anchor Inn and Riverside
// Bistro, not ready, driver Chris Moore) and one unassigned delivery for The Grand Hotel
// Leeds, which is on no route. The Blackbird Restaurant is on the route but has no order
// that day.
const seed: ScenarioSeed = async ({ prisma }) => {
  await addProducts(prisma, [PRODUCTS.chateauBelmont, PRODUCTS.sauvignon, PRODUCTS.prosecco]);

  const blackbird = await addCustomer(prisma, CUSTOMERS.blackbird);
  const anchorInn = await addCustomer(prisma, CUSTOMERS.anchorInn);
  const riverside = await addCustomer(prisma, CUSTOMERS.riverside);
  const grandHotel = await addCustomer(prisma, CUSTOMERS.grandHotel);

  await addRoute(prisma, {
    id: 'docs-route-city-centre',
    name: 'City Centre',
    code: 'CC',
    defaultDriverName: 'Chris Moore',
    customers: [blackbird, anchorInn, riverside],
  });

  const tuesday = nextWeekday(2, 2);
  const orders = [
    { id: 'docs-order-anchor-inn', number: 'ORD-2026-50011', customer: anchorInn, po: 'AI-0412', lines: [{ productId: PRODUCTS.chateauBelmont.id, quantity: 12 }, { productId: PRODUCTS.prosecco.id, quantity: 6 }] },
    { id: 'docs-order-riverside', number: 'ORD-2026-50012', customer: riverside, po: 'RB-1187', lines: [{ productId: PRODUCTS.sauvignon.id, quantity: 12 }] },
    { id: 'docs-order-grand-hotel', number: 'ORD-2026-50013', customer: grandHotel, po: 'GH-7730', lines: [{ productId: PRODUCTS.chateauBelmont.id, quantity: 24 }, { productId: PRODUCTS.sauvignon.id, quantity: 12 }] },
  ];
  for (const o of orders) {
    await addOrder(prisma, {
      id: o.id,
      orderNumber: o.number,
      customer: o.customer,
      status: 'ACCEPTED',
      deliveryDate: tuesday,
      customerReference: o.po,
      lines: o.lines,
      submittedDaysAgo: 1,
    });
  }

  await addRun(prisma, {
    id: 'docs-run-city-centre',
    routeId: 'docs-route-city-centre',
    deliveryDate: tuesday,
    orderIds: ['docs-order-anchor-inn', 'docs-order-riverside'],
  });
};

export default seed;
