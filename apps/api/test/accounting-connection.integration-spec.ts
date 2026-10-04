/**
 * Integration tests for the accounting connection routes: verifies
 * DistributorAccessGuard enforcement against a real JWKS-validated JWT, that
 * the partial unique index (one CONNECTED AccountingConnection per
 * distributor) is actually enforced at the database level — something a
 * mocked-Prisma unit test cannot prove — and that a reconnect to the same
 * organisation keeps everything the distributor linked (ADR-074).
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import {
  AccountingConnectionStatus,
  AccountingContactMatchMethod,
  AccountingProductMatchMethod,
  AccountingProvider,
  AccountingTaxTypeMatchMethod,
  IngestionRunStatus,
  IngestionRunTrigger,
  OrganisationType,
  Prisma,
  Role,
  TaxClassification,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';
import { createAccountingConnection } from './support/accounting-fixtures';
import { FakeAccountingAdapter } from './support/fake-accounting.adapter';
import { AccountingConnectionService } from '../src/accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../src/accounting/adapters/accounting-adapter.registry';
import { TokenEncryptionService } from '../src/accounting/token-encryption.service';
import { AccountingRefreshLockService } from '../src/accounting/accounting-refresh-lock.service';
import { AdminNotificationsService } from '../src/admin-notifications/admin-notifications.service';
import { MailService } from '../src/mail/mail.service';

const DIST_A = 'test-accounting-dist-a';
const DIST_B = 'test-accounting-dist-b';
const ADMIN_USER = 'test-accounting-admin';
const ADMIN_KEYCLOAK_ID = 'kc-test-accounting-admin';
const CUSTOMER = 'test-accounting-customer';

describe('Accounting connection routes (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let token: string;

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
      create: { id: DIST_A, name: 'Accounting Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Accounting Test Distributor B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    const user = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER,
        email: 'accounting-admin@integration.test',
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

    token = jwtServer.signToken({ sub: ADMIN_KEYCLOAK_ID, email: 'accounting-admin@integration.test' });
  });

  afterEach(async () => {
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingOrganisation.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
    await jwtServer.close();
  });

  describe('DistributorAccessGuard', () => {
    it('allows GET connection for the distributor the admin belongs to', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/accounting/connection`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });

    it('rejects GET connection for a distributor the admin does not belong to', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_B}/accounting/connection`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('rejects the authorization-url route for a distributor the admin does not belong to', async () => {
      // Blocked by the guard before the Xero adapter is ever invoked — no
      // real network call to Xero happens here.
      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_B}/accounting/connections/xero/authorization-url`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('rejects DELETE connection for a distributor the admin does not belong to', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/distributors/${DIST_B}/accounting/connection`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('rejects requests with no Authorization header at all', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/distributors/${DIST_A}/accounting/connection`,
      );

      expect(res.status).toBe(401);
    });
  });

  describe('one active connection per distributor (DB-level partial unique index)', () => {
    const baseConnection = {
      provider: AccountingProvider.XERO,
      externalOrganisationId: 'tenant-1',
      externalOrganisationName: 'Acme Wines',
      scopes: 'openid',
      encryptedCredentialData: 'irrelevant-for-this-test',
      connectedByUserId: ADMIN_USER,
      connectedAt: new Date(),
    };

    it('rejects a second CONNECTED row for the same distributor', async () => {
      await createAccountingConnection(prisma, { ...baseConnection, distributorId: DIST_A, status: AccountingConnectionStatus.CONNECTED });

      await expect(
        createAccountingConnection(prisma, { ...baseConnection, distributorId: DIST_A, status: AccountingConnectionStatus.CONNECTED }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('allows a DISCONNECTED row to coexist with a CONNECTED row for the same distributor', async () => {
      await createAccountingConnection(prisma, { ...baseConnection, distributorId: DIST_A, status: AccountingConnectionStatus.CONNECTED });

      await expect(
        createAccountingConnection(prisma, {
            ...baseConnection,
            distributorId: DIST_A,
            status: AccountingConnectionStatus.DISCONNECTED,
            disconnectedAt: new Date(),
          }),
      ).resolves.toBeDefined();
    });

    it('allows a CONNECTED row per distributor independently', async () => {
      await createAccountingConnection(prisma, { ...baseConnection, distributorId: DIST_A, status: AccountingConnectionStatus.CONNECTED });

      await expect(
        createAccountingConnection(prisma, { ...baseConnection, distributorId: DIST_B, status: AccountingConnectionStatus.CONNECTED }),
      ).resolves.toBeDefined();
    });
  });

  // The user-facing promise: dropping or disconnecting the connection and
  // connecting the same company again must not lose anything the distributor
  // linked. Drives the real OAuth callback (handleCallback) with a fake
  // provider, and reads the links back through the real list endpoints.
  describe('reconnecting (ADR-074)', () => {
    let fake: FakeAccountingAdapter;
    let connections: AccountingConnectionService;

    beforeAll(async () => {
      await prisma.organisation.upsert({
        where: { id: CUSTOMER },
        create: { id: CUSTOMER, name: 'Reconnect Test Customer', type: OrganisationType.TRADE_CUSTOMER },
        update: {},
      });
    });

    beforeEach(() => {
      fake = new FakeAccountingAdapter();
      const registry = { get: () => fake, displayName: () => fake.displayName } as unknown as AccountingAdapterRegistry;
      const get = <T>(type: new (...args: never[]) => T) => app.get(type, { strict: false });
      connections = new AccountingConnectionService(
        prisma,
        get(TokenEncryptionService),
        registry,
        get(AccountingRefreshLockService),
        get(AdminNotificationsService),
        get(MailService),
        get(ConfigService),
      );
    });

    afterEach(async () => {
      const where = { where: { distributorId: DIST_A } };
      await prisma.customerAccountingMapping.deleteMany(where);
      await prisma.productAccountingMapping.deleteMany(where);
      await prisma.taxTypeAccountingMapping.deleteMany(where);
      await prisma.externalAccountingContact.deleteMany(where);
      await prisma.externalAccountingProduct.deleteMany(where);
      await prisma.externalAccountingTaxType.deleteMany(where);
      await prisma.tradeRelationship.deleteMany(where);
      await prisma.product.deleteMany(where);
      await prisma.taxType.deleteMany(where);
      await prisma.accountingOAuthState.deleteMany(where);
      await prisma.ingestionRun.deleteMany(where);
    });

    afterAll(async () => {
      await prisma.organisation.deleteMany({ where: { id: CUSTOMER } });
    });

    // One full OAuth round trip, landing in whichever company the fake holds.
    async function connect() {
      const { authorizationUrl } = await connections.createAuthorizationUrl(DIST_A, ADMIN_USER, AccountingProvider.XERO);
      const state = new URL(authorizationUrl).searchParams.get('state')!;
      await connections.handleCallback('https://admin.test/callback?code=c', 'c', state);
      return prisma.accountingConnection.findFirstOrThrow({
        where: { distributorId: DIST_A, status: AccountingConnectionStatus.CONNECTED },
      });
    }

    // A contact, a product and a tax rate, each linked to its Stocdup record.
    async function linkOneOfEach(accountingOrganisationId: string) {
      const scope = { distributorId: DIST_A, accountingOrganisationId, provider: AccountingProvider.XERO, lastSyncedAt: new Date(), rawProviderData: {} };
      const relationship = await prisma.tradeRelationship.create({ data: { distributorId: DIST_A, customerId: CUSTOMER } });
      const product = await prisma.product.create({ data: { distributorId: DIST_A, name: 'Reconnect Shiraz', sku: 'RECONNECT-1' } });
      const taxType = await prisma.taxType.create({
        data: { distributorId: DIST_A, name: 'Reconnect GST', classification: TaxClassification.STANDARD, ratePercentage: '15.00', active: true },
      });
      const contact = await prisma.externalAccountingContact.create({ data: { ...scope, externalContactId: 'x-contact', displayName: 'The Blackbird' } });
      const item = await prisma.externalAccountingProduct.create({ data: { ...scope, externalProductId: 'x-item', displayName: 'Shiraz' } });
      const rate = await prisma.externalAccountingTaxType.create({
        data: { ...scope, taxType: 'OUTPUT2', displayName: 'GST on Income', ratePercentage: '15.00' },
      });
      const link = { distributorId: DIST_A, accountingOrganisationId, linkedByUserId: ADMIN_USER };
      await prisma.customerAccountingMapping.create({
        data: { ...link, tradeRelationshipId: relationship.id, externalContactId: contact.id, matchMethod: AccountingContactMatchMethod.MANUAL },
      });
      await prisma.productAccountingMapping.create({
        data: { ...link, productId: product.id, externalProductId: item.id, matchMethod: AccountingProductMatchMethod.MANUAL },
      });
      await prisma.taxTypeAccountingMapping.create({
        data: { ...link, taxTypeId: taxType.id, externalTaxTypeId: rate.id, matchMethod: AccountingTaxTypeMatchMethod.MANUAL },
      });
    }

    async function listStatuses(resource: 'contacts' | 'products' | 'tax-types') {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/accounting/${resource}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      return (res.body.data as Array<{ status: string }>).map((row) => row.status);
    }

    async function disconnect() {
      await request(app.getHttpServer())
        .delete(`/api/v1/distributors/${DIST_A}/accounting/connection`)
        .set('Authorization', `Bearer ${token}`)
        .expect((res) => expect(res.status).toBeLessThan(300));
    }

    it('keeps every link after a disconnect and reconnect to the same organisation', async () => {
      const first = await connect();
      await linkOneOfEach(first.accountingOrganisationId);

      await disconnect();
      const second = await connect();

      expect(second.id).not.toBe(first.id); // a new connection row (ADR-051 history) …
      expect(second.accountingOrganisationId).toBe(first.accountingOrganisationId); // … in the same organisation
      expect(await listStatuses('contacts')).toEqual(['LINKED']);
      expect(await listStatuses('products')).toEqual(['LINKED']);
      expect(await listStatuses('tax-types')).toEqual(['LINKED']);
    });

    it('does not show a reconnected organisation as never synced before the new connection has pulled', async () => {
      const first = await connect();
      await linkOneOfEach(first.accountingOrganisationId);
      const syncedAt = new Date('2026-10-04T09:00:00Z');
      await prisma.ingestionRun.create({
        data: {
          distributorId: DIST_A,
          sourceType: 'accounting',
          sourceRef: first.id,
          resourceType: 'contact',
          status: IngestionRunStatus.COMPLETED,
          trigger: IngestionRunTrigger.MANUAL,
          lastSucceededAt: syncedAt,
        },
      });

      await disconnect();
      await connect();

      const status = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/accounting/sync/status`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(status.body.lastSucceededAt).toBe(syncedAt.toISOString());
      expect(await listStatuses('contacts')).toEqual(['LINKED']);
    });

    it('keeps every link when reconnecting a connection that broke (ERROR)', async () => {
      const first = await connect();
      await linkOneOfEach(first.accountingOrganisationId);
      await prisma.accountingConnection.update({
        where: { id: first.id },
        data: { status: AccountingConnectionStatus.ERROR, lastErrorMessage: 'refresh token expired' },
      });

      await connect();

      expect(await listStatuses('contacts')).toEqual(['LINKED']);
      expect(await listStatuses('products')).toEqual(['LINKED']);
      expect(await listStatuses('tax-types')).toEqual(['LINKED']);
    });

    it('keeps the invoice target status setting across a reconnect', async () => {
      await connect();
      await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/accounting/connection`)
        .set('Authorization', `Bearer ${token}`)
        .send({ invoiceExportTargetStatus: 'AUTHORISED' })
        .expect(200);

      await disconnect();
      await connect();

      const status = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/accounting/connection`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(status.body.invoiceExportTargetStatus).toBe('AUTHORISED');
    });

    it('starts empty when the reconnect lands in a different organisation, and restores the first on switching back', async () => {
      const first = await connect();
      await linkOneOfEach(first.accountingOrganisationId);

      fake.organisations = [{ externalId: 'fake-org-2', name: 'Another Company' }];
      const other = await connect();

      expect(other.accountingOrganisationId).not.toBe(first.accountingOrganisationId);
      expect(await listStatuses('contacts')).toEqual([]);
      expect(await listStatuses('products')).toEqual([]);
      expect(await listStatuses('tax-types')).toEqual([]);

      fake.organisations = [{ externalId: 'fake-org-1', name: 'Fake Books Organisation' }];
      const back = await connect();

      expect(back.accountingOrganisationId).toBe(first.accountingOrganisationId);
      expect(await listStatuses('contacts')).toEqual(['LINKED']);
    });

    it("never hands one distributor's links to another distributor connecting the same company", async () => {
      const first = await connect();
      await linkOneOfEach(first.accountingOrganisationId);

      const other = await createAccountingConnection(prisma, {
        distributorId: DIST_B,
        provider: AccountingProvider.XERO,
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationId: 'fake-org-1', // the same provider company
        scopes: 'openid',
        encryptedCredentialData: 'irrelevant-for-this-test',
        connectedByUserId: ADMIN_USER,
        connectedAt: new Date(),
      });

      expect(other.accountingOrganisationId).not.toBe(first.accountingOrganisationId);
      expect(await prisma.customerAccountingMapping.count({ where: { accountingOrganisationId: other.accountingOrganisationId } })).toBe(0);
    });
  });
});
