import { addCatalogue, addCustomer, addDeliveryProfile, addPortalInvitation, addProducts } from '../lib/builders';
import { addBranding } from '../lib/images';
import { ScenarioSeed } from '../lib/types';
import { CUSTOMERS, PRODUCTS } from './fixtures';

// Starting data: The Rusty Anchor Bar & Grill is a Vine & Co customer, Pending invite, with
// no login yet, a catalogue and a delivery profile. Vine & Co has sent it a portal invitation
// to orders@rustyanchor.example; wholo-worker emails it to MailHog. Vine & Co's storefront
// is branded. The Keycloak account Tom creates in the run is removed by every reset
// (DOCS_SIGN_UP_EMAILS).
const seed: ScenarioSeed = async ({ prisma, output }) => {
  const products = [PRODUCTS.chateauBelmont, PRODUCTS.barolo, PRODUCTS.sauvignon, PRODUCTS.rioja, PRODUCTS.prosecco, PRODUCTS.chianti];
  await addProducts(prisma, products);
  await addBranding(prisma);
  await addCatalogue(prisma, { id: 'docs-cat-full-range', name: 'Full Range', productIds: products.map((p) => p.id) });
  await addDeliveryProfile(prisma, { id: 'docs-dp-weekday', name: 'Standard Weekday', weekdays: [1, 2, 3, 4, 5] });
  const rustyAnchor = await addCustomer(prisma, {
    ...CUSTOMERS.rustyAnchor,
    status: 'PENDING_INVITE',
    noContact: true,
    deliveryProfileId: 'docs-dp-weekday',
    catalogueIds: ['docs-cat-full-range'],
  });
  output.inviteEmail = await addPortalInvitation(prisma, rustyAnchor, CUSTOMERS.rustyAnchor.email);
};

export default seed;
