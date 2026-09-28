/**
 * Integration tests for trade-relationship lifecycle events (ADR-070).
 * Every relationship change must write exactly one outbox event, scoped to the
 * distributor that owns the relationship, in the same transaction as the change.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrganisationType, Role, TradeRelationshipStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'integ-relevents-dist-a';
const DIST_B = 'integ-relevents-dist-b';
const ADMIN_A = 'integ-relevents-admin-a';
const ADMIN_A_KC = 'kc-integ-relevents-admin-a';
const BUYER_ORG = 'integ-relevents-buyer-org';
const BUYER_USER = 'integ-relevents-buyer-user';
const BUYER_KC = 'kc-integ-relevents-buyer';
const INVITEE_EMAIL = 'invitee@relevents.integration.test';
const INVITEE_KC = 'kc-integ-relevents-invitee';

describe('Relationship lifecycle events (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let adminToken: string;
  let buyerToken: string;

  const api = () => request(app.getHttpServer());
  const ok = (r: request.Response) => expect(r.status).toBeLessThan(300);

  const eventsFor = (relationshipId: string) =>
    prisma.outboxEvent.findMany({
      where: { aggregateId: relationshipId, aggregateType: 'TradeRelationship' },
      orderBy: { createdAt: 'asc' },
    });

  async function cleanRelationships() {
    const rels = await prisma.tradeRelationship.findMany({
      where: { distributorId: { in: [DIST_A, DIST_B] } },
      select: { id: true, customerId: true },
    });
    const invitations = await prisma.customerInvitation.findMany({
      where: { distributorId: { in: [DIST_A, DIST_B] } },
      select: { id: true },
    });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...rels.map((r) => r.id), ...invitations.map((i) => i.id)] } },
    });
    await prisma.customerInvitation.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    const inviteeUsers = await prisma.user.findMany({ where: { keycloakId: INVITEE_KC }, select: { id: true } });
    await prisma.membershipRole.deleteMany({ where: { membership: { userId: { in: inviteeUsers.map((u) => u.id) } } } });
    await prisma.membership.deleteMany({ where: { userId: { in: inviteeUsers.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { keycloakId: INVITEE_KC } });
    const customerOrgIds = rels.map((r) => r.customerId).filter((id) => id !== BUYER_ORG);
    if (customerOrgIds.length > 0) await prisma.organisation.deleteMany({ where: { id: { in: customerOrgIds } } });
  }

  beforeAll(async () => {
    // Invite and status-change emails link to the portal; no other integration test reaches those paths.
    process.env.PORTAL_URL ??= 'http://portal.integration.test';
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
        create: { id, name: `Relationship events ${id}`, type: OrganisationType.DISTRIBUTOR, slug: `${id}-slug` },
        update: {},
      });
    }
    await prisma.organisation.upsert({
      where: { id: BUYER_ORG },
      create: { id: BUYER_ORG, name: 'Relationship events buyer', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });

    const admin = await prisma.user.upsert({
      where: { id: ADMIN_A },
      create: { id: ADMIN_A, email: 'admin@relevents.integration.test', keycloakId: ADMIN_A_KC, firstName: 'Rel', lastName: 'Admin' },
      update: { keycloakId: ADMIN_A_KC },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: admin.id, organisationId: DIST_A } },
      create: { userId: admin.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });
    const buyer = await prisma.user.upsert({
      where: { id: BUYER_USER },
      create: { id: BUYER_USER, email: 'buyer@relevents.integration.test', keycloakId: BUYER_KC, firstName: 'Rel', lastName: 'Buyer' },
      update: { keycloakId: BUYER_KC },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: buyer.id, organisationId: BUYER_ORG } },
      create: { userId: buyer.id, organisationId: BUYER_ORG, role: Role.TRADE_CUSTOMER },
      update: {},
    });

    adminToken = jwtServer.signToken({ sub: ADMIN_A_KC, email: 'admin@relevents.integration.test' });
    buyerToken = jwtServer.signToken({ sub: BUYER_KC, email: 'buyer@relevents.integration.test' });
  });

  afterAll(async () => {
    await cleanRelationships();
    await prisma.membership.deleteMany({ where: { userId: { in: [ADMIN_A, BUYER_USER] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ADMIN_A, BUYER_USER] } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B, BUYER_ORG] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(cleanRelationships);

  it('records created, invite sent, invite accepted, suspended and removed for one relationship, all scoped to the owning distributor', async () => {
    const created = await api()
      .post(`/api/v1/distributors/${DIST_A}/customers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Lifecycle Bar', email: INVITEE_EMAIL })
      .expect(ok);
    const relationshipId: string = created.body.id;
    const customerId: string = created.body.organisationId;

    const invite = await api()
      .post(`/api/v1/distributors/${DIST_A}/customers/${customerId}/invite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(ok);
    const inviteToken = new URL(invite.body.inviteUrl).searchParams.get('token');

    const inviteeToken = jwtServer.signToken({
      sub: INVITEE_KC, email: INVITEE_EMAIL, email_verified: true, given_name: 'In', family_name: 'Vitee',
    });
    await api().post('/api/v1/portal/invitations/accept').set('Authorization', `Bearer ${inviteeToken}`).send({ token: inviteToken }).expect(ok);

    await api().post(`/api/v1/distributors/${DIST_A}/customers/${customerId}/suspend`).set('Authorization', `Bearer ${adminToken}`).expect(ok);
    await api().delete(`/api/v1/distributors/${DIST_A}/customers/${customerId}`).set('Authorization', `Bearer ${adminToken}`).expect(ok);

    const events = await eventsFor(relationshipId);
    const summary = events.map((e) => {
      const p = e.payload as Record<string, unknown>;
      return [e.eventType, p.fromStatus, p.toStatus];
    });
    expect(summary).toEqual([
      ['TradeRelationshipCreated', null, 'PENDING_INVITE'],
      ['CustomerInviteAccepted', 'PENDING_INVITE', 'ACTIVE'],
      ['TradeRelationshipSuspended', 'ACTIVE', 'SUSPENDED'],
      ['TradeRelationshipRemoved', 'SUSPENDED', 'SUSPENDED'],
    ]);
    for (const e of events) {
      expect(e.payload).toMatchObject({ relationshipId, distributorId: DIST_A, customerId });
    }
    expect((events[0].payload as Record<string, unknown>).origin).toBe('MANUAL');

    // The invite-sent event is on the invitation aggregate but names the relationship.
    const inviteSent = await prisma.outboxEvent.findFirst({ where: { eventType: 'CustomerInviteSent', payload: { path: ['relationshipId'], equals: relationshipId } } });
    expect(inviteSent?.payload).toMatchObject({ distributorId: DIST_A, customerId, fromStatus: 'PENDING_INVITE', toStatus: 'PENDING_INVITE' });
  });

  it('records an access request, and a second one after a decline, keeping both in the history', async () => {
    await api().post(`/api/v1/distributors/${DIST_A}/customers/${BUYER_ORG}`).set('Authorization', `Bearer ${buyerToken}`).send({ recentContact: true }).expect(ok);
    await api().post(`/api/v1/distributors/${DIST_A}/customers/${BUYER_ORG}/decline-request`).set('Authorization', `Bearer ${adminToken}`).expect(ok);
    await api().post(`/api/v1/distributors/${DIST_A}/customers/${BUYER_ORG}`).set('Authorization', `Bearer ${buyerToken}`).send({ recentContact: false }).expect(ok);

    const rel = await prisma.tradeRelationship.findUniqueOrThrow({ where: { distributorId_customerId: { distributorId: DIST_A, customerId: BUYER_ORG } } });
    const events = await eventsFor(rel.id);
    expect(events.map((e) => [e.eventType, (e.payload as Record<string, unknown>).fromStatus])).toEqual([
      ['TradeRelationshipAccessRequested', null],
      ['TradeRelationshipRequestDeclined', 'PENDING_REQUEST'],
      ['TradeRelationshipAccessRequested', 'INACTIVE'],
    ]);
  });

  it("does not let distributor A change B's customer, and writes no event when it tries", async () => {
    const org = await prisma.organisation.create({ data: { name: 'B customer', type: OrganisationType.TRADE_CUSTOMER } });
    const relB = await prisma.tradeRelationship.create({
      data: { distributorId: DIST_B, customerId: org.id, status: TradeRelationshipStatus.ACTIVE },
    });

    // Addressed through A's own path: the customer is not A's, so it is not found.
    await api().post(`/api/v1/distributors/${DIST_A}/customers/${org.id}/suspend`).set('Authorization', `Bearer ${adminToken}`).expect(404);
    await api().delete(`/api/v1/distributors/${DIST_A}/customers/${org.id}`).set('Authorization', `Bearer ${adminToken}`).expect(404);
    // Addressed through B's path: A's admin has no membership there.
    await api().post(`/api/v1/distributors/${DIST_B}/customers/${org.id}/suspend`).set('Authorization', `Bearer ${adminToken}`).expect(403);

    expect(await eventsFor(relB.id)).toEqual([]);
    const unchanged = await prisma.tradeRelationship.findUniqueOrThrow({ where: { id: relB.id } });
    expect(unchanged).toMatchObject({ status: TradeRelationshipStatus.ACTIVE, deletedAt: null });
  });
});
