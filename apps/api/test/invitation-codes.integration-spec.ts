/**
 * Integration tests for accepting an invitation with a different login, via a
 * code emailed to the invited address (ADR-081). Unit tests with a fake store
 * show the rules; these prove them against the real database and the real
 * JWT + guard pipeline:
 *   - the lookup needs no sign-in and reveals nothing for a dead token
 *   - a code belongs to one invitation and one signed-in identity
 *   - expired and locked codes are refused, and the invitation stays open
 *   - an accepted-by-code invitation makes the CLAIMANT the member, records who
 *     accepted, and writes the event the acceptance notice is sent from
 *
 * The code itself only ever exists in the email, so the test reads it from
 * the mail the API tried to send (the invited mailbox, in real life).
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
import { MailService } from '../src/mail/mail.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { MAX_CODE_ATTEMPTS } from '../src/invitation-codes/invitation-codes.service';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST = 'integ-invcodes-dist';
const OWNER = { id: 'integ-invcodes-owner', kc: 'kc-integ-invcodes-owner', email: 'owner@invcodes.integration.test' };
// Everyone who signs in to accept has a Keycloak sub with this prefix, so their users can be cleaned up.
const KC_PREFIX = 'kc-integ-invcodes-claimant-';
const DOMAIN = '@invcodes.integration.test';

describe('Invitation codes (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let ownerToken: string;
  /** Mail the API sent with a code: the invited mailbox's view. */
  const inbox: { to: string; code: string; claimantEmail: string }[] = [];

  const api = () => request(app.getHttpServer());
  const signIn = (name: string, email = `${name}${DOMAIN}`) =>
    jwtServer.signToken({ sub: `${KC_PREFIX}${name}`, email, email_verified: true, given_name: name, family_name: 'Claimant' });
  const lastCodeTo = (to: string) => [...inbox].reverse().find((m) => m.to === to)!.code;
  const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

  async function cleanup() {
    const invitations = await prisma.customerInvitation.findMany({ where: { distributorId: DIST }, select: { id: true } });
    const rels = await prisma.tradeRelationship.findMany({ where: { distributorId: DIST }, select: { id: true, customerId: true } });
    const staff = await prisma.staffInvitation.findMany({ where: { distributorId: DIST }, select: { id: true } });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...invitations, ...rels, ...staff].map((r) => r.id) } },
    });
    await prisma.relationshipFact.deleteMany({ where: { distributorId: DIST } });
    await prisma.relationshipAnalyticsState.deleteMany({ where: { distributorId: DIST } });
    await prisma.adminNotification.deleteMany({ where: { organisationId: DIST } });
    // Codes go with their invitation (cascade).
    await prisma.customerInvitation.deleteMany({ where: { distributorId: DIST } });
    await prisma.staffInvitation.deleteMany({ where: { distributorId: DIST } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: DIST } });
    const claimants = await prisma.user.findMany({ where: { keycloakId: { startsWith: KC_PREFIX } }, select: { id: true } });
    const ids = claimants.map((u) => u.id);
    await prisma.membershipRole.deleteMany({ where: { membership: { userId: { in: ids } } } });
    await prisma.membership.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { distributorId: DIST }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    if (rels.length > 0) await prisma.organisation.deleteMany({ where: { id: { in: rels.map((r) => r.customerId) } } });
    inbox.length = 0;
  }

  beforeAll(async () => {
    process.env.PORTAL_URL ??= 'http://portal.integration.test';
    jwtServer = await startJwtTestServer();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    jest.spyOn(app.get(MailService), 'sendInvitationCode').mockImplementation(async (to, params) => {
      inbox.push({ to, code: params.code, claimantEmail: params.claimantEmail });
    });

    await prisma.organisation.upsert({
      where: { id: DIST },
      create: { id: DIST, name: 'Invitation Codes Wines', type: OrganisationType.DISTRIBUTOR, slug: `${DIST}-slug` },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: OWNER.id },
      create: { id: OWNER.id, email: OWNER.email, keycloakId: OWNER.kc, firstName: 'Owen', lastName: 'Owner' },
      update: { keycloakId: OWNER.kc, deletedAt: null },
    });
    const membership = await prisma.membership.upsert({
      where: { userId_organisationId: { userId: OWNER.id, organisationId: DIST } },
      create: { userId: OWNER.id, organisationId: DIST, role: Role.DISTRIBUTOR_ADMIN },
      update: { role: Role.DISTRIBUTOR_ADMIN },
    });
    await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await prisma.membershipRole.create({ data: { membershipId: membership.id, role: Role.DISTRIBUTOR_ADMIN } });
    ownerToken = jwtServer.signToken({ sub: OWNER.kc, email: OWNER.email });
  });

  beforeEach(cleanup);

  afterAll(async () => {
    await cleanup();
    await prisma.membershipRole.deleteMany({ where: { membership: { userId: OWNER.id } } });
    await prisma.membership.deleteMany({ where: { userId: OWNER.id } });
    await prisma.user.deleteMany({ where: { id: OWNER.id } });
    await prisma.organisation.deleteMany({ where: { id: DIST } });
    await app.close();
    await jwtServer.close();
  });

  /** A customer with a portal invitation to `email`, as the distributor would send it. */
  async function portalInvitation(name: string, email: string) {
    const created = await api()
      .post(`/api/v1/distributors/${DIST}/customers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name, email })
      .expect((r) => expect(r.status).toBeLessThan(300));
    const customerId: string = created.body.organisationId;
    const invite = await api()
      .post(`/api/v1/distributors/${DIST}/customers/${customerId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect((r) => expect(r.status).toBeLessThan(300));
    const token = new URL(invite.body.inviteUrl).searchParams.get('token')!;
    const relationshipId: string = created.body.id;
    const row = await prisma.customerInvitation.findFirstOrThrow({ where: { tradeRelationshipId: relationshipId, email } });
    return { token, customerId, invitationId: row.id, relationshipId };
  }

  const portal = {
    lookup: (token: string) => api().post('/api/v1/portal/invitations/lookup').send({ token }),
    sendCode: (token: string, bearer: string) =>
      api().post('/api/v1/portal/invitations/email-code').set('Authorization', `Bearer ${bearer}`).send({ token }),
    accept: (token: string, bearer: string, code?: string) =>
      api().post('/api/v1/portal/invitations/accept').set('Authorization', `Bearer ${bearer}`).send({ token, ...(code ? { code } : {}) }),
  };

  describe('portal invitations', () => {
    const invited = `orders${DOMAIN}`;

    it('looks an invitation up without sign-in, and says nothing about a token that is not one', async () => {
      const { token } = await portalInvitation('Lookup Bar', invited);

      const found = await portal.lookup(token).expect(200);
      expect(found.body).toMatchObject({ invitedEmail: invited, distributorName: 'Invitation Codes Wines', customerName: 'Lookup Bar' });

      const missing = await portal.lookup('not-a-real-token');
      expect(missing.status).toBe(404);
      expect(JSON.stringify(missing.body)).not.toContain(invited);
    });

    it('lets another login accept with the code sent to the invited address, making that login the member', async () => {
      const { token, customerId, invitationId, relationshipId } = await portalInvitation('Rusty Anchor', invited);
      const rick = signIn('rick');

      await portal.accept(token, rick).expect(403); // another address needs a code
      await portal.sendCode(token, rick).expect(200);
      expect(inbox).toEqual([expect.objectContaining({ to: invited, claimantEmail: `rick${DOMAIN}` })]);

      await portal.accept(token, rick, lastCodeTo(invited)).expect(201);

      const rickUser = await prisma.user.findFirstOrThrow({ where: { keycloakId: `${KC_PREFIX}rick` } });
      const memberships = await prisma.membership.findMany({ where: { organisationId: customerId } });
      expect(memberships.map((m) => m.userId)).toEqual([rickUser.id]);
      const invitation = await prisma.customerInvitation.findUniqueOrThrow({ where: { id: invitationId } });
      expect(invitation).toMatchObject({ status: 'ACCEPTED', acceptedByUserId: rickUser.id });

      const event = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: relationshipId, eventType: 'CustomerInviteAccepted' } });
      expect(event.payload).toMatchObject({ invitationEmail: invited, acceptedByEmail: `rick${DOMAIN}`, acceptedWithCode: true });
    });

    it('accepts the invited address itself with no code, as before', async () => {
      const { token, relationshipId } = await portalInvitation('Same Address Bar', invited);

      await portal.accept(token, signIn('orders', invited)).expect(201);

      expect(inbox).toHaveLength(0);
      const event = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: relationshipId, eventType: 'CustomerInviteAccepted' } });
      expect(event.payload).toMatchObject({ acceptedWithCode: false });
    });

    it('refuses the right code from another signed-in person', async () => {
      const { token, customerId } = await portalInvitation('Shared Inbox Bar', invited);
      await portal.sendCode(token, signIn('rick')).expect(200);

      const res = await portal.accept(token, signIn('mallory'), lastCodeTo(invited));

      expect(res.status).toBe(422);
      expect(await prisma.membership.count({ where: { organisationId: customerId } })).toBe(0);
    });

    it('refuses a code on an invitation it was not sent for', async () => {
      const first = await portalInvitation('First Bar', invited);
      const second = await portalInvitation('Second Bar', `bookings${DOMAIN}`);
      const rick = signIn('rick');
      await portal.sendCode(first.token, rick).expect(200);

      await portal.accept(second.token, rick, lastCodeTo(invited)).expect(422);
      expect(await prisma.membership.count({ where: { organisationId: second.customerId } })).toBe(0);
    });

    it('refuses an expired code and leaves the invitation open', async () => {
      const { token, invitationId } = await portalInvitation('Slow Bar', invited);
      const rick = signIn('rick');
      await portal.sendCode(token, rick).expect(200);
      await prisma.invitationEmailCode.updateMany({ where: { customerInvitationId: invitationId }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const res = await portal.accept(token, rick, lastCodeTo(invited));

      expect(res.status).toBe(422);
      expect(res.body.detail).toMatch(/expired/);
      expect((await prisma.customerInvitation.findUniqueOrThrow({ where: { id: invitationId } })).status).toBe('PENDING');
    });

    it(`locks a code after ${MAX_CODE_ATTEMPTS} wrong tries, even against the right code`, async () => {
      const { token, customerId } = await portalInvitation('Guessing Bar', invited);
      const rick = signIn('rick');
      await portal.sendCode(token, rick).expect(200);
      const code = lastCodeTo(invited);

      for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
        await portal.accept(token, rick, wrong(code)).expect(422);
      }
      const res = await portal.accept(token, rick, code);

      expect(res.status).toBe(422);
      expect(res.body.detail).toMatch(/Too many wrong codes/);
      expect(await prisma.membership.count({ where: { organisationId: customerId } })).toBe(0);
    });

    it(`compares at most ${MAX_CODE_ATTEMPTS} guesses even when many arrive at once`, async () => {
      const { token, invitationId, customerId } = await portalInvitation('Scripted Bar', invited);
      const rick = signIn('rick');
      await portal.sendCode(token, rick).expect(200);
      const code = lastCodeTo(invited);

      const answers = await Promise.all(Array.from({ length: 20 }, () => portal.accept(token, rick, wrong(code))));

      expect(answers.every((r) => r.status === 422)).toBe(true);
      expect(answers.filter((r) => /isn't right/.test(r.body.detail)).length).toBeLessThanOrEqual(MAX_CODE_ATTEMPTS);
      const claim = await prisma.invitationEmailCode.findFirstOrThrow({ where: { customerInvitationId: invitationId } });
      expect(claim.attempts).toBe(MAX_CODE_ATTEMPTS);
      // The right code is now refused too: the tries are gone.
      const late = await portal.accept(token, rick, code);
      expect(late.status).toBe(422);
      expect(await prisma.membership.count({ where: { organisationId: customerId } })).toBe(0);
    });

    it('marks the code used, so it cannot be used again', async () => {
      const { token, invitationId } = await portalInvitation('Once Bar', invited);
      const rick = signIn('rick');
      await portal.sendCode(token, rick).expect(200);
      const code = lastCodeTo(invited);
      await portal.accept(token, rick, code).expect(201);

      const claim = await prisma.invitationEmailCode.findFirstOrThrow({ where: { customerInvitationId: invitationId } });
      expect(claim.consumedAt).not.toBeNull();
      expect(JSON.stringify(claim)).not.toContain(code); // only the hash is stored
      await portal.accept(token, rick, code).expect(409);
    });

    it('will not send a second code within a minute', async () => {
      const { token } = await portalInvitation('Impatient Bar', invited);
      const rick = signIn('rick');
      await portal.sendCode(token, rick).expect(200);

      await portal.sendCode(token, rick).expect(429);
      expect(inbox).toHaveLength(1);
    });
  });

  describe('staff invitations', () => {
    const invited = `sam${DOMAIN}`;
    const staff = {
      sendCode: (token: string, bearer: string) =>
        api().post('/api/v1/staff-invitations/email-code').set('Authorization', `Bearer ${bearer}`).send({ token }),
      accept: (token: string, bearer: string, code?: string) =>
        api().post('/api/v1/staff-invitations/accept').set('Authorization', `Bearer ${bearer}`).send({ token, ...(code ? { code } : {}) }),
    };

    async function staffInvitation(email: string) {
      const res = await api()
        .post(`/api/v1/distributors/${DIST}/staff-invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email, roles: [Role.WAREHOUSE_STAFF] });
      expect(res.status).toBe(201);
      const event = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: res.body.id, eventType: 'StaffInviteSent' } });
      return { id: res.body.id as string, token: new URL((event.payload as { inviteUrl: string }).inviteUrl).searchParams.get('token')! };
    }

    it('looks an invitation up without sign-in', async () => {
      const { token } = await staffInvitation(invited);

      const res = await api().post('/api/v1/staff-invitations/lookup').send({ token }).expect(200);

      expect(res.body).toMatchObject({ invitedEmail: invited, distributorName: 'Invitation Codes Wines', inviterName: 'Owen Owner' });
    });

    it('lets another login join the team with the code, with the invited roles, and records the acceptance', async () => {
      const { id, token } = await staffInvitation(invited);
      const samPersonal = signIn('sam-personal');

      await staff.accept(token, samPersonal).expect(403);
      await staff.sendCode(token, samPersonal).expect(200);
      await staff.accept(token, samPersonal, lastCodeTo(invited)).expect(200);

      const user = await prisma.user.findFirstOrThrow({ where: { keycloakId: `${KC_PREFIX}sam-personal` } });
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: user.id, organisationId: DIST }, include: { roles: true } });
      expect(membership.roles.map((r) => r.role)).toEqual([Role.WAREHOUSE_STAFF]);
      expect(await prisma.staffInvitation.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'ACCEPTED', acceptedByUserId: user.id });
      const event = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: id, eventType: 'StaffInviteAccepted' } });
      expect(event.payload).toMatchObject({ acceptedWithCode: true });
    });

    it('refuses the right code from another signed-in person', async () => {
      const { token } = await staffInvitation(invited);
      await staff.sendCode(token, signIn('sam-personal')).expect(200);

      await staff.accept(token, signIn('mallory'), lastCodeTo(invited)).expect(422);
      expect(await prisma.membership.count({ where: { organisationId: DIST, user: { keycloakId: `${KC_PREFIX}mallory` } } })).toBe(0);
    });
  });
});
