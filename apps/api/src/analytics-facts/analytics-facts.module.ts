import { Module } from '@nestjs/common';
import { AnalyticsFactsProcessor } from './analytics-facts.processor';
import { AnalyticsReconciliationService } from './analytics-reconciliation.service';
import { OrderFactsService } from './order-facts.service';

// Worker-only, same as accounting-invoice-export/notifications — imported by
// WorkerModule, never AppModule (the HTTP API process has no BullMQ wiring).
@Module({
  providers: [AnalyticsFactsProcessor, OrderFactsService, AnalyticsReconciliationService],
  exports: [OrderFactsService],
})
export class AnalyticsFactsModule {}
