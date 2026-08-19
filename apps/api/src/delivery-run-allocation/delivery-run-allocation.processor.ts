import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DELIVERY_RUN_ALLOCATION_QUEUE } from '../queues/queue.constants';
import { DeliveryRunAllocationService } from './delivery-run-allocation.service';

interface DeliveryRunAllocationJobData {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  payload: { orderId?: string; distributorId?: string };
}

// Allocates each accepted order into its customer's default route's dated run,
// creating that run lazily on first need. Consumes OrderAccepted — the same
// domain event the invoice export and analytics consumers already read, via
// the existing outbox relay; no new trigger mechanism.
//
// Business idempotency is the DeliveryRunOrder row (unique activeOrderId), so
// a redelivered job can never double-allocate an order.
@Processor(DELIVERY_RUN_ALLOCATION_QUEUE)
export class DeliveryRunAllocationProcessor extends WorkerHost {
  private readonly logger = new Logger(DeliveryRunAllocationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocation: DeliveryRunAllocationService,
  ) {
    super();
  }

  async process(job: Job<DeliveryRunAllocationJobData>): Promise<void> {
    const orderId = job.data.payload?.orderId;
    if (!orderId) {
      this.logger.warn(`Job ${job.id} (${job.name}) carries no orderId — skipping`);
      return;
    }

    // Reload fresh rather than trusting the event payload snapshot — the same
    // defensive re-read the invoice export processor does.
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      this.logger.warn(`Order ${orderId} not found — skipping delivery allocation`);
      return;
    }
    if (order.status !== OrderStatus.ACCEPTED) {
      this.logger.log(`Order ${orderId} is ${order.status}, not allocatable — skipping delivery allocation`);
      return;
    }

    const outcome = await this.allocation.allocateOrder(order);
    if (outcome.allocated) {
      this.logger.log(`Order ${order.orderNumber} allocated to run ${outcome.runId}`);
    } else {
      // Not an error: an unrouted customer (or a run already marked Ready) is
      // an expected outcome. The order surfaces in the board's Unassigned
      // column with this same reason derived at read time.
      this.logger.log(`Order ${order.orderNumber} left unassigned (${outcome.reason})`);
    }
  }
}
