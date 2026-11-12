import { addCustomer } from '../lib/builders';
import { ScenarioSeed } from '../lib/types';
import { CUSTOMERS } from './fixtures';

// Starting data: the customer being invited, with no invitations.
const seed: ScenarioSeed = async ({ prisma }) => {
  await addCustomer(prisma, CUSTOMERS.rustyAnchor);
};

export default seed;
