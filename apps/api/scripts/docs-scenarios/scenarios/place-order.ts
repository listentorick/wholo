import { addCatalogue, addCustomer, addDeliveryProfile, addProducts } from '../lib/builders';
import { addBranding } from '../lib/images';
import { ScenarioSeed } from '../lib/types';
import { CUSTOMERS, PRODUCTS } from './fixtures';

// Starting data: Peter Walsh's business, The Blackbird Restaurant, is an active Vine & Co
// customer with the Full Range catalogue (six wines, including Château Belmont Rouge 2021 and
// Barolo Riserva 2019) and a weekday delivery profile, and no orders. Vine & Co's storefront
// is branded.
const seed: ScenarioSeed = async ({ prisma }) => {
  const products = [PRODUCTS.chateauBelmont, PRODUCTS.barolo, PRODUCTS.sauvignon, PRODUCTS.rioja, PRODUCTS.prosecco, PRODUCTS.chianti];
  await addProducts(prisma, products);
  await addBranding(prisma);
  await addCatalogue(prisma, { id: 'docs-cat-full-range', name: 'Full Range', productIds: products.map((p) => p.id) });
  await addDeliveryProfile(prisma, { id: 'docs-dp-weekday', name: 'Standard Weekday', weekdays: [1, 2, 3, 4, 5] });
  await addCustomer(prisma, {
    ...CUSTOMERS.blackbird,
    deliveryProfileId: 'docs-dp-weekday',
    catalogueIds: ['docs-cat-full-range'],
  });
};

export default seed;
