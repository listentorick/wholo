import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationAudience, NotificationChannel, NotificationType } from '@prisma/client';
import { R2StorageService } from '../asset-images/r2-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { DeliveryOutcomeNotificationService } from './delivery-outcome-notification.service';
import { OrderDeliveryOutcomeEventPayload } from './notification-payload';

const DISTRIBUTOR_ID = 'dist-1';
const CUSTOMER_ID = 'cust-1';
const USER_ID = 'user-1';

function makeEvent(overrides: Partial<OrderDeliveryOutcomeEventPayload> = {}): OrderDeliveryOutcomeEventPayload {
  return {
    orderId: 'order-1',
    distributorId: DISTRIBUTOR_ID,
    traderCustomerId: CUSTOMER_ID,
    placedByUserId: USER_ID,
    isOrderedByDelegate: false,
    orderNumber: 'ORD-2026-00042',
    driverName: 'Alex Turner',
    recordedAt: '2026-08-26T09:00:00.000Z',
    unableReason: null,
    ...overrides,
  };
}

describe('DeliveryOutcomeNotificationService', () => {
  let service: DeliveryOutcomeNotificationService;
  let prisma: {
    organisation: { findUnique: jest.Mock };
    distributorSettings: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    notification: { upsert: jest.Mock };
    notificationDelivery: { createMany: jest.Mock; findMany: jest.Mock };
    assetImage: { findFirst: jest.Mock };
  };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      organisation: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) => {
          if (where.id === DISTRIBUTOR_ID) {
            return Promise.resolve({ name: 'Vinos Direct', email: 'office@vinos.example', phone: '(03) 9123 4567', slug: 'vinos-direct' });
          }
          if (where.id === CUSTOMER_ID) return Promise.resolve({ name: 'The Wine Bar', email: 'org@winebar.example' });
          return Promise.resolve(null);
        }),
      },
      distributorSettings: {
        findUnique: jest.fn().mockResolvedValue({ orderNotificationEmails: ['orders@vinos.example'] }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'buyer@winebar.example' }) },
      notification: { upsert: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
      notificationDelivery: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue([{ id: 'del-1' }, { id: 'del-2' }]),
      },
      assetImage: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    queue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryOutcomeNotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE), useValue: queue },
        { provide: R2StorageService, useValue: { getPublicUrl: jest.fn((key: string) => `https://cdn.stocdup.com/${key}`) } },
      ],
    }).compile();

    service = module.get(DeliveryOutcomeNotificationService);
  });

  describe('handleOrderDelivered', () => {
    it('creates a notification deduped by ORDER_DELIVERED:<orderId>, with driver name and no unable-reason', async () => {
      await service.handleOrderDelivered(makeEvent());

      expect(prisma.notification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dedupeKey: 'ORDER_DELIVERED:order-1' },
          create: expect.objectContaining({
            type: NotificationType.ORDER_DELIVERED,
            distributorId: DISTRIBUTOR_ID,
            orderId: 'order-1',
            payload: expect.objectContaining({
              orderNumber: 'ORD-2026-00042',
              distributorName: 'Vinos Direct',
              distributorSlug: 'vinos-direct',
              customerName: 'The Wine Bar',
              driverName: 'Alex Turner',
              unableReason: null,
            }),
          }),
        }),
      );
    });

    it('creates deliveries for the distributor notification emails and the placing user', async () => {
      await service.handleOrderDelivered(makeEvent());

      const created = prisma.notificationDelivery.createMany.mock.calls[0][0];
      expect(created.skipDuplicates).toBe(true);
      expect(created.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ audience: NotificationAudience.DISTRIBUTOR, channel: NotificationChannel.EMAIL, recipient: 'orders@vinos.example' }),
          expect.objectContaining({ audience: NotificationAudience.CUSTOMER, recipient: 'buyer@winebar.example' }),
        ]),
      );
    });

    it('enqueues one delivery job per pending delivery, keyed by delivery id', async () => {
      await service.handleOrderDelivered(makeEvent());

      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledWith('deliver', { deliveryId: 'del-1' }, { jobId: 'del-1' });
    });

    it('sends the customer notification to the organisation email for delegate-placed orders', async () => {
      await service.handleOrderDelivered(makeEvent({ isOrderedByDelegate: true }));

      const created = prisma.notificationDelivery.createMany.mock.calls[0][0];
      const customer = created.data.find((d: { audience: string }) => d.audience === NotificationAudience.CUSTOMER);
      expect(customer.recipient).toBe('org@winebar.example');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('falls back to the distributor organisation email when no notification emails are configured', async () => {
      prisma.distributorSettings.findUnique.mockResolvedValue({ orderNotificationEmails: [] });

      await service.handleOrderDelivered(makeEvent());

      const created = prisma.notificationDelivery.createMany.mock.calls[0][0];
      const distributorRecipients = created.data
        .filter((d: { audience: string }) => d.audience === NotificationAudience.DISTRIBUTOR)
        .map((d: { recipient: string }) => d.recipient);
      expect(distributorRecipients).toEqual(['office@vinos.example']);
    });

    it('creates nothing when no recipients can be resolved at all', async () => {
      prisma.distributorSettings.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organisation.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === DISTRIBUTOR_ID) return Promise.resolve({ name: 'Vinos Direct', email: null });
        return Promise.resolve({ name: 'The Wine Bar', email: null });
      });

      await service.handleOrderDelivered(makeEvent());

      expect(prisma.notification.upsert).not.toHaveBeenCalled();
      expect(prisma.notificationDelivery.createMany).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('creates nothing when the distributor organisation no longer exists', async () => {
      prisma.organisation.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === CUSTOMER_ID ? { name: 'The Wine Bar', email: 'org@winebar.example' } : null),
      );

      await service.handleOrderDelivered(makeEvent());

      expect(prisma.notification.upsert).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('resolves the distributor logo URL via AssetImage when one is uploaded', async () => {
      prisma.assetImage.findFirst.mockResolvedValue({ variants: { full: 'distributors/dist-1/branding/logo/img-1/full.webp' } });

      await service.handleOrderDelivered(makeEvent());

      const payload = prisma.notification.upsert.mock.calls[0][0].create.payload;
      expect(payload.distributorLogoUrl).toBe('https://cdn.stocdup.com/distributors/dist-1/branding/logo/img-1/full.webp');
    });
  });

  describe('handleOrderDeliveryFailed', () => {
    it('creates a notification deduped by ORDER_DELIVERY_FAILED:<orderId>, carrying the unable reason', async () => {
      await service.handleOrderDeliveryFailed(makeEvent({ unableReason: 'CUSTOMER_REFUSED' }));

      expect(prisma.notification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dedupeKey: 'ORDER_DELIVERY_FAILED:order-1' },
          create: expect.objectContaining({
            type: NotificationType.ORDER_DELIVERY_FAILED,
            payload: expect.objectContaining({ unableReason: 'CUSTOMER_REFUSED' }),
          }),
        }),
      );
    });

    it('is a distinct dedupe key from the Delivered notification for the same order — reprocessing one never clobbers the other', async () => {
      await service.handleOrderDelivered(makeEvent());
      await service.handleOrderDeliveryFailed(makeEvent({ unableReason: 'CUSTOMER_REFUSED' }));

      const keys = prisma.notification.upsert.mock.calls.map((call) => call[0].where.dedupeKey);
      expect(keys).toEqual(['ORDER_DELIVERED:order-1', 'ORDER_DELIVERY_FAILED:order-1']);
    });
  });
});
