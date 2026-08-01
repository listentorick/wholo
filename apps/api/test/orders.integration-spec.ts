/**
 * Integration tests for POST /api/v1/orders (customer-facing order submission).
 *
 * These hit a real database to verify the relationship-status gate added to
 * OrdersService#submitOrder — a suspended relationship must not be able to
 * convert a (possibly stale) cart into a real order, matching the guard
 * already enforced at add-to-cart time.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrganisationType, ProductStatus, TradeRelationshipStatus, Role, CartOrderStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST         = 'integ-orders-dist';
const DIST_SLUG     = 'integ-orders-dist-slug';
const CUSTOMER      = 'integ-orders-customer';
const CUSTOMER_USER = 'integ-orders-customer-user';
const CUSTOMER_KEYCLOAK_ID = 'kc-integ-orders-customer-user';

describe('Orders submission (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let token: string;
  let productId: string;
  let relationshipId: string;

  beforeAll(async () => {
    jwtServer = await startJwtTestServer();

    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.organisation.upsert({
      where: { id: DIST },
      create: { id: DIST, name: 'Integration Orders Distributor', type: OrganisationType.DISTRIBUTOR, slug: DIST_SLUG },
      update: { slug: DIST_SLUG },
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER },
      create: { id: CUSTOMER, name: 'Integration Orders Customer', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    const customerUser = await prisma.user.upsert({
      where: { id: CUSTOMER_USER },
      create: {
        id: CUSTOMER_USER,
        email: 'orders-customer@integration.test',
        keycloakId: CUSTOMER_KEYCLOAK_ID,
        firstName: 'Orders',
        lastName: 'Customer',
      },
      update: { keycloakId: CUSTOMER_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: customerUser.id, organisationId: CUSTOMER } },
      create: { userId: customerUser.id, organisationId: CUSTOMER, role: Role.TRADE_CUSTOMER },
      update: {},
    });

    token = jwtServer.signToken({ sub: CUSTOMER_KEYCLOAK_ID, email: 'orders-customer@integration.test' });
  });

  afterAll(async () => {
    await prisma.orderLine.deleteMany({ where: { distributorId: DIST } });
    await prisma.order.deleteMany({ where: { distributorId: DIST } });
    await prisma.cartOrderLine.deleteMany({ where: { order: { distributorId: DIST } } });
    await prisma.cartOrder.deleteMany({ where: { distributorId: DIST } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: DIST } });
    await prisma.product.deleteMany({ where: { distributorId: DIST } });
    await prisma.membership.deleteMany({ where: { userId: CUSTOMER_USER } });
    await prisma.user.deleteMany({ where: { id: CUSTOMER_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST, CUSTOMER] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(async () => {
    await prisma.orderLine.deleteMany({ where: { distributorId: DIST } });
    await prisma.order.deleteMany({ where: { distributorId: DIST } });
    await prisma.cartOrderLine.deleteMany({ where: { order: { distributorId: DIST } } });
    await prisma.cartOrder.deleteMany({ where: { distributorId: DIST } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: DIST } });
    await prisma.product.deleteMany({ where: { distributorId: DIST } });

    const product = await prisma.product.create({
      data: { distributorId: DIST, name: 'Integration Orders Product', status: ProductStatus.ACTIVE, price: 10 },
    });
    productId = product.id;

    const relationship = await prisma.tradeRelationship.create({
      data: { distributorId: DIST, customerId: CUSTOMER, status: TradeRelationshipStatus.ACTIVE },
    });
    relationshipId = relationship.id;
  });

  async function seedCart() {
    const cart = await prisma.cartOrder.create({
      data: {
        distributorId: DIST,
        customerId: CUSTOMER,
        userId: CUSTOMER_USER,
        status: CartOrderStatus.DRAFT,
      },
    });
    await prisma.cartOrderLine.create({
      data: { orderId: cart.id, productId, quantity: 2, unitPrice: 10 },
    });
    return cart;
  }

  describe('POST /api/v1/orders', () => {
    it('succeeds when the relationship is ACTIVE', async () => {
      await seedCart();

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ distributorSlug: DIST_SLUG });

      expect(res.status).toBe(201);
      expect(res.body.distributorId).toBe(DIST);
      expect(res.body.traderCustomerId).toBe(CUSTOMER);

      // The cart is consumed on a successful submission.
      const remainingCart = await prisma.cartOrder.findMany({ where: { distributorId: DIST, customerId: CUSTOMER } });
      expect(remainingCart).toHaveLength(0);
    });

    it('returns 403 and leaves the cart untouched when the relationship is SUSPENDED — a stale cart cannot become a real order', async () => {
      const cart = await seedCart();
      await prisma.tradeRelationship.update({
        where: { id: relationshipId },
        data: { status: TradeRelationshipStatus.SUSPENDED },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ distributorSlug: DIST_SLUG });

      expect(res.status).toBe(403);

      const untouchedCart = await prisma.cartOrder.findUnique({ where: { id: cart.id } });
      expect(untouchedCart).not.toBeNull();
      const orders = await prisma.order.findMany({ where: { distributorId: DIST, traderCustomerId: CUSTOMER } });
      expect(orders).toHaveLength(0);
    });

    it('returns 403 when there is no trade relationship at all', async () => {
      await seedCart();
      await prisma.tradeRelationship.deleteMany({ where: { id: relationshipId } });

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ distributorSlug: DIST_SLUG });

      expect(res.status).toBe(403);
    });
  });
});
