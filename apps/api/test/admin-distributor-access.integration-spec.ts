/**
 * Integration tests for the DistributorAccessGuard (S1 fix): verifies that a
 * real, JWKS-validated JWT for one distributor's admin cannot reach another
 * distributor's admin routes, against a real database and real JWT
 * validation pipeline — something unit tests with mocked Prisma/guards
 * cannot guarantee.
 *
 * Exercised via GET /admin/distributors/:distributorId/settings as the
 * representative route; the guard itself is shared by all 11 admin
 * controllers, not per-controller logic.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrganisationType, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-distaccess-dist-a';
const DIST_B = 'test-distaccess-dist-b';
const ADMIN_USER = 'test-distaccess-admin';
const ADMIN_KEYCLOAK_ID = 'kc-test-distaccess-admin';

describe('DistributorAccessGuard (integration)', () => {
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
      create: { id: DIST_A, name: 'Distributor Access Test A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Distributor Access Test B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    const user = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER,
        email: 'distaccess-admin@integration.test',
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

    token = jwtServer.signToken({ sub: ADMIN_KEYCLOAK_ID, email: 'distaccess-admin@integration.test' });
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.distributorSettings.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
    await jwtServer.close();
  });

  it('allows access to the distributor the admin belongs to', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/distributors/${DIST_A}/settings`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Distributor Access Test A');
  });

  it('rejects access to a distributor the admin does not belong to', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/distributors/${DIST_B}/settings`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('rejects requests with no Authorization header at all', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/admin/distributors/${DIST_A}/settings`);

    expect(res.status).toBe(401);
  });
});
