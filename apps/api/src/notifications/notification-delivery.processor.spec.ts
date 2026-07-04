import { NotificationChannel, NotificationDeliveryStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { ChannelSender } from './channel-senders/channel-sender.interface';
import { PrismaService } from '../prisma/prisma.service';

function makeJob(deliveryId = 'del-1'): Job<{ deliveryId: string }> {
  return { data: { deliveryId } } as Job<{ deliveryId: string }>;
}

describe('NotificationDeliveryProcessor', () => {
  let processor: NotificationDeliveryProcessor;
  let prisma: { notificationDelivery: { findUnique: jest.Mock; update: jest.Mock } };
  let emailSender: { channel: NotificationChannel; send: jest.Mock };

  const notification = { id: 'notif-1', payload: {} };

  function makeDelivery(overrides: Record<string, unknown> = {}) {
    return {
      id: 'del-1',
      channel: NotificationChannel.EMAIL,
      status: NotificationDeliveryStatus.PENDING,
      recipient: 'x@example.com',
      notification,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      notificationDelivery: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    emailSender = { channel: NotificationChannel.EMAIL, send: jest.fn().mockResolvedValue(undefined) };
    processor = new NotificationDeliveryProcessor(
      prisma as unknown as PrismaService,
      [emailSender as unknown as ChannelSender],
    );
  });

  it('sends via the channel sender and marks the delivery SENT', async () => {
    const delivery = makeDelivery();
    prisma.notificationDelivery.findUnique.mockResolvedValue(delivery);

    await processor.process(makeJob());

    expect(emailSender.send).toHaveBeenCalledWith(delivery, notification);
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-1' },
        data: expect.objectContaining({ status: NotificationDeliveryStatus.SENT }),
      }),
    );
  });

  it('does nothing for deliveries that are already SENT', async () => {
    prisma.notificationDelivery.findUnique.mockResolvedValue(
      makeDelivery({ status: NotificationDeliveryStatus.SENT }),
    );

    await processor.process(makeJob());

    expect(emailSender.send).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.update).not.toHaveBeenCalled();
  });

  it('ignores jobs whose delivery row no longer exists', async () => {
    prisma.notificationDelivery.findUnique.mockResolvedValue(null);

    await expect(processor.process(makeJob('gone'))).resolves.toBeUndefined();
    expect(prisma.notificationDelivery.update).not.toHaveBeenCalled();
  });

  it('marks FAILED without retrying when no sender exists for the channel', async () => {
    prisma.notificationDelivery.findUnique.mockResolvedValue(
      makeDelivery({ channel: NotificationChannel.WEB_PUSH }),
    );

    await expect(processor.process(makeJob())).resolves.toBeUndefined();

    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: NotificationDeliveryStatus.FAILED,
          errorMessage: expect.stringContaining('WEB_PUSH'),
        }),
      }),
    );
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('marks FAILED with the error and rethrows so BullMQ retries', async () => {
    prisma.notificationDelivery.findUnique.mockResolvedValue(makeDelivery());
    emailSender.send.mockRejectedValue(new Error('SMTP connection refused'));

    await expect(processor.process(makeJob())).rejects.toThrow('SMTP connection refused');

    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: NotificationDeliveryStatus.FAILED,
          errorMessage: 'SMTP connection refused',
        }),
      }),
    );
  });
});
