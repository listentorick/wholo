/**
 * Integration tests for GET /api/v1/portal/me/recommended-distributors
 *
 * Hits a real database to verify the relationship-exclusion and marketplace-visibility
 * filtering that unit tests with mocked Prisma cannot guarantee.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrganisationType, TradeRelationshipStatus, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const P = 'integ-rec-';
const DIST_OPEN = `${P}dist-open`; //        visible, no relationship          → recommended
const DIST_ACTIVE = `${P}dist-active`; //    visible, ACTIVE relationship       → excluded
const DIST_PENDING = `${P}dist-pending`; //  visible, PENDING_REQUEST rel        → excluded
const DIST_SOFTDEL = `${P}dist-softdel`; //  visible, soft-deleted relationship  → recommended
const DIST_HIDDEN = `${P}dist-hidden`; //    marketplaceVisible:false            → excluded
const DIST_NOSETTINGS = `${P}dist-nosettings`; // no settings row                → excluded
const DIST_DELETED = `${P}dist-deleted`; //  visible but org deletedAt           → excluded

const ALL_DIST_IDS = [
  DIST_OPEN,
  DIST_ACTIVE,
  DIST_PENDING,
  DIST_SOFTDEL,
  DIST_HIDDEN,
  DIST_NOSETTINGS,
  DIST_DELETED,
];

const CUSTOMER = `${P}customer`;
const USER = `${P}user`;
const USER_KEYCLOAK_ID = `kc-${P}user`;
const LOGO_ASSET = `${P}logo-open`;

describe('Portal recommended distributors (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let token: string;

  const ids = (body: unknown[]) => (body as { id: string }[]).map((d) => d.id);

  beforeAll(async () => {
    jwtServer = await startJwtTestServer();

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    for (const [i, id] of ALL_DIST_IDS.entries()) {
      await prisma.organisation.upsert({
        where: { id },
        // Names sort so DIST_OPEN precedes DIST_SOFTDEL alphabetically.
        create: {
          id,
          name: `Integ Rec ${String.fromCharCode(65 + i)} ${id}`,
          type: OrganisationType.DISTRIBUTOR,
          slug: `${id}-slug`,
          addressCity: 'Leeds',
          addressCountry: 'UK',
        },
        update: { slug: `${id}-slug`, deletedAt: null },
      });
    }
    await prisma.organisation.update({ where: { id: DIST_DELETED }, data: { deletedAt: new Date() } });

    await prisma.organisation.upsert({
      where: { id: CUSTOMER },
      create: { id: CUSTOMER, name: 'Integ Rec Customer', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    const user = await prisma.user.upsert({
      where: { id: USER },
      create: { id: USER, email: `${P}user@integration.test`, keycloakId: USER_KEYCLOAK_ID, firstName: 'Rec', lastName: 'Customer' },
      update: { keycloakId: USER_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: CUSTOMER } },
      create: { userId: user.id, organisationId: CUSTOMER, role: Role.TRADE_CUSTOMER },
      update: {},
    });

    // Marketplace visibility: everything except DIST_HIDDEN (false) and DIST_NOSETTINGS (no row).
    for (const id of [DIST_OPEN, DIST_ACTIVE, DIST_PENDING, DIST_SOFTDEL, DIST_DELETED]) {
      await prisma.distributorSettings.upsert({
        where: { distributorId: id },
        create: { distributorId: id, marketplaceVisible: true, tagline: `${id} tagline` },
        update: { marketplaceVisible: true },
      });
    }
    await prisma.distributorSettings.upsert({
      where: { distributorId: DIST_HIDDEN },
      create: { distributorId: DIST_HIDDEN, marketplaceVisible: false },
      update: { marketplaceVisible: false },
    });
    await prisma.distributorSettings.deleteMany({ where: { distributorId: DIST_NOSETTINGS } });

    await prisma.assetImage.deleteMany({ where: { id: LOGO_ASSET } });
    await prisma.assetImage.create({
      data: {
        id: LOGO_ASSET,
        assetType: 'distributor-logo',
        entityId: DIST_OPEN,
        distributorId: DIST_OPEN,
        variants: { full: 'logos/integ-rec-open.jpg' },
        sourceMimeType: 'image/jpeg',
        sourceSizeBytes: 1,
      },
    });

    token = jwtServer.signToken({ sub: USER_KEYCLOAK_ID, email: `${P}user@integration.test` });
  });

  afterAll(async () => {
    await prisma.assetImage.deleteMany({ where: { distributorId: { in: ALL_DIST_IDS } } });
    await prisma.distributorSettings.deleteMany({ where: { distributorId: { in: ALL_DIST_IDS } } });
    await prisma.tradeRelationship.deleteMany({ where: { customerId: CUSTOMER } });
    await prisma.membership.deleteMany({ where: { userId: USER } });
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [...ALL_DIST_IDS, CUSTOMER] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(async () => {
    await prisma.tradeRelationship.deleteMany({ where: { customerId: CUSTOMER } });
    await prisma.tradeRelationship.create({
      data: { distributorId: DIST_ACTIVE, customerId: CUSTOMER, status: TradeRelationshipStatus.ACTIVE },
    });
    await prisma.tradeRelationship.create({
      data: { distributorId: DIST_PENDING, customerId: CUSTOMER, status: TradeRelationshipStatus.PENDING_REQUEST },
    });
    await prisma.tradeRelationship.create({
      data: {
        distributorId: DIST_SOFTDEL,
        customerId: CUSTOMER,
        status: TradeRelationshipStatus.ACTIVE,
        deletedAt: new Date(),
      },
    });
  });

  it('recommends a marketplace-visible distributor the customer has no relationship with', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portal/me/recommended-distributors')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(ids(res.body)).toContain(DIST_OPEN);
  });

  it('excludes distributors the customer already has a relationship with, regardless of status', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portal/me/recommended-distributors')
      .set('Authorization', `Bearer ${token}`);

    expect(ids(res.body)).not.toContain(DIST_ACTIVE);
    expect(ids(res.body)).not.toContain(DIST_PENDING);
  });

  it('still recommends a distributor whose only relationship is soft-deleted', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portal/me/recommended-distributors')
      .set('Authorization', `Bearer ${token}`);

    expect(ids(res.body)).toContain(DIST_SOFTDEL);
  });

  it('excludes distributors that have not opted into the marketplace', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portal/me/recommended-distributors')
      .set('Authorization', `Bearer ${token}`);

    expect(ids(res.body)).not.toContain(DIST_HIDDEN);
    expect(ids(res.body)).not.toContain(DIST_NOSETTINGS);
  });

  it('excludes soft-deleted distributor orgs even when marketplace-visible', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portal/me/recommended-distributors')
      .set('Authorization', `Bearer ${token}`);

    expect(ids(res.body)).not.toContain(DIST_DELETED);
  });

  it('orders results by name and resolves logo + location', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portal/me/recommended-distributors')
      .set('Authorization', `Bearer ${token}`);

    const mine = (res.body as { id: string; name: string }[]).filter((d) =>
      ALL_DIST_IDS.includes(d.id),
    );
    expect(mine.map((d) => d.id)).toEqual([DIST_OPEN, DIST_SOFTDEL]);

    const open = (res.body as { id: string; logoUrl: string | null; location: string | null }[]).find(
      (d) => d.id === DIST_OPEN,
    )!;
    expect(open.logoUrl).toMatch(/logos\/integ-rec-open\.jpg$/);
    expect(open.location).toBe('Leeds, UK');
  });

  it('returns 401 without an Authorization header', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/portal/me/recommended-distributors');
    expect(res.status).toBe(401);
  });
});
