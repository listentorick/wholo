import { Notification, NotificationChannel, NotificationDelivery } from '@prisma/client';

// A ChannelSender knows how to deliver one notification attempt over one
// channel. Adding a channel (e.g. WEB_PUSH via FCM) means implementing this
// interface and registering the sender under CHANNEL_SENDERS — the delivery
// pipeline, retries and idempotency are channel-agnostic.
export interface ChannelSender {
  readonly channel: NotificationChannel;
  send(delivery: NotificationDelivery, notification: Notification): Promise<void>;
}

export const CHANNEL_SENDERS = Symbol('CHANNEL_SENDERS');
