/**
 * Integration tests for PermissionsGuard's core security invariant: effective
 * permissions are the union of roles on the ONE membership in scope for the
 * current request, never unioned across a user's memberships at other
 * organisations. A mocked-Prisma unit test can prove the guard reads the
 * right shape, but only a real DB + real JWT pipeline proves a user who is
 * DISTRIBUTOR_ADMIN at one distributor cannot use that privilege at another
 * distributor where they hold a narrower role.
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

const DIST_A = 'test-permleak-dist-a';
const DIST_B = 'test-permleak-dist-b';
const TEST_USER = 'test-permleak-user';
const TEST_KEYCLOAK_ID = 'kc-test-permleak-user';

describe('PermissionsGuard cross-organisation isolation (integration)', () => {
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
      create: { id: DIST_A, name: 'Perm Leak Test A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Perm Leak Test B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    const user = await prisma.user.upsert({
      where: { id: TEST_USER },
      create: {
        id: TEST_USER,
        email: 'permleak-user@integration.test',
        keycloakId: TEST_KEYCLOAK_ID,
        firstName: 'Integration',
        lastName: 'User',
      },
      update: { keycloakId: TEST_KEYCLOAK_ID },
    });

    // DISTRIBUTOR_ADMIN at DIST_A (holds TAX_TYPES_MANAGE), only
    // WAREHOUSE_STAFF at DIST_B (does not hold TAX_TYPES_MANAGE, but does
    // hold DELIVERY_READ) — the one JWT/user spans both memberships.
    const membershipA = await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: DIST_A } },
      create: { userId: user.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });
    await prisma.membershipRole.upsert({
      where: { membershipId_role: { membershipId: membershipA.id, role: Role.DISTRIBUTOR_ADMIN } },
      create: { membershipId: membershipA.id, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });
    const membershipB = await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: DIST_B } },
      create: { userId: user.id, organisationId: DIST_B, role: Role.WAREHOUSE_STAFF },
      update: {},
    });
    await prisma.membershipRole.upsert({
      where: { membershipId_role: { membershipId: membershipB.id, role: Role.WAREHOUSE_STAFF } },
      create: { membershipId: membershipB.id, role: Role.WAREHOUSE_STAFF },
      update: {},
    });

    token = jwtServer.signToken({ sub: TEST_KEYCLOAK_ID, email: 'permleak-user@integration.test' });
  });

  afterAll(async () => {
    await prisma.membershipRole.deleteMany({ where: { membership: { userId: TEST_USER } } });
    await prisma.membership.deleteMany({ where: { userId: TEST_USER } });
    await prisma.user.deleteMany({ where: { id: TEST_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
    await jwtServer.close();
  });

  it('allows a TAX_TYPES_MANAGE action at the distributor where the user is DISTRIBUTOR_ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/tax-types`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('does NOT leak DISTRIBUTOR_ADMIN permissions from DIST_A onto DIST_B', async () => {
    // Same JWT, same user — but WAREHOUSE_STAFF at DIST_B does not hold
    // TAX_TYPES_MANAGE. This is the core anti-leak proof.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_B}/tax-types`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('still allows a permission the DIST_B membership genuinely holds', async () => {
    // Proves the guard resolves DIST_B's own (narrower) role set correctly,
    // rather than just denying everything at DIST_B.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_B}/delivery-routes`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
