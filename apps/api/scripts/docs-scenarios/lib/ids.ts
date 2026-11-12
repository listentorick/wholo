// Fixed identities of the docs world. The sign-in users reuse the Keycloak accounts the
// realm import creates (helm/wholo/templates/keycloak/realm-secret.yaml), so no Keycloak
// setup is needed and saved browser sessions keep working across resets.

export const DOCS_DISTRIBUTOR_ID = 'docs-distributor';
export const DOCS_DISTRIBUTOR_SLUG = 'vine-and-co';
export const DOCS_DISTRIBUTOR_NAME = 'Vine & Co';

/**
 * Store URLs that docs runs create through the onboarding wizard (distributor-onboarding,
 * get-started-owner). Onboarding gives the business a generated id, so the clear-down
 * recognises it by one of these slugs instead. Never a slug the demo seed uses.
 */
export const DOCS_ONBOARDING_SLUGS: readonly string[] = ['harbour-wines'];

/**
 * Accounts a docs run creates by signing up through Keycloak's registration page (an
 * invited customer creating their login). Every reset deletes them from Keycloak and
 * empties their inbox (lib/sign-ups.ts). Only .example addresses, which can't be real.
 */
export const DOCS_SIGN_UP_EMAILS: readonly string[] = ['orders@rustyanchor.example', 'tom@rustyanchor.example'];

export const DOCS_USERS = {
  owner: { id: 'docs-user-owner', keycloakId: 'kc-seed-admin-1', email: 'james@vineandco.com', firstName: 'James', lastName: 'Vine' },
  buyer: { id: 'docs-user-buyer', keycloakId: 'kc-seed-user-1', email: 'peter@blackbird.com', firstName: 'Peter', lastName: 'Walsh' },
} as const;

export const BASE_IDS = {
  taxStandardVat: 'docs-tax-standard-vat',
  priceListStandard: 'docs-pl-standard',
  productType: {
    wine: 'docs-pt-wine',
    beer: 'docs-pt-beer',
    spirits: 'docs-pt-spirits',
    cider: 'docs-pt-cider',
    nonAlcoholic: 'docs-pt-non-alcoholic',
  },
  supplier: {
    southernCellars: 'docs-sup-southern-cellars',
    artisanBeverages: 'docs-sup-artisan-beverages',
    leafyLegacy: 'docs-sup-leafylegacy',
  },
} as const;
