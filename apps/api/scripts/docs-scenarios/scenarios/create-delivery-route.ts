import { addCustomer } from '../lib/builders';
import { ScenarioSeed } from '../lib/types';
import { CUSTOMERS } from './fixtures';

// Starting data: three customers on no route. No routes exist. Drivers are typed in, so
// there's nothing to create for Chris Moore.
const seed: ScenarioSeed = async ({ prisma }) => {
  await addCustomer(prisma, CUSTOMERS.anchorInn);
  await addCustomer(prisma, CUSTOMERS.riverside);
  await addCustomer(prisma, CUSTOMERS.blackbird);
};

export default seed;
