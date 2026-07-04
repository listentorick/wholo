import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NOTIFICATION_DELIVERY_QUEUE, NOTIFICATIONS_QUEUE } from '../queues/queue.constants';
import { CHANNEL_SENDERS } from './channel-senders/channel-sender.interface';
import { EmailChannelSender } from './channel-senders/email-channel.sender';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { NotificationsProcessor } from './notifications.processor';
import { OrderPlacedNotificationService } from './order-placed-notification.service';

// Worker-only module: registers the queue processors. Do not import into the
// API's AppModule — the API process only writes outbox rows (ADR-034/047).
@Module({
  imports: [
    BullModule.registerQueue(
      { name: NOTIFICATIONS_QUEUE },
      {
        name: NOTIFICATION_DELIVERY_QUEUE,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
          // Bounded retention (not `true`): completed jobs carry the jobId
          // dedupe records that stop re-published events re-sending emails.
          removeOnComplete: { count: 1000 },
          removeOnFail: false,
        },
      },
    ),
  ],
  providers: [
    OrderPlacedNotificationService,
    NotificationsProcessor,
    NotificationDeliveryProcessor,
    EmailChannelSender,
    {
      provide: CHANNEL_SENDERS,
      useFactory: (email: EmailChannelSender) => [email],
      inject: [EmailChannelSender],
    },
  ],
  exports: [OrderPlacedNotificationService],
})
export class NotificationsModule {}
