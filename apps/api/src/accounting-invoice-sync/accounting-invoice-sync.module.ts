import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { IngestionRunModule } from '../ingestion/ingestion-run.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ACCOUNTING_INVOICE_SYNC_QUEUE } from '../queues/queue.constants';
import { AccountingInvoiceSyncProcessor } from './accounting-invoice-sync.processor';

// Worker-only, same as the other accounting sync modules — imported by
// WorkerModule, never AppModule.
@Module({
  imports: [BullModule.registerQueue({ name: ACCOUNTING_INVOICE_SYNC_QUEUE }), AccountingModule, IngestionRunModule, OutboxModule],
  providers: [AccountingInvoiceSyncProcessor],
})
export class AccountingInvoiceSyncModule {}
