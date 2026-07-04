/**
 * Integration tests for order-placed notification idempotency.
 * Verifies against a real database that reprocessing the same OrderSubmitted
 * event cannot create duplicate notifications or deliveries (the unique
 * constraints are the real subject here — mocked Prisma cannot prove them).
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  NotificationAudience,
  NotificationDeliveryStatus,
  OrderAcceptanceMode,
  OrderStatus,
  OrganisationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../src/queues/queue.constants';
import { OrderPlacedNotificationService } from '../src/notifications/order-placed-notification.service';

const DIST = 'test-notif-dist';
const CUST = 'test-notif-cust';
const USER = 'test-notif-user';
const ORDER = 'test-notif-order';

describe('Order-placed notifications (integration)', () => {
  let prisma: PrismaService;
  let service: OrderPlacedNotificationService;
  let queueAdd: jest.Mock;

  const event = {
    orderId: ORDER,
    distributorId: DIST,
    traderCustomerId: CUST,
    placedByUserId: USER,
    isOrderedByDelegate: false,
    acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL,
    orderNumber: 'ORD-2026-90001',
  };

  beforeAll(async () => {
    queueAdd = jest.fn().mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        OrderPlacedNotificationService,
        PrismaService,
        { provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE), useValue: { add: queueAdd } },
      ],
    }).compile();

    prisma = module.get(PrismaService);
    service = module.get(OrderPlacedNotificationService);

    await prisma.organisation.upsert({
      where: { id: DIST },
      create: {
        id: DIST,
        name: 'Notif Test Distributor',
        type: OrganisationType.DISTRIBUTOR,
        email: 'office@notif-dist.test',
      },
      update: { email: 'office@notif-dist.test' },
    });
    await prisma.distributorSettings.upsert({
      where: { distributorId: DIST },
      create: { distributorId: DIST, orderNotificationEmails: ['orders@notif-dist.test'] },
      update: { orderNotificationEmails: ['orders@notif-dist.test'] },
    });
    await prisma.organisation.upsert({
      where: { id: CUST },
      create: {
        id: CUST,
        name: 'Notif Test Customer',
        type: OrganisationType.TRADE_CUSTOMER,
        email: 'org@notif-cust.test',
      },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: USER },
      create: {
        id: USER,
        email: 'buyer@notif-cust.test',
        keycloakId: 'kc-test-notif-user',
        firstName: 'Notif',
        lastName: 'Buyer',
      },
      update: {},
    });
    await prisma.order.upsert({
      where: { id: ORDER },
      create: {
        id: ORDER,
        distributorId: DIST,
        traderCustomerId: CUST,
        placedByUserId: USER,
        orderNumber: 'ORD-2026-90001',
        status: OrderStatus.SUBMITTED,
        acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL,
        acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
        subtotalAmount: new Prisma.Decimal('10.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('10.00'),
      },
      update: {},
    });
  });

  beforeEach(async () => {
    queueAdd.mockClear();
    await prisma.notificationDelivery.deleteMany({
      where: { notification: { distributorId: DIST } },
    });
    await prisma.notification.deleteMany({ where: { distributorId: DIST } });
  });

  afterAll(async () => {
    await prisma.notificationDelivery.deleteMany({ where: { notification: { distributorId: DIST } } });
    await prisma.notification.deleteMany({ where: { distributorId: DIST } });
    await prisma.order.deleteMany({ where: { id: ORDER } });
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.distributorSettings.deleteMany({ where: { distributorId: DIST } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST, CUST] } } });
    await prisma.$disconnect();
  });

  it('creates one notification with distributor and customer deliveries, scoped to the distributor', async () => {
    await service.handleOrderSubmitted(event);

    const notifications = await prisma.notification.findMany({
      where: { distributorId: DIST },
      include: { deliveries: true },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].distributorId).toBe(DIST);
    expect(notifications[0].orderId).toBe(ORDER);

    const deliveries = notifications[0].deliveries;
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((d) => [d.audience, d.recipient]).sort()).toEqual([
      [NotificationAudience.CUSTOMER, 'buyer@notif-cust.test'],
      [NotificationAudience.DISTRIBUTOR, 'orders@notif-dist.test'],
    ]);
    expect(deliveries.every((d) => d.status === NotificationDeliveryStatus.PENDING)).toBe(true);
  });

  it('reprocessing the same event creates no duplicate notification or deliveries', async () => {
    await service.handleOrderSubmitted(event);
    await service.handleOrderSubmitted(event);

    const notifications = await prisma.notification.findMany({ where: { distributorId: DIST } });
    expect(notifications).toHaveLength(1);

    const deliveries = await prisma.notificationDelivery.findMany({
      where: { notificationId: notifications[0].id },
    });
    expect(deliveries).toHaveLength(2);

    // Re-enqueued jobs reuse the same deterministic jobIds, so BullMQ drops
    // them; what matters here is that the same delivery ids are re-offered,
    // not new ones.
    const enqueuedIds = queueAdd.mock.calls.map((c) => c[2].jobId);
    expect(new Set(enqueuedIds).size).toBe(2);
  });

  it('marks already-sent deliveries untouched on reprocessing', async () => {
    await service.handleOrderSubmitted(event);
    const sentAt = new Date();
    await prisma.notificationDelivery.updateMany({
      where: { notification: { distributorId: DIST } },
      data: { status: NotificationDeliveryStatus.SENT, sentAt },
    });
    queueAdd.mockClear();

    await service.handleOrderSubmitted(event);

    const deliveries = await prisma.notificationDelivery.findMany({
      where: { notification: { distributorId: DIST } },
    });
    expect(deliveries.every((d) => d.status === NotificationDeliveryStatus.SENT)).toBe(true);
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
