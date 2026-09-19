/**
 * Integration tests for distributor staff invitations and team-member role
 * management. Unit tests with mocked Prisma can only show the code passes the
 * right arguments; these prove — against a real database and the real JWT +
 * guard pipeline — that:
 *   - one distributor's Owner cannot see or touch another's invitations/members
 *   - only people holding `team:manage` may use the endpoints at all
 *   - the Owner role can never be granted through an invitation or a role edit
 *   - an email that already has a Stocdup account cannot be invited
 *   - changing a member's roles genuinely changes what they may do
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { InvitationStatus, OrganisationType, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-staff-dist-a';
const DIST_B = 'test-staff-dist-b';
const OWNER_A = { id: 'test-staff-owner-a', kc: 'kc-test-staff-owner-a', email: 'owner-a@staff.integration.test' };
const OWNER_B = { id: 'test-staff-owner-b', kc: 'kc-test-staff-owner-b', email: 'owner-b@staff.integration.test' };
const OPS_A = { id: 'test-staff-ops-a', kc: 'kc-test-staff-ops-a', email: 'ops-a@staff.integration.test' };
const MEMBER_A = { id: 'test-staff-member-a', kc: 'kc-test-staff-member-a', email: 'member-a@staff.integration.test' };
const EXISTING = { id: 'test-staff-existing', kc: 'kc-test-staff-existing', email: 'existing@staff.integration.test' };
const ALL_USERS = [OWNER_A, OWNER_B, OPS_A, MEMBER_A, EXISTING];

describe('Staff invitations & team members (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  const tokens: Record<string, string> = {};

  const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, user: (typeof ALL_USERS)[number]) =>
    request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${tokens[user.id]}`);

  async function seedMembership(user: (typeof ALL_USERS)[number], organisationId: string, role: Role) {
    const membership = await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId } },
      create: { userId: user.id, organisationId, role },
      update: { role },
    });
    await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await prisma.membershipRole.create({ data: { membershipId: membership.id, role } });
  }

  // Users created by accepting invitations (their emails all end in this domain).
  const ACCEPT_DOMAIN = '@accept.integration.test';
  async function cleanupAcceptUsers() {
    const users = await prisma.user.findMany({ where: { email: { endsWith: ACCEPT_DOMAIN } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.adminNotification.deleteMany({ where: { organisationId: { in: [DIST_A, DIST_B] } } });
    await prisma.staffInvitation.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { userId: { in: ids } } } });
    await prisma.membership.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
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

    for (const id of [DIST_A, DIST_B]) {
      await prisma.organisation.upsert({
        where: { id },
        create: { id, name: `Staff Test ${id}`, type: OrganisationType.DISTRIBUTOR },
        update: {},
      });
    }
    for (const u of ALL_USERS) {
      await prisma.user.upsert({
        where: { id: u.id },
        create: { id: u.id, email: u.email, keycloakId: u.kc, firstName: 'Test', lastName: u.id.replace('test-staff-', '') },
        update: { keycloakId: u.kc, deletedAt: null },
      });
      tokens[u.id] = jwtServer.signToken({ sub: u.kc, email: u.email });
    }
  });

  beforeEach(async () => {
    // Undo any removal a previous test performed on the fixed users.
    await prisma.user.updateMany({ where: { id: { in: ALL_USERS.map((u) => u.id) } }, data: { deletedAt: null } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'User', aggregateId: { in: ALL_USERS.map((u) => u.id) } } });
    await prisma.staffInvitation.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.auditLog.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await seedMembership(OWNER_A, DIST_A, Role.DISTRIBUTOR_ADMIN);
    await seedMembership(OWNER_B, DIST_B, Role.DISTRIBUTOR_ADMIN);
    await seedMembership(OPS_A, DIST_A, Role.OPERATIONS_MANAGER);
    await seedMembership(MEMBER_A, DIST_A, Role.WAREHOUSE_STAFF);
  });

  afterAll(async () => {
    await cleanupAcceptUsers();
    await prisma.staffInvitation.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.auditLog.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: { in: ['StaffInvitation', 'User'] }, aggregateId: { not: '' } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { userId: { in: ALL_USERS.map((u) => u.id) } } } });
    await prisma.membership.deleteMany({ where: { userId: { in: ALL_USERS.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: ALL_USERS.map((u) => u.id) } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
    await jwtServer.close();
  });

  const invite = (email: string, roles: Role[], user = OWNER_A, dist = DIST_A) =>
    call('post', `/distributors/${dist}/staff-invitations`, user).send({ email, roles });

  describe('inviting', () => {
    it('lets an Owner invite an employee with the Operations manager role and queues the email', async () => {
      const res = await invite('new.hire@staff.integration.test', [Role.OPERATIONS_MANAGER]);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ email: 'new.hire@staff.integration.test', roles: [Role.OPERATIONS_MANAGER], status: 'PENDING' });

      const event = await prisma.outboxEvent.findFirst({ where: { aggregateId: res.body.id, eventType: 'StaffInviteSent' } });
      expect(event).not.toBeNull();
      const row = await prisma.staffInvitation.findUniqueOrThrow({ where: { id: res.body.id } });
      const token = new URL((event!.payload as { inviteUrl: string }).inviteUrl).searchParams.get('token')!;
      expect(row.tokenHash).not.toBe(token); // only a hash is stored
      expect(row.invitedByUserId).toBe(OWNER_A.id);
    });

    it.each([
      ['the Owner role', [Role.DISTRIBUTOR_ADMIN]],
      ['the driver role', [Role.DRIVER]],
      ['an empty role list', []],
    ])('rejects %s', async (_label, roles) => {
      const res = await invite('blocked@staff.integration.test', roles);
      expect(res.status).toBe(400);
      expect(await prisma.staffInvitation.count({ where: { distributorId: DIST_A } })).toBe(0);
    });

    it('rejects an email that already has a Stocdup account, whatever its case', async () => {
      const res = await invite('EXISTING@staff.integration.test', [Role.WAREHOUSE_STAFF]);
      expect(res.status).toBe(409);
    });

    it('rejects the email of a removed (soft-deleted) user too', async () => {
      await prisma.user.update({ where: { id: EXISTING.id }, data: { deletedAt: new Date() } });
      try {
        const res = await invite('existing@staff.integration.test', [Role.WAREHOUSE_STAFF]);
        expect(res.status).toBe(409);
      } finally {
        await prisma.user.update({ where: { id: EXISTING.id }, data: { deletedAt: null } });
      }
    });
  });

  describe('viewing, updating, resending and revoking', () => {
    it('lists pending invitations and reports lapsed ones as EXPIRED; revoked ones disappear', async () => {
      const kept = (await invite('kept@staff.integration.test', [Role.WAREHOUSE_STAFF])).body;
      const revoked = (await invite('revoked@staff.integration.test', [Role.WAREHOUSE_STAFF])).body;
      await call('delete', `/distributors/${DIST_A}/staff-invitations/${revoked.id}`, OWNER_A).expect(204);
      const lapsed = (await invite('lapsed@staff.integration.test', [Role.WAREHOUSE_STAFF])).body;
      await prisma.staffInvitation.update({ where: { id: lapsed.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const res = await call('get', `/distributors/${DIST_A}/staff-invitations`, OWNER_A).expect(200);

      const byEmail = Object.fromEntries(res.body.map((i: { email: string; status: string }) => [i.email, i.status]));
      expect(byEmail).toEqual({ 'kept@staff.integration.test': 'PENDING', 'lapsed@staff.integration.test': 'EXPIRED' });
      expect(res.body.find((i: { id: string }) => i.id === kept.id)).toBeDefined();
    });

    it('changes the roles on a pending invitation but never to the Owner role', async () => {
      const inv = (await invite('edit@staff.integration.test', [Role.WAREHOUSE_STAFF])).body;

      const ok = await call('patch', `/distributors/${DIST_A}/staff-invitations/${inv.id}`, OWNER_A).send({ roles: [Role.OPERATIONS_MANAGER] });
      expect(ok.status).toBe(200);
      expect(ok.body.roles).toEqual([Role.OPERATIONS_MANAGER]);

      const bad = await call('patch', `/distributors/${DIST_A}/staff-invitations/${inv.id}`, OWNER_A).send({ roles: [Role.DISTRIBUTOR_ADMIN] });
      expect(bad.status).toBe(400);
    });

    it('resend replaces the invitation: the old one is gone, a new pending one has the same roles', async () => {
      const inv = (await invite('resend@staff.integration.test', [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF])).body;

      const res = await call('post', `/distributors/${DIST_A}/staff-invitations/${inv.id}/resend`, OWNER_A).expect(200);

      expect(res.body.id).not.toBe(inv.id);
      expect(res.body.roles).toEqual([Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF]);
      const old = await prisma.staffInvitation.findUniqueOrThrow({ where: { id: inv.id } });
      expect(old.status).toBe(InvitationStatus.REVOKED);
      await call('post', `/distributors/${DIST_A}/staff-invitations/${inv.id}/resend`, OWNER_A).expect(404);
    });

    it('records who did what in the audit log', async () => {
      const inv = (await invite('audit@staff.integration.test', [Role.WAREHOUSE_STAFF])).body;
      await call('delete', `/distributors/${DIST_A}/staff-invitations/${inv.id}`, OWNER_A).expect(204);

      const entries = await prisma.auditLog.findMany({ where: { distributorId: DIST_A, entityId: inv.id }, orderBy: { createdAt: 'asc' } });
      expect(entries.map((e) => [e.action, e.actorUserId])).toEqual([
        ['INVITED', OWNER_A.id],
        ['REVOKED', OWNER_A.id],
      ]);
    });
  });

  describe('tenant isolation and permissions', () => {
    it("does not let another distributor's Owner list, create, or manage this distributor's team", async () => {
      const inv = (await invite('private@staff.integration.test', [Role.WAREHOUSE_STAFF])).body;

      // Path names DIST_A, which OWNER_B does not belong to.
      await call('get', `/distributors/${DIST_A}/staff-invitations`, OWNER_B).expect(403);
      await call('post', `/distributors/${DIST_A}/staff-invitations`, OWNER_B).send({ email: 'x@staff.integration.test', roles: [Role.WAREHOUSE_STAFF] }).expect(403);
      await call('get', `/distributors/${DIST_A}/members`, OWNER_B).expect(403);

      // Path names their OWN distributor but the id belongs to DIST_A: not found, never touched.
      await call('patch', `/distributors/${DIST_B}/staff-invitations/${inv.id}`, OWNER_B).send({ roles: [Role.OPERATIONS_MANAGER] }).expect(404);
      await call('post', `/distributors/${DIST_B}/staff-invitations/${inv.id}/resend`, OWNER_B).expect(404);
      await call('delete', `/distributors/${DIST_B}/staff-invitations/${inv.id}`, OWNER_B).expect(404);
      await call('patch', `/distributors/${DIST_B}/members/${MEMBER_A.id}`, OWNER_B).send({ roles: [Role.OPERATIONS_MANAGER] }).expect(404);

      const still = await prisma.staffInvitation.findUniqueOrThrow({ where: { id: inv.id } });
      expect(still.status).toBe(InvitationStatus.PENDING);
      expect(still.roles).toEqual([Role.WAREHOUSE_STAFF]);
    });

    it('does not show one distributor\'s invitations in another distributor\'s list', async () => {
      await invite('only-a@staff.integration.test', [Role.WAREHOUSE_STAFF]);
      const res = await call('get', `/distributors/${DIST_B}/staff-invitations`, OWNER_B).expect(200);
      expect(res.body).toEqual([]);
    });

    it('forbids people without team management, even at their own distributor', async () => {
      await call('get', `/distributors/${DIST_A}/staff-invitations`, OPS_A).expect(403);
      await call('post', `/distributors/${DIST_A}/staff-invitations`, OPS_A).send({ email: 'y@staff.integration.test', roles: [Role.WAREHOUSE_STAFF] }).expect(403);
      await call('get', `/distributors/${DIST_A}/members`, MEMBER_A).expect(403);
    });
  });

  describe('team members', () => {
    it('lists the distributor\'s members with their roles', async () => {
      const res = await call('get', `/distributors/${DIST_A}/members`, OWNER_A).expect(200);
      const roles = Object.fromEntries(res.body.map((m: { userId: string; roles: Role[] }) => [m.userId, m.roles]));
      expect(roles).toEqual({
        [OWNER_A.id]: [Role.DISTRIBUTOR_ADMIN],
        [OPS_A.id]: [Role.OPERATIONS_MANAGER],
        [MEMBER_A.id]: [Role.WAREHOUSE_STAFF],
      });
    });

    it('changing a member\'s roles genuinely changes what they may do', async () => {
      // Warehouse staff cannot manage price lists; Operations managers can.
      await call('get', `/distributors/${DIST_A}/price-lists`, MEMBER_A).expect(403);

      const res = await call('patch', `/distributors/${DIST_A}/members/${MEMBER_A.id}`, OWNER_A).send({ roles: [Role.OPERATIONS_MANAGER] });
      expect(res.status).toBe(200);
      expect(res.body.roles).toEqual([Role.OPERATIONS_MANAGER]);

      await call('get', `/distributors/${DIST_A}/price-lists`, MEMBER_A).expect(200);

      // ...and back again: the old role must not linger in the legacy column.
      await call('patch', `/distributors/${DIST_A}/members/${MEMBER_A.id}`, OWNER_A).send({ roles: [Role.WAREHOUSE_STAFF] }).expect(200);
      await call('get', `/distributors/${DIST_A}/price-lists`, MEMBER_A).expect(403);
    });

    it('never lets a role edit create an Owner or driver, and protects the Owner and the caller', async () => {
      await call('patch', `/distributors/${DIST_A}/members/${OPS_A.id}`, OWNER_A).send({ roles: [Role.DISTRIBUTOR_ADMIN] }).expect(400);
      await call('patch', `/distributors/${DIST_A}/members/${OPS_A.id}`, OWNER_A).send({ roles: [Role.DRIVER] }).expect(400);
      await call('patch', `/distributors/${DIST_A}/members/${OWNER_A.id}`, OWNER_A).send({ roles: [Role.OPERATIONS_MANAGER] }).expect(403);

      const owner = await prisma.membership.findFirstOrThrow({ where: { userId: OWNER_A.id, organisationId: DIST_A }, include: { roles: true } });
      expect(owner.roles.map((r) => r.role)).toEqual([Role.DISTRIBUTOR_ADMIN]);
    });
  });

  describe('accepting an invitation', () => {
    const identityToken = (email: string, over: Record<string, unknown> = {}) =>
      jwtServer.signToken({ sub: `kc-${email}`, email, email_verified: true, given_name: 'New', family_name: 'Hire', ...over });
    const accept = (token: string, bearer: string) =>
      request(app.getHttpServer()).post('/api/v1/staff-invitations/accept').set('Authorization', `Bearer ${bearer}`).send({ token });

    /** Invites via the API and pulls the raw token out of the queued email link. */
    async function inviteAndGetToken(email: string, roles: Role[]) {
      const res = await invite(email, roles);
      expect(res.status).toBe(201);
      const event = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: res.body.id, eventType: 'StaffInviteSent' } });
      const token = new URL((event.payload as { inviteUrl: string }).inviteUrl).searchParams.get('token')!;
      return { id: res.body.id as string, token };
    }

    beforeEach(cleanupAcceptUsers);

    it('joins the inviting distributor with every invited role, and the new person can act on them at once', async () => {
      const email = `sam${ACCEPT_DOMAIN}`;
      const { id, token } = await inviteAndGetToken(email, [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF]);

      const res = await accept(token, identityToken(email));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ distributorId: DIST_A, roles: [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF] });
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: user.id }, include: { roles: true } });
      expect(membership.organisationId).toBe(DIST_A);
      expect(membership.roles.map((r) => r.role).sort()).toEqual([Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF].sort());
      expect((await prisma.staffInvitation.findUniqueOrThrow({ where: { id } })).status).toBe(InvitationStatus.ACCEPTED);

      // Operations manager: may manage price lists, may NOT manage the team.
      const bearer = identityToken(email);
      await request(app.getHttpServer()).get(`/api/v1/distributors/${DIST_A}/price-lists`).set('Authorization', `Bearer ${bearer}`).expect(200);
      await request(app.getHttpServer()).get(`/api/v1/distributors/${DIST_A}/members`).set('Authorization', `Bearer ${bearer}`).expect(403);
      // ...and has no access to another distributor.
      await request(app.getHttpServer()).get(`/api/v1/distributors/${DIST_B}/price-lists`).set('Authorization', `Bearer ${bearer}`).expect(403);
    });

    it('shows the new member to the Owner, with who invited them, and pings the Owner in the bell inbox', async () => {
      const email = `joined${ACCEPT_DOMAIN}`;
      const { token } = await inviteAndGetToken(email, [Role.WAREHOUSE_STAFF]);
      await accept(token, identityToken(email)).expect(200);

      const members = await call('get', `/distributors/${DIST_A}/members`, OWNER_A).expect(200);
      expect(members.body.find((m: { email: string }) => m.email === email)).toMatchObject({ roles: [Role.WAREHOUSE_STAFF], invitedBy: 'Test owner-a' });

      const inbox = await prisma.adminNotification.findMany({ where: { userId: OWNER_A.id, organisationId: DIST_A } });
      expect(inbox).toEqual([expect.objectContaining({ type: 'STAFF_INVITE_ACCEPTED', title: 'New Hire joined your team', linkPath: '/team', readAt: null })]);
      // A different distributor's Owner hears nothing.
      expect(await prisma.adminNotification.count({ where: { userId: OWNER_B.id } })).toBe(0);
      // Only Owners are pinged, not the person who joined.
      expect(await prisma.adminNotification.count({ where: { organisationId: DIST_A, userId: { not: OWNER_A.id } } })).toBe(0);
    });

    it('binds the invitation to the invited address: a different verified email is refused and leaves no user behind', async () => {
      const { id, token } = await inviteAndGetToken(`intended${ACCEPT_DOMAIN}`, [Role.WAREHOUSE_STAFF]);
      const other = `someone-else${ACCEPT_DOMAIN}`;

      await accept(token, identityToken(other)).expect(403);

      expect(await prisma.user.count({ where: { email: other } })).toBe(0);
      expect((await prisma.staffInvitation.findUniqueOrThrow({ where: { id } })).status).toBe(InvitationStatus.PENDING);
    });

    it('requires a VERIFIED email', async () => {
      const email = `unverified${ACCEPT_DOMAIN}`;
      const { token } = await inviteAndGetToken(email, [Role.WAREHOUSE_STAFF]);
      await accept(token, identityToken(email, { email_verified: false })).expect(401);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('lets a link be used once only', async () => {
      const email = `once${ACCEPT_DOMAIN}`;
      const { token } = await inviteAndGetToken(email, [Role.WAREHOUSE_STAFF]);
      await accept(token, identityToken(email)).expect(200);
      await accept(token, identityToken(email)).expect(409);
    });

    it('lets exactly one of two simultaneous accepts through', async () => {
      const email = `race${ACCEPT_DOMAIN}`;
      const { token } = await inviteAndGetToken(email, [Role.WAREHOUSE_STAFF]);
      const bearer = identityToken(email);

      const results = await Promise.all([accept(token, bearer), accept(token, bearer)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(await prisma.membership.count({ where: { userId: user.id } })).toBe(1);
    });

    it('refuses revoked, expired and unknown links; a revoked link cannot come back via resend', async () => {
      const revoked = await inviteAndGetToken(`revoked${ACCEPT_DOMAIN}`, [Role.WAREHOUSE_STAFF]);
      await call('delete', `/distributors/${DIST_A}/staff-invitations/${revoked.id}`, OWNER_A).expect(204);
      await accept(revoked.token, identityToken(`revoked${ACCEPT_DOMAIN}`)).expect(410);

      const lapsed = await inviteAndGetToken(`lapsed${ACCEPT_DOMAIN}`, [Role.WAREHOUSE_STAFF]);
      await prisma.staffInvitation.update({ where: { id: lapsed.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await accept(lapsed.token, identityToken(`lapsed${ACCEPT_DOMAIN}`)).expect(410);

      await accept('not-a-real-token', identityToken(`nobody${ACCEPT_DOMAIN}`)).expect(404);

      // Resend supersedes: the OLD link dies, the new one works.
      const first = await inviteAndGetToken(`resent${ACCEPT_DOMAIN}`, [Role.WAREHOUSE_STAFF]);
      const resent = await call('post', `/distributors/${DIST_A}/staff-invitations/${first.id}/resend`, OWNER_A).expect(200);
      const event = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: resent.body.id, eventType: 'StaffInviteSent' } });
      const newToken = new URL((event.payload as { inviteUrl: string }).inviteUrl).searchParams.get('token')!;
      await accept(first.token, identityToken(`resent${ACCEPT_DOMAIN}`)).expect(410);
      await accept(newToken, identityToken(`resent${ACCEPT_DOMAIN}`)).expect(200);
    });

    it('will not add someone who already belongs to a company', async () => {
      // An existing member of DIST_B, signed in as themselves, tries to use an invitation
      // addressed to their own email — the invite couldn't even be created for a taken address,
      // so seed the invitation directly to prove accept refuses on its own.
      const email = OWNER_B.email;
      const token = 'seeded-token-for-existing-member';
      await prisma.staffInvitation.create({
        data: {
          distributorId: DIST_A,
          email,
          roles: [Role.WAREHOUSE_STAFF],
          tokenHash: require('crypto').createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 86400000),
          invitedByUserId: OWNER_A.id,
        },
      });

      await accept(token, jwtServer.signToken({ sub: OWNER_B.kc, email, email_verified: true })).expect(409);
      expect(await prisma.membership.count({ where: { userId: OWNER_B.id } })).toBe(1);
    });

    it('does not let a stranger invite themselves in: accepting needs the emailed token, not just the address', async () => {
      const email = `target${ACCEPT_DOMAIN}`;
      await inviteAndGetToken(email, [Role.WAREHOUSE_STAFF]);
      // Right address, verified, but a guessed token.
      await accept('guess', identityToken(email)).expect(404);
      expect(await prisma.membership.count({ where: { user: { email } } })).toBe(0);
    });
  });

  describe('removing a team member', () => {
    const remove = (dist: string, user: (typeof ALL_USERS)[number], as: (typeof ALL_USERS)[number]) =>
      call('delete', `/distributors/${dist}/members/${user.id}`, as);

    it('revokes access on the very next request, even with a still-valid token, and blocks Keycloak login', async () => {
      // Before: warehouse staff can reach their distributor.
      await call('get', `/distributors/${DIST_A}/delivery-routes`, MEMBER_A).expect(200);

      await remove(DIST_A, MEMBER_A, OWNER_A).expect(204);

      // Same token, no expiry yet — refused.
      await call('get', `/distributors/${DIST_A}/delivery-routes`, MEMBER_A).expect(401);
      expect(await prisma.membership.count({ where: { userId: MEMBER_A.id } })).toBe(0);
      // The disable of their Keycloak login is queued for the worker.
      const event = await prisma.outboxEvent.findFirst({ where: { aggregateId: MEMBER_A.id, eventType: 'StaffKeycloakDisableRequested' } });
      expect(event?.payload).toMatchObject({ userId: MEMBER_A.id, keycloakId: MEMBER_A.kc, distributorId: DIST_A });
    });

    it('keeps the person and their history: the user row, what they did, and who removed them', async () => {
      await prisma.auditLog.create({
        data: { distributorId: DIST_A, entityType: 'ORDER', entityId: 'order-x', action: 'ACCEPTED', actorType: 'USER', actorUserId: MEMBER_A.id, actorName: 'Test member-a', summary: 'Accepted an order' },
      });
      // Something they created: an invitation (points at their user row via a foreign key).
      const seeded = await prisma.staffInvitation.create({
        data: { distributorId: DIST_A, email: 'kept-history@staff.integration.test', roles: [Role.WAREHOUSE_STAFF], tokenHash: 'hist-hash', expiresAt: new Date(Date.now() + 86400000), invitedByUserId: MEMBER_A.id },
      });

      await remove(DIST_A, MEMBER_A, OWNER_A).expect(204);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: MEMBER_A.id } });
      expect(user.deletedAt).not.toBeNull(); // soft-deleted, not gone
      expect(await prisma.staffInvitation.findUnique({ where: { id: seeded.id } })).not.toBeNull();
      const entries = await prisma.auditLog.findMany({ where: { distributorId: DIST_A, actorUserId: { in: [MEMBER_A.id, OWNER_A.id] } }, orderBy: { createdAt: 'asc' } });
      expect(entries.map((e) => [e.entityType, e.action, e.actorName])).toEqual([
        ['ORDER', 'ACCEPTED', 'Test member-a'],
        ['MEMBERSHIP', 'REMOVED', 'Test owner-a'],
      ]);
      expect(entries[1].changes).toMatchObject({ email: MEMBER_A.email, roles: [Role.WAREHOUSE_STAFF] });
    });

    it('does not let the address be invited again (it stays taken)', async () => {
      await remove(DIST_A, MEMBER_A, OWNER_A).expect(204);
      await invite(MEMBER_A.email, [Role.WAREHOUSE_STAFF]).expect(409);
    });

    it('does not lock someone out of another company they also belong to', async () => {
      await seedMembership(MEMBER_A, DIST_B, Role.WAREHOUSE_STAFF);
      try {
        await remove(DIST_A, MEMBER_A, OWNER_A).expect(204);

        expect((await prisma.user.findUniqueOrThrow({ where: { id: MEMBER_A.id } })).deletedAt).toBeNull();
        expect(await prisma.outboxEvent.count({ where: { aggregateId: MEMBER_A.id, eventType: 'StaffKeycloakDisableRequested' } })).toBe(0);
        await call('get', `/distributors/${DIST_B}/delivery-routes`, MEMBER_A).expect(200); // still works at B
        await call('get', `/distributors/${DIST_A}/delivery-routes`, MEMBER_A).expect(403); // gone from A
      } finally {
        await prisma.membershipRole.deleteMany({ where: { membership: { userId: MEMBER_A.id, organisationId: DIST_B } } });
        await prisma.membership.deleteMany({ where: { userId: MEMBER_A.id, organisationId: DIST_B } });
      }
    });

    it('protects the Owner and the caller', async () => {
      await remove(DIST_A, OWNER_A, OWNER_A).expect(403);
      expect(await prisma.membership.count({ where: { userId: OWNER_A.id } })).toBe(1);
    });

    it("does not let another distributor's Owner, or someone without team management, remove anyone", async () => {
      await remove(DIST_A, MEMBER_A, OWNER_B).expect(403); // path names a distributor they don't belong to
      await remove(DIST_B, MEMBER_A, OWNER_B).expect(404); // their own distributor, but not their member
      await remove(DIST_A, MEMBER_A, OPS_A).expect(403); // right distributor, wrong permission

      expect(await prisma.membership.count({ where: { userId: MEMBER_A.id, organisationId: DIST_A } })).toBe(1);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: MEMBER_A.id } })).deletedAt).toBeNull();
    });
  });
});
