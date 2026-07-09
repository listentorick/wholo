/**
 * Integration tests for the accounting product sync routes: proves
 * distributor-boundary isolation on the new tables (a real DB query, not a
 * mocked-Prisma unit test, is the only way to prove a query actually scopes
 * by distributor rather than just trusting the arguments passed to it), the
 * two partial unique constraints on ProductAccountingMapping, that "Sync now"
 * writes an outbox row rather than performing a synchronous side effect, and
 * that import creates a DRAFT product (409 on SKU collision).
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
  AccountingProductMatchMethod,
  AccountingProvider,
  OrganisationType,
  Prisma,
  ProductStatus,
  Role,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-acct-products-dist-a';
const DIST_B = 'test-acct-products-dist-b';
const ADMIN_USER = 'test-acct-products-admin';
const ADMIN_KEYCLOAK_ID = 'kc-test-acct-products-admin';

describe('Accounting product sync routes (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let token: string;
  let connectionA: { id: string };
  let connectionB: { id: string };
  let productA: { id: string };

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
      create: { id: DIST_A, name: 'Products Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Products Test Distributor B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    const user = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER,
        email: 'acct-products-admin@integration.test',
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

    token = jwtServer.signToken({ sub: ADMIN_KEYCLOAK_ID, email: 'acct-products-admin@integration.test' });
  });

  beforeEach(async () => {
    const baseConnection = {
      provider: AccountingProvider.XERO,
      status: AccountingConnectionStatus.CONNECTED,
      externalOrganisationName: 'Acme Wines',
      scopes: 'openid accounting.settings',
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
    productA = await prisma.product.create({
      data: { distributorId: DIST_A, name: 'Existing Cab Sauv', sku: 'CAB-SAUV-001' },
    });
  });

  afterEach(async () => {
    await prisma.accountingProductMatchSuggestion.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.productAccountingMapping.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.externalAccountingProduct.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'AccountingConnection' } });
    await prisma.productSearchDocument.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
    await jwtServer.close();
  });

  async function createExternalProduct(
    connectionId: string,
    distributorId: string,
    externalProductId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return prisma.externalAccountingProduct.create({
      data: {
        distributorId,
        accountingConnectionId: connectionId,
        provider: AccountingProvider.XERO,
        externalProductId,
        externalProductCode: `CODE-${externalProductId}`,
        displayName: `Product ${externalProductId}`,
        salesUnitPrice: new Prisma.Decimal('12.3456'),
        lastSyncedAt: new Date(),
        rawProviderData: {},
        ...overrides,
      },
    });
  }

  describe('distributor-scoped list endpoint', () => {
    it('only returns products belonging to the requesting distributor, even when another distributor has its own', async () => {
      const externalA = await createExternalProduct(connectionA.id, DIST_A, 'xero-a-1');
      await createExternalProduct(connectionB.id, DIST_B, 'xero-b-1');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/accounting/products`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([externalA.id]);
    });

    it('rejects the list route for a distributor the admin does not belong to', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_B}/accounting/products`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /products/sync', () => {
    it('writes an outbox event rather than performing a synchronous sync', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/accounting/products/sync`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ queued: true });

      const events = await prisma.outboxEvent.findMany({
        where: { aggregateType: 'AccountingConnection', aggregateId: connectionA.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('AccountingProductSyncRequested');
      expect(events[0].status).toBe('PENDING');
    });
  });

  describe('import as new product', () => {
    it('creates a DRAFT product seeded from the cache row (price rounded to 2 dp) plus a MANUAL mapping', async () => {
      const external = await createExternalProduct(connectionA.id, DIST_A, 'xero-a-import', {
        externalProductCode: 'NEW-PROD-001',
        displayName: 'Newly Imported Product',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/accounting/products/${external.id}/import`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(201);

      const mapping = await prisma.productAccountingMapping.findFirst({
        where: { externalProductId: external.id },
      });
      expect(mapping).not.toBeNull();
      expect(mapping?.matchMethod).toBe(AccountingProductMatchMethod.MANUAL);

      const product = await prisma.product.findUnique({ where: { id: mapping!.productId } });
      expect(product?.status).toBe(ProductStatus.DRAFT);
      expect(product?.name).toBe('Newly Imported Product');
      expect(product?.sku).toBe('NEW-PROD-001');
      expect(product?.price?.toFixed(2)).toBe('12.35');
    });

    it('409s when the item code collides with an existing product SKU', async () => {
      const external = await createExternalProduct(connectionA.id, DIST_A, 'xero-a-collide', {
        externalProductCode: 'CAB-SAUV-001', // same as productA's sku
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/accounting/products/${external.id}/import`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.detail).toMatch(/already exists/);

      const mapping = await prisma.productAccountingMapping.findFirst({
        where: { externalProductId: external.id },
      });
      expect(mapping).toBeNull();
    });
  });

  describe('ProductAccountingMapping partial unique constraints', () => {
    it('rejects a second active mapping for the same product on the same connection', async () => {
      const external1 = await createExternalProduct(connectionA.id, DIST_A, 'xero-a-2');
      const external2 = await createExternalProduct(connectionA.id, DIST_A, 'xero-a-3');

      await prisma.productAccountingMapping.create({
        data: {
          distributorId: DIST_A,
          accountingConnectionId: connectionA.id,
          productId: productA.id,
          externalProductId: external1.id,
          matchMethod: AccountingProductMatchMethod.MANUAL,
          linkedByUserId: ADMIN_USER,
        },
      });

      await expect(
        prisma.productAccountingMapping.create({
          data: {
            distributorId: DIST_A,
            accountingConnectionId: connectionA.id,
            productId: productA.id,
            externalProductId: external2.id,
            matchMethod: AccountingProductMatchMethod.MANUAL,
            linkedByUserId: ADMIN_USER,
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('rejects a second active mapping for the same external product on the same connection', async () => {
      const external = await createExternalProduct(connectionA.id, DIST_A, 'xero-a-4');
      const product2 = await prisma.product.create({
        data: { distributorId: DIST_A, name: 'Second Product', sku: 'SECOND-001' },
      });

      await prisma.productAccountingMapping.create({
        data: {
          distributorId: DIST_A,
          accountingConnectionId: connectionA.id,
          productId: productA.id,
          externalProductId: external.id,
          matchMethod: AccountingProductMatchMethod.MANUAL,
          linkedByUserId: ADMIN_USER,
        },
      });

      await expect(
        prisma.productAccountingMapping.create({
          data: {
            distributorId: DIST_A,
            accountingConnectionId: connectionA.id,
            productId: product2.id,
            externalProductId: external.id,
            matchMethod: AccountingProductMatchMethod.MANUAL,
            linkedByUserId: ADMIN_USER,
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('allows relinking the same pair after the original mapping has been unlinked', async () => {
      const external = await createExternalProduct(connectionA.id, DIST_A, 'xero-a-5');

      const first = await prisma.productAccountingMapping.create({
        data: {
          distributorId: DIST_A,
          accountingConnectionId: connectionA.id,
          productId: productA.id,
          externalProductId: external.id,
          matchMethod: AccountingProductMatchMethod.MANUAL,
          linkedByUserId: ADMIN_USER,
        },
      });
      await prisma.productAccountingMapping.update({
        where: { id: first.id },
        data: { unlinkedAt: new Date() },
      });

      await expect(
        prisma.productAccountingMapping.create({
          data: {
            distributorId: DIST_A,
            accountingConnectionId: connectionA.id,
            productId: productA.id,
            externalProductId: external.id,
            matchMethod: AccountingProductMatchMethod.MANUAL,
            linkedByUserId: ADMIN_USER,
          },
        }),
      ).resolves.toBeDefined();
    });
  });
});
