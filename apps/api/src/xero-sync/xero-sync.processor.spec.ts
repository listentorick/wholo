import { Job } from 'bullmq';
import { XeroSyncProcessor } from './xero-sync.processor';

describe('XeroSyncProcessor (placeholder)', () => {
  it('acknowledges OrderAccepted jobs without doing anything', async () => {
    const processor = new XeroSyncProcessor();
    const job = {
      name: 'OrderAccepted',
      data: {
        eventId: 'evt-1',
        aggregateType: 'Order',
        aggregateId: 'order-1',
        payload: { orderId: 'order-1', orderNumber: 'ORD-2026-00042' },
      },
    } as Job;

    await expect(processor.process(job)).resolves.toBeUndefined();
  });
});
