import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { XERO_SYNC_QUEUE } from '../queues/queue.constants';

interface OutboxEventJobData {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  payload: { orderId?: string; orderNumber?: string };
}

// Placeholder consumer (ADR-047): keeps the OrderAccepted → xero-sync route
// live end-to-end so the real Xero invoice sync drops into an existing slot.
// The real implementation must add the XeroInvoiceSync inbox table
// (unique orderId — duplicate invoice prevention) before doing any Xero calls.
@Processor(XERO_SYNC_QUEUE)
export class XeroSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(XeroSyncProcessor.name);

  async process(job: Job<OutboxEventJobData>): Promise<void> {
    this.logger.log(
      `Xero sync not yet implemented — acknowledging ${job.name} for order ` +
        `${job.data.payload?.orderId ?? job.data.aggregateId} (${job.data.payload?.orderNumber ?? 'no number'})`,
    );
  }
}
