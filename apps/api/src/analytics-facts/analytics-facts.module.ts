import { Module } from '@nestjs/common';
import { AnalyticsFactsProcessor } from './analytics-facts.processor';
import { AnalyticsReconciliationService } from './analytics-reconciliation.service';
import { DeliveryFactsBackfillService } from './delivery-facts-backfill.service';
import { DeliveryFactsService } from './delivery-facts.service';
import { OrderFactsService } from './order-facts.service';

// Worker-only, same as accounting-invoice-export/notifications — imported by
// WorkerModule, never AppModule (the HTTP API process has no BullMQ wiring).
@Module({
  providers: [AnalyticsFactsProcessor, OrderFactsService, DeliveryFactsService, DeliveryFactsBackfillService, AnalyticsReconciliationService],
  exports: [OrderFactsService],
})
export class AnalyticsFactsModule {}
