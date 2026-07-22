import { Job } from 'bullmq';
import { OrderStatus } from '@prisma/client';
import { AnalyticsFactsProcessor } from './analytics-facts.processor';
import { OrderFactsService } from './order-facts.service';

const makeJob = (name: string, payload: Record<string, unknown> = {}) =>
  ({
    name,
    data: { eventId: 'evt-1', aggregateType: 'Order', aggregateId: 'order-1', payload },
  }) as unknown as Job;

describe('AnalyticsFactsProcessor', () => {
  let processor: AnalyticsFactsProcessor;
  let orderFacts: { handleOrderEvent: jest.Mock };

  beforeEach(() => {
    orderFacts = { handleOrderEvent: jest.fn().mockResolvedValue(undefined) };
    processor = new AnalyticsFactsProcessor(orderFacts as unknown as OrderFactsService);
  });

  it.each(['OrderSubmitted', 'OrderAccepted', 'OrderRejected', 'OrderCancelled'])(
    'dispatches %s to OrderFactsService',
    async (eventType) => {
      const payload = { orderId: 'order-1', status: OrderStatus.SUBMITTED };
      await processor.process(makeJob(eventType, payload));

      expect(orderFacts.handleOrderEvent).toHaveBeenCalledWith('evt-1', eventType, payload);
    },
  );

  it('logs and ignores an unrouted event type rather than throwing', async () => {
    await expect(processor.process(makeJob('SomethingElse'))).resolves.toBeUndefined();
    expect(orderFacts.handleOrderEvent).not.toHaveBeenCalled();
  });
});
