import { addCatalogue, addCustomer, addDeliveryProfile, addOrder, addProducts, nextWeekday } from '../lib/builders';
import { ScenarioSeed } from '../lib/types';
import { CUSTOMERS, PRODUCTS } from './fixtures';

// Starting data: The Blackbird Restaurant (Peter Walsh's business) has one order awaiting
// review, for delivery next Thursday, with PO reference BB-2207.
const seed: ScenarioSeed = async ({ prisma }) => {
  const products = [PRODUCTS.chateauBelmont, PRODUCTS.sauvignon, PRODUCTS.prosecco];
  await addProducts(prisma, products);
  await addCatalogue(prisma, { id: 'docs-cat-full-range', name: 'Full Range', productIds: products.map((p) => p.id) });
  await addDeliveryProfile(prisma, { id: 'docs-dp-weekday', name: 'Standard Weekday', weekdays: [1, 2, 3, 4, 5] });

  const blackbird = await addCustomer(prisma, {
    ...CUSTOMERS.blackbird,
    deliveryProfileId: 'docs-dp-weekday',
    catalogueIds: ['docs-cat-full-range'],
  });

  await addOrder(prisma, {
    id: 'docs-order-blackbird',
    orderNumber: 'ORD-2026-50001',
    customer: blackbird,
    status: 'SUBMITTED',
    deliveryDate: nextWeekday(4, 3),
    customerReference: 'BB-2207',
    lines: [
      { productId: PRODUCTS.chateauBelmont.id, quantity: 12 },
      { productId: PRODUCTS.sauvignon.id, quantity: 6 },
      { productId: PRODUCTS.prosecco.id, quantity: 6 },
    ],
  });
};

export default seed;
