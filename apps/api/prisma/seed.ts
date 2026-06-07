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

  console.log(`Seeded: distributor "${distributor.name}", user "${user.email}", admin "${adminUser.email}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
