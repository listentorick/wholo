import { PrismaClient, OrganisationType, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const distributor = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-1' },
    update: {},
    create: {
      id: 'seed-distributor-1',
      name: 'Vine & Co',
      slug: 'vine-and-co',
      type: OrganisationType.DISTRIBUTOR,
    },
  });

  const tradeCustomerOrg = await prisma.organisation.upsert({
    where: { id: 'seed-tc-org-1' },
    update: {},
    create: {
      id: 'seed-tc-org-1',
      name: 'The Blackbird Restaurant',
      type: OrganisationType.TRADE_CUSTOMER,
    },
  });

  const passwordHash = await bcrypt.hash('password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'peter@blackbird.com' },
    update: { keycloakId: 'kc-seed-user-1' },
    create: {
      id: 'seed-user-1',
      email: 'peter@blackbird.com',
      keycloakId: 'kc-seed-user-1',
      passwordHash,
      firstName: 'Peter',
      lastName: 'Walsh',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: user.id, organisationId: tradeCustomerOrg.id } },
    update: {},
    create: {
      userId: user.id,
      organisationId: tradeCustomerOrg.id,
      role: Role.TRADE_CUSTOMER,
    },
  });

  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'james@vineandco.com' },
    update: { keycloakId: 'kc-seed-admin-1' },
    create: {
      id: 'seed-admin-1',
      email: 'james@vineandco.com',
      keycloakId: 'kc-seed-admin-1',
      passwordHash: adminPasswordHash,
      firstName: 'James',
      lastName: 'Vine',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: adminUser.id, organisationId: distributor.id } },
    update: {},
    create: {
      userId: adminUser.id,
      organisationId: distributor.id,
      role: Role.DISTRIBUTOR_ADMIN,
    },
  });

  // Yorkshire Hand Made Pies distributor
  const yhmp = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-2' },
    update: {
      addressLine1: '12 Westgate',
      addressCity: 'Wakefield',
      addressState: 'West Yorkshire',
      addressPostcode: 'WF1 1JZ',
      addressCountry: 'United Kingdom',
    },
    create: {
      id: 'seed-distributor-2',
      name: 'Yorkshire Hand Made Pies',
      slug: 'yhmp',
      type: OrganisationType.DISTRIBUTOR,
      addressLine1: '12 Westgate',
      addressCity: 'Wakefield',
      addressState: 'West Yorkshire',
      addressPostcode: 'WF1 1JZ',
      addressCountry: 'United Kingdom',
    },
  });

  const yhmpAdminPasswordHash = await bcrypt.hash('password123', 10);

  const yhmpAdminUser = await prisma.user.upsert({
    where: { email: 'rick@yorkshirehandmadepies.co.uk' },
    update: { keycloakId: 'kc-seed-admin-2' },
    create: {
      id: 'seed-admin-2',
      email: 'rick@yorkshirehandmadepies.co.uk',
      keycloakId: 'kc-seed-admin-2',
      passwordHash: yhmpAdminPasswordHash,
      firstName: 'Rick',
      lastName: 'Yorkshire',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: yhmpAdminUser.id, organisationId: yhmp.id } },
    update: {},
    create: {
      userId: yhmpAdminUser.id,
      organisationId: yhmp.id,
      role: Role.DISTRIBUTOR_ADMIN,
    },
  });

  // Garratts — YHMP trade customer portal login
  await prisma.organisation.update({
    where: { id: 'cmqhajvd8000kou01gacuad3p' },
    data: { email: 'buyer@garratts.co.uk' },
  });

  const garrattsPasswordHash = await bcrypt.hash('password123', 10);

  const garrattsUser = await prisma.user.upsert({
    where: { email: 'buyer@garratts.co.uk' },
    update: { keycloakId: 'kc-seed-garratts-1' },
    create: {
      email: 'buyer@garratts.co.uk',
      keycloakId: 'kc-seed-garratts-1',
      passwordHash: garrattsPasswordHash,
      firstName: 'Garratts',
      lastName: 'Buyer',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: garrattsUser.id, organisationId: 'cmqhajvd8000kou01gacuad3p' } },
    update: {},
    create: {
      userId: garrattsUser.id,
      organisationId: 'cmqhajvd8000kou01gacuad3p',
      role: Role.TRADE_CUSTOMER,
    },
  });

  await prisma.tradeRelationship.update({
    where: { id: 'cmqhajvda000mou01kgeqoz8v' },
    data: { status: 'ACTIVE' },
  });

  // Rogers Bakery
  const rogersBakery = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-3' },
    update: {},
    create: {
      id: 'seed-distributor-3',
      name: 'Rogers Bakery',
      slug: 'rogers-bakery',
      type: OrganisationType.DISTRIBUTOR,
    },
  });

  const rogersBakeryAdminHash = await bcrypt.hash('password123', 10);

  const rogersBakeryAdmin = await prisma.user.upsert({
    where: { email: 'admin@rogersbakery.com' },
    update: {},
    create: {
      id: 'seed-admin-3',
      email: 'admin@rogersbakery.com',
      keycloakId: 'kc-seed-admin-3',
      passwordHash: rogersBakeryAdminHash,
      firstName: 'Roger',
      lastName: 'Baker',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: rogersBakeryAdmin.id, organisationId: rogersBakery.id } },
    update: {},
    create: {
      userId: rogersBakeryAdmin.id,
      organisationId: rogersBakery.id,
      role: Role.DISTRIBUTOR_ADMIN,
    },
  });

  // Goo Cheese
  const gooCheese = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-4' },
    update: {},
    create: {
      id: 'seed-distributor-4',
      name: 'Goo Cheese',
      slug: 'goo-cheese',
      type: OrganisationType.DISTRIBUTOR,
    },
  });

  const gooCheeseAdminHash = await bcrypt.hash('password123', 10);

  const gooCheeseAdmin = await prisma.user.upsert({
    where: { email: 'admin@goo-cheese.co.uk' },
    update: {},
    create: {
      id: 'seed-admin-4',
      email: 'admin@goo-cheese.co.uk',
      keycloakId: 'kc-seed-admin-4',
      passwordHash: gooCheeseAdminHash,
      firstName: 'Goo',
      lastName: 'Admin',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: gooCheeseAdmin.id, organisationId: gooCheese.id } },
    update: {},
    create: {
      userId: gooCheeseAdmin.id,
      organisationId: gooCheese.id,
      role: Role.DISTRIBUTOR_ADMIN,
    },
  });

  // Crofters Foods
  const croftersFoods = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-5' },
    update: {},
    create: {
      id: 'seed-distributor-5',
      name: 'Crofters Foods',
      slug: 'crofters-foods',
      type: OrganisationType.DISTRIBUTOR,
    },
  });

  const croftersFoodsAdminHash = await bcrypt.hash('password123', 10);

  const croftersFoodsAdmin = await prisma.user.upsert({
    where: { email: 'admin@croftersfoods.co.uk' },
    update: {},
    create: {
      id: 'seed-admin-5',
      email: 'admin@croftersfoods.co.uk',
      keycloakId: 'kc-seed-admin-5',
      passwordHash: croftersFoodsAdminHash,
      firstName: 'Crofters',
      lastName: 'Admin',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: croftersFoodsAdmin.id, organisationId: croftersFoods.id } },
    update: {},
    create: {
      userId: croftersFoodsAdmin.id,
      organisationId: croftersFoods.id,
      role: Role.DISTRIBUTOR_ADMIN,
    },
  });

  // Cryer and Stott
  const cryerAndStott = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-6' },
    update: {},
    create: {
      id: 'seed-distributor-6',
      name: 'Cryer and Stott',
      slug: 'cryer-and-stott',
      type: OrganisationType.DISTRIBUTOR,
    },
  });

  const cryerAndStottAdminHash = await bcrypt.hash('password123', 10);

  const cryerAndStottAdmin = await prisma.user.upsert({
    where: { email: 'admin@cryerandstott.co.uk' },
    update: {},
    create: {
      id: 'seed-admin-6',
      email: 'admin@cryerandstott.co.uk',
      keycloakId: 'kc-seed-admin-6',
      passwordHash: cryerAndStottAdminHash,
      firstName: 'Cryer',
      lastName: 'Admin',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: cryerAndStottAdmin.id, organisationId: cryerAndStott.id } },
    update: {},
    create: {
      userId: cryerAndStottAdmin.id,
      organisationId: cryerAndStott.id,
      role: Role.DISTRIBUTOR_ADMIN,
    },
  });

  // Product types for Vine & Co
  const productTypeData = [
    { id: 'seed-pt-wine', name: 'Wine', code: 'wine', displayOrder: 1 },
    { id: 'seed-pt-beer', name: 'Beer', code: 'beer', displayOrder: 2 },
    { id: 'seed-pt-spirits', name: 'Spirits', code: 'spirits', displayOrder: 3 },
    { id: 'seed-pt-cider', name: 'Cider', code: 'cider', displayOrder: 4 },
    { id: 'seed-pt-non-alc', name: 'Non-Alcoholic', code: 'non-alcoholic', displayOrder: 5 },
  ];

  for (const pt of productTypeData) {
    await prisma.productType.upsert({
      where: { distributorId_code: { distributorId: distributor.id, code: pt.code } },
      update: { name: pt.name, displayOrder: pt.displayOrder },
      create: {
        id: pt.id,
        distributorId: distributor.id,
        name: pt.name,
        code: pt.code,
        displayOrder: pt.displayOrder,
      },
    });
  }

  // Suppliers for Vine & Co
  const supplierData = [
    { id: 'seed-sup-1', name: 'LeafyLegacy' },
    { id: 'seed-sup-2', name: 'Artisan Beverages Co' },
    { id: 'seed-sup-3', name: 'Southern Cellars' },
  ];

  for (const sup of supplierData) {
    await prisma.supplier.upsert({
      where: { id: sup.id },
      update: { name: sup.name },
      create: {
        id: sup.id,
        distributorId: distributor.id,
        name: sup.name,
      },
    });
  }

  console.log(
    `Seeded: distributor "${distributor.name}", ` +
    `user "${user.email}", admin "${adminUser.email}", ` +
    `${productTypeData.length} product types, ${supplierData.length} suppliers, ` +
    `distributor "${yhmp.name}", admin "${yhmpAdminUser.email}", ` +
    `distributor "${rogersBakery.name}", admin "${rogersBakeryAdmin.email}", ` +
    `distributor "${gooCheese.name}", admin "${gooCheeseAdmin.email}", ` +
    `distributor "${croftersFoods.name}", admin "${croftersFoodsAdmin.email}", ` +
    `distributor "${cryerAndStott.name}", admin "${cryerAndStottAdmin.email}"`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
