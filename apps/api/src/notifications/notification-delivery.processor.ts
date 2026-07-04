import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationDeliveryStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { CHANNEL_SENDERS, ChannelSender } from './channel-senders/channel-sender.interface';

export interface DeliveryJobData {
  deliveryId: string;
}

@Processor(NOTIFICATION_DELIVERY_QUEUE)
export class NotificationDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDeliveryProcessor.name);
  private readonly senders: Map<NotificationChannel, ChannelSender>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_SENDERS) channelSenders: ChannelSender[],
  ) {
    super();
    this.senders = new Map(channelSenders.map((s) => [s.channel, s]));
  }

  async process(job: Job<DeliveryJobData>): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: job.data.deliveryId },
      include: { notification: true },
    });

    if (!delivery) {
      this.logger.warn(`Delivery ${job.data.deliveryId} not found; ignoring job`);
      return;
    }
    if (delivery.status === NotificationDeliveryStatus.SENT) {
      return;
    }

    const sender = this.senders.get(delivery.channel);
    if (!sender) {
      // A delivery row for a channel we cannot send is a config error, not a
      // transient failure — mark FAILED and complete the job (no retry).
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: NotificationDeliveryStatus.FAILED,
          failedAt: new Date(),
          errorMessage: `No sender registered for channel ${delivery.channel}`,
        },
      });
      this.logger.error(`No sender registered for channel ${delivery.channel} (delivery ${delivery.id})`);
      return;
    }

    await this.prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { attemptCount: { increment: 1 } },
    });

    try {
      await sender.send(delivery, delivery.notification);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: NotificationDeliveryStatus.SENT, sentAt: new Date(), errorMessage: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: NotificationDeliveryStatus.FAILED,
          failedAt: new Date(),
          errorMessage: message,
        },
      });
      // Rethrow so BullMQ retries with backoff; a later success flips FAILED → SENT.
      throw err;
    }
  }
}
