import { addProducts } from '../lib/builders';
import { BASE_IDS } from '../lib/ids';
import { withXero } from '../lib/types';
import { syncAgain } from '../lib/xero-connection';
import { linkProductToXero, linkTaxTypeToXero } from '../lib/xero-links';
import { PRODUCTS } from './fixtures';
import { XERO_ITEMS, XERO_SAUVIGNON_NEW_PRICE, XERO_VAT_20 } from './xero-fixtures';

// Starting data: Marlborough Sauvignon Blanc 2023 (£13.75) linked to the Xero item WINE-005.
// Since the link, the item's sales price in Xero has gone up to £14.25 and a sync has seen it,
// so the product shows "Changed in Xero". The product's own price is still £13.75.
export default withXero({
  synced: true,
  before: async ({ prisma }) => {
    await addProducts(prisma, [PRODUCTS.sauvignon]);
  },
  after: async ({ prisma, xero }) => {
    await linkTaxTypeToXero(prisma, BASE_IDS.taxStandardVat, XERO_VAT_20);
    await linkProductToXero(prisma, PRODUCTS.sauvignon.id, XERO_ITEMS.sauvignon.code);
    const items = await xero.get<{ Items: Array<{ ItemID: string; Code: string }> }>(`/Items?where=${encodeURIComponent(`Code=="${XERO_ITEMS.sauvignon.code}"`)}`);
    await xero.post('/Items', {
      Items: [{ ItemID: items.Items[0].ItemID, Code: XERO_ITEMS.sauvignon.code, SalesDetails: { UnitPrice: XERO_SAUVIGNON_NEW_PRICE } }],
    });
    await syncAgain(prisma, ['product']);
  },
});
