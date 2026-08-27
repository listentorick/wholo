/**
 * Integration tests for the public delivery-link endpoints
 * (GET/POST /delivery-links, /delivery-links/outcome).
 *
 * Focused on what a mocked-Prisma unit test cannot prove: a token only ever
 * resolves its own order, single-use is enforced against a real DB unique
 * constraint under a genuine race, a cancelled order's link 410s even after
 * being previously viewable, and an already-submitted link's GET returns the
 * read-only view rather than an error.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrderStatus, OrganisationType, Prisma } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { DeliveryTokenSigner } from '../src/delivery-links/delivery-token.signer';
import { R2StorageService } from '../src/asset-images/r2-storage.service';

const DIST = 'test-dlink-dist';
const CUSTOMER = 'test-dlink-customer';
const ADMIN_USER = 'test-dlink-admin';

// R2 is stubbed — no real Cloudflare calls.
const mockR2 = {
  upload: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  getPublicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
};

describe('Delivery links (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let signer: DeliveryTokenSigner;
  let png: Buffer;

  beforeAll(async () => {
    png = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 90, g: 120, b: 150 } } })
      .png()
      .toBuffer();

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(R2StorageService)
      .useValue(mockR2)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    signer = app.get(DeliveryTokenSigner);

    await prisma.organisation.upsert({
      where: { id: DIST },
      create: { id: DIST, name: 'Delivery Links Test Distributor', type: OrganisationType.DISTRIBUTOR, email: 'orders@dlink-dist.example' },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER },
      create: { id: CUSTOMER, name: 'The Old Hall', type: OrganisationType.TRADE_CUSTOMER, phone: '07700 900123' },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER, email: 'dlink-admin@integration.test', keycloakId: 'kc-test-dlink-admin', firstName: 'Integration', lastName: 'Admin',
      },
      update: {},
    });
  });

  afterEach(async () => {
    mockR2.upload.mockClear();
    mockR2.delete.mockClear();

    const orders = await prisma.order.findMany({ where: { distributorId: DIST }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);

    await prisma.auditLog.deleteMany({ where: { distributorId: DIST } });
    await prisma.orderDeliveryPhoto.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderDeliveryOutcome.deleteMany({ where: { order: { distributorId: DIST } } });
    // Notification has a real FK to Order — NotificationDelivery, then
    // Notification, must go before the order itself.
    await prisma.notificationDelivery.deleteMany({ where: { notification: { distributorId: DIST } } });
    await prisma.notification.deleteMany({ where: { distributorId: DIST } });
    // aggregateId isn't a real FK (loose-reference by design), but scope the
    // delete to this test's own order ids anyway — no reason to risk another
    // integration file's still-pending events sharing aggregateType 'Order'.
    if (orderIds.length) await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'Order', aggregateId: { in: orderIds } } });
    await prisma.orderLine.deleteMany({ where: { distributorId: DIST } });
    await prisma.order.deleteMany({ where: { distributorId: DIST } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST, CUSTOMER] } } });
    await app.close();
  });

  const createOrder = async (overrides: Record<string, unknown> = {}) => {
    const seqResult = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    const orderNumber = `TEST-DLINK-${seqResult[0].nextval}`;
    return prisma.order.create({
      data: {
        distributorId: DIST,
        traderCustomerId: CUSTOMER,
        placedByUserId: ADMIN_USER,
        orderNumber,
        currency: 'GBP',
        status: OrderStatus.ACCEPTED,
        acceptanceModeSnapshot: 'MANUAL',
        acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
        subtotalAmount: new Prisma.Decimal('30.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('30.00'),
        submittedAt: new Date(),
        acceptedAt: new Date(),
        deliveryAddressSnapshot: { line1: '8 High Street', city: 'Halifax', postcode: 'HX1 2AB', country: 'GB' },
        ...overrides,
      },
    });
  };

  // A complete, valid Delivered submission. HANDED_TO_PERSON is the only usable
  // drop method this increment and it requires a recipient name and a signature.
  const HANDED_TO_PERSON = {
    outcome: 'DELIVERED',
    dropMethod: 'HANDED_TO_PERSON',
    recipientName: 'Sam Taylor',
    signature: {
      format: 'signature_pad',
      version: 5,
      width: 320,
      height: 200,
      strokes: [{ points: [{ x: 1, y: 2, time: 0, pressure: 0.5 }] }],
    },
    capturedAt: '2026-08-26T09:00:00.000Z',
  };

  const getOrder = (token: string) => request(app.getHttpServer())
    .get('/api/v1/delivery-links')
    .set('X-Delivery-Token', token);

  const submitOutcome = (token: string, body: Record<string, unknown>) => request(app.getHttpServer())
    .post('/api/v1/delivery-links/outcome')
    .set('X-Delivery-Token', token)
    .send(body);

  const uploadPhoto = (token: string) => request(app.getHttpServer())
    .post('/api/v1/delivery-links/photos')
    .set('X-Delivery-Token', token)
    .attach('photo', png, { filename: 'shot.png', contentType: 'image/png' });

  const deletePhoto = (token: string, photoId: string) => request(app.getHttpServer())
    .delete(`/api/v1/delivery-links/photos/${photoId}`)
    .set('X-Delivery-Token', token);

  it('resolves a token to only its own order — never leaks another order via the same request', async () => {
    const orderA = await createOrder();
    const orderB = await createOrder();

    const res = await getOrder(signer.sign(orderA.id));

    expect(res.status).toBe(200);
    expect(res.body.orderNumber).toBe(orderA.orderNumber);
    expect(res.body.orderNumber).not.toBe(orderB.orderNumber);
    expect(res.body).not.toHaveProperty('price');
  });

  it('rejects a forged token (valid-looking but wrong signature) with 404', async () => {
    const order = await createOrder();
    const [orderId] = signer.sign(order.id).split('.');

    const res = await getOrder(`${orderId}.not-a-real-signature`);

    expect(res.status).toBe(404);
  });

  it('enforces single-use against a real DB unique constraint under a genuine race', async () => {
    const order = await createOrder();
    const token = signer.sign(order.id);

    const [first, second] = await Promise.all([
      submitOutcome(token, HANDED_TO_PERSON),
      submitOutcome(token, HANDED_TO_PERSON),
    ]);

    // Same body from both concurrent callers — idempotent match, both 200.
    expect([first.status, second.status]).toEqual([200, 200]);

    const outcomes = await prisma.orderDeliveryOutcome.findMany({ where: { orderId: order.id } });
    expect(outcomes).toHaveLength(1);
  });

  it('rejects a second submission with a different body as a 409 conflict', async () => {
    const order = await createOrder();
    const token = signer.sign(order.id);

    await submitOutcome(token, HANDED_TO_PERSON);
    const res = await submitOutcome(token, { outcome: 'UNABLE_TO_DELIVER', unableReason: 'CUSTOMER_REFUSED' });

    expect(res.status).toBe(409);
  });

  it('rejects a Delivered submission with no drop method as a 422', async () => {
    const order = await createOrder();
    const res = await submitOutcome(signer.sign(order.id), { outcome: 'DELIVERED' });
    expect(res.status).toBe(422);
  });

  it('persists drop method, signature (jsonb) and capture time for a handed-to-person delivery, and never exposes the signature', async () => {
    const order = await createOrder();
    const token = signer.sign(order.id);

    const res = await submitOutcome(token, HANDED_TO_PERSON);
    expect(res.status).toBe(200);

    const row = await prisma.orderDeliveryOutcome.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(row.dropMethod).toBe('HANDED_TO_PERSON');
    expect(row.signature).toEqual(HANDED_TO_PERSON.signature);
    expect(row.capturedAt?.toISOString()).toBe('2026-08-26T09:00:00.000Z');

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe(OrderStatus.DELIVERED);

    // The read-only view must not carry the signature (PRD §13/§23).
    const view = await getOrder(token);
    expect(view.body.state).toBe('SUBMITTED');
    expect(JSON.stringify(view.body)).not.toContain('signature');
  });

  it('returns the read-only confirmation, not the pending form, on GET after submission', async () => {
    const order = await createOrder();
    const token = signer.sign(order.id);

    await submitOutcome(token, HANDED_TO_PERSON);
    const res = await getOrder(token);

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('SUBMITTED');
    expect(res.body.outcome.outcome).toBe('DELIVERED');
    // Read-only confirmation is deliberately minimal — no address/contact/products.
    expect(res.body.lines).toEqual([]);
  });

  it('writes exactly one audit row for a successful submission', async () => {
    const order = await createOrder();
    await submitOutcome(signer.sign(order.id), HANDED_TO_PERSON);

    const rows = await prisma.auditLog.findMany({ where: { entityId: order.id, action: 'DELIVERY_OUTCOME_RECORDED' } });
    expect(rows).toHaveLength(1);
  });

  // The outbox is drained by a separate worker process (NotificationsModule
  // is explicitly worker-only, not imported into this AppModule — see its
  // own module comment), so this app-scoped test can only prove apps/api's
  // side of the contract: the status transition and a correctly-shaped
  // OutboxEvent row. That the event actually becomes two Notification/
  // NotificationDelivery rows is covered separately by
  // delivery-outcome-notification.service.spec.ts (unit) and by a real
  // MailHog send in manual verification.
  it('transitions Order.status to DELIVERED and writes a correctly-shaped OrderDelivered outbox event', async () => {
    const order = await createOrder();
    await submitOutcome(signer.sign(order.id), HANDED_TO_PERSON);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe(OrderStatus.DELIVERED);

    const events = await prisma.outboxEvent.findMany({ where: { aggregateType: 'Order', aggregateId: order.id, eventType: 'OrderDelivered' } });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual(expect.objectContaining({
      orderId: order.id,
      distributorId: DIST,
      traderCustomerId: CUSTOMER,
      unableReason: null,
    }));
  });

  it('transitions Order.status to DELIVERY_FAILED and writes a correctly-shaped OrderDeliveryFailed outbox event', async () => {
    const order = await createOrder();
    await submitOutcome(signer.sign(order.id), { outcome: 'UNABLE_TO_DELIVER', unableReason: 'CUSTOMER_REFUSED' });

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe(OrderStatus.DELIVERY_FAILED);

    const events = await prisma.outboxEvent.findMany({ where: { aggregateType: 'Order', aggregateId: order.id, eventType: 'OrderDeliveryFailed' } });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual(expect.objectContaining({ unableReason: 'CUSTOMER_REFUSED' }));
  });

  it('410s a cancelled order — even one that was previously viewable — and never accepts a submission for it', async () => {
    const order = await createOrder();
    const token = signer.sign(order.id);

    expect((await getOrder(token)).status).toBe(200);

    await prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED } });

    expect((await getOrder(token)).status).toBe(410);
    expect((await submitOutcome(token, { outcome: 'DELIVERED' })).status).toBe(410);
  });

  describe('delivery-proof photos', () => {
    it('uploads a photo to R2 under the order-scoped prefix and links it to the outcome on submit — never exposing it', async () => {
      const order = await createOrder();
      const token = signer.sign(order.id);

      const up = await uploadPhoto(token);
      expect(up.status).toBe(201);
      expect(mockR2.upload).toHaveBeenCalledTimes(2); // full + thumb

      const row = await prisma.orderDeliveryPhoto.findUniqueOrThrow({ where: { id: up.body.id } });
      expect(row.outcomeId).toBeNull();
      const keys = row.variants as Record<string, string>;
      expect(keys.full).toMatch(new RegExp(`^distributors/${DIST}/deliveries/${order.id}/[0-9a-f-]+/full\\.webp$`));

      const submitted = await submitOutcome(token, {
        ...HANDED_TO_PERSON,
        photoIds: [up.body.id],
        location: { latitude: 53.72, longitude: -1.86, accuracyM: 9, capturedAt: '2026-08-27T10:00:00.000Z' },
      });
      expect(submitted.status).toBe(200);

      const linked = await prisma.orderDeliveryPhoto.findUniqueOrThrow({ where: { id: up.body.id } });
      const outcome = await prisma.orderDeliveryOutcome.findUniqueOrThrow({ where: { orderId: order.id } });
      expect(linked.outcomeId).toBe(outcome.id);
      expect(outcome.latitude).toBe(53.72);
      expect(outcome.locationCapturedAt?.toISOString()).toBe('2026-08-27T10:00:00.000Z');

      const view = await getOrder(token);
      expect(view.body.state).toBe('SUBMITTED');
      expect(JSON.stringify(view.body)).not.toContain('deliveries/');
      expect(JSON.stringify(view.body)).not.toContain('53.72');
    });

    it('records "location unavailable" with null coordinates', async () => {
      const order = await createOrder();
      const token = signer.sign(order.id);
      await submitOutcome(token, { ...HANDED_TO_PERSON, location: { unavailable: true } });

      const outcome = await prisma.orderDeliveryOutcome.findUniqueOrThrow({ where: { orderId: order.id } });
      expect(outcome.locationUnavailable).toBe(true);
      expect(outcome.latitude).toBeNull();
    });

    it('deletes an unlinked photo (row + both R2 objects) but 409s one already linked to a recorded outcome', async () => {
      const order = await createOrder();
      const token = signer.sign(order.id);

      const a = (await uploadPhoto(token)).body.id;
      const b = (await uploadPhoto(token)).body.id;

      expect((await deletePhoto(token, a)).status).toBe(204);
      expect(mockR2.delete).toHaveBeenCalledTimes(2);
      expect(await prisma.orderDeliveryPhoto.findUnique({ where: { id: a } })).toBeNull();

      await submitOutcome(token, { ...HANDED_TO_PERSON, photoIds: [b] });
      expect((await deletePhoto(token, b)).status).toBe(409);
    });

    it('rejects a non-UUID photo id with 400 (server-minted ids only — no arbitrary strings reach the DB)', async () => {
      const order = await createOrder();
      const token = signer.sign(order.id);
      expect((await deletePhoto(token, 'not-a-real-uuid')).status).toBe(400);
      expect((await deletePhoto(token, '....branding')).status).toBe(400);
    });

    it('410s a photo upload once the delivery outcome is recorded', async () => {
      const order = await createOrder();
      const token = signer.sign(order.id);
      await submitOutcome(token, HANDED_TO_PERSON);
      expect((await uploadPhoto(token)).status).toBe(410);
    });

    it('a token cannot delete another order\'s photo', async () => {
      const orderA = await createOrder();
      const orderB = await createOrder();
      const photoA = (await uploadPhoto(signer.sign(orderA.id))).body.id;

      expect((await deletePhoto(signer.sign(orderB.id), photoA)).status).toBe(404);
      expect(await prisma.orderDeliveryPhoto.findUnique({ where: { id: photoA } })).not.toBeNull();
    });
  });
});
