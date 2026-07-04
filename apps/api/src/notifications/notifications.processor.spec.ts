import { Job } from 'bullmq';
import { NotificationsProcessor, OutboxEventJobData } from './notifications.processor';
import { OrderPlacedNotificationService } from './order-placed-notification.service';

function makeJob(name: string, payload: unknown = { orderId: 'order-1' }): Job<OutboxEventJobData> {
  return {
    name,
    data: { eventId: 'evt-1', aggregateType: 'Order', aggregateId: 'order-1', payload },
  } as Job<OutboxEventJobData>;
}

describe('NotificationsProcessor', () => {
  let processor: NotificationsProcessor;
  let orderPlaced: { handleOrderSubmitted: jest.Mock };

  beforeEach(() => {
    orderPlaced = { handleOrderSubmitted: jest.fn().mockResolvedValue(undefined) };
    processor = new NotificationsProcessor(orderPlaced as unknown as OrderPlacedNotificationService);
  });

  it('routes OrderSubmitted jobs to the order-placed handler', async () => {
    const payload = { orderId: 'order-1', orderNumber: 'ORD-2026-00042' };
    await processor.process(makeJob('OrderSubmitted', payload));

    expect(orderPlaced.handleOrderSubmitted).toHaveBeenCalledWith(payload);
  });

  it('completes without a handler for unknown event types (no endless retry)', async () => {
    await expect(processor.process(makeJob('SomethingElse'))).resolves.toBeUndefined();
    expect(orderPlaced.handleOrderSubmitted).not.toHaveBeenCalled();
  });
});
