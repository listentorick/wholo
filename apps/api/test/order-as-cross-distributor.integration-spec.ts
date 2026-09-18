/**
 * Integration tests proving an "order on behalf" session minted for one
 * distributor cannot be used to read or write cart state at another
 * distributor — against a real database and the real JWT validation
 * pipeline, which unit tests with mocked Prisma/guards cannot guarantee.
 *
 * The customer here has a genuine ACTIVE trade relationship with BOTH
 * distributors, so the assertions below isolate the order-as
 * distributor-binding check specifically — not merely "no relationship
 * exists" (a separate, already-covered rejection reason).
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrganisationType, ProductStatus, TradeRelationshipStatus, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-oacd-dist-a';
const DIST_A_SLUG = 'test-oacd-dist-a-slug';
const DIST_B = 'test-oacd-dist-b';
const DIST_B_SLUG = 'test-oacd-dist-b-slug';
const CUSTOMER = 'test-oacd-customer';
const ADMIN_USER = 'test-oacd-admin';
const ADMIN_KEYCLOAK_ID = 'kc-test-oacd-admin';
const STAFF_USER = 'test-oacd-staff';
const STAFF_KEYCLOAK_ID = 'kc-test-oacd-staff';

describe('Order-as session distributor boundary (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let adminToken: string;
  let staffToken: string;
  let relationshipAId: string;
  let productBId: string;

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
      create: { id: DIST_A, name: 'Order-As Cross-Distributor A', type: OrganisationType.DISTRIBUTOR, slug: DIST_A_SLUG },
      update: { slug: DIST_A_SLUG },
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Order-As Cross-Distributor B', type: OrganisationType.DISTRIBUTOR, slug: DIST_B_SLUG },
      update: { slug: DIST_B_SLUG },
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER },
      create: { id: CUSTOMER, name: 'Order-As Cross-Distributor Customer', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    const admin = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER,
        email: 'oacd-admin@integration.test',
        keycloakId: ADMIN_KEYCLOAK_ID,
        firstName: 'Order-As',
        lastName: 'Admin',
      },
      update: { keycloakId: ADMIN_KEYCLOAK_ID },
    });
    // The admin belongs only to DIST_A — never DIST_B.
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: admin.id, organisationId: DIST_A } },
      create: { userId: admin.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });

    adminToken = jwtServer.signToken({ sub: ADMIN_KEYCLOAK_ID, email: 'oacd-admin@integration.test' });

    // A non-admin distributor staff member at DIST_A — used to prove
    // ORDER_AS_INITIATE is enforced by apps/api itself, not just trusted from
    // admin-api's (now-removed) inline role check.
    const staff = await prisma.user.upsert({
      where: { id: STAFF_USER },
      create: {
        id: STAFF_USER,
        email: 'oacd-staff@integration.test',
        keycloakId: STAFF_KEYCLOAK_ID,
        firstName: 'Order-As',
        lastName: 'Staff',
      },
      update: { keycloakId: STAFF_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: staff.id, organisationId: DIST_A } },
      create: { userId: staff.id, organisationId: DIST_A, role: Role.WAREHOUSE_STAFF },
      update: {},
    });
    staffToken = jwtServer.signToken({ sub: STAFF_KEYCLOAK_ID, email: 'oacd-staff@integration.test' });
  });

  afterAll(async () => {
    await prisma.orderAsDeliveryToken.deleteMany({ where: { session: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.orderAsSession.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.cartOrderLine.deleteMany({ where: { order: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.cartOrder.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.membership.deleteMany({ where: { userId: { in: [ADMIN_USER, STAFF_USER] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ADMIN_USER, STAFF_USER] } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B, CUSTOMER] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(async () => {
    await prisma.orderAsDeliveryToken.deleteMany({ where: { session: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.orderAsSession.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.cartOrderLine.deleteMany({ where: { order: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.cartOrder.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });

    // The customer genuinely does business with BOTH distributors — isolates
    // the order-as distributor-binding check from the (separate, already
    // covered) "no relationship at all" rejection.
    const relA = await prisma.tradeRelationship.create({
      data: { distributorId: DIST_A, customerId: CUSTOMER, status: TradeRelationshipStatus.ACTIVE },
    });
    relationshipAId = relA.id;
    await prisma.tradeRelationship.create({
      data: { distributorId: DIST_B, customerId: CUSTOMER, status: TradeRelationshipStatus.ACTIVE },
    });

    const productB = await prisma.product.create({
      data: { distributorId: DIST_B, name: 'Order-As Cross-Distributor Product B', status: ProductStatus.ACTIVE, price: 10 },
    });
    productBId = productB.id;
  });

  /** Mints a real order-as session for DIST_A via the actual HTTP flow (admin session create → exchange). */
  async function mintOrderAsSessionForDistA(): Promise<string> {
    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/distributors/${DIST_A}/order-as/sessions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tradeRelationshipId: relationshipAId });
    expect(createRes.status).toBe(201);

    const exchangeRes = await request(app.getHttpServer())
      .post('/api/v1/order-as/sessions/exchange')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deliveryToken: createRes.body.deliveryToken });
    expect(exchangeRes.status).toBe(200);
    expect(exchangeRes.body.distributorId).toBe(DIST_A);

    return exchangeRes.body.sessionToken;
  }

  it('rejects a cart write against a different distributor than the order-as session was issued for', async () => {
    const sessionToken = await mintOrderAsSessionForDistA();

    const res = await request(app.getHttpServer())
      .put(`/api/v1/distributors/${DIST_B}/cart/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Order-As-Session', sessionToken)
      .send({ productId: productBId, quantity: 1 });

    expect(res.status).toBe(403);

    // The distributor check now runs before any cart row is touched (it's the
    // first thing upsertItem does, ahead of the trade-relationship lookup and
    // the draft-cart upsert) — no cart is created at all for the mismatched
    // distributor, not just no line.
    const cartAtB = await prisma.cartOrder.findFirst({ where: { distributorId: DIST_B, customerId: CUSTOMER } });
    expect(cartAtB).toBeNull();
  });

  it('rejects reading the cart at a different distributor than the order-as session was issued for', async () => {
    const sessionToken = await mintOrderAsSessionForDistA();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_B}/cart`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Order-As-Session', sessionToken);

    expect(res.status).toBe(403);
  });

  it('rejects order-as session creation for a non-admin membership, enforced directly by apps/api', async () => {
    // Authorization (only DISTRIBUTOR_ADMIN may initiate order-as) is now
    // enforced by apps/api's PermissionsGuard, not trusted from admin-api's
    // (now-removed) inline role check — hit apps/api directly, as admin-api
    // itself would, and confirm it 403s independent of any BFF-side check.
    const res = await request(app.getHttpServer())
      .post(`/api/v1/distributors/${DIST_A}/order-as/sessions`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ tradeRelationshipId: relationshipAId });

    expect(res.status).toBe(403);
  });

  it('still allows cart reads at the distributor the order-as session actually belongs to', async () => {
    const sessionToken = await mintOrderAsSessionForDistA();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/cart`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Order-As-Session', sessionToken);

    expect(res.status).toBe(200);
  });
});
