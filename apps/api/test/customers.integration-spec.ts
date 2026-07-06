/**
 * Integration tests for GET /api/v1/distributors/:distributorId/customers/:customerId
 *
 * These tests hit a real database to verify tenancy isolation and field-level
 * visibility on the customer-in-context record — something unit tests with
 * mocked Prisma cannot guarantee.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrganisationType, TradeRelationshipStatus, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_X      = 'integ-customers-dist-x';
const DIST_X_SLUG = 'integ-customers-dist-x-slug';
const DIST_Y      = 'integ-customers-dist-y';
const DIST_Y_SLUG = 'integ-customers-dist-y-slug';
const CUSTOMER_A  = 'integ-customers-customer-a';
const CUSTOMER_B  = 'integ-customers-customer-b';
const USER_A      = 'integ-customers-user-a';
const USER_A_KEYCLOAK_ID = 'kc-integ-customers-user-a';

describe('Customers (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let token: string;

  beforeAll(async () => {
    jwtServer = await startJwtTestServer();

    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.organisation.upsert({
      where: { id: DIST_X },
      create: { id: DIST_X, name: 'Integration Customers Distributor X', type: OrganisationType.DISTRIBUTOR, slug: DIST_X_SLUG },
      update: { slug: DIST_X_SLUG },
    });
    await prisma.organisation.upsert({
      where: { id: DIST_Y },
      create: { id: DIST_Y, name: 'Integration Customers Distributor Y', type: OrganisationType.DISTRIBUTOR, slug: DIST_Y_SLUG },
      update: { slug: DIST_Y_SLUG },
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER_A },
      create: { id: CUSTOMER_A, name: 'Integration Customer A', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER_B },
      create: { id: CUSTOMER_B, name: 'Integration Customer B', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    const userA = await prisma.user.upsert({
      where: { id: USER_A },
      create: {
        id: USER_A,
        email: 'customers-user-a@integration.test',
        keycloakId: USER_A_KEYCLOAK_ID,
        firstName: 'Customer',
        lastName: 'A',
      },
      update: { keycloakId: USER_A_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: userA.id, organisationId: CUSTOMER_A } },
      create: { userId: userA.id, organisationId: CUSTOMER_A, role: Role.TRADE_CUSTOMER },
      update: {},
    });

    token = jwtServer.signToken({ sub: USER_A_KEYCLOAK_ID, email: 'customers-user-a@integration.test' });
  });

  afterAll(async () => {
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_X, DIST_Y] } } });
    await prisma.membership.deleteMany({ where: { userId: USER_A } });
    await prisma.user.deleteMany({ where: { id: USER_A } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_X, DIST_Y, CUSTOMER_A, CUSTOMER_B] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(async () => {
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_X, DIST_Y] } } });

    // Both A and B have relationships with X, each with internal working data
    // that must never reach the customer principal.
    await prisma.tradeRelationship.create({
      data: {
        distributorId: DIST_X,
        customerId: CUSTOMER_A,
        status: TradeRelationshipStatus.ACTIVE,
        accountNumber: 'ACC-A',
        paymentTerms: 'NET 30',
        notes: 'internal note about A',
        creditLimit: 5000,
        deliveryLine1: '1 Wine Lane',
        deliveryCity: 'Melbourne',
        deliveryState: 'VIC',
        deliveryPostcode: '3000',
        deliveryCountry: 'Australia',
      },
    });
    await prisma.tradeRelationship.create({
      data: {
        distributorId: DIST_X,
        customerId: CUSTOMER_B,
        status: TradeRelationshipStatus.ACTIVE,
        deliveryLine1: '99 Secret St',
        deliveryCity: 'Sydney',
      },
    });
  });

  describe('GET /api/v1/distributors/:distributorId/customers/:customerId', () => {
    it('returns the customer\'s own record with trade information', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_X}/customers/${CUSTOMER_A}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.organisationId).toBe(CUSTOMER_A);
      expect(res.body.distributorId).toBe(DIST_X);
      expect(res.body.accountNumber).toBe('ACC-A');
      expect(res.body.paymentTerms).toBe('NET 30');
      expect(res.body.deliveryLine1).toBe('1 Wine Lane');
      expect(res.body.deliveryCity).toBe('Melbourne');
      expect(res.body.organisation.name).toBe('Integration Customer A');
    });

    it('never exposes the distributor working data to the customer principal', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_X}/customers/${CUSTOMER_A}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('notes');
      expect(res.body).not.toHaveProperty('creditLimit');
      expect(res.body).not.toHaveProperty('priceListId');
      expect(res.body).not.toHaveProperty('catalogues');
      expect(res.body).not.toHaveProperty('invitations');
    });

    it('returns 403 when requesting another customer\'s record', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_X}/customers/${CUSTOMER_B}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain('99 Secret St');
    });

    it('returns 404 when the customer has no relationship with the distributor', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_Y}/customers/${CUSTOMER_A}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 for an unknown distributor id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/does-not-exist/customers/${CUSTOMER_A}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 for a soft-deleted relationship', async () => {
      await prisma.tradeRelationship.updateMany({
        where: { distributorId: DIST_X, customerId: CUSTOMER_A },
        data: { deletedAt: new Date() },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_X}/customers/${CUSTOMER_A}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 without an Authorization header', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_X}/customers/${CUSTOMER_A}`);

      expect(res.status).toBe(401);
    });
  });
});
