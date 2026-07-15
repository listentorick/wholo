/**
 * Integration tests for POST /api/v1/distributors — self-service distributor
 * onboarding. Hits a real database to verify the ownership-creating path:
 * User + Organisation + Membership rows, idempotency, slug uniqueness and
 * tenant isolation, none of which mocked-Prisma unit tests can guarantee.
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

const EMAIL_DOMAIN = 'onboarding.integration.test';
const SUB_A = 'kc-integ-onboard-a';
const SUB_B = 'kc-integ-onboard-b';
const SUB_C = 'kc-integ-onboard-c';
const LEGACY_USER_ID = 'integ-onboard-legacy-user';

const body = {
  name: 'Integ Onboard Acme',
  addressLine1: '1 Barrel Way',
  addressCity: 'Leeds',
  addressPostcode: 'LS1 1AA',
  addressCountry: 'United Kingdom',
};

describe('Distributor onboarding (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;

  const tokenFor = (sub: string, email: string, extra: Record<string, unknown> = {}) =>
    jwtServer.signToken({
      sub,
      email,
      email_verified: true,
      given_name: 'Integ',
      family_name: 'Onboarder',
      ...extra,
    });

  async function cleanup() {
    const users = await prisma.user.findMany({
      where: { email: { endsWith: `@${EMAIL_DOMAIN}` } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.organisation.deleteMany({ where: { slug: { startsWith: 'integ-onboard-' } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  beforeAll(async () => {
    jwtServer = await startJwtTestServer();

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await jwtServer.close();
  });

  it('creates User, DISTRIBUTOR organisation and DISTRIBUTOR_ADMIN membership from a verified token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/distributors')
      .set('Authorization', `Bearer ${tokenFor(SUB_A, `a@${EMAIL_DOMAIN}`)}`)
      .send(body)
      .expect(201);

    expect(res.body).toMatchObject({
      name: body.name,
      slug: 'integ-onboard-acme',
      type: OrganisationType.DISTRIBUTOR,
      addressLine1: body.addressLine1,
    });

    const user = await prisma.user.findUnique({ where: { keycloakId: SUB_A }, include: { memberships: true } });
    expect(user).toMatchObject({ email: `a@${EMAIL_DOMAIN}`, firstName: 'Integ', lastName: 'Onboarder' });
    expect(user!.memberships).toHaveLength(1);
    expect(user!.memberships[0]).toMatchObject({ organisationId: res.body.id, role: Role.DISTRIBUTOR_ADMIN });

    const org = await prisma.organisation.findUnique({ where: { id: res.body.id } });
    expect(org).toMatchObject({ type: OrganisationType.DISTRIBUTOR, slug: 'integ-onboard-acme' });
  });

  it('is idempotent: re-submitting returns the same organisation with no duplicate rows', async () => {
    const token = tokenFor(SUB_A, `a@${EMAIL_DOMAIN}`);
    const first = await request(app.getHttpServer())
      .post('/api/v1/distributors')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/distributors')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, name: 'Different Name Entirely' })
      .expect(201);

    expect(second.body.id).toBe(first.body.id);

    const user = await prisma.user.findUnique({ where: { keycloakId: SUB_A }, include: { memberships: true } });
    expect(user!.memberships).toHaveLength(1);
    expect(await prisma.organisation.count({ where: { slug: { startsWith: 'integ-onboard-acme' } } })).toBe(1);
  });

  it('suffixes the slug for a second distributor with the same name, isolated per identity', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/distributors')
      .set('Authorization', `Bearer ${tokenFor(SUB_B, `b@${EMAIL_DOMAIN}`)}`)
      .send(body)
      .expect(201);

    expect(res.body.slug).toBe('integ-onboard-acme-2');

    const userB = await prisma.user.findUnique({ where: { keycloakId: SUB_B }, include: { memberships: true } });
    expect(userB!.memberships.map((m) => m.organisationId)).toEqual([res.body.id]);
  });

  it('honours a caller-chosen slug and persists phone and email', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/distributors')
      .set('Authorization', `Bearer ${tokenFor('kc-integ-onboard-slug', `slug@${EMAIL_DOMAIN}`)}`)
      .send({ ...body, slug: 'integ-onboard-chosen', phone: '0113 496 0000', email: `shop@${EMAIL_DOMAIN}` })
      .expect(201);

    expect(res.body).toMatchObject({
      slug: 'integ-onboard-chosen',
      phone: '0113 496 0000',
      email: `shop@${EMAIL_DOMAIN}`,
    });
  });

  it('rejects a caller-chosen slug that is taken with 409 and writes no organisation', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/distributors')
      .set('Authorization', `Bearer ${tokenFor('kc-integ-onboard-slug2', `slug2@${EMAIL_DOMAIN}`)}`)
      .send({ ...body, slug: 'integ-onboard-chosen' })
      .expect(409);

    const user = await prisma.user.findUnique({
      where: { keycloakId: 'kc-integ-onboard-slug2' },
      include: { memberships: true },
    });
    // User row may exist (created before the conflict), but no org/membership.
    expect(user?.memberships ?? []).toHaveLength(0);
  });

  it('rejects a malformed slug with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/distributors')
      .set('Authorization', `Bearer ${tokenFor('kc-integ-onboard-slug3', `slug3@${EMAIL_DOMAIN}`)}`)
      .send({ ...body, slug: 'Has Spaces!' })
      .expect(400);
  });

  it('rejects an unverified email with 401 and writes nothing', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/distributors')
      .set('Authorization', `Bearer ${tokenFor(SUB_C, `c@${EMAIL_DOMAIN}`, { email_verified: false })}`)
      .send(body)
      .expect(401);

    expect(await prisma.user.findUnique({ where: { keycloakId: SUB_C } })).toBeNull();
  });

  it('rejects a garbage token with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/distributors')
      .set('Authorization', 'Bearer not-a-jwt')
      .send(body)
      .expect(401);
  });

  it('returns 409 when the email belongs to a legacy user with no keycloakId', async () => {
    await prisma.user.upsert({
      where: { id: LEGACY_USER_ID },
      create: {
        id: LEGACY_USER_ID,
        email: `legacy@${EMAIL_DOMAIN}`,
        firstName: 'Legacy',
        lastName: 'User',
      },
      update: { keycloakId: null },
    });

    await request(app.getHttpServer())
      .post('/api/v1/distributors')
      .set('Authorization', `Bearer ${tokenFor(SUB_C, `legacy@${EMAIL_DOMAIN}`)}`)
      .send(body)
      .expect(409);

    expect(await prisma.user.findUnique({ where: { keycloakId: SUB_C } })).toBeNull();
    const legacy = await prisma.user.findUnique({ where: { id: LEGACY_USER_ID }, include: { memberships: true } });
    expect(legacy!.keycloakId).toBeNull();
    expect(legacy!.memberships).toHaveLength(0);
  });

  it('lets the main JwtStrategy resolve the onboarded user: /auth/me returns role and organisation', async () => {
    const token = tokenFor(SUB_A, `a@${EMAIL_DOMAIN}`);
    const created = await request(app.getHttpServer())
      .post('/api/v1/distributors')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(me.body).toMatchObject({ role: Role.DISTRIBUTOR_ADMIN, organisationId: created.body.id });
  });

  it('rejects missing required fields with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/distributors')
      .set('Authorization', `Bearer ${tokenFor(SUB_C, `c@${EMAIL_DOMAIN}`)}`)
      .send({ name: 'No Address' })
      .expect(400);
  });
});
