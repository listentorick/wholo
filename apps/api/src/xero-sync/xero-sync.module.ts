import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { XERO_SYNC_QUEUE } from '../queues/queue.constants';
import { XeroSyncProcessor } from './xero-sync.processor';

@Module({
  imports: [BullModule.registerQueue({ name: XERO_SYNC_QUEUE })],
  providers: [XeroSyncProcessor],
})
export class XeroSyncModule {}
