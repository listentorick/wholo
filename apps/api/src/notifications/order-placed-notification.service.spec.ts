import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  NotificationAudience,
  NotificationChannel,
  OrderAcceptanceMode,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { OrderPlacedNotificationService, OrderSubmittedEventPayload } from './order-placed-notification.service';

const DISTRIBUTOR_ID = 'dist-1';
const CUSTOMER_ID = 'cust-1';
const USER_ID = 'user-1';

function makeEvent(overrides: Partial<OrderSubmittedEventPayload> = {}): OrderSubmittedEventPayload {
  return {
    orderId: 'order-1',
    distributorId: DISTRIBUTOR_ID,
    traderCustomerId: CUSTOMER_ID,
    placedByUserId: USER_ID,
    isOrderedByDelegate: false,
    acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL,
    orderNumber: 'ORD-2026-00042',
    ...overrides,
  };
}

describe('OrderPlacedNotificationService', () => {
  let service: OrderPlacedNotificationService;
  let prisma: {
    organisation: { findUnique: jest.Mock };
    distributorSettings: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    notification: { upsert: jest.Mock };
    notificationDelivery: { createMany: jest.Mock; findMany: jest.Mock };
  };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      organisation: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) => {
          if (where.id === DISTRIBUTOR_ID) {
            return Promise.resolve({ name: 'Vinos Direct', email: 'office@vinos.example' });
          }
          if (where.id === CUSTOMER_ID) {
            return Promise.resolve({ name: 'The Wine Bar', email: 'org@winebar.example' });
          }
          return Promise.resolve(null);
        }),
      },
      distributorSettings: {
        findUnique: jest.fn().mockResolvedValue({ orderNotificationEmails: ['orders@vinos.example', 'ops@vinos.example'] }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'buyer@winebar.example' }) },
      notification: { upsert: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
      notificationDelivery: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
        findMany: jest.fn().mockResolvedValue([{ id: 'del-1' }, { id: 'del-2' }, { id: 'del-3' }]),
      },
    };
    queue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderPlacedNotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get(OrderPlacedNotificationService);
  });

  it('creates a notification and deliveries for configured distributor emails plus the placing user', async () => {
    await service.handleOrderSubmitted(makeEvent());

    expect(prisma.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: 'ORDER_PLACED:order-1' },
        create: expect.objectContaining({
          distributorId: DISTRIBUTOR_ID,
          orderId: 'order-1',
          payload: expect.objectContaining({
            orderNumber: 'ORD-2026-00042',
            distributorName: 'Vinos Direct',
            customerName: 'The Wine Bar',
            autoAccepted: false,
          }),
        }),
      }),
    );

    const created = prisma.notificationDelivery.createMany.mock.calls[0][0];
    expect(created.skipDuplicates).toBe(true);
    expect(created.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          audience: NotificationAudience.DISTRIBUTOR,
          channel: NotificationChannel.EMAIL,
          recipient: 'orders@vinos.example',
        }),
        expect.objectContaining({ audience: NotificationAudience.DISTRIBUTOR, recipient: 'ops@vinos.example' }),
        expect.objectContaining({ audience: NotificationAudience.CUSTOMER, recipient: 'buyer@winebar.example' }),
      ]),
    );
    expect(created.data).toHaveLength(3);
  });

  it('enqueues one delivery job per pending delivery, keyed by delivery id', async () => {
    await service.handleOrderSubmitted(makeEvent());

    expect(queue.add).toHaveBeenCalledTimes(3);
    expect(queue.add).toHaveBeenCalledWith('deliver', { deliveryId: 'del-1' }, { jobId: 'del-1' });
    expect(queue.add).toHaveBeenCalledWith('deliver', { deliveryId: 'del-2' }, { jobId: 'del-2' });
  });

  it('falls back to the distributor organisation email when no notification emails are configured', async () => {
    prisma.distributorSettings.findUnique.mockResolvedValue({ orderNotificationEmails: [] });

    await service.handleOrderSubmitted(makeEvent());

    const created = prisma.notificationDelivery.createMany.mock.calls[0][0];
    const distributorRecipients = created.data
      .filter((d: { audience: string }) => d.audience === NotificationAudience.DISTRIBUTOR)
      .map((d: { recipient: string }) => d.recipient);
    expect(distributorRecipients).toEqual(['office@vinos.example']);
  });

  it('falls back to the organisation email when the event has no placedByUserId (pre-ADR-047 replays)', async () => {
    await service.handleOrderSubmitted(makeEvent({ placedByUserId: undefined as unknown as string }));

    const created = prisma.notificationDelivery.createMany.mock.calls[0][0];
    const customer = created.data.find((d: { audience: string }) => d.audience === NotificationAudience.CUSTOMER);
    expect(customer.recipient).toBe('org@winebar.example');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('sends the customer notification to the organisation email for delegate-placed orders', async () => {
    await service.handleOrderSubmitted(makeEvent({ isOrderedByDelegate: true }));

    const created = prisma.notificationDelivery.createMany.mock.calls[0][0];
    const customer = created.data.find((d: { audience: string }) => d.audience === NotificationAudience.CUSTOMER);
    expect(customer.recipient).toBe('org@winebar.example');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('marks the notification payload autoAccepted for AUTO_ON_SUBMISSION orders', async () => {
    await service.handleOrderSubmitted(makeEvent({ acceptanceModeSnapshot: OrderAcceptanceMode.AUTO_ON_SUBMISSION }));

    expect(prisma.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ payload: expect.objectContaining({ autoAccepted: true }) }),
      }),
    );
  });

  it('still notifies the customer when the distributor has no resolvable recipients', async () => {
    prisma.distributorSettings.findUnique.mockResolvedValue(null);
    prisma.organisation.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === DISTRIBUTOR_ID) return Promise.resolve({ name: 'Vinos Direct', email: null });
      return Promise.resolve({ name: 'The Wine Bar', email: 'org@winebar.example' });
    });

    await service.handleOrderSubmitted(makeEvent());

    const created = prisma.notificationDelivery.createMany.mock.calls[0][0];
    expect(created.data).toHaveLength(1);
    expect(created.data[0].audience).toBe(NotificationAudience.CUSTOMER);
  });

  it('creates nothing when no recipients can be resolved at all', async () => {
    prisma.distributorSettings.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organisation.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === DISTRIBUTOR_ID) return Promise.resolve({ name: 'Vinos Direct', email: null });
      return Promise.resolve({ name: 'The Wine Bar', email: null });
    });

    await service.handleOrderSubmitted(makeEvent());

    expect(prisma.notification.upsert).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.createMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('creates nothing when the distributor organisation no longer exists', async () => {
    prisma.organisation.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === CUSTOMER_ID ? { name: 'The Wine Bar', email: 'org@winebar.example' } : null),
    );

    await service.handleOrderSubmitted(makeEvent());

    expect(prisma.notification.upsert).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues nothing on reprocessing when all deliveries are already sent', async () => {
    prisma.notificationDelivery.createMany.mockResolvedValue({ count: 0 });
    prisma.notificationDelivery.findMany.mockResolvedValue([]);

    await service.handleOrderSubmitted(makeEvent());

    expect(queue.add).not.toHaveBeenCalled();
  });
});
