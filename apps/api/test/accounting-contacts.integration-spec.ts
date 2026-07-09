/**
 * Integration tests for the accounting contact sync routes: proves
 * distributor-boundary isolation on the new tables (a real DB query, not a
 * mocked-Prisma unit test, is the only way to prove a query actually scopes
 * by distributor rather than just trusting the arguments passed to it), the
 * two partial unique constraints on CustomerAccountingMapping, and that
 * "Sync now" writes an outbox row rather than performing a synchronous
 * side effect.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import {
  AccountingConnectionStatus,
  AccountingContactMatchMethod,
  AccountingProvider,
  OrganisationType,
  Prisma,
  Role,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-acct-contacts-dist-a';
const DIST_B = 'test-acct-contacts-dist-b';
const CUSTOMER_A = 'test-acct-contacts-customer-a';
const ADMIN_USER = 'test-acct-contacts-admin';
const ADMIN_KEYCLOAK_ID = 'kc-test-acct-contacts-admin';

describe('Accounting contact sync routes (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let token: string;
  let connectionA: { id: string };
  let connectionB: { id: string };
  let tradeRelationshipA: { id: string };

  beforeAll(async () => {
    jwtServer = await startJwtTestServer();

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.organisation.upsert({
      where: { id: DIST_A },
      create: { id: DIST_A, name: 'Contacts Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Contacts Test Distributor B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER_A },
      create: { id: CUSTOMER_A, name: 'Blackbird Vine & Co', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    const user = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER,
        email: 'acct-contacts-admin@integration.test',
        keycloakId: ADMIN_KEYCLOAK_ID,
        firstName: 'Integration',
        lastName: 'Admin',
      },
      update: { keycloakId: ADMIN_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: DIST_A } },
      create: { userId: user.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });

    token = jwtServer.signToken({ sub: ADMIN_KEYCLOAK_ID, email: 'acct-contacts-admin@integration.test' });
  });

  beforeEach(async () => {
    const baseConnection = {
      provider: AccountingProvider.XERO,
      status: AccountingConnectionStatus.CONNECTED,
      externalOrganisationName: 'Acme Wines',
      scopes: 'openid accounting.contacts',
      encryptedCredentialData: 'irrelevant-for-this-test',
      connectedByUserId: ADMIN_USER,
      connectedAt: new Date(),
    };
    connectionA = await prisma.accountingConnection.create({
      data: { ...baseConnection, distributorId: DIST_A, externalOrganisationId: 'tenant-a' },
    });
    connectionB = await prisma.accountingConnection.create({
      data: { ...baseConnection, distributorId: DIST_B, externalOrganisationId: 'tenant-b' },
    });
    tradeRelationshipA = await prisma.tradeRelationship.create({
      data: { distributorId: DIST_A, customerId: CUSTOMER_A, accountNumber: 'WC-1' },
    });
  });

  afterEach(async () => {
    await prisma.accountingContactMatchSuggestion.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.customerAccountingMapping.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.externalAccountingContact.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'AccountingConnection' } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B, CUSTOMER_A] } } });
    await app.close();
    await jwtServer.close();
  });

  async function createContact(connectionId: string, distributorId: string, externalContactId: string) {
    return prisma.externalAccountingContact.create({
      data: {
        distributorId,
        accountingConnectionId: connectionId,
        provider: AccountingProvider.XERO,
        externalContactId,
        displayName: `Contact ${externalContactId}`,
        isCustomer: true,
        lastSyncedAt: new Date(),
        rawProviderData: {},
      },
    });
  }

  describe('distributor-scoped list endpoint', () => {
    it('only returns contacts belonging to the requesting distributor, even when another distributor has its own', async () => {
      const contactA = await createContact(connectionA.id, DIST_A, 'xero-a-1');
      await createContact(connectionB.id, DIST_B, 'xero-b-1');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/accounting/contacts`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([contactA.id]);
    });

    it('rejects the list route for a distributor the admin does not belong to', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_B}/accounting/contacts`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /contacts/sync', () => {
    it('writes an outbox event rather than performing a synchronous sync', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/accounting/contacts/sync`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ queued: true });

      const events = await prisma.outboxEvent.findMany({
        where: { aggregateType: 'AccountingConnection', aggregateId: connectionA.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('AccountingContactSyncRequested');
      expect(events[0].status).toBe('PENDING');
    });
  });

  describe('import as new customer', () => {
    it('creates an Organisation + TradeRelationship + mapping, and never a CustomerInvitation', async () => {
      const contact = await createContact(connectionA.id, DIST_A, 'xero-a-import');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/accounting/contacts/${contact.id}/import`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Imported Co' });

      expect(res.status).toBe(201);

      const mapping = await prisma.customerAccountingMapping.findFirst({
        where: { externalContactId: contact.id },
      });
      expect(mapping).not.toBeNull();
      expect(mapping?.matchMethod).toBe(AccountingContactMatchMethod.MANUAL);

      const relationship = await prisma.tradeRelationship.findUnique({
        where: { id: mapping!.tradeRelationshipId },
        include: { customer: true, invitations: true },
      });
      expect(relationship?.status).toBe('PENDING_INVITE');
      expect(relationship?.customer.name).toBe('New Imported Co');
      expect(relationship?.invitations).toHaveLength(0);
    });
  });

  describe('CustomerAccountingMapping partial unique constraints', () => {
    it('rejects a second active mapping for the same trade relationship on the same connection', async () => {
      const contact1 = await createContact(connectionA.id, DIST_A, 'xero-a-2');
      const contact2 = await createContact(connectionA.id, DIST_A, 'xero-a-3');

      await prisma.customerAccountingMapping.create({
        data: {
          distributorId: DIST_A,
          accountingConnectionId: connectionA.id,
          tradeRelationshipId: tradeRelationshipA.id,
          externalContactId: contact1.id,
          matchMethod: AccountingContactMatchMethod.MANUAL,
          linkedByUserId: ADMIN_USER,
        },
      });

      await expect(
        prisma.customerAccountingMapping.create({
          data: {
            distributorId: DIST_A,
            accountingConnectionId: connectionA.id,
            tradeRelationshipId: tradeRelationshipA.id,
            externalContactId: contact2.id,
            matchMethod: AccountingContactMatchMethod.MANUAL,
            linkedByUserId: ADMIN_USER,
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('rejects a second active mapping for the same external contact on the same connection', async () => {
      const contact = await createContact(connectionA.id, DIST_A, 'xero-a-4');
      const customer2 = await prisma.organisation.create({
        data: { name: 'Second Customer', type: OrganisationType.TRADE_CUSTOMER },
      });
      const relationship2 = await prisma.tradeRelationship.create({
        data: { distributorId: DIST_A, customerId: customer2.id },
      });

      await prisma.customerAccountingMapping.create({
        data: {
          distributorId: DIST_A,
          accountingConnectionId: connectionA.id,
          tradeRelationshipId: tradeRelationshipA.id,
          externalContactId: contact.id,
          matchMethod: AccountingContactMatchMethod.MANUAL,
          linkedByUserId: ADMIN_USER,
        },
      });

      await expect(
        prisma.customerAccountingMapping.create({
          data: {
            distributorId: DIST_A,
            accountingConnectionId: connectionA.id,
            tradeRelationshipId: relationship2.id,
            externalContactId: contact.id,
            matchMethod: AccountingContactMatchMethod.MANUAL,
            linkedByUserId: ADMIN_USER,
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);

      await prisma.tradeRelationship.delete({ where: { id: relationship2.id } });
      await prisma.organisation.delete({ where: { id: customer2.id } });
    });

    it('allows relinking the same pair after the original mapping has been unlinked', async () => {
      const contact = await createContact(connectionA.id, DIST_A, 'xero-a-5');

      const first = await prisma.customerAccountingMapping.create({
        data: {
          distributorId: DIST_A,
          accountingConnectionId: connectionA.id,
          tradeRelationshipId: tradeRelationshipA.id,
          externalContactId: contact.id,
          matchMethod: AccountingContactMatchMethod.MANUAL,
          linkedByUserId: ADMIN_USER,
        },
      });
      await prisma.customerAccountingMapping.update({
        where: { id: first.id },
        data: { unlinkedAt: new Date() },
      });

      await expect(
        prisma.customerAccountingMapping.create({
          data: {
            distributorId: DIST_A,
            accountingConnectionId: connectionA.id,
            tradeRelationshipId: tradeRelationshipA.id,
            externalContactId: contact.id,
            matchMethod: AccountingContactMatchMethod.MANUAL,
            linkedByUserId: ADMIN_USER,
          },
        }),
      ).resolves.toBeDefined();
    });
  });
});
