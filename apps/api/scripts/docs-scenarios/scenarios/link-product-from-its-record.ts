import { addProducts } from '../lib/builders';
import { BASE_IDS } from '../lib/ids';
import { withXero } from '../lib/types';
import { linkTaxTypeToXero } from '../lib/xero-links';
import { PRODUCTS } from './fixtures';
import { XERO_VAT_20 } from './xero-fixtures';

// Starting data: Barolo Riserva 2019 (SKU WINE-004), not linked. The first sync suggests the
// Xero item Barolo Riserva 2019 (code BAR-RIS-19) for it, by name. Standard VAT is linked to
// 20% (VAT on Income).
export default withXero({
  synced: true,
  before: async ({ prisma }) => {
    await addProducts(prisma, [PRODUCTS.barolo]);
  },
  after: async ({ prisma }) => {
    await linkTaxTypeToXero(prisma, BASE_IDS.taxStandardVat, XERO_VAT_20);
  },
});
