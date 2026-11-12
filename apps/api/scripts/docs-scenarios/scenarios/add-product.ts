import { addCatalogue, addProducts } from '../lib/builders';
import { ScenarioSeed } from '../lib/types';
import { PRODUCTS } from './fixtures';

// Starting data: a Full Range catalogue with a few products, so adding Sancerre Blanc 2023
// to it is visible. The product type, supplier and tax type come from the base.
const seed: ScenarioSeed = async ({ prisma }) => {
  const range = [PRODUCTS.chateauBelmont, PRODUCTS.rioja, PRODUCTS.prosecco, PRODUCTS.goldenAle, PRODUCTS.gingerBeer];
  await addProducts(prisma, range);
  await addCatalogue(prisma, {
    id: 'docs-cat-full-range',
    name: 'Full Range',
    description: 'Every product Vine & Co currently offers.',
    productIds: range.map((p) => p.id),
  });
};

export default seed;
