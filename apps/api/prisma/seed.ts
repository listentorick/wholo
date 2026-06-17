import { PrismaClient, OrganisationType, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const distributor = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-1' },
    update: { slug: 'vine-and-co' },
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
    update: {},
    create: {
      id: 'seed-user-1',
      email: 'peter@blackbird.com',
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
    update: {},
    create: {
      id: 'seed-admin-1',
      email: 'james@vineandco.com',
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
    update: { slug: 'yhmp' },
    create: {
      id: 'seed-distributor-2',
      name: 'Yorkshire Hand Made Pies',
      slug: 'yhmp',
      type: OrganisationType.DISTRIBUTOR,
    },
  });

  const yhmpAdminPasswordHash = await bcrypt.hash('password123', 10);

  const yhmpAdminUser = await prisma.user.upsert({
    where: { email: 'rick@yorkshirehandmadepies.co.uk' },
    update: {},
    create: {
      id: 'seed-admin-2',
      email: 'rick@yorkshirehandmadepies.co.uk',
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
    update: {},
    create: {
      email: 'buyer@garratts.co.uk',
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
    `distributor "${yhmp.name}", admin "${yhmpAdminUser.email}"`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
