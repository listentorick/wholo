import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DELIVERY_RUN_ALLOCATION_QUEUE } from '../queues/queue.constants';
import { DeliveryRunAllocationModule } from './delivery-run-allocation.module';
import { DeliveryRunAllocationProcessor } from './delivery-run-allocation.processor';

// Worker-only, same as the accounting processors — imported by WorkerModule,
// never AppModule (the HTTP API process has no BullMQ wiring, by deliberate
// rule). Adds the queue registration + processor on top of the plain,
// queue-free DeliveryRunAllocationModule, which the HTTP-side
// DeliveryRunsModule also imports to reuse the same allocation logic
// synchronously from the change-delivery-date action.
@Module({
  imports: [
    BullModule.registerQueue({ name: DELIVERY_RUN_ALLOCATION_QUEUE }),
    DeliveryRunAllocationModule,
  ],
  providers: [DeliveryRunAllocationProcessor],
})
export class DeliveryRunAllocationWorkerModule {}
