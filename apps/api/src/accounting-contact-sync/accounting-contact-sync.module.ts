import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ACCOUNTING_CONTACT_SYNC_QUEUE } from '../queues/queue.constants';
import { AccountingContactSyncProcessor } from './accounting-contact-sync.processor';

// Worker-only — imported by WorkerModule, never AppModule (the HTTP API
// process has no BullMQ wiring, by deliberate rule).
@Module({
  imports: [BullModule.registerQueue({ name: ACCOUNTING_CONTACT_SYNC_QUEUE }), AccountingModule],
  providers: [AccountingContactSyncProcessor],
})
export class AccountingContactSyncModule {}
