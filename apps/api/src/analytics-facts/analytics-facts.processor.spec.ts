import { Job } from 'bullmq';
import { OrderStatus } from '@prisma/client';
import { AnalyticsFactsProcessor } from './analytics-facts.processor';
import { OrderFactsService } from './order-facts.service';
import { DeliveryFactsService } from './delivery-facts.service';
import { RelationshipFactsService } from './relationship-facts.service';

const makeJob = (name: string, payload: Record<string, unknown> = {}) =>
  ({
    name,
    data: { eventId: 'evt-1', aggregateType: 'Order', aggregateId: 'order-1', payload },
  }) as unknown as Job;

describe('AnalyticsFactsProcessor', () => {
  let processor: AnalyticsFactsProcessor;
  let orderFacts: { handleOrderEvent: jest.Mock };
  let deliveryFacts: { handleDeliveryEvent: jest.Mock };
  let relationshipFacts: { handleRelationshipEvent: jest.Mock };

  beforeEach(() => {
    orderFacts = { handleOrderEvent: jest.fn().mockResolvedValue(undefined) };
    deliveryFacts = { handleDeliveryEvent: jest.fn().mockResolvedValue(undefined) };
    relationshipFacts = { handleRelationshipEvent: jest.fn().mockResolvedValue(undefined) };
    processor = new AnalyticsFactsProcessor(
      orderFacts as unknown as OrderFactsService,
      deliveryFacts as unknown as DeliveryFactsService,
      relationshipFacts as unknown as RelationshipFactsService,
    );
  });

  it.each([
    'TradeRelationshipCreated', 'TradeRelationshipAccessRequested', 'CustomerInviteSent', 'CustomerInviteAccepted',
    'TradeRelationshipRequestAccepted', 'TradeRelationshipRequestDeclined', 'TradeRelationshipActivated',
    'TradeRelationshipSuspended', 'TradeRelationshipUnsuspended', 'TradeRelationshipRemoved',
  ])('dispatches %s to RelationshipFactsService and nothing else', async (eventType) => {
    const payload = { relationshipId: 'rel-1', toStatus: 'ACTIVE' };
    await processor.process(makeJob(eventType, payload));

    expect(relationshipFacts.handleRelationshipEvent).toHaveBeenCalledWith('evt-1', eventType, payload);
    expect(orderFacts.handleOrderEvent).not.toHaveBeenCalled();
    expect(deliveryFacts.handleDeliveryEvent).not.toHaveBeenCalled();
  });

  it.each(['OrderSubmitted', 'OrderAccepted', 'OrderRejected', 'OrderCancelled'])(
    'dispatches %s to OrderFactsService',
    async (eventType) => {
      const payload = { orderId: 'order-1', status: OrderStatus.SUBMITTED };
      await processor.process(makeJob(eventType, payload));

      expect(orderFacts.handleOrderEvent).toHaveBeenCalledWith('evt-1', eventType, payload);
    },
  );

  describe.each([
    ['OrderDelivered', OrderStatus.DELIVERED],
    ['OrderDeliveryFailed', OrderStatus.DELIVERY_FAILED],
  ])('%s', (eventType, status) => {
    const payload = { orderId: 'order-1', distributorId: 'dist-1', traderCustomerId: 'cust-1', recordedAt: '2026-09-18T09:30:00.000Z', committedDate: '2026-09-18' };

    it('moves the order lifecycle to the resulting status, at the time the outcome was recorded', async () => {
      await processor.process(makeJob(eventType, payload));

      expect(orderFacts.handleOrderEvent).toHaveBeenCalledWith('evt-1', eventType, {
        orderId: 'order-1', distributorId: 'dist-1', traderCustomerId: 'cust-1', status, occurredAt: '2026-09-18T09:30:00.000Z',
      });
    });

    it('also records the delivery fact from the same event', async () => {
      await processor.process(makeJob(eventType, payload));

      expect(deliveryFacts.handleDeliveryEvent).toHaveBeenCalledWith('evt-1', eventType, payload);
    });

    it('still records the delivery fact on a retry when the order half already succeeded (each half is idempotent)', async () => {
      orderFacts.handleOrderEvent.mockResolvedValue(undefined);
      deliveryFacts.handleDeliveryEvent.mockRejectedValueOnce(new Error('db blip'));

      await expect(processor.process(makeJob(eventType, payload))).rejects.toThrow('db blip');
      await processor.process(makeJob(eventType, payload));

      expect(deliveryFacts.handleDeliveryEvent).toHaveBeenCalledTimes(2);
    });
  });

  it('logs and ignores an unrouted event type rather than throwing', async () => {
    await expect(processor.process(makeJob('SomethingElse'))).resolves.toBeUndefined();
    expect(orderFacts.handleOrderEvent).not.toHaveBeenCalled();
  });
});
