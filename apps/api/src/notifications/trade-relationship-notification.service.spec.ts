import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationAudience, NotificationChannel, NotificationType } from '@prisma/client';
import { R2StorageService } from '../asset-images/r2-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { TradeRelationshipEventPayload, TradeRelationshipNotificationService } from './trade-relationship-notification.service';

const DISTRIBUTOR_ID = 'dist-1';

function makeEvent(overrides: Partial<TradeRelationshipEventPayload> = {}): TradeRelationshipEventPayload {
  return {
    relationshipId: 'rel-1',
    distributorId: DISTRIBUTOR_ID,
    customerId: 'cust-1',
    customerName: 'The Wine Bar',
    customerEmail: 'buyer@winebar.example',
    distributorName: 'Vinos Direct',
    distributorEmail: null,
    distributorPhone: null,
    portalUrl: 'http://localhost:3010/vinos-direct',
    ...overrides,
  };
}

describe('TradeRelationshipNotificationService', () => {
  let service: TradeRelationshipNotificationService;
  let prisma: {
    notification: { upsert: jest.Mock };
    notificationDelivery: { createMany: jest.Mock; findMany: jest.Mock };
    assetImage: { findFirst: jest.Mock };
  };
  let r2Storage: { getPublicUrl: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      notification: { upsert: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
      notificationDelivery: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{ id: 'del-1' }]),
      },
      assetImage: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    r2Storage = { getPublicUrl: jest.fn((key: string) => `https://cdn.stocdup.com/${key}`) };
    queue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradeRelationshipNotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: R2StorageService, useValue: r2Storage },
        { provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get(TradeRelationshipNotificationService);
  });

  const handlers = [
    { name: 'handleTradeRelationshipRequestAccepted', type: NotificationType.TRADE_RELATIONSHIP_REQUEST_ACCEPTED, label: 'ACCEPTED' },
    { name: 'handleTradeRelationshipRequestDeclined', type: NotificationType.TRADE_RELATIONSHIP_REQUEST_DECLINED, label: 'DECLINED' },
    { name: 'handleTradeRelationshipSuspended', type: NotificationType.TRADE_RELATIONSHIP_SUSPENDED, label: 'SUSPENDED' },
    { name: 'handleTradeRelationshipUnsuspended', type: NotificationType.TRADE_RELATIONSHIP_UNSUSPENDED, label: 'UNSUSPENDED' },
    { name: 'handleTradeRelationshipActivated', type: NotificationType.TRADE_RELATIONSHIP_ACTIVATED, label: 'ACTIVATED' },
  ] as const;

  for (const { name, type, label } of handlers) {
    it(`${name}: creates a notification keyed by event id and a delivery for the customer's email`, async () => {
      await (service[name] as (e: TradeRelationshipEventPayload, id: string) => Promise<void>)(makeEvent(), 'evt-1');

      expect(prisma.notification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dedupeKey: `TRADE_RELATIONSHIP:${label}:evt-1` },
          create: expect.objectContaining({
            type,
            distributorId: DISTRIBUTOR_ID,
            dedupeKey: `TRADE_RELATIONSHIP:${label}:evt-1`,
            payload: expect.objectContaining({
              relationshipId: 'rel-1',
              distributorName: 'Vinos Direct',
              portalUrl: 'http://localhost:3010/vinos-direct',
            }),
          }),
        }),
      );

      const created = prisma.notificationDelivery.createMany.mock.calls[0][0];
      expect(created.data).toEqual([
        expect.objectContaining({
          notificationId: 'notif-1',
          channel: NotificationChannel.EMAIL,
          audience: NotificationAudience.CUSTOMER,
          recipient: 'buyer@winebar.example',
        }),
      ]);
      expect(queue.add).toHaveBeenCalledWith('deliver', { deliveryId: 'del-1' }, { jobId: 'del-1' });
    });
  }

  it('does nothing when the relationship has no customer email', async () => {
    await service.handleTradeRelationshipSuspended(makeEvent({ customerEmail: null }), 'evt-1');

    expect(prisma.notification.upsert).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  // The load-bearing correctness test: unlike an invite (one row per invitation),
  // the same relationship can be suspended and unsuspended repeatedly. Deduping
  // on relationshipId alone (the invite pattern) would silently swallow every
  // occurrence after the first — dedupe must be keyed on the outbox event's own
  // id instead.
  it('sends a fresh notification for each occurrence on the same relationship, keyed by outbox event id', async () => {
    await service.handleTradeRelationshipSuspended(makeEvent(), 'evt-1');
    await service.handleTradeRelationshipUnsuspended(makeEvent(), 'evt-2');
    await service.handleTradeRelationshipSuspended(makeEvent(), 'evt-3');

    expect(prisma.notification.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { dedupeKey: 'TRADE_RELATIONSHIP:SUSPENDED:evt-1' } }),
    );
    expect(prisma.notification.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { dedupeKey: 'TRADE_RELATIONSHIP:UNSUSPENDED:evt-2' } }),
    );
    expect(prisma.notification.upsert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ where: { dedupeKey: 'TRADE_RELATIONSHIP:SUSPENDED:evt-3' } }),
    );
    expect(prisma.notification.upsert).toHaveBeenCalledTimes(3);
  });

  it('reprocessing the same outbox event id is idempotent (upsert, not create)', async () => {
    await service.handleTradeRelationshipSuspended(makeEvent(), 'evt-1');
    await service.handleTradeRelationshipSuspended(makeEvent(), 'evt-1');

    expect(prisma.notification.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { dedupeKey: 'TRADE_RELATIONSHIP:SUSPENDED:evt-1' } }),
    );
    expect(prisma.notification.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { dedupeKey: 'TRADE_RELATIONSHIP:SUSPENDED:evt-1' } }),
    );
  });

  it('enqueues nothing on reprocessing when the delivery is already sent', async () => {
    prisma.notificationDelivery.createMany.mockResolvedValue({ count: 0 });
    prisma.notificationDelivery.findMany.mockResolvedValue([]);

    await service.handleTradeRelationshipSuspended(makeEvent(), 'evt-1');

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('resolves the distributor logo URL via AssetImage when one is uploaded', async () => {
    prisma.assetImage.findFirst.mockResolvedValue({
      variants: { full: 'distributors/dist-1/branding/logo/img-1/full.webp', thumb: 'distributors/dist-1/branding/logo/img-1/thumb.webp' },
    });

    await service.handleTradeRelationshipSuspended(makeEvent(), 'evt-1');

    expect(prisma.assetImage.findFirst).toHaveBeenCalledWith({
      where: { assetType: 'distributor-logo', entityId: DISTRIBUTOR_ID },
    });
    const payload = prisma.notification.upsert.mock.calls[0][0].create.payload;
    expect(payload.distributorLogoUrl).toBe('https://cdn.stocdup.com/distributors/dist-1/branding/logo/img-1/full.webp');
  });

  it('leaves distributorLogoUrl null when the distributor has no uploaded logo', async () => {
    await service.handleTradeRelationshipSuspended(makeEvent(), 'evt-1');

    const payload = prisma.notification.upsert.mock.calls[0][0].create.payload;
    expect(payload.distributorLogoUrl).toBeNull();
    expect(r2Storage.getPublicUrl).not.toHaveBeenCalled();
  });

  it('carries the distributor contact details through onto the notification payload', async () => {
    await service.handleTradeRelationshipSuspended(
      makeEvent({ distributorEmail: 'orders@vinos.example', distributorPhone: '(03) 9123 4567' }),
      'evt-1',
    );

    const payload = prisma.notification.upsert.mock.calls[0][0].create.payload;
    expect(payload.distributorEmail).toBe('orders@vinos.example');
    expect(payload.distributorPhone).toBe('(03) 9123 4567');
  });
});
