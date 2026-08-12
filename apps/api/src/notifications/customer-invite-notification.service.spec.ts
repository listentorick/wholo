import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationAudience, NotificationChannel, NotificationType } from '@prisma/client';
import { R2StorageService } from '../asset-images/r2-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { CustomerInviteNotificationService, CustomerInviteSentEventPayload } from './customer-invite-notification.service';

const DISTRIBUTOR_ID = 'dist-1';

function makeEvent(overrides: Partial<CustomerInviteSentEventPayload> = {}): CustomerInviteSentEventPayload {
  return {
    invitationId: 'inv-1',
    distributorId: DISTRIBUTOR_ID,
    email: 'buyer@winebar.example',
    distributorName: 'Vinos Direct',
    distributorEmail: null,
    distributorPhone: null,
    customerName: 'The Wine Bar',
    inviteUrl: 'http://localhost:3010/accept-invite?token=abc',
    expiresAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

describe('CustomerInviteNotificationService', () => {
  let service: CustomerInviteNotificationService;
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
        CustomerInviteNotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: R2StorageService, useValue: r2Storage },
        { provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get(CustomerInviteNotificationService);
  });

  it('creates a notification keyed by invitation id and a delivery for the invited email', async () => {
    await service.handleCustomerInviteSent(makeEvent());

    expect(prisma.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: 'CUSTOMER_INVITE:inv-1' },
        create: expect.objectContaining({
          type: NotificationType.CUSTOMER_INVITE_SENT,
          distributorId: DISTRIBUTOR_ID,
          dedupeKey: 'CUSTOMER_INVITE:inv-1',
          payload: expect.objectContaining({
            invitationId: 'inv-1',
            distributorName: 'Vinos Direct',
            customerName: 'The Wine Bar',
            recipientEmail: 'buyer@winebar.example',
            inviteUrl: 'http://localhost:3010/accept-invite?token=abc',
            expiresAt: '2026-08-19T00:00:00.000Z',
            distributorLogoUrl: null,
          }),
        }),
      }),
    );

    const created = prisma.notificationDelivery.createMany.mock.calls[0][0];
    expect(created.skipDuplicates).toBe(true);
    expect(created.data).toEqual([
      expect.objectContaining({
        notificationId: 'notif-1',
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.CUSTOMER,
        recipient: 'buyer@winebar.example',
      }),
    ]);
  });

  it('enqueues a delivery job keyed by delivery id', async () => {
    await service.handleCustomerInviteSent(makeEvent());

    expect(queue.add).toHaveBeenCalledWith('deliver', { deliveryId: 'del-1' }, { jobId: 'del-1' });
  });

  it('enqueues nothing on reprocessing when the delivery is already sent', async () => {
    prisma.notificationDelivery.createMany.mockResolvedValue({ count: 0 });
    prisma.notificationDelivery.findMany.mockResolvedValue([]);

    await service.handleCustomerInviteSent(makeEvent());

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('re-sends use a fresh invitation id, so distinct sends never collide on dedupeKey', async () => {
    await service.handleCustomerInviteSent(makeEvent({ invitationId: 'inv-1' }));
    await service.handleCustomerInviteSent(makeEvent({ invitationId: 'inv-2' }));

    expect(prisma.notification.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { dedupeKey: 'CUSTOMER_INVITE:inv-1' } }),
    );
    expect(prisma.notification.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { dedupeKey: 'CUSTOMER_INVITE:inv-2' } }),
    );
  });

  it('resolves the distributor logo URL via AssetImage when one is uploaded', async () => {
    prisma.assetImage.findFirst.mockResolvedValue({
      variants: { full: 'distributors/dist-1/branding/logo/img-1/full.webp', thumb: 'distributors/dist-1/branding/logo/img-1/thumb.webp' },
    });

    await service.handleCustomerInviteSent(makeEvent());

    expect(prisma.assetImage.findFirst).toHaveBeenCalledWith({
      where: { assetType: 'distributor-logo', entityId: DISTRIBUTOR_ID },
    });
    expect(r2Storage.getPublicUrl).toHaveBeenCalledWith('distributors/dist-1/branding/logo/img-1/full.webp');
    const payload = prisma.notification.upsert.mock.calls[0][0].create.payload;
    expect(payload.distributorLogoUrl).toBe('https://cdn.stocdup.com/distributors/dist-1/branding/logo/img-1/full.webp');
  });

  it('leaves distributorLogoUrl null when the distributor has no uploaded logo', async () => {
    await service.handleCustomerInviteSent(makeEvent());

    const payload = prisma.notification.upsert.mock.calls[0][0].create.payload;
    expect(payload.distributorLogoUrl).toBeNull();
    expect(r2Storage.getPublicUrl).not.toHaveBeenCalled();
  });
});
