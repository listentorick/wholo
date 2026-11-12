import { addCatalogue, addCustomer, addPriceList } from '../lib/builders';
import { ScenarioSeed } from '../lib/types';
import { CUSTOMERS } from './fixtures';

// Starting data: a customer with no catalogues on Standard Pricing, the two catalogues it
// can be given, and the Hotel Trade price list. The catalogues and price list are empty:
// the task only chooses them.
const seed: ScenarioSeed = async ({ prisma }) => {
  await addCatalogue(prisma, { id: 'docs-cat-full-range', name: 'Full Range', productIds: [] });
  await addCatalogue(prisma, { id: 'docs-cat-featured', name: 'Featured Selection', productIds: [] });
  await addPriceList(prisma, { id: 'docs-pl-hotel-trade', name: 'Hotel Trade' });
  await addCustomer(prisma, CUSTOMERS.grandHotel);
};

export default seed;
