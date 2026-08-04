/**
 * Integration tests for order-placed notification idempotency, and for the
 * AdminNotification in-app-inbox fan-out it drives. The fan-out/org-scoping
 * tests are the real subject of the second describe block — a mocked-Prisma
 * unit test can confirm the right arguments were passed, but only a real
 * database can prove the organisationId filter actually excludes another
 * organisation's rows for the same user (CLAUDE.md multi-tenancy rule).
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
  Role,
} from '@prisma/client';
import { AdminNotificationsService } from '../src/admin-notifications/admin-notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../src/queues/queue.constants';
import { OrderPlacedNotificationService } from '../src/notifications/order-placed-notification.service';

const DIST = 'test-notif-dist';
const DIST_OTHER = 'test-notif-dist-other';
const CUST = 'test-notif-cust';
const USER = 'test-notif-user';
const ADMIN_USER = 'test-notif-admin';
const ORDER = 'test-notif-order';

describe('Order-placed notifications (integration)', () => {
  let prisma: PrismaService;
  let service: OrderPlacedNotificationService;
  let adminNotifications: AdminNotificationsService;
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
        AdminNotificationsService,
        PrismaService,
        { provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE), useValue: { add: queueAdd } },
      ],
    }).compile();

    prisma = module.get(PrismaService);
    service = module.get(OrderPlacedNotificationService);
    adminNotifications = module.get(AdminNotificationsService);

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
    await prisma.organisation.upsert({
      where: { id: DIST_OTHER },
      create: { id: DIST_OTHER, name: 'Notif Test Distributor Other', type: OrganisationType.DISTRIBUTOR },
      update: {},
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
    await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER,
        email: 'admin@notif-dist.test',
        keycloakId: 'kc-test-notif-admin',
        firstName: 'Notif',
        lastName: 'Admin',
      },
      update: {},
    });
    // ADMIN_USER holds a DISTRIBUTOR_ADMIN membership on BOTH orgs — the one
    // hard-to-fake setup that proves the org filter itself, not just "this
    // user happens to belong to only one org" (see notifyOrganisationAdmins
    // scoping tests below).
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: ADMIN_USER, organisationId: DIST } },
      create: { userId: ADMIN_USER, organisationId: DIST, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: ADMIN_USER, organisationId: DIST_OTHER } },
      create: { userId: ADMIN_USER, organisationId: DIST_OTHER, role: Role.DISTRIBUTOR_ADMIN },
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
    await prisma.adminNotification.deleteMany({ where: { organisationId: { in: [DIST, DIST_OTHER] } } });
  });

  afterAll(async () => {
    await prisma.notificationDelivery.deleteMany({ where: { notification: { distributorId: DIST } } });
    await prisma.notification.deleteMany({ where: { distributorId: DIST } });
    await prisma.adminNotification.deleteMany({ where: { organisationId: { in: [DIST, DIST_OTHER] } } });
    await prisma.order.deleteMany({ where: { id: ORDER } });
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.user.deleteMany({ where: { id: { in: [USER, ADMIN_USER] } } });
    await prisma.distributorSettings.deleteMany({ where: { distributorId: DIST } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST, DIST_OTHER, CUST] } } });
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

  describe('AdminNotification fan-out (org-scoped in-app inbox)', () => {
    it('notifies the distributor admin and scopes the row to that organisation', async () => {
      await service.handleOrderSubmitted(event);

      const rows = await prisma.adminNotification.findMany({ where: { organisationId: DIST } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ organisationId: DIST, userId: ADMIN_USER, type: 'ORDER_PLACED' });

      expect(await prisma.adminNotification.findMany({ where: { organisationId: DIST_OTHER } })).toHaveLength(0);
    });

    it("does not surface the notification through the same admin's OTHER organisation", async () => {
      await service.handleOrderSubmitted(event);

      // Real DB proof that organisationId is an enforced filter, not an
      // accident of "this user only belongs to one org": ADMIN_USER holds a
      // DISTRIBUTOR_ADMIN membership on DIST_OTHER too, yet list/unreadCount
      // scoped to DIST_OTHER must see nothing from the DIST event.
      expect(await adminNotifications.list(ADMIN_USER, DIST_OTHER)).toHaveLength(0);
      expect(await adminNotifications.unreadCount(ADMIN_USER, DIST_OTHER)).toBe(0);

      const ownOrgRows = await adminNotifications.list(ADMIN_USER, DIST);
      expect(ownOrgRows).toHaveLength(1);
      expect(await adminNotifications.unreadCount(ADMIN_USER, DIST)).toBe(1);
    });

    it('markRead scoped to the wrong organisation 404s instead of marking the row read', async () => {
      await service.handleOrderSubmitted(event);
      const [row] = await adminNotifications.list(ADMIN_USER, DIST);

      await expect(adminNotifications.markRead(ADMIN_USER, DIST_OTHER, row.id)).rejects.toThrow('Notification not found');

      const stillUnread = await prisma.adminNotification.findUnique({ where: { id: row.id } });
      expect(stillUnread!.readAt).toBeNull();
    });
  });
});
