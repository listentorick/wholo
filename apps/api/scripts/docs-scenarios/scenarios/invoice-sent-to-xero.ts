import { addCatalogue, addCustomer, addDeliveryProfile, addOrder, addProducts, nextWeekday } from '../lib/builders';
import { BASE_IDS } from '../lib/ids';
import { withXero } from '../lib/types';
import { linkCustomerToXero, linkProductToXero, linkTaxTypeToXero } from '../lib/xero-links';
import { CUSTOMERS, PRODUCTS } from './fixtures';
import { XERO_CONTACTS, XERO_ITEMS, XERO_ORDER_NUMBERS, XERO_VAT_20 } from './xero-fixtures';

// Starting data: Botanica Bar & Kitchen, linked to its Xero contact, has one order awaiting
// review (ORD-2026-60001, 12 × Prosecco Extra Dry, for delivery next Thursday). Prosecco Extra
// Dry is linked to the Xero item WINE-007, and Standard VAT to 20% (VAT on Income). Invoices
// are created in Xero as drafts. No Xero invoice exists for this order (resetXeroData removes
// earlier runs' ones).
export default withXero({
  synced: true,
  before: async ({ prisma }) => {
    await addProducts(prisma, [PRODUCTS.prosecco]);
    await addCatalogue(prisma, { id: 'docs-cat-full-range', name: 'Full Range', productIds: [PRODUCTS.prosecco.id] });
    await addDeliveryProfile(prisma, { id: 'docs-dp-weekday', name: 'Standard Weekday', weekdays: [1, 2, 3, 4, 5] });
    const botanica = await addCustomer(prisma, {
      ...CUSTOMERS.botanica,
      deliveryProfileId: 'docs-dp-weekday',
      catalogueIds: ['docs-cat-full-range'],
    });
    await addOrder(prisma, {
      id: 'docs-order-botanica',
      orderNumber: XERO_ORDER_NUMBERS.botanica,
      customer: botanica,
      status: 'SUBMITTED',
      deliveryDate: nextWeekday(4, 3),
      lines: [{ productId: PRODUCTS.prosecco.id, quantity: 12 }],
    });
  },
  after: async ({ prisma }) => {
    await linkTaxTypeToXero(prisma, BASE_IDS.taxStandardVat, XERO_VAT_20);
    await linkProductToXero(prisma, PRODUCTS.prosecco.id, XERO_ITEMS.prosecco.code);
    await linkCustomerToXero(prisma, `docs-rel-${CUSTOMERS.botanica.key}`, XERO_CONTACTS.botanica.name);
  },
});
