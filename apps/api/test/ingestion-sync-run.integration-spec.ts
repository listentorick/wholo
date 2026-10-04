/**
 * Integration tests for the combined accounting sync trigger + status routes,
 * and the IngestionRun row lifecycle (created in the same transaction as the
 * outbox event, deduped/reset per (connection, resourceType), distributor
 * isolation).
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
  IngestionRunStatus,
  OrganisationType,
  Role,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';
import { AccountingSyncScheduler } from '../src/accounting/accounting-sync.scheduler';
import { AccountingSyncService } from '../src/accounting/sync/accounting-sync.service';
import { IngestionRunService } from '../src/ingestion/ingestion-run.service';
// Manual Sync queues every resource type; derive the count so a new one doesn't make this stale.
import { ACCOUNTING_MAPPING_RESOURCE_TYPES, ACCOUNTING_SYNC_RESOURCE_TYPES } from '../src/accounting/sync/accounting-sync.constants';
import { createAccountingConnection } from './support/accounting-fixtures';

const DIST_A = 'test-ingest-dist-a';
const DIST_B = 'test-ingest-dist-b';
const ADMIN_USER = 'test-ingest-admin';
const ADMIN_KC = 'kc-test-ingest-admin';

describe('Accounting sync trigger + IngestionRun (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let token: string;
  let connectionA: { id: string };

  const baseConn = {
    provider: AccountingProvider.XERO,
    externalOrganisationId: 'tenant-1',
    externalOrganisationName: 'Acme Wines',
    scopes: 'openid',
    encryptedCredentialData: 'irrelevant',
    connectedByUserId: ADMIN_USER,
    connectedAt: new Date(),
  };

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
        create: { id, name: `Ingest Test ${id}`, type: OrganisationType.DISTRIBUTOR },
        update: {},
      });
    }
    const user = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: { id: ADMIN_USER, email: 'ingest-admin@integration.test', keycloakId: ADMIN_KC, firstName: 'I', lastName: 'A' },
      update: { keycloakId: ADMIN_KC },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: DIST_A } },
      create: { userId: user.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });
    token = jwtServer.signToken({ sub: ADMIN_KC, email: 'ingest-admin@integration.test' });
  });

  beforeEach(async () => {
    await prisma.ingestionRun.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingOrganisation.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    connectionA = await createAccountingConnection(prisma, { ...baseConn, distributorId: DIST_A, status: AccountingConnectionStatus.CONNECTED });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: connectionA.id } });
  });

  afterAll(async () => {
    await prisma.ingestionRun.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: connectionA.id } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingOrganisation.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
    await jwtServer.close();
  });

  it('POST /accounting/sync creates one QUEUED run + one matching outbox event per resource type', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/distributors/${DIST_A}/accounting/sync`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.runs).toHaveLength(3);

    const runs = await prisma.ingestionRun.findMany({ where: { sourceRef: connectionA.id } });
    expect(runs).toHaveLength(ACCOUNTING_SYNC_RESOURCE_TYPES.length);
    expect(runs.map((r) => r.resourceType).sort()).toEqual([...ACCOUNTING_SYNC_RESOURCE_TYPES].sort());
    expect(runs.every((r) => r.status === IngestionRunStatus.QUEUED && r.trigger === 'MANUAL')).toBe(true);

    const events = await prisma.outboxEvent.findMany({
      where: { aggregateType: 'AccountingConnection', aggregateId: connectionA.id },
    });
    expect(events).toHaveLength(ACCOUNTING_SYNC_RESOURCE_TYPES.length);
    const runIds = new Set(runs.map((r) => r.id));
    for (const e of events) {
      expect(runIds.has((e.payload as { runId: string }).runId)).toBe(true);
    }
  });

  it('calling it again while runs are still queued writes no duplicate events', async () => {
    await request(app.getHttpServer()).post(`/api/v1/distributors/${DIST_A}/accounting/sync`).set('Authorization', `Bearer ${token}`);
    await request(app.getHttpServer()).post(`/api/v1/distributors/${DIST_A}/accounting/sync`).set('Authorization', `Bearer ${token}`);

    expect(await prisma.ingestionRun.count({ where: { sourceRef: connectionA.id } })).toBe(ACCOUNTING_SYNC_RESOURCE_TYPES.length);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: connectionA.id } })).toBe(ACCOUNTING_SYNC_RESOURCE_TYPES.length);
  });

  it('two concurrent sync requests still produce exactly one event per resource type (atomic create/reset)', async () => {
    await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app.getHttpServer()).post(`/api/v1/distributors/${DIST_A}/accounting/sync`).set('Authorization', `Bearer ${token}`),
      ),
    );

    expect(await prisma.ingestionRun.count({ where: { sourceRef: connectionA.id } })).toBe(ACCOUNTING_SYNC_RESOURCE_TYPES.length);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: connectionA.id } })).toBe(ACCOUNTING_SYNC_RESOURCE_TYPES.length);
  });

  it('re-queues a run left QUEUED for over an hour (its job gave up before claiming it)', async () => {
    await request(app.getHttpServer()).post(`/api/v1/distributors/${DIST_A}/accounting/sync`).set('Authorization', `Bearer ${token}`);
    await prisma.ingestionRun.updateMany({
      where: { sourceRef: connectionA.id, resourceType: 'contact' },
      data: { queuedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    await request(app.getHttpServer()).post(`/api/v1/distributors/${DIST_A}/accounting/sync`).set('Authorization', `Bearer ${token}`);

    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: connectionA.id } });
    expect(events.filter((e) => e.eventType === 'AccountingContactSyncRequested')).toHaveLength(2);
    expect(events.filter((e) => e.eventType === 'AccountingProductSyncRequested')).toHaveLength(1);
  });

  describe('scheduler', () => {
    let scheduler: AccountingSyncScheduler;
    let connectionB: { id: string };

    beforeEach(async () => {
      scheduler = new AccountingSyncScheduler(prisma, app.get(IngestionRunService), app.get(AccountingSyncService));
      connectionB = await createAccountingConnection(prisma, { ...baseConn, distributorId: DIST_B, status: AccountingConnectionStatus.DISCONNECTED });
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: connectionB.id } });
    });

    afterEach(async () => {
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: connectionB.id } });
    });

    it('queues a never-synced connection once, then nothing until its next slot', async () => {
      const now = new Date();
      const first = await scheduler.runOnce(now);
      const second = await scheduler.runOnce(new Date(now.getTime() + 60_000));

      expect(first.enqueued).toBeGreaterThanOrEqual(3);
      expect(second.enqueued).toBe(0);
      expect(await prisma.outboxEvent.count({ where: { aggregateId: connectionA.id } })).toBe(3);
      const runs = await prisma.ingestionRun.findMany({ where: { sourceRef: connectionA.id } });
      expect(runs.every((r) => r.nextRunAt !== null && r.nextRunAt.getTime() > now.getTime())).toBe(true);
    });

    it('never schedules a connection that is not CONNECTED (another distributor\'s, here)', async () => {
      await scheduler.runOnce(new Date());

      expect(await prisma.ingestionRun.count({ where: { sourceRef: connectionB.id } })).toBe(0);
      expect(await prisma.outboxEvent.count({ where: { aggregateId: connectionB.id } })).toBe(0);
    });

    it('advances the slot without a duplicate event while the run is still in flight', async () => {
      const now = new Date();
      await scheduler.runOnce(now);
      await prisma.ingestionRun.updateMany({
        where: { sourceRef: connectionA.id },
        data: { nextRunAt: new Date(now.getTime() - 1000) }, // due again, but still QUEUED
      });

      const summary = await scheduler.runOnce(new Date(now.getTime() + 1000));

      expect(summary.skippedInFlight).toBe(3);
      expect(await prisma.outboxEvent.count({ where: { aggregateId: connectionA.id } })).toBe(3);
    });
  });

  it('resets a terminal run back to QUEUED with zeroed counts on the next trigger', async () => {
    await request(app.getHttpServer()).post(`/api/v1/distributors/${DIST_A}/accounting/sync`).set('Authorization', `Bearer ${token}`);
    const before = await prisma.ingestionRun.findFirst({ where: { sourceRef: connectionA.id, resourceType: 'contact' } });
    await prisma.ingestionRun.update({
      where: { id: before!.id },
      data: {
        status: IngestionRunStatus.COMPLETED,
        recordsProcessed: 42,
        recordsTotal: 42,
        recordsCreated: 9,
        recordsUpdated: 4,
        recordsRemoved: 2,
        finishedAt: new Date(),
      },
    });

    await request(app.getHttpServer()).post(`/api/v1/distributors/${DIST_A}/accounting/sync`).set('Authorization', `Bearer ${token}`);
    const after = await prisma.ingestionRun.findUnique({ where: { id: before!.id } });
    expect(after!.status).toBe(IngestionRunStatus.QUEUED);
    expect(after!.recordsProcessed).toBe(0);
    expect(after!.recordsTotal).toBeNull();
    expect(after!.recordsCreated).toBe(0);
    expect(after!.recordsUpdated).toBe(0);
    expect(after!.recordsRemoved).toBe(0);
  });

  it('GET /accounting/sync/status returns the runs + lastSucceededAt', async () => {
    await request(app.getHttpServer()).post(`/api/v1/distributors/${DIST_A}/accounting/sync`).set('Authorization', `Bearer ${token}`);
    const contact = await prisma.ingestionRun.findFirst({ where: { sourceRef: connectionA.id, resourceType: 'contact' } });
    await app.get(IngestionRunService).finalizeSuccess(contact!.id, { recordsProcessed: 1 });
    const { finishedAt } = await prisma.ingestionRun.findUniqueOrThrow({ where: { id: contact!.id } });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/accounting/sync/status`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(3);
    expect(new Date(res.body.lastSucceededAt).getTime()).toBe(finishedAt!.getTime());
  });

  // ADR-061: the row is reused, so a later failed attempt must not erase the
  // fact that the connection synced (this is what made the admin page show
  // "nothing synced yet" once an expired Xero organisation failed every pull).
  it('keeps reporting the last success after every resource type has since failed', async () => {
    const runs = app.get(IngestionRunService);
    await request(app.getHttpServer()).post(`/api/v1/distributors/${DIST_A}/accounting/sync`).set('Authorization', `Bearer ${token}`);
    const rows = await prisma.ingestionRun.findMany({ where: { sourceRef: connectionA.id } });
    for (const row of rows) await runs.finalizeSuccess(row.id, { recordsProcessed: 1 });
    // The status reports the mapping pulls only (the invoice status sync is not shown).
    const succeeded = await prisma.ingestionRun.findMany({
      where: { sourceRef: connectionA.id, resourceType: { in: [...ACCOUNTING_MAPPING_RESOURCE_TYPES] } },
    });
    const lastSuccess = Math.max(...succeeded.map((r) => r.finishedAt!.getTime()));

    // The next attempt of every type fails.
    await prisma.ingestionRun.updateMany({ where: { sourceRef: connectionA.id }, data: { status: IngestionRunStatus.PROCESSING } });
    for (const row of rows) await runs.finalizeFailure(row.id, 'Xero getContacts failed with HTTP 403: AuthenticationUnsuccessful');

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/accounting/sync/status`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.runs.every((r: { status: string }) => r.status === 'FAILED')).toBe(true);
    expect(new Date(res.body.lastSucceededAt).getTime()).toBe(lastSuccess);
  });

  it('a distributor cannot see or trigger another distributor\'s sync', async () => {
    const triggerB = await request(app.getHttpServer())
      .post(`/api/v1/distributors/${DIST_B}/accounting/sync`)
      .set('Authorization', `Bearer ${token}`);
    expect(triggerB.status).toBe(403);

    const statusB = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_B}/accounting/sync/status`)
      .set('Authorization', `Bearer ${token}`);
    expect(statusB.status).toBe(403);
  });

  it('GET status with no connection returns an empty result', async () => {
    await prisma.accountingConnection.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.accountingOrganisation.deleteMany({ where: { distributorId: DIST_A } });
    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/accounting/sync/status`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ runs: [], lastSucceededAt: null });
  });
});
