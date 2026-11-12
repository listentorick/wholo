import { BASE_IDS } from '../lib/ids';
import { withXero } from '../lib/types';
import { linkTaxTypeToXero } from '../lib/xero-links';
import { XERO_VAT_20 } from './xero-fixtures';

// Starting data: Vine & Co connected to Demo Company (UK) and synced, with no products, and
// Standard VAT linked to 20% (VAT on Income), so imported products get it as their tax type.
export default withXero({
  synced: true,
  after: async ({ prisma }) => {
    await linkTaxTypeToXero(prisma, BASE_IDS.taxStandardVat, XERO_VAT_20);
  },
});
