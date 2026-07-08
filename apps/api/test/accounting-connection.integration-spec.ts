/**
 * Integration tests for the accounting connection routes: verifies
 * DistributorAccessGuard enforcement against a real JWKS-validated JWT, and
 * that the partial unique index (one CONNECTED AccountingConnection per
 * distributor) is actually enforced at the database level — something a
 * mocked-Prisma unit test cannot prove.
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
  OrganisationType,
  Prisma,
  Role,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-accounting-dist-a';
const DIST_B = 'test-accounting-dist-b';
const ADMIN_USER = 'test-accounting-admin';
const ADMIN_KEYCLOAK_ID = 'kc-test-accounting-admin';

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
      await prisma.accountingConnection.create({
        data: { ...baseConnection, distributorId: DIST_A, status: AccountingConnectionStatus.CONNECTED },
      });

      await expect(
        prisma.accountingConnection.create({
          data: { ...baseConnection, distributorId: DIST_A, status: AccountingConnectionStatus.CONNECTED },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('allows a DISCONNECTED row to coexist with a CONNECTED row for the same distributor', async () => {
      await prisma.accountingConnection.create({
        data: { ...baseConnection, distributorId: DIST_A, status: AccountingConnectionStatus.CONNECTED },
      });

      await expect(
        prisma.accountingConnection.create({
          data: {
            ...baseConnection,
            distributorId: DIST_A,
            status: AccountingConnectionStatus.DISCONNECTED,
            disconnectedAt: new Date(),
          },
        }),
      ).resolves.toBeDefined();
    });

    it('allows a CONNECTED row per distributor independently', async () => {
      await prisma.accountingConnection.create({
        data: { ...baseConnection, distributorId: DIST_A, status: AccountingConnectionStatus.CONNECTED },
      });

      await expect(
        prisma.accountingConnection.create({
          data: { ...baseConnection, distributorId: DIST_B, status: AccountingConnectionStatus.CONNECTED },
        }),
      ).resolves.toBeDefined();
    });
  });
});
