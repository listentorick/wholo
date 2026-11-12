import { BASE_IDS } from '../lib/ids';
import { withXero } from '../lib/types';
import { linkTaxTypeToXero } from '../lib/xero-links';
import { XERO_VAT_20 } from './xero-fixtures';

// Starting data: Vine & Co connected to Demo Company (UK) and synced, with Standard VAT linked
// to 20% (VAT on Income). No tax type for Xero's 5% (VAT on Income) rate, and none called
// Reduced VAT.
export default withXero({
  synced: true,
  after: async ({ prisma }) => {
    await linkTaxTypeToXero(prisma, BASE_IDS.taxStandardVat, XERO_VAT_20);
  },
});
