import { addCustomer } from '../lib/builders';
import { withXero } from '../lib/types';
import { CUSTOMERS } from './fixtures';

// Starting data: Highfield Golf Club, not linked. The first sync suggests the Xero contact
// Highfield Golf Club for it, by name.
export default withXero({
  synced: true,
  before: async ({ prisma }) => {
    await addCustomer(prisma, CUSTOMERS.highfield);
  },
});
