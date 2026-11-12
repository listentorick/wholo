import { addCatalogue, addCustomer, addDeliveryProfile, addOrder, addProducts, nextWeekday } from '../lib/builders';
import { addBranding } from '../lib/images';
import { ScenarioSeed } from '../lib/types';
import { CUSTOMERS, PRODUCTS } from './fixtures';

// Starting data: The Blackbird Restaurant (Peter Walsh) has two Vine & Co orders: ORD-2026-50011
// (PO BB-2214), accepted, for delivery next Tuesday; and ORD-2026-50012 (PO BB-2215), awaiting
// confirmation, for delivery next Thursday. Vine & Co's storefront is branded.
const seed: ScenarioSeed = async ({ prisma }) => {
  const products = [PRODUCTS.chateauBelmont, PRODUCTS.barolo, PRODUCTS.sauvignon, PRODUCTS.rioja, PRODUCTS.prosecco, PRODUCTS.chianti];
  await addProducts(prisma, products);
  await addBranding(prisma);
  await addCatalogue(prisma, { id: 'docs-cat-full-range', name: 'Full Range', productIds: products.map((p) => p.id) });
  await addDeliveryProfile(prisma, { id: 'docs-dp-weekday', name: 'Standard Weekday', weekdays: [1, 2, 3, 4, 5] });
  const blackbird = await addCustomer(prisma, {
    ...CUSTOMERS.blackbird,
    deliveryProfileId: 'docs-dp-weekday',
    catalogueIds: ['docs-cat-full-range'],
  });

  await addOrder(prisma, {
    id: 'docs-order-blackbird-accepted',
    orderNumber: 'ORD-2026-50011',
    customer: blackbird,
    status: 'ACCEPTED',
    deliveryDate: nextWeekday(2, 3),
    customerReference: 'BB-2214',
    submittedDaysAgo: 2,
    lines: [
      { productId: PRODUCTS.rioja.id, quantity: 12 },
      { productId: PRODUCTS.chianti.id, quantity: 6 },
    ],
  });
  await addOrder(prisma, {
    id: 'docs-order-blackbird-submitted',
    orderNumber: 'ORD-2026-50012',
    customer: blackbird,
    status: 'SUBMITTED',
    deliveryDate: nextWeekday(4, 3),
    customerReference: 'BB-2215',
    lines: [
      { productId: PRODUCTS.sauvignon.id, quantity: 12 },
      { productId: PRODUCTS.prosecco.id, quantity: 6 },
    ],
  });
};

export default seed;
