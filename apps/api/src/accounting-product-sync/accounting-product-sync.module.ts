import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ACCOUNTING_PRODUCT_SYNC_QUEUE } from '../queues/queue.constants';
import { AccountingProductSyncProcessor } from './accounting-product-sync.processor';

// Worker-only, same as AccountingContactSyncModule — imported by
// WorkerModule, never AppModule (the HTTP API process has no BullMQ wiring,
// by deliberate rule).
@Module({
  imports: [BullModule.registerQueue({ name: ACCOUNTING_PRODUCT_SYNC_QUEUE }), AccountingModule],
  providers: [AccountingProductSyncProcessor],
})
export class AccountingProductSyncModule {}
