import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ACCOUNTING_TAX_TYPE_SYNC_QUEUE } from '../queues/queue.constants';
import { AccountingTaxTypeSyncProcessor } from './accounting-tax-type-sync.processor';

// Worker-only, same as AccountingContactSyncModule/AccountingProductSyncModule
// — imported by WorkerModule, never AppModule.
@Module({
  imports: [BullModule.registerQueue({ name: ACCOUNTING_TAX_TYPE_SYNC_QUEUE }), AccountingModule],
  providers: [AccountingTaxTypeSyncProcessor],
})
export class AccountingTaxTypeSyncModule {}
