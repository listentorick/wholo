/**
 * The Operations manager's boundary, proven against a real database and the real
 * JWT + guard pipeline. The role runs the business day to day, may work with tax
 * types, and may bring accounting data in (sync, import, match, retry exports) —
 * but may not change company settings, manage the team, or CHANGE THE
 * INTEGRATION CONNECTION (connect / edit settings / disconnect). Each check is
 * paired with the role that must still be refused, so a guard that silently
 * opened up (or a role that silently lost access) fails here.
 *
 * "Not 403" is the assertion for allowed routes: the request has passed the
 * permission guard, and whatever the handler then says (400 for an empty body,
 * 404 for an unknown id) is the handler's business, not access control.
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

const DIST = 'test-opsperm-dist';
type Fixture = { id: string; kc: string; email: string; role: Role };
const OWNER: Fixture = { id: 'test-opsperm-owner', kc: 'kc-test-opsperm-owner', email: 'owner@opsperm.integration.test', role: Role.DISTRIBUTOR_ADMIN };
const OPS: Fixture = { id: 'test-opsperm-ops', kc: 'kc-test-opsperm-ops', email: 'ops@opsperm.integration.test', role: Role.OPERATIONS_MANAGER };
const WAREHOUSE: Fixture = { id: 'test-opsperm-wh', kc: 'kc-test-opsperm-wh', email: 'wh@opsperm.integration.test', role: Role.WAREHOUSE_STAFF };
const USERS = [OWNER, OPS, WAREHOUSE];

describe('Operations manager permission boundary (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  const tokens: Record<string, string> = {};

  const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, as: Fixture) =>
    request(app.getHttpServer())[method](`/api/v1/distributors/${DIST}${path}`).set('Authorization', `Bearer ${tokens[as.id]}`);

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
      where: { id: DIST },
      create: { id: DIST, name: 'Ops Perm Test', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    for (const u of USERS) {
      const user = await prisma.user.upsert({
        where: { id: u.id },
        create: { id: u.id, email: u.email, keycloakId: u.kc, firstName: 'Test', lastName: u.role },
        update: { keycloakId: u.kc, deletedAt: null },
      });
      const membership = await prisma.membership.upsert({
        where: { userId_organisationId: { userId: user.id, organisationId: DIST } },
        create: { userId: user.id, organisationId: DIST, role: u.role },
        update: { role: u.role },
      });
      await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
      await prisma.membershipRole.create({ data: { membershipId: membership.id, role: u.role } });
      tokens[u.id] = jwtServer.signToken({ sub: u.kc, email: u.email });
    }
  });

  afterAll(async () => {
    await prisma.membershipRole.deleteMany({ where: { membership: { userId: { in: USERS.map((u) => u.id) } } } });
    await prisma.membership.deleteMany({ where: { userId: { in: USERS.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: USERS.map((u) => u.id) } } });
    // Owner's GET /settings lazily creates a settings row for the distributor.
    await prisma.distributorSettings.deleteMany({ where: { distributorId: DIST } });
    await prisma.taxType.deleteMany({ where: { distributorId: DIST } });
    await prisma.organisation.deleteMany({ where: { id: DIST } });
    await app.close();
    await jwtServer.close();
  });

  describe('tax types', () => {
    it('lets an Operations manager view and work with tax types (the product form reads them)', async () => {
      expect((await call('get', '/tax-types', OPS)).status).toBe(200);
      expect((await call('post', '/tax-types', OPS).send({})).status).not.toBe(403); // 400: empty body, i.e. past the guard
      expect((await call('patch', '/tax-types/nope', OPS).send({})).status).not.toBe(403);
      expect((await call('delete', '/tax-types/nope', OPS)).status).not.toBe(403);
    });

    it('still keeps tax types away from roles that hold neither read nor manage', async () => {
      expect((await call('get', '/tax-types', WAREHOUSE)).status).toBe(403);
      expect((await call('post', '/tax-types', WAREHOUSE).send({})).status).toBe(403);
      expect((await call('delete', '/tax-types/nope', WAREHOUSE)).status).toBe(403);
    });
  });

  describe('accounting integration', () => {
    it('lets an Operations manager see the connection and bring data in', async () => {
      expect((await call('get', '/accounting/connection', OPS)).status).not.toBe(403); // 204 when nothing is connected yet
      expect((await call('get', '/accounting/sync/status', OPS)).status).not.toBe(403);
      expect((await call('post', '/accounting/sync', OPS)).status).not.toBe(403);
      expect((await call('post', '/accounting/contacts/x/ignore', OPS)).status).not.toBe(403);
      expect((await call('post', '/accounting/contacts/x/import', OPS).send({})).status).not.toBe(403);
      expect((await call('post', '/accounting/invoice-exports/x/retry', OPS)).status).not.toBe(403);
    });

    it('does NOT let an Operations manager connect, reconfigure or disconnect the integration', async () => {
      expect((await call('post', '/accounting/connections/xero/authorization-url', OPS)).status).toBe(403);
      expect((await call('patch', '/accounting/connection', OPS).send({})).status).toBe(403);
      expect((await call('delete', '/accounting/connection', OPS)).status).toBe(403);
    });

    it('lets the Owner reach the connection-level routes', async () => {
      expect((await call('post', '/accounting/connections/xero/authorization-url', OWNER)).status).not.toBe(403);
      expect((await call('patch', '/accounting/connection', OWNER).send({})).status).not.toBe(403);
    });

    it('keeps the accounting integration away from roles with no accounting permission at all', async () => {
      expect((await call('get', '/accounting/connection', WAREHOUSE)).status).toBe(403);
      expect((await call('post', '/accounting/sync', WAREHOUSE)).status).toBe(403);
    });
  });

  describe('company settings and the team', () => {
    it('does not let an Operations manager see or change company settings', async () => {
      expect((await call('get', '/settings', OPS)).status).toBe(403);
      expect((await call('patch', '/settings', OPS).send({})).status).toBe(403);
      expect((await call('get', '/settings', OWNER)).status).not.toBe(403);
    });

    it('does not let an Operations manager manage the team', async () => {
      expect((await call('get', '/members', OPS)).status).toBe(403);
      expect((await call('post', '/staff-invitations', OPS).send({ email: 'x@opsperm.integration.test', roles: [Role.WAREHOUSE_STAFF] })).status).toBe(403);
    });
  });

  describe('customers', () => {
    it('lets an Operations manager create and invite customers, and refuses a read-only role', async () => {
      expect((await call('post', '/customers', OPS).send({})).status).not.toBe(403);
      expect((await call('post', '/customers/nope/invite', OPS).send({})).status).not.toBe(403);
      expect((await call('post', '/customers', WAREHOUSE).send({})).status).toBe(403);
    });
  });
});
