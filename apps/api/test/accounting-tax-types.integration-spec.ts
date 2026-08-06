/**
 * Integration tests for accounting tax type sync — proves the full pipeline
 * (fetch → cache upsert → matcher → suggestion) writes real rows against a
 * real database, that confirming a suggestion creates a real
 * TaxTypeAccountingMapping, and — the core Phase 3 guarantee — that a rate
 * change on an already-linked tax rate is detected, flags the cache row, and
 * raises a real AdminNotification row WITHOUT ever mutating the Stocdup
 * TaxType's own rate. Acknowledging the change clears the highlight.
 *
 * The Xero HTTP call itself is faked by overriding AccountingConnectionService
 * and AccountingAdapterRegistry in the Nest testing module — everything
 * downstream (Prisma writes, the real matcher, the real change-detection
 * service, the real AdminNotificationsService) runs for real against Postgres.
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
  AccountingProvider,
  AccountingTaxTypeMatchMethod,
  OrganisationType,
  Role,
  TaxClassification,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { AccountingConnectionService } from '../src/accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../src/accounting/adapters/accounting-adapter.registry';
import { AccountingChangeDetectionService } from '../src/accounting/accounting-change-detection.service';
import { AccountingTaxTypeMatcherService } from '../src/accounting/matching/accounting-tax-type-matcher.service';
import { AccountingExternalTaxRate } from '../src/accounting/adapters/accounting-connection-adapter.interface';
import { AccountingTaxTypeSyncProcessor } from '../src/accounting-tax-type-sync/accounting-tax-type-sync.processor';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST = 'test-acct-tax-types-dist';
const ADMIN_USER = 'test-acct-tax-types-admin';
const ADMIN_KEYCLOAK_ID = 'kc-test-acct-tax-types-admin';

describe('Accounting tax type sync (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let token: string;
  let processor: AccountingTaxTypeSyncProcessor;
  let listTaxRates: jest.Mock;
  let connection: { id: string };

  beforeAll(async () => {
    jwtServer = await startJwtTestServer();

    listTaxRates = jest.fn();

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    // AccountingTaxTypeSyncProcessor lives in the worker-only module (needs a
    // BullMQ queue registration AppModule doesn't set up), so it's
    // constructed directly here rather than resolved via app.get — same
    // approach as the processor's own unit test, except the change-detection
    // service and matcher come from the real app (real Prisma, real
    // AdminNotificationsService) so their DB side effects are genuinely
    // exercised. Only the Xero-facing token/adapter calls are faked.
    processor = new AccountingTaxTypeSyncProcessor(
      prisma,
      {
        getValidTokenSet: jest.fn().mockResolvedValue({
          accessToken: 'a',
          refreshToken: 'r',
          expiresAt: new Date().toISOString(),
          scope: 'openid accounting.settings',
        }),
      } as unknown as AccountingConnectionService,
      { get: () => ({ listTaxRates }) } as unknown as AccountingAdapterRegistry,
      app.get(AccountingChangeDetectionService),
      app.get(AccountingTaxTypeMatcherService),
    );

    await prisma.organisation.upsert({
      where: { id: DIST },
      create: { id: DIST, name: 'Tax Types Test Distributor', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    const user = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER,
        email: 'acct-tax-types-admin@integration.test',
        keycloakId: ADMIN_KEYCLOAK_ID,
        firstName: 'Integration',
        lastName: 'Admin',
      },
      update: { keycloakId: ADMIN_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: DIST } },
      create: { userId: user.id, organisationId: DIST, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });

    token = jwtServer.signToken({ sub: ADMIN_KEYCLOAK_ID, email: 'acct-tax-types-admin@integration.test' });
  });

  beforeEach(async () => {
    listTaxRates.mockReset();
    connection = await prisma.accountingConnection.create({
      data: {
        provider: AccountingProvider.XERO,
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationName: 'Acme Wines',
        externalOrganisationId: 'tenant-1',
        scopes: 'openid accounting.settings',
        encryptedCredentialData: 'irrelevant-for-this-test',
        connectedByUserId: ADMIN_USER,
        connectedAt: new Date(),
        distributorId: DIST,
      },
    });
  });

  afterEach(async () => {
    await prisma.adminNotification.deleteMany({ where: { organisationId: DIST } });
    await prisma.accountingTaxTypeMatchSuggestion.deleteMany({ where: { distributorId: DIST } });
    await prisma.taxTypeAccountingMapping.deleteMany({ where: { distributorId: DIST } });
    await prisma.externalAccountingTaxType.deleteMany({ where: { distributorId: DIST } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'AccountingConnection' } });
    await prisma.taxType.deleteMany({ where: { distributorId: DIST } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: DIST } });
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: DIST } });
    await app.close();
    await jwtServer.close();
  });

  function taxRate(overrides: Partial<AccountingExternalTaxRate> = {}): AccountingExternalTaxRate {
    return {
      taxType: 'OUTPUT2',
      displayName: 'Standard rate',
      ratePercentage: '20.0000',
      isActive: true,
      raw: {},
      ...overrides,
    };
  }

  function runSync() {
    return processor.process({
      name: 'AccountingTaxTypeSyncRequested',
      data: { eventId: 'evt-1', aggregateType: 'AccountingConnection', aggregateId: connection.id, payload: {} },
    } as any);
  }

  it('caches a fetched tax rate and creates a suggestion when a same-named Wholo tax type exists', async () => {
    await prisma.taxType.create({
      data: { distributorId: DIST, name: 'Standard rate', classification: TaxClassification.STANDARD, ratePercentage: '20.00', active: true },
    });
    listTaxRates.mockResolvedValue([taxRate()]);

    await runSync();

    const cached = await prisma.externalAccountingTaxType.findFirst({
      where: { accountingConnectionId: connection.id, taxType: 'OUTPUT2' },
    });
    expect(cached).not.toBeNull();
    expect(cached?.displayName).toBe('Standard rate');
    expect(cached?.ratePercentage.toFixed(4)).toBe('20.0000');

    const suggestion = await prisma.accountingTaxTypeMatchSuggestion.findFirst({
      where: { externalTaxTypeId: cached!.id },
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion?.matchMethod).toBe(AccountingTaxTypeMatchMethod.NAME_EXACT);
  });

  it('lets an admin confirm a suggestion via the HTTP route, creating a real mapping', async () => {
    const taxType = await prisma.taxType.create({
      data: { distributorId: DIST, name: 'Standard rate', classification: TaxClassification.STANDARD, ratePercentage: '20.00', active: true },
    });
    listTaxRates.mockResolvedValue([taxRate()]);
    await runSync();

    const cached = await prisma.externalAccountingTaxType.findFirst({
      where: { accountingConnectionId: connection.id, taxType: 'OUTPUT2' },
    });
    const suggestion = await prisma.accountingTaxTypeMatchSuggestion.findFirst({
      where: { externalTaxTypeId: cached!.id },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/distributors/${DIST}/accounting/tax-types/suggestions/${suggestion!.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);

    const mapping = await prisma.taxTypeAccountingMapping.findFirst({
      where: { externalTaxTypeId: cached!.id, unlinkedAt: null },
    });
    expect(mapping).not.toBeNull();
    expect(mapping?.taxTypeId).toBe(taxType.id);
  });

  it('flags a rate change on a linked tax rate without ever mutating the Stocdup TaxType, and notifies distributor admins', async () => {
    const taxType = await prisma.taxType.create({
      data: { distributorId: DIST, name: 'Standard rate', classification: TaxClassification.STANDARD, ratePercentage: '20.00', active: true },
    });
    listTaxRates.mockResolvedValue([taxRate()]);
    await runSync();

    const cachedBefore = await prisma.externalAccountingTaxType.findFirst({
      where: { accountingConnectionId: connection.id, taxType: 'OUTPUT2' },
    });
    await prisma.taxTypeAccountingMapping.create({
      data: {
        distributorId: DIST,
        accountingConnectionId: connection.id,
        taxTypeId: taxType.id,
        externalTaxTypeId: cachedBefore!.id,
        matchMethod: AccountingTaxTypeMatchMethod.MANUAL,
        linkedByUserId: ADMIN_USER,
      },
    });

    // Xero's rate changed since the mapping was made.
    listTaxRates.mockResolvedValue([taxRate({ ratePercentage: '22.5000' })]);
    await runSync();

    const cachedAfter = await prisma.externalAccountingTaxType.findFirst({
      where: { id: cachedBefore!.id },
    });
    expect(cachedAfter?.ratePercentage.toFixed(4)).toBe('22.5000');
    expect(cachedAfter?.changeDetectedAt).not.toBeNull();
    expect(cachedAfter?.changeAcknowledgedAt).toBeNull();

    // The core guarantee: the Stocdup TaxType's own rate is never auto-applied.
    const taxTypeAfter = await prisma.taxType.findUnique({ where: { id: taxType.id } });
    expect(taxTypeAfter?.ratePercentage.toFixed(2)).toBe('20.00');

    const notifications = await prisma.adminNotification.findMany({
      where: { organisationId: DIST, userId: ADMIN_USER, type: 'ACCOUNTING_TAX_TYPE_CHANGED' },
    });
    expect(notifications).toHaveLength(1);
  });

  it('acknowledging a change clears the highlight without touching the rate', async () => {
    const taxType = await prisma.taxType.create({
      data: { distributorId: DIST, name: 'Standard rate', classification: TaxClassification.STANDARD, ratePercentage: '20.00', active: true },
    });
    listTaxRates.mockResolvedValue([taxRate()]);
    await runSync();
    const cached = await prisma.externalAccountingTaxType.findFirst({
      where: { accountingConnectionId: connection.id, taxType: 'OUTPUT2' },
    });
    await prisma.taxTypeAccountingMapping.create({
      data: {
        distributorId: DIST,
        accountingConnectionId: connection.id,
        taxTypeId: taxType.id,
        externalTaxTypeId: cached!.id,
        matchMethod: AccountingTaxTypeMatchMethod.MANUAL,
        linkedByUserId: ADMIN_USER,
      },
    });

    listTaxRates.mockResolvedValue([taxRate({ ratePercentage: '22.5000' })]);
    await runSync();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/distributors/${DIST}/accounting/tax-types/${cached!.id}/acknowledge-change`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);

    const after = await prisma.externalAccountingTaxType.findUnique({ where: { id: cached!.id } });
    expect(after?.changeAcknowledgedAt).not.toBeNull();
    expect(after?.ratePercentage.toFixed(4)).toBe('22.5000');
  });

  it('rejects the tax-types route for a distributor the admin does not belong to', async () => {
    const otherDist = 'test-acct-tax-types-dist-other';
    await prisma.organisation.upsert({
      where: { id: otherDist },
      create: { id: otherDist, name: 'Other Distributor', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${otherDist}/accounting/tax-types`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);

    await prisma.organisation.deleteMany({ where: { id: otherDist } });
  });
});
