import { addProducts } from '../lib/builders';
import { ScenarioSeed } from '../lib/types';
import { PRODUCTS } from './fixtures';

// Starting data: the product given a fixed price. Standard Pricing (the default) comes
// with the base; no other price lists exist.
const seed: ScenarioSeed = async ({ prisma }) => {
  await addProducts(prisma, [PRODUCTS.barolo]);
};

export default seed;
