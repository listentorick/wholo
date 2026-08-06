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
import { OrganisationType, ProductStatus, TradeRelationshipStatus, Role, CartOrderStatus, TaxClassification } from '@prisma/client';
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
    await prisma.auditLog.deleteMany({ where: { distributorId: DIST } });
    await prisma.orderLine.deleteMany({ where: { distributorId: DIST } });
    await prisma.order.deleteMany({ where: { distributorId: DIST } });
    await prisma.cartOrderLine.deleteMany({ where: { order: { distributorId: DIST } } });
    await prisma.cartOrder.deleteMany({ where: { distributorId: DIST } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: DIST } });
    await prisma.product.deleteMany({ where: { distributorId: DIST } });
    await prisma.taxType.deleteMany({ where: { distributorId: DIST } });
    await prisma.distributorSettings.deleteMany({ where: { distributorId: DIST } });
    await prisma.membership.deleteMany({ where: { userId: CUSTOMER_USER } });
    await prisma.user.deleteMany({ where: { id: CUSTOMER_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST, CUSTOMER] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({ where: { distributorId: DIST } });
    await prisma.orderLine.deleteMany({ where: { distributorId: DIST } });
    await prisma.order.deleteMany({ where: { distributorId: DIST } });
    await prisma.cartOrderLine.deleteMany({ where: { order: { distributorId: DIST } } });
    await prisma.cartOrder.deleteMany({ where: { distributorId: DIST } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: DIST } });
    await prisma.product.deleteMany({ where: { distributorId: DIST } });
    await prisma.taxType.deleteMany({ where: { distributorId: DIST } });
    await prisma.distributorSettings.deleteMany({ where: { distributorId: DIST } });

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

    it('returns 422 and leaves the cart untouched when the order is below the relationship minimum order spend', async () => {
      const cart = await seedCart(); // 2 × £10 = £20 subtotal
      await prisma.tradeRelationship.update({
        where: { id: relationshipId },
        data: { minimumOrderSpend: 50 },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ distributorSlug: DIST_SLUG });

      expect(res.status).toBe(422);
      expect(res.body.detail).toMatch(/minimum order value/);

      const untouchedCart = await prisma.cartOrder.findUnique({ where: { id: cart.id } });
      expect(untouchedCart).not.toBeNull();
      const orders = await prisma.order.findMany({ where: { distributorId: DIST, traderCustomerId: CUSTOMER } });
      expect(orders).toHaveLength(0);
    });

    it('returns 422 when below the distributor default minimum order spend (no relationship override)', async () => {
      await seedCart(); // £20 subtotal
      await prisma.distributorSettings.upsert({
        where: { distributorId: DIST },
        create: { distributorId: DIST, minimumOrderSpend: 50 },
        update: { minimumOrderSpend: 50 },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ distributorSlug: DIST_SLUG });

      expect(res.status).toBe(422);
    });

    it('succeeds when the order meets the minimum order spend', async () => {
      await seedCart(); // £20 subtotal
      await prisma.tradeRelationship.update({
        where: { id: relationshipId },
        data: { minimumOrderSpend: 20 },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ distributorSlug: DIST_SLUG });

      expect(res.status).toBe(201);
    });
  });

  // ── Tax snapshot immutability (AC7) ─────────────────────────────────────────
  // Unit tests with mocked Prisma can't prove this — only a real DB round-trip
  // (place order, mutate the underlying TaxType, re-fetch) shows the snapshot
  // genuinely doesn't move.

  describe('order tax snapshot survives later TaxType changes', () => {
    it('keeps a placed order\'s tax type, rate and amounts unchanged after the product\'s tax type is reassigned and the original rate is edited', async () => {
      const taxType = await prisma.taxType.create({
        data: { distributorId: DIST, name: 'Standard rate', classification: TaxClassification.STANDARD, ratePercentage: '20.00' },
      });
      await prisma.product.update({ where: { id: productId }, data: { taxTypeId: taxType.id } });

      const cart = await prisma.cartOrder.create({
        data: { distributorId: DIST, customerId: CUSTOMER, userId: CUSTOMER_USER, status: CartOrderStatus.DRAFT },
      });
      await prisma.cartOrderLine.create({
        data: { orderId: cart.id, productId, quantity: 2, unitPrice: 10, taxTypeId: taxType.id, taxRateSnapshot: '20.00' },
      });

      const submitRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ distributorSlug: DIST_SLUG });
      expect(submitRes.status).toBe(201);
      const orderId = submitRes.body.id;
      expect(submitRes.body.taxAmount).toBe('4.00');

      // The submit response's own `lines` come from the same query that
      // created the Order row, before orderLine.createMany runs later in the
      // same transaction — a pre-existing quirk unrelated to tax — so fetch
      // fresh to see the actual placed-order line snapshot.
      const placedRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(placedRes.status).toBe(200);
      expect(placedRes.body.lines[0].taxTypeNameSnapshot).toBe('Standard rate');
      expect(placedRes.body.lines[0].taxClassificationSnapshot).toBe(TaxClassification.STANDARD);
      expect(placedRes.body.lines[0].taxRatePercentageSnapshot).toBe('20.00');
      expect(placedRes.body.lines[0].taxAmount).toBe('4.00');

      // Mutate the tax type after the order exists: rename/reclassify/re-rate
      // it, and reassign the product to a different tax type entirely.
      const otherTaxType = await prisma.taxType.create({
        data: { distributorId: DIST, name: 'Reduced rate', classification: TaxClassification.REDUCED, ratePercentage: '5.00' },
      });
      await prisma.taxType.update({
        where: { id: taxType.id },
        data: { name: 'Renamed rate', classification: TaxClassification.EXEMPT, ratePercentage: '99.00' },
      });
      await prisma.product.update({ where: { id: productId }, data: { taxTypeId: otherTaxType.id } });

      const refetchRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(refetchRes.status).toBe(200);
      expect(refetchRes.body.lines[0].taxTypeId).toBe(taxType.id);
      expect(refetchRes.body.lines[0].taxTypeNameSnapshot).toBe('Standard rate');
      expect(refetchRes.body.lines[0].taxClassificationSnapshot).toBe(TaxClassification.STANDARD);
      expect(refetchRes.body.lines[0].taxRatePercentageSnapshot).toBe('20.00');
      expect(refetchRes.body.lines[0].subtotalAmount).toBe('20.00');
      expect(refetchRes.body.lines[0].taxAmount).toBe('4.00');
      expect(refetchRes.body.lines[0].totalAmount).toBe('24.00');
      expect(refetchRes.body.taxAmount).toBe('4.00');
      expect(refetchRes.body.totalAmount).toBe('24.00');
    });
  });
});
