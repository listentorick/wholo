import { addCustomer, addProducts } from '../lib/builders';
import { ScenarioSeed } from '../lib/types';
import { CUSTOMERS, PRODUCTS } from './fixtures';

// Starting data: the six products the two new catalogues are built from, and two
// customers with no catalogues. No catalogues exist.
const seed: ScenarioSeed = async ({ prisma }) => {
  await addProducts(prisma, [
    PRODUCTS.rioja,
    PRODUCTS.chianti,
    PRODUCTS.sauvignon,
    PRODUCTS.prosecco,
    PRODUCTS.gingerBeer,
    PRODUCTS.afLager,
  ]);
  await addCustomer(prisma, CUSTOMERS.botanica);
  await addCustomer(prisma, CUSTOMERS.highfield);
};

export default seed;
