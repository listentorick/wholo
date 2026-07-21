import { Job } from 'bullmq';
import { CustomerInviteNotificationService } from './customer-invite-notification.service';
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
  let customerInvite: { handleCustomerInviteSent: jest.Mock };

  beforeEach(() => {
    orderPlaced = { handleOrderSubmitted: jest.fn().mockResolvedValue(undefined) };
    customerInvite = { handleCustomerInviteSent: jest.fn().mockResolvedValue(undefined) };
    processor = new NotificationsProcessor(
      orderPlaced as unknown as OrderPlacedNotificationService,
      customerInvite as unknown as CustomerInviteNotificationService,
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

  it('completes without a handler for unknown event types (no endless retry)', async () => {
    await expect(processor.process(makeJob('SomethingElse'))).resolves.toBeUndefined();
    expect(orderPlaced.handleOrderSubmitted).not.toHaveBeenCalled();
    expect(customerInvite.handleCustomerInviteSent).not.toHaveBeenCalled();
  });
});
