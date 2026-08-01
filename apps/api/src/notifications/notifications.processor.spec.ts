import { Job } from 'bullmq';
import { CustomerInviteNotificationService } from './customer-invite-notification.service';
import { NotificationsProcessor, OutboxEventJobData } from './notifications.processor';
import { OrderPlacedNotificationService } from './order-placed-notification.service';
import { TradeRelationshipNotificationService } from './trade-relationship-notification.service';

function makeJob(name: string, payload: unknown = { orderId: 'order-1' }): Job<OutboxEventJobData> {
  return {
    name,
    data: { eventId: 'evt-1', aggregateType: 'Order', aggregateId: 'order-1', payload },
  } as Job<OutboxEventJobData>;
}

describe('NotificationsProcessor', () => {
  let processor: NotificationsProcessor;
  let orderPlaced: { handleOrderSubmitted: jest.Mock };
  let customerInvite: { handleCustomerInviteSent: jest.Mock };
  let tradeRelationship: {
    handleTradeRelationshipRequestAccepted: jest.Mock;
    handleTradeRelationshipRequestDeclined: jest.Mock;
    handleTradeRelationshipSuspended: jest.Mock;
    handleTradeRelationshipUnsuspended: jest.Mock;
    handleTradeRelationshipActivated: jest.Mock;
  };

  beforeEach(() => {
    orderPlaced = { handleOrderSubmitted: jest.fn().mockResolvedValue(undefined) };
    customerInvite = { handleCustomerInviteSent: jest.fn().mockResolvedValue(undefined) };
    tradeRelationship = {
      handleTradeRelationshipRequestAccepted: jest.fn().mockResolvedValue(undefined),
      handleTradeRelationshipRequestDeclined: jest.fn().mockResolvedValue(undefined),
      handleTradeRelationshipSuspended: jest.fn().mockResolvedValue(undefined),
      handleTradeRelationshipUnsuspended: jest.fn().mockResolvedValue(undefined),
      handleTradeRelationshipActivated: jest.fn().mockResolvedValue(undefined),
    };
    processor = new NotificationsProcessor(
      orderPlaced as unknown as OrderPlacedNotificationService,
      customerInvite as unknown as CustomerInviteNotificationService,
      tradeRelationship as unknown as TradeRelationshipNotificationService,
    );
  });

  it('routes OrderSubmitted jobs to the order-placed handler', async () => {
    const payload = { orderId: 'order-1', orderNumber: 'ORD-2026-00042' };
    await processor.process(makeJob('OrderSubmitted', payload));

    expect(orderPlaced.handleOrderSubmitted).toHaveBeenCalledWith(payload);
  });

  it('routes CustomerInviteSent jobs to the customer-invite handler', async () => {
    const payload = { invitationId: 'inv-1', email: 'buyer@winebar.example' };
    await processor.process(makeJob('CustomerInviteSent', payload));

    expect(customerInvite.handleCustomerInviteSent).toHaveBeenCalledWith(payload);
  });

  it.each([
    ['TradeRelationshipRequestAccepted', 'handleTradeRelationshipRequestAccepted'],
    ['TradeRelationshipRequestDeclined', 'handleTradeRelationshipRequestDeclined'],
    ['TradeRelationshipSuspended', 'handleTradeRelationshipSuspended'],
    ['TradeRelationshipUnsuspended', 'handleTradeRelationshipUnsuspended'],
    ['TradeRelationshipActivated', 'handleTradeRelationshipActivated'],
  ] as const)('routes %s jobs to %s, passing the outbox event id', async (jobName, handlerName) => {
    const payload = { relationshipId: 'rel-1', customerEmail: 'buyer@winebar.example' };
    await processor.process(makeJob(jobName, payload));

    expect(tradeRelationship[handlerName]).toHaveBeenCalledWith(payload, 'evt-1');
  });

  it('completes without a handler for unknown event types (no endless retry)', async () => {
    await expect(processor.process(makeJob('SomethingElse'))).resolves.toBeUndefined();
    expect(orderPlaced.handleOrderSubmitted).not.toHaveBeenCalled();
    expect(customerInvite.handleCustomerInviteSent).not.toHaveBeenCalled();
    expect(tradeRelationship.handleTradeRelationshipRequestAccepted).not.toHaveBeenCalled();
  });
});
