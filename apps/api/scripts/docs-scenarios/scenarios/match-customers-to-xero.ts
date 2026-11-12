import { addCustomer } from '../lib/builders';
import { withXero } from '../lib/types';
import { CUSTOMERS } from './fixtures';

// Starting data: The Blackbird Restaurant, The Anchor Inn and Riverside Bistro, none linked.
// The first sync suggests Blackbird Restaurant Ltd for The Blackbird Restaurant (same email)
// and Anchor Inn Harrogate for The Anchor Inn (same account number, VC-1002); nothing is
// suggested for RB Hospitality Ltd.
export default withXero({
  synced: true,
  before: async ({ prisma }) => {
    await addCustomer(prisma, CUSTOMERS.blackbird);
    await addCustomer(prisma, CUSTOMERS.anchorInn);
    await addCustomer(prisma, CUSTOMERS.riverside);
  },
});
