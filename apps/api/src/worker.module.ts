import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountingModule } from './accounting/accounting.module';
import { AccountingTokenRefreshScheduler } from './accounting/accounting-token-refresh.scheduler';
import { AccountingContactSyncScheduler } from './accounting/accounting-contact-sync.scheduler';
import { AccountingContactSyncModule } from './accounting-contact-sync/accounting-contact-sync.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OutboxModule } from './outbox/outbox.module';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { PrismaModule } from './prisma/prisma.module';
import { ACCOUNTING_CONTACT_SYNC_QUEUE, NOTIFICATIONS_QUEUE, XERO_SYNC_QUEUE } from './queues/queue.constants';
import { redisConnectionFromUrl } from './queues/redis-connection';
import { XeroSyncModule } from './xero-sync/xero-sync.module';

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
      { name: XERO_SYNC_QUEUE },
      { name: ACCOUNTING_CONTACT_SYNC_QUEUE },
    ),
    PrismaModule,
    MailModule,
    NotificationsModule,
    XeroSyncModule,
    AccountingModule,
    AccountingContactSyncModule,
    OutboxModule,
  ],
  providers: [OutboxPublisherService, AccountingTokenRefreshScheduler, AccountingContactSyncScheduler],
})
export class WorkerModule {}
