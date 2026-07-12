import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ACCOUNTING_INVOICE_EXPORT_QUEUE } from '../queues/queue.constants';
import { AccountingInvoiceExportProcessor } from './accounting-invoice-export.processor';

// Worker-only, same as the sync modules — imported by WorkerModule, never
// AppModule (the HTTP API process has no BullMQ wiring, by deliberate rule).
@Module({
  imports: [BullModule.registerQueue({ name: ACCOUNTING_INVOICE_EXPORT_QUEUE }), AccountingModule],
  providers: [AccountingInvoiceExportProcessor],
})
export class AccountingInvoiceExportModule {}
