import { OrganisationType, PrismaClient, Role, TaxClassification } from '@prisma/client';
import { BASE_IDS, DOCS_DISTRIBUTOR_ID, DOCS_DISTRIBUTOR_NAME, DOCS_DISTRIBUTOR_SLUG, DOCS_USERS } from './ids';

/**
 * The base every scenario starts from: Vine & Co set up and ready, the way a new
 * distributor would have it after onboarding and basic catalogue setup, with no customers,
 * products, catalogues, delivery profiles or routes, and no accounting connection.
 *
 * Settings rows the app creates for itself when first needed (distributor settings, the
 * "set by accounting software" payment term) are left to the app, so they come out exactly
 * as they would for a real distributor.
 */
export async function createBase(prisma: PrismaClient): Promise<void> {
  await prisma.organisation.create({
    data: {
      id: DOCS_DISTRIBUTOR_ID,
      name: DOCS_DISTRIBUTOR_NAME,
      slug: DOCS_DISTRIBUTOR_SLUG,
      type: OrganisationType.DISTRIBUTOR,
      email: 'hello@vineandco.example',
      phone: '0113 496 0100',
      addressLine1: '14 Wharf Street',
      addressCity: 'Leeds',
      addressPostcode: 'LS2 7EQ',
      addressCountry: 'United Kingdom',
    },
  });

  const owner = await upsertUser(prisma, DOCS_USERS.owner);
  await prisma.membership.create({
    data: {
      userId: owner.id,
      organisationId: DOCS_DISTRIBUTOR_ID,
      role: Role.DISTRIBUTOR_ADMIN,
      roles: { create: { role: Role.DISTRIBUTOR_ADMIN } },
    },
  });

  // The portal buyer's sign-in exists, but belongs to no customer until a scenario adds one.
  await upsertUser(prisma, DOCS_USERS.buyer);

  const types: Array<[string, string, string]> = [
    [BASE_IDS.productType.wine, 'Wine', 'wine'],
    [BASE_IDS.productType.beer, 'Beer', 'beer'],
    [BASE_IDS.productType.spirits, 'Spirits', 'spirits'],
    [BASE_IDS.productType.cider, 'Cider', 'cider'],
    [BASE_IDS.productType.nonAlcoholic, 'Non-Alcoholic', 'non-alcoholic'],
  ];
  await prisma.productType.createMany({
    data: types.map(([id, name, code], i) => ({ id, distributorId: DOCS_DISTRIBUTOR_ID, name, code, displayOrder: i + 1 })),
  });

  await prisma.supplier.createMany({
    data: [
      { id: BASE_IDS.supplier.southernCellars, distributorId: DOCS_DISTRIBUTOR_ID, name: 'Southern Cellars' },
      { id: BASE_IDS.supplier.artisanBeverages, distributorId: DOCS_DISTRIBUTOR_ID, name: 'Artisan Beverages Co' },
      { id: BASE_IDS.supplier.leafyLegacy, distributorId: DOCS_DISTRIBUTOR_ID, name: 'LeafyLegacy' },
    ],
  });

  await prisma.taxType.create({
    data: {
      id: BASE_IDS.taxStandardVat,
      distributorId: DOCS_DISTRIBUTOR_ID,
      name: 'Standard VAT',
      classification: TaxClassification.STANDARD,
      ratePercentage: 20,
      active: true,
    },
  });

  await prisma.priceList.create({
    data: {
      id: BASE_IDS.priceListStandard,
      distributorId: DOCS_DISTRIBUTOR_ID,
      name: 'Standard Pricing',
      description: 'Default trade pricing applied when no customer-specific price list is assigned.',
      currency: 'GBP',
      isDefault: true,
      active: true,
    },
  });
}

async function upsertUser(
  prisma: PrismaClient,
  user: { id: string; keycloakId: string; email: string; firstName: string; lastName: string },
) {
  // Matched on the Keycloak id: that's how a sign-in finds its user.
  return prisma.user.upsert({
    where: { keycloakId: user.keycloakId },
    update: { email: user.email, firstName: user.firstName, lastName: user.lastName, deletedAt: null },
    create: user,
  });
}
