import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { ACCOUNTING_BULK_IMPORT_QUEUE } from '../queues/queue.constants';
import { AccountingBulkImportProcessor } from './accounting-bulk-import.processor';

// Worker-only, same as the sync/invoice-export modules — imported by
// WorkerModule, never AppModule (the HTTP API process has no BullMQ wiring,
// by deliberate rule).
@Module({
  imports: [
    BullModule.registerQueue({ name: ACCOUNTING_BULK_IMPORT_QUEUE }),
    AccountingModule,
    AdminNotificationsModule,
  ],
  providers: [AccountingBulkImportProcessor],
})
export class AccountingBulkImportModule {}
