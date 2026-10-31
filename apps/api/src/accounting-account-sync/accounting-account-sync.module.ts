import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { ACCOUNTING_ACCOUNT_SYNC_QUEUE } from '../queues/queue.constants';
import { AccountingAccountSyncProcessor } from './accounting-account-sync.processor';

// Worker-only, same as the other accounting pull modules — imported by
// WorkerModule, never AppModule.
@Module({
  imports: [BullModule.registerQueue({ name: ACCOUNTING_ACCOUNT_SYNC_QUEUE }), AccountingModule, AdminNotificationsModule],
  providers: [AccountingAccountSyncProcessor],
})
export class AccountingAccountSyncModule {}
