import { addCustomer } from '../lib/builders';
import { ScenarioSeed } from '../lib/types';
import { CUSTOMERS } from './fixtures';

// Starting data: one customer with no payment terms of its own (so it uses the default).
// No payment terms exist beyond the one the app adds by itself.
const seed: ScenarioSeed = async ({ prisma }) => {
  await addCustomer(prisma, CUSTOMERS.grandHotel);
};

export default seed;
