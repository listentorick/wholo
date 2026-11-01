/**
 * Integration tests for Stocdup support access (ADR-078). Unit tests with a
 * mocked Prisma only prove the code passes the right arguments; these prove,
 * against a real database and the real JWT pipeline, that:
 *   - a normal user can never select or reach another organisation;
 *   - platform powers and grants work only for an ops session (Ops client +
 *     authenticator-level acr) — never through the admin client;
 *   - a grant gives exactly the SUPPORT role at exactly one distributor, and
 *     stops working when it expires or is revoked.
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
import { AccountingAdapterRegistry } from '../src/accounting/adapters/accounting-adapter.registry';
import { FakeAccountingAdapter } from './support/fake-accounting.adapter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const PLATFORM = 'test-sg-platform';
const DIST_A = 'test-sg-dist-a';
const DIST_B = 'test-sg-dist-b';
const OPERATOR = 'test-sg-operator';
const OWNER_A = 'test-sg-owner-a';
const STAFF_A = 'test-sg-staff-a';
// An operator who also works at a wholesaler (ADR-078).
const DUAL = 'test-sg-dual';
const USERS = [OPERATOR, OWNER_A, STAFF_A, DUAL];
const kc = (id: string) => `kc-${id}`;

describe('Support access grants (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtTestServer;

  const opsToken = () => jwt.signToken({ sub: kc(OPERATOR), azp: 'stocdup-ops', acr: '2' });
  const adminClientToken = (id: string) => jwt.signToken({ sub: kc(id), azp: 'wholo-admin', acr: '1' });

  const api = () => request(app.getHttpServer());

  async function member(userId: string, organisationId: string, role: Role) {
    const m = await prisma.membership.upsert({
      where: { userId_organisationId: { userId, organisationId } },
      create: { userId, organisationId, role },
      update: { role },
    });
    await prisma.membershipRole.upsert({
      where: { membershipId_role: { membershipId: m.id, role } },
      create: { membershipId: m.id, role },
      update: {},
    });
  }

  async function openGrant(distributorId = DIST_A, durationMinutes = 60) {
    const res = await api()
      .post(`/api/v1/distributors/${distributorId}/support-grants`)
      .set('Authorization', `Bearer ${opsToken()}`)
      .send({ userId: OPERATOR, reason: 'Integration test', durationMinutes });
    return res;
  }

  beforeAll(async () => {
    jwt = await startJwtTestServer();
    const fake = new FakeAccountingAdapter();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AccountingAdapterRegistry)
      .useValue({ get: () => fake, displayName: () => fake.displayName })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    for (const [id, name, type] of [
      [PLATFORM, 'SG Stocdup', OrganisationType.PLATFORM],
      [DIST_A, 'SG Distributor A', OrganisationType.DISTRIBUTOR],
      [DIST_B, 'SG Distributor B', OrganisationType.DISTRIBUTOR],
    ] as const) {
      await prisma.organisation.upsert({ where: { id }, create: { id, name, type }, update: {} });
    }
    for (const id of USERS) {
      await prisma.user.upsert({
        where: { id },
        create: { id, email: `${id}@integration.test`, keycloakId: kc(id), firstName: id, lastName: 'Test' },
        update: { keycloakId: kc(id) },
      });
    }
    await member(OPERATOR, PLATFORM, Role.PLATFORM_ADMIN);
    await member(OWNER_A, DIST_A, Role.DISTRIBUTOR_ADMIN);
    await member(STAFF_A, DIST_A, Role.WAREHOUSE_STAFF);
    await member(DUAL, PLATFORM, Role.PLATFORM_ADMIN);
    await member(DUAL, DIST_B, Role.DISTRIBUTOR_ADMIN);
  });

  async function clearAccounting() {
    const where = { where: { distributorId: { in: [DIST_A, DIST_B] } } };
    await prisma.accountingOAuthState.deleteMany(where);
    await prisma.accountingConnection.deleteMany(where);
    await prisma.accountingOrganisation.deleteMany(where);
  }

  beforeEach(async () => {
    await prisma.supportAccessGrant.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.auditLog.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await clearAccounting();
  });

  afterAll(async () => {
    await clearAccounting();
    await prisma.supportAccessGrant.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.auditLog.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { userId: { in: USERS } } } });
    await prisma.membership.deleteMany({ where: { userId: { in: USERS } } });
    await prisma.user.deleteMany({ where: { id: { in: USERS } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [PLATFORM, DIST_A, DIST_B] } } });
    await app.close();
    await jwt.close();
  });

  describe('a normal user', () => {
    it('cannot select another organisation through /auth/me', async () => {
      const res = await api().get(`/api/v1/auth/me?organisationId=${DIST_B}`).set('Authorization', `Bearer ${adminClientToken(OWNER_A)}`);
      expect(res.status).toBe(403);
    });

    it('cannot reach another distributor’s routes', async () => {
      const res = await api().get(`/api/v1/distributors/${DIST_B}/price-lists`).set('Authorization', `Bearer ${adminClientToken(OWNER_A)}`);
      expect(res.status).toBe(403);
    });

    it('cannot open a grant, even with an ops-shaped token', async () => {
      const token = jwt.signToken({ sub: kc(OWNER_A), azp: 'stocdup-ops', acr: '2' });
      const res = await api()
        .post(`/api/v1/distributors/${DIST_B}/support-grants`)
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: OWNER_A, reason: 'nope' });
      expect(res.status).toBe(403);
    });
  });

  describe('a platform admin', () => {
    it.each([
      ['through the admin client', { azp: 'wholo-admin', acr: '2' }],
      ['without the authenticator', { azp: 'stocdup-ops', acr: '1' }],
    ])('gets no platform access %s', async (_label, claims) => {
      const token = jwt.signToken({ sub: kc(OPERATOR), ...claims });
      const stats = await api().get('/api/v1/platform/stats').set('Authorization', `Bearer ${token}`);
      const create = await api()
        .post(`/api/v1/distributors/${DIST_A}/support-grants`)
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: OPERATOR, reason: 'x' });
      expect(stats.status).toBe(403);
      expect(create.status).toBe(403);
    });

    it('sees platform stats and the wholesaler list in an ops session', async () => {
      const stats = await api().get('/api/v1/platform/stats').set('Authorization', `Bearer ${opsToken()}`);
      const list = await api().get('/api/v1/distributors?q=SG%20Distributor').set('Authorization', `Bearer ${opsToken()}`);
      expect(stats.status).toBe(200);
      expect(stats.body.ordersPerDay).toHaveLength(30);
      expect(list.status).toBe(200);
      expect(list.body.map((d: { id: string }) => d.id).sort()).toEqual([DIST_A, DIST_B]);
    });

    it('has no access inside a distributor without a grant', async () => {
      const res = await api().get(`/api/v1/distributors/${DIST_A}/price-lists`).set('Authorization', `Bearer ${opsToken()}`);
      expect(res.status).toBe(403);
    });

    it('cannot open a grant for someone else', async () => {
      const res = await api()
        .post(`/api/v1/distributors/${DIST_A}/support-grants`)
        .set('Authorization', `Bearer ${opsToken()}`)
        .send({ userId: STAFF_A, reason: 'x' });
      expect(res.status).toBe(403);
    });
  });

  describe('with a grant', () => {
    it('gets SUPPORT permissions at that distributor only', async () => {
      expect((await openGrant()).status).toBe(201);
      const auth = { Authorization: `Bearer ${opsToken()}` };

      expect((await api().get(`/api/v1/distributors/${DIST_A}/price-lists`).set(auth)).status).toBe(200);
      expect((await api().get(`/api/v1/distributors/${DIST_A}/members`).set(auth)).status).toBe(403);
      expect((await api().post(`/api/v1/distributors/${DIST_B}/accounting/connections/xero/authorization-url`).set(auth)).status).toBe(403);
      expect((await api().get(`/api/v1/distributors/${DIST_B}/price-lists`).set(auth)).status).toBe(403);

      const me = await api().get(`/api/v1/auth/me?organisationId=${DIST_A}`).set(auth);
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ organisationId: DIST_A, roles: ['SUPPORT'], access: { kind: 'SUPPORT' } });
    });

    it('lets the operator connect from Ops, and records who connected and disconnected', async () => {
      await openGrant();
      const auth = { Authorization: `Bearer ${opsToken()}` };

      const started = await api().post(`/api/v1/distributors/${DIST_A}/accounting/connections/xero/authorization-url`).set(auth);
      expect(started.status).toBe(201);
      const stateRow = await prisma.accountingOAuthState.findFirstOrThrow({ where: { distributorId: DIST_A } });
      expect(stateRow.viaOps).toBe(true);

      const callback = await api()
        .post('/api/v1/accounting/xero/callback')
        .send({ callbackUrl: 'https://ops.test/callback?code=c', code: 'c', state: stateRow.state });
      expect(callback.body).toEqual({ status: 'connected' });

      expect((await api().delete(`/api/v1/distributors/${DIST_A}/accounting/connection`).set(auth)).status).toBe(200);

      const rows = await prisma.auditLog.findMany({ where: { distributorId: DIST_A, entityType: 'ACCOUNTING_CONNECTION' } });
      expect(rows.map((r) => r.action).sort()).toEqual(['ACCOUNTING_CONNECTED', 'ACCOUNTING_DISCONNECTED']);
      expect(rows.every((r) => r.actorUserId === OPERATOR)).toBe(true);
    });

    it('marks a connect from the admin app as not from Ops', async () => {
      const res = await api()
        .post(`/api/v1/distributors/${DIST_A}/accounting/connections/xero/authorization-url`)
        .set('Authorization', `Bearer ${adminClientToken(OWNER_A)}`);
      expect(res.status).toBe(201);
      const stateRow = await prisma.accountingOAuthState.findFirstOrThrow({ where: { distributorId: DIST_A } });
      expect(stateRow.viaOps).toBe(false);
    });

    it('does nothing through the admin client', async () => {
      await openGrant();
      const res = await api().get(`/api/v1/distributors/${DIST_A}/price-lists`).set('Authorization', `Bearer ${adminClientToken(OPERATOR)}`);
      expect(res.status).toBe(403);
    });

    it.each([
      ['expired', { startsAt: new Date(Date.now() - 2 * 3600_000), expiresAt: new Date(Date.now() - 3600_000) }],
      ['revoked', { revokedAt: new Date() }],
      ['not yet started', { startsAt: new Date(Date.now() + 3600_000), expiresAt: new Date(Date.now() + 2 * 3600_000) }],
    ])('stops working once %s', async (_label, patch) => {
      const created = await openGrant();
      await prisma.supportAccessGrant.update({ where: { id: created.body.id }, data: patch });
      const res = await api().get(`/api/v1/distributors/${DIST_A}/price-lists`).set('Authorization', `Bearer ${opsToken()}`);
      expect(res.status).toBe(403);
    });

    it('is extended, not duplicated, when opened again, and clamps the length', async () => {
      await openGrant(DIST_A, 60);
      const again = await openGrant(DIST_A, 24 * 60);
      expect(again.status).toBe(201);
      const minutes = (new Date(again.body.expiresAt).getTime() - Date.now()) / 60_000;
      expect(minutes).toBeLessThanOrEqual(480);
      expect(minutes).toBeGreaterThan(470);
      expect(await prisma.supportAccessGrant.count({ where: { userId: OPERATOR, distributorId: DIST_A } })).toBe(1);
    });

    it('can be ended by the distributor’s Owner, after which the next request is refused', async () => {
      const created = await openGrant();

      const active = await api().get(`/api/v1/distributors/${DIST_A}/support-grants?active=true`).set('Authorization', `Bearer ${adminClientToken(STAFF_A)}`);
      expect(active.body.map((g: { id: string }) => g.id)).toEqual([created.body.id]);

      const revoke = await api()
        .delete(`/api/v1/distributors/${DIST_A}/support-grants/${created.body.id}`)
        .set('Authorization', `Bearer ${adminClientToken(OWNER_A)}`);
      expect(revoke.status).toBe(200);
      expect(revoke.body).toMatchObject({ status: 'ENDED', endedBy: 'DISTRIBUTOR' });

      const after = await api().get(`/api/v1/distributors/${DIST_A}/price-lists`).set('Authorization', `Bearer ${opsToken()}`);
      expect(after.status).toBe(403);
    });

    it('keeps saying the wholesaler ended it after that Owner leaves the team', async () => {
      const created = await openGrant();
      const revoke = await api()
        .delete(`/api/v1/distributors/${DIST_A}/support-grants/${created.body.id}`)
        .set('Authorization', `Bearer ${adminClientToken(OWNER_A)}`);
      expect(revoke.status).toBe(200);

      await prisma.membershipRole.deleteMany({ where: { membership: { userId: OWNER_A, organisationId: DIST_A } } });
      await prisma.membership.deleteMany({ where: { userId: OWNER_A, organisationId: DIST_A } });
      try {
        const mine = await api().get(`/api/v1/users/${OPERATOR}/support-grants`).set('Authorization', `Bearer ${opsToken()}`);
        expect(mine.body.find((g: { id: string }) => g.id === created.body.id)).toMatchObject({ status: 'ENDED', endedBy: 'DISTRIBUTOR' });
      } finally {
        await member(OWNER_A, DIST_A, Role.DISTRIBUTOR_ADMIN);
      }
    });

    it('keeps the reason it was opened with when opened again', async () => {
      const created = await openGrant();
      const again = await api()
        .post(`/api/v1/distributors/${DIST_A}/support-grants`)
        .set('Authorization', `Bearer ${opsToken()}`)
        .send({ userId: OPERATOR, reason: 'A second look', durationMinutes: 60 });
      expect(again.body).toMatchObject({ id: created.body.id, reason: 'Integration test' });
    });

    it('is ended once when the holder and the Owner end it at the same moment', async () => {
      const created = await openGrant();
      const end = (token: string) =>
        api().delete(`/api/v1/distributors/${DIST_A}/support-grants/${created.body.id}`).set('Authorization', `Bearer ${token}`);

      const results = await Promise.all([end(opsToken()), end(adminClientToken(OWNER_A))]);

      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const row = await prisma.supportAccessGrant.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(results.map((r) => r.body.endedBy)).toEqual([row.endedBy, row.endedBy]);
      expect(await prisma.auditLog.count({ where: { entityId: created.body.id, action: 'SUPPORT_ACCESS_ENDED' } })).toBe(1);
    });

    it('cannot be ended by staff without team management', async () => {
      const created = await openGrant();
      const res = await api()
        .delete(`/api/v1/distributors/${DIST_A}/support-grants/${created.body.id}`)
        .set('Authorization', `Bearer ${adminClientToken(STAFF_A)}`);
      expect(res.status).toBe(403);
    });

    it('keeps the history from the support visitor', async () => {
      await openGrant();
      const res = await api().get(`/api/v1/distributors/${DIST_A}/support-grants`).set('Authorization', `Bearer ${opsToken()}`);
      expect(res.status).toBe(403);
    });
  });

  describe('an operator who also works at a wholesaler', () => {
    const dualOps = () => jwt.signToken({ sub: kc(DUAL), azp: 'stocdup-ops', acr: '2' });

    it('is the operator when the Ops app asks for PLATFORM, and the wholesaler when admin asks for DISTRIBUTOR', async () => {
      const ops = await api().get('/api/v1/auth/me?organisationType=PLATFORM').set('Authorization', `Bearer ${dualOps()}`);
      expect(ops.status).toBe(200);
      expect(ops.body).toMatchObject({ organisationId: PLATFORM, organisationType: 'PLATFORM' });

      const admin = await api().get('/api/v1/auth/me?organisationType=DISTRIBUTOR').set('Authorization', `Bearer ${adminClientToken(DUAL)}`);
      expect(admin.status).toBe(200);
      expect(admin.body).toMatchObject({ organisationId: DIST_B, organisationType: 'DISTRIBUTOR' });
    });

    it('keeps platform powers in an ops session and the wholesaler in the admin app', async () => {
      const stats = await api().get('/api/v1/platform/stats').set('Authorization', `Bearer ${dualOps()}`);
      expect(stats.status).toBe(200);

      const own = await api().get(`/api/v1/distributors/${DIST_B}/price-lists`).set('Authorization', `Bearer ${adminClientToken(DUAL)}`);
      expect(own.status).toBe(200);
    });

    it('refuses an unknown organisationType', async () => {
      const res = await api().get('/api/v1/auth/me?organisationType=ADMIN').set('Authorization', `Bearer ${dualOps()}`);
      expect(res.status).toBe(400);
    });
  });

  it('a grant row inserted directly for a normal user gives no platform powers and nothing outside an ops session', async () => {
    // Proves the rules hold independent of the create endpoint's checks.
    await prisma.supportAccessGrant.create({
      data: { userId: STAFF_A, distributorId: DIST_B, role: Role.SUPPORT, reason: 'raw', startsAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 3600_000) },
    });

    const viaAdmin = await api().get(`/api/v1/distributors/${DIST_B}/price-lists`).set('Authorization', `Bearer ${adminClientToken(STAFF_A)}`);
    expect(viaAdmin.status).toBe(403);

    const opsShaped = jwt.signToken({ sub: kc(STAFF_A), azp: 'stocdup-ops', acr: '2' });
    const stats = await api().get('/api/v1/platform/stats').set('Authorization', `Bearer ${opsShaped}`);
    expect(stats.status).toBe(403);
  });
});
