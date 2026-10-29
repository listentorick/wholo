/**
 * Integration tests for the record-side accounting link lookup
 * (GET distributors/:id/customers/:customerId/accounting and
 * GET distributors/:id/products/:productId/accounting): proves against a
 * real database that the lookup only ever returns the requesting
 * distributor's links, that a customer or product belonging to another
 * distributor is a 404 rather than an empty link, and that the mapping,
 * suggestion and history it returns are the right rows.
 *
 * The connection row says XERO only because AccountingProvider is a database
 * enum with one value today; nothing here depends on which provider it is —
 * the provider name is whatever the adapter registry says.
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
  AccountingProductMatchMethod,
  AccountingProvider,
  OrganisationType,
  Role,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { AccountingAdapterRegistry } from '../src/accounting/adapters/accounting-adapter.registry';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';
import { createAccountingConnection } from './support/accounting-fixtures';

const DIST_A = 'test-acct-link-dist-a';
const DIST_B = 'test-acct-link-dist-b';
const CUSTOMER_A = 'test-acct-link-customer-a';
const CUSTOMER_B = 'test-acct-link-customer-b';
const ADMIN_USER = 'test-acct-link-admin';
const ADMIN_KEYCLOAK_ID = 'kc-test-acct-link-admin';

describe('Accounting record link lookup (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let token: string;
  let providerName: string;
  let connectionA: { accountingOrganisationId: string };
  let connectionB: { accountingOrganisationId: string };
  let relationshipA: { id: string };
  let relationshipB: { id: string };
  let productA: { id: string };
  let productB: { id: string };

  beforeAll(async () => {
    jwtServer = await startJwtTestServer();

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    providerName = app.get(AccountingAdapterRegistry).displayName(AccountingProvider.XERO);

    for (const [id, name, type] of [
      [DIST_A, 'Link Test Distributor A', OrganisationType.DISTRIBUTOR],
      [DIST_B, 'Link Test Distributor B', OrganisationType.DISTRIBUTOR],
      [CUSTOMER_A, 'Link Test Customer A', OrganisationType.TRADE_CUSTOMER],
      [CUSTOMER_B, 'Link Test Customer B', OrganisationType.TRADE_CUSTOMER],
    ] as const) {
      await prisma.organisation.upsert({ where: { id }, create: { id, name, type }, update: {} });
    }
    const user = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER,
        email: 'acct-link-admin@integration.test',
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

    token = jwtServer.signToken({ sub: ADMIN_KEYCLOAK_ID, email: 'acct-link-admin@integration.test' });
  });

  beforeEach(async () => {
    const baseConnection = {
      provider: AccountingProvider.XERO,
      status: AccountingConnectionStatus.CONNECTED,
      externalOrganisationName: 'Acme Wines',
      scopes: 'openid',
      encryptedCredentialData: 'irrelevant-for-this-test',
      connectedByUserId: ADMIN_USER,
      connectedAt: new Date(),
    };
    connectionA = await createAccountingConnection(prisma, { ...baseConnection, distributorId: DIST_A, externalOrganisationId: 'tenant-a' });
    connectionB = await createAccountingConnection(prisma, { ...baseConnection, distributorId: DIST_B, externalOrganisationId: 'tenant-b' });
    relationshipA = await prisma.tradeRelationship.create({ data: { distributorId: DIST_A, customerId: CUSTOMER_A, accountNumber: 'A-1' } });
    relationshipB = await prisma.tradeRelationship.create({ data: { distributorId: DIST_B, customerId: CUSTOMER_B, accountNumber: 'B-1' } });
    productA = await prisma.product.create({ data: { distributorId: DIST_A, name: 'Link Test Product A', sku: 'LT-A' } });
    productB = await prisma.product.create({ data: { distributorId: DIST_B, name: 'Link Test Product B', sku: 'LT-B' } });
  });

  afterEach(async () => {
    const distributorId = { in: [DIST_A, DIST_B] };
    await prisma.accountingContactMatchSuggestion.deleteMany({ where: { distributorId } });
    await prisma.accountingProductMatchSuggestion.deleteMany({ where: { distributorId } });
    await prisma.customerAccountingMapping.deleteMany({ where: { distributorId } });
    await prisma.productAccountingMapping.deleteMany({ where: { distributorId } });
    await prisma.externalAccountingContact.deleteMany({ where: { distributorId } });
    await prisma.externalAccountingProduct.deleteMany({ where: { distributorId } });
    await prisma.externalAccountingTaxType.deleteMany({ where: { distributorId } });
    await prisma.product.deleteMany({ where: { distributorId } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId } });
    await prisma.accountingOrganisation.deleteMany({ where: { distributorId } });
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B, CUSTOMER_A, CUSTOMER_B] } } });
    await app.close();
    await jwtServer.close();
  });

  function contactFor(distributorId: string, accountingOrganisationId: string, externalContactId: string, displayName: string) {
    return prisma.externalAccountingContact.create({
      data: {
        distributorId,
        accountingOrganisationId,
        provider: AccountingProvider.XERO,
        externalContactId,
        displayName,
        email: `${externalContactId}@integration.test`,
        isCustomer: true,
        lastSyncedAt: new Date(),
        rawProviderData: {},
      },
    });
  }

  function itemFor(distributorId: string, accountingOrganisationId: string, externalProductId: string, taxCode: string | null) {
    return prisma.externalAccountingProduct.create({
      data: {
        distributorId,
        accountingOrganisationId,
        provider: AccountingProvider.XERO,
        externalProductId,
        externalProductCode: externalProductId.toUpperCase(),
        displayName: `Item ${externalProductId}`,
        taxCode,
        lastSyncedAt: new Date(),
        rawProviderData: {},
      },
    });
  }

  const get = (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`);

  describe('customer link', () => {
    it("returns the linked contact and the full history, never another distributor's rows", async () => {
      const old = await contactFor(DIST_A, connectionA.accountingOrganisationId, 'c-old', 'Old contact');
      const current = await contactFor(DIST_A, connectionA.accountingOrganisationId, 'c-current', 'Current contact');
      await prisma.customerAccountingMapping.create({
        data: {
          distributorId: DIST_A,
          accountingOrganisationId: connectionA.accountingOrganisationId,
          tradeRelationshipId: relationshipA.id,
          externalContactId: old.id,
          matchMethod: AccountingContactMatchMethod.MANUAL,
          linkedByUserId: ADMIN_USER,
          linkedAt: new Date('2026-09-01T09:00:00Z'),
          unlinkedAt: new Date('2026-10-01T09:00:00Z'),
        },
      });
      await prisma.customerAccountingMapping.create({
        data: {
          distributorId: DIST_A,
          accountingOrganisationId: connectionA.accountingOrganisationId,
          tradeRelationshipId: relationshipA.id,
          externalContactId: current.id,
          matchMethod: AccountingContactMatchMethod.EMAIL_EXACT,
          linkedByUserId: ADMIN_USER,
          linkedAt: new Date('2026-10-12T09:00:00Z'),
        },
      });
      // Distributor B's own link, which must never appear in A's answer.
      const otherContact = await contactFor(DIST_B, connectionB.accountingOrganisationId, 'c-b', 'B contact');
      await prisma.customerAccountingMapping.create({
        data: {
          distributorId: DIST_B,
          accountingOrganisationId: connectionB.accountingOrganisationId,
          tradeRelationshipId: relationshipB.id,
          externalContactId: otherContact.id,
          matchMethod: AccountingContactMatchMethod.MANUAL,
          linkedByUserId: ADMIN_USER,
        },
      });

      const res = await get(`/distributors/${DIST_A}/customers/${CUSTOMER_A}/accounting`);

      expect(res.status).toBe(200);
      expect(res.body.connection.providerName).toBe(providerName);
      expect(res.body.link).toMatchObject({
        matchMethod: 'EMAIL_EXACT',
        linkedBy: { name: 'Integration Admin' },
        external: { id: current.id, displayName: 'Current contact', email: 'c-current@integration.test' },
      });
      expect(res.body.history.map((h: { externalDisplayName: string }) => h.externalDisplayName)).toEqual([
        'Current contact',
        'Old contact',
      ]);
      expect(res.body.suggestion).toBeNull();
    });

    it('returns the open suggestion when the customer is not linked', async () => {
      const contact = await contactFor(DIST_A, connectionA.accountingOrganisationId, 'c-sug', 'Suggested contact');
      await prisma.accountingContactMatchSuggestion.create({
        data: {
          distributorId: DIST_A,
          accountingOrganisationId: connectionA.accountingOrganisationId,
          externalContactId: contact.id,
          suggestedTradeRelationshipId: relationshipA.id,
          confidence: 95,
          matchMethod: AccountingContactMatchMethod.EMAIL_EXACT,
          matchReason: 'Same email address',
        },
      });

      const res = await get(`/distributors/${DIST_A}/customers/${CUSTOMER_A}/accounting`);

      expect(res.status).toBe(200);
      expect(res.body.link).toBeNull();
      expect(res.body.suggestion).toMatchObject({ confidence: 95, external: { id: contact.id } });
    });

    it('does not offer a suggestion whose contact is now linked to another customer', async () => {
      const contact = await contactFor(DIST_A, connectionA.accountingOrganisationId, 'c-taken', 'Taken contact');
      await prisma.accountingContactMatchSuggestion.create({
        data: {
          distributorId: DIST_A,
          accountingOrganisationId: connectionA.accountingOrganisationId,
          externalContactId: contact.id,
          suggestedTradeRelationshipId: relationshipA.id,
          confidence: 95,
          matchMethod: AccountingContactMatchMethod.EMAIL_EXACT,
          matchReason: 'Same email address',
        },
      });
      // Since the suggestion was made, the contact was linked to another of A's customers.
      const otherRelationship = await prisma.tradeRelationship.create({
        data: { distributorId: DIST_A, customerId: CUSTOMER_B, accountNumber: 'A-2' },
      });
      await prisma.customerAccountingMapping.create({
        data: {
          distributorId: DIST_A,
          accountingOrganisationId: connectionA.accountingOrganisationId,
          tradeRelationshipId: otherRelationship.id,
          externalContactId: contact.id,
          matchMethod: AccountingContactMatchMethod.MANUAL,
          linkedByUserId: ADMIN_USER,
        },
      });

      const res = await get(`/distributors/${DIST_A}/customers/${CUSTOMER_A}/accounting`);

      expect(res.status).toBe(200);
      expect(res.body.link).toBeNull();
      expect(res.body.suggestion).toBeNull();
    });

    it("is a 404 for another distributor's customer, even via the caller's own distributor path", async () => {
      const res = await get(`/distributors/${DIST_A}/customers/${CUSTOMER_B}/accounting`);
      expect(res.status).toBe(404);
    });

    it('is a 403 for a distributor the caller does not belong to', async () => {
      const res = await get(`/distributors/${DIST_B}/customers/${CUSTOMER_B}/accounting`);
      expect(res.status).toBe(403);
    });

    it('returns an empty link when the distributor has no accounting connection', async () => {
      await prisma.accountingConnection.deleteMany({ where: { distributorId: DIST_A } });

      const res = await get(`/distributors/${DIST_A}/customers/${CUSTOMER_A}/accounting`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ connection: null, link: null, change: null, suggestion: null, history: [] });
    });
  });

  describe('product link', () => {
    it("returns the linked item with its tax rate's name, scoped to the caller's organisation", async () => {
      await prisma.externalAccountingTaxType.create({
        data: {
          distributorId: DIST_A,
          accountingOrganisationId: connectionA.accountingOrganisationId,
          provider: AccountingProvider.XERO,
          taxType: 'T20',
          displayName: 'Standard 20%',
          ratePercentage: '20',
          lastSyncedAt: new Date(),
          rawProviderData: {},
        },
      });
      // Same tax code in distributor B's organisation with a different name.
      await prisma.externalAccountingTaxType.create({
        data: {
          distributorId: DIST_B,
          accountingOrganisationId: connectionB.accountingOrganisationId,
          provider: AccountingProvider.XERO,
          taxType: 'T20',
          displayName: 'B tax name',
          ratePercentage: '20',
          lastSyncedAt: new Date(),
          rawProviderData: {},
        },
      });
      const linkedItem = await itemFor(DIST_A, connectionA.accountingOrganisationId, 'p-a', 'T20');
      await prisma.productAccountingMapping.create({
        data: {
          distributorId: DIST_A,
          accountingOrganisationId: connectionA.accountingOrganisationId,
          productId: productA.id,
          externalProductId: linkedItem.id,
          matchMethod: AccountingProductMatchMethod.SKU_EXACT,
          linkedByUserId: ADMIN_USER,
        },
      });

      const res = await get(`/distributors/${DIST_A}/products/${productA.id}/accounting`);

      expect(res.status).toBe(200);
      expect(res.body.link.external).toMatchObject({ id: linkedItem.id, code: 'P-A', taxCode: 'T20', taxName: 'Standard 20%' });
    });

    it('does not offer a suggestion whose item is now linked to another product', async () => {
      const item = await itemFor(DIST_A, connectionA.accountingOrganisationId, 'p-taken', null);
      await prisma.accountingProductMatchSuggestion.create({
        data: {
          distributorId: DIST_A,
          accountingOrganisationId: connectionA.accountingOrganisationId,
          externalProductId: item.id,
          suggestedProductId: productA.id,
          confidence: 100,
          matchMethod: AccountingProductMatchMethod.SKU_EXACT,
          matchReason: 'Same SKU',
        },
      });
      const otherProduct = await prisma.product.create({ data: { distributorId: DIST_A, name: 'Other product', sku: 'LT-A2' } });
      await prisma.productAccountingMapping.create({
        data: {
          distributorId: DIST_A,
          accountingOrganisationId: connectionA.accountingOrganisationId,
          productId: otherProduct.id,
          externalProductId: item.id,
          matchMethod: AccountingProductMatchMethod.MANUAL,
          linkedByUserId: ADMIN_USER,
        },
      });

      const res = await get(`/distributors/${DIST_A}/products/${productA.id}/accounting`);

      expect(res.status).toBe(200);
      expect(res.body.suggestion).toBeNull();
    });

    it("is a 404 for another distributor's product", async () => {
      const res = await get(`/distributors/${DIST_A}/products/${productB.id}/accounting`);
      expect(res.status).toBe(404);
    });
  });
});
