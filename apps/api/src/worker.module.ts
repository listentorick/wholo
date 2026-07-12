import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountingModule } from './accounting/accounting.module';
import { AccountingTokenRefreshScheduler } from './accounting/accounting-token-refresh.scheduler';
import { AccountingContactSyncScheduler } from './accounting/accounting-contact-sync.scheduler';
import { AccountingProductSyncScheduler } from './accounting/accounting-product-sync.scheduler';
import { AccountingContactSyncModule } from './accounting-contact-sync/accounting-contact-sync.module';
import { AccountingInvoiceExportModule } from './accounting-invoice-export/accounting-invoice-export.module';
import { AccountingProductSyncModule } from './accounting-product-sync/accounting-product-sync.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OutboxModule } from './outbox/outbox.module';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { PrismaModule } from './prisma/prisma.module';
import {
  ACCOUNTING_CONTACT_SYNC_QUEUE,
  ACCOUNTING_INVOICE_EXPORT_QUEUE,
  ACCOUNTING_PRODUCT_SYNC_QUEUE,
  NOTIFICATIONS_QUEUE,
} from './queues/queue.constants';
import { redisConnectionFromUrl } from './queues/redis-connection';

// Root module for the wholo-worker process (dist/worker.js) — the single
// replica that relays outbox events onto BullMQ and runs all queue consumers.
// The HTTP API process (AppModule) has no queue wiring at all.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnectionFromUrl(config.get<string>('REDIS_URL', 'redis://localhost:6379')),
      }),
    }),
    BullModule.registerQueue(
      { name: NOTIFICATIONS_QUEUE },
      {
        name: ACCOUNTING_INVOICE_EXPORT_QUEUE,
        // These options must live on THIS registration: the outbox publisher's
        // @InjectQueue resolves this queue provider, and queue.add picks up
        // defaultJobOptions from the Queue instance (the publisher only sets
        // jobId). Backoff is generous — the usual transient cause is a Xero
        // rate limit, not a blip.
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: false,
        },
      },
      { name: ACCOUNTING_CONTACT_SYNC_QUEUE },
      { name: ACCOUNTING_PRODUCT_SYNC_QUEUE },
    ),
    PrismaModule,
    MailModule,
    NotificationsModule,
    AccountingInvoiceExportModule,
    AccountingModule,
    AccountingContactSyncModule,
    AccountingProductSyncModule,
    OutboxModule,
  ],
  providers: [
    OutboxPublisherService,
    AccountingTokenRefreshScheduler,
    AccountingContactSyncScheduler,
    AccountingProductSyncScheduler,
  ],
})
export class WorkerModule {}
