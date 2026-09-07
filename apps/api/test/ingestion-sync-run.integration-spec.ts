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
    connectionA = await prisma.accountingConnection.create({
      data: { ...baseConn, distributorId: DIST_A, status: AccountingConnectionStatus.CONNECTED },
    });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: connectionA.id } });
  });

  afterAll(async () => {
    await prisma.ingestionRun.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: connectionA.id } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
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
    expect(runs).toHaveLength(3);
    expect(runs.map((r) => r.resourceType).sort()).toEqual(['contact', 'product', 'tax_type']);
    expect(runs.every((r) => r.status === IngestionRunStatus.QUEUED && r.trigger === 'MANUAL')).toBe(true);

    const events = await prisma.outboxEvent.findMany({
      where: { aggregateType: 'AccountingConnection', aggregateId: connectionA.id },
    });
    expect(events).toHaveLength(3);
    const runIds = new Set(runs.map((r) => r.id));
    for (const e of events) {
      expect(runIds.has((e.payload as { runId: string }).runId)).toBe(true);
    }
  });

  it('calling it again while runs are non-terminal keeps 3 rows but writes new events', async () => {
    await request(app.getHttpServer()).post(`/api/v1/distributors/${DIST_A}/accounting/sync`).set('Authorization', `Bearer ${token}`);
    await request(app.getHttpServer()).post(`/api/v1/distributors/${DIST_A}/accounting/sync`).set('Authorization', `Bearer ${token}`);

    expect(await prisma.ingestionRun.count({ where: { sourceRef: connectionA.id } })).toBe(3);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: connectionA.id } })).toBe(6);
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
    const finishedAt = new Date();
    await prisma.ingestionRun.update({
      where: { id: contact!.id },
      data: { status: IngestionRunStatus.COMPLETED, finishedAt },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/accounting/sync/status`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(3);
    expect(new Date(res.body.lastSucceededAt).getTime()).toBe(finishedAt.getTime());
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
    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/accounting/sync/status`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ runs: [], lastSucceededAt: null });
  });
});
