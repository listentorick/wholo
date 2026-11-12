import { addProducts } from '../lib/builders';
import { BASE_IDS } from '../lib/ids';
import { withXero } from '../lib/types';
import { linkTaxTypeToXero } from '../lib/xero-links';
import { PRODUCTS } from './fixtures';
import { XERO_VAT_20 } from './xero-fixtures';

// Starting data: Château Belmont Rouge 2021 (WINE-001) and Rioja Crianza 2020, neither linked.
// The first sync suggests the Xero item WINE-001 for Château Belmont by its code; nothing is
// suggested for House Red - Rioja. Standard VAT is linked to 20% (VAT on Income), the Xero
// items' rate, so matching doesn't ask to change a tax type.
export default withXero({
  synced: true,
  before: async ({ prisma }) => {
    await addProducts(prisma, [PRODUCTS.chateauBelmont, PRODUCTS.rioja]);
  },
  after: async ({ prisma }) => {
    await linkTaxTypeToXero(prisma, BASE_IDS.taxStandardVat, XERO_VAT_20);
  },
});
