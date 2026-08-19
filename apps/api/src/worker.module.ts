import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountingModule } from './accounting/accounting.module';
import { AccountingTokenRefreshScheduler } from './accounting/accounting-token-refresh.scheduler';
import { AccountingContactSyncScheduler } from './accounting/accounting-contact-sync.scheduler';
import { AccountingProductSyncScheduler } from './accounting/accounting-product-sync.scheduler';
import { AccountingTaxTypeSyncScheduler } from './accounting/accounting-tax-type-sync.scheduler';
import { AccountingBulkImportModule } from './accounting-bulk-import/accounting-bulk-import.module';
import { AccountingContactSyncModule } from './accounting-contact-sync/accounting-contact-sync.module';
import { AccountingInvoiceExportModule } from './accounting-invoice-export/accounting-invoice-export.module';
import { AccountingProductSyncModule } from './accounting-product-sync/accounting-product-sync.module';
import { AccountingTaxTypeSyncModule } from './accounting-tax-type-sync/accounting-tax-type-sync.module';
import { AnalyticsFactsModule } from './analytics-facts/analytics-facts.module';
import { DeliveryRunAllocationModule } from './delivery-run-allocation/delivery-run-allocation.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OutboxModule } from './outbox/outbox.module';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { PrismaModule } from './prisma/prisma.module';
import {
  ACCOUNTING_BULK_IMPORT_QUEUE,
  ACCOUNTING_CONTACT_SYNC_QUEUE,
  ACCOUNTING_INVOICE_EXPORT_QUEUE,
  ACCOUNTING_PRODUCT_SYNC_QUEUE,
  ACCOUNTING_TAX_TYPE_SYNC_QUEUE,
  ANALYTICS_FACTS_QUEUE,
  DELIVERY_RUN_ALLOCATION_QUEUE,
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
      { name: ACCOUNTING_TAX_TYPE_SYNC_QUEUE },
      {
        name: ACCOUNTING_BULK_IMPORT_QUEUE,
        // Local DB operations per item, not external API calls — same
        // reasoning as ANALYTICS_FACTS_QUEUE's backoff, just enough retries
        // to ride out a transient DB blip on a systemic (job-level) failure.
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: false,
        },
      },
      {
        name: ANALYTICS_FACTS_QUEUE,
        // Fact writes are local DB operations, not external API calls — no
        // rate-limit-driven backoff needed, just enough retries to ride out a
        // transient DB blip.
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: false,
        },
      },
      {
        name: DELIVERY_RUN_ALLOCATION_QUEUE,
        // Local DB operations only (route lookup, run upsert) — same backoff
        // reasoning as ANALYTICS_FACTS_QUEUE, not the generous external-API
        // backoff the invoice export needs.
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: false,
        },
      },
    ),
    PrismaModule,
    MailModule,
    NotificationsModule,
    AccountingBulkImportModule,
    AccountingInvoiceExportModule,
    AccountingModule,
    AccountingContactSyncModule,
    AccountingProductSyncModule,
    AccountingTaxTypeSyncModule,
    AnalyticsFactsModule,
    DeliveryRunAllocationModule,
    OutboxModule,
    HealthModule,
  ],
  providers: [
    OutboxPublisherService,
    AccountingTokenRefreshScheduler,
    AccountingContactSyncScheduler,
    AccountingProductSyncScheduler,
    AccountingTaxTypeSyncScheduler,
  ],
})
export class WorkerModule {}
