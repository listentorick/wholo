import { OutboxEventStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxPublisherService } from './outbox-publisher.service';

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    aggregateType: 'Order',
    aggregateId: 'order-1',
    eventType: 'OrderSubmitted',
    payload: { orderId: 'order-1' },
    status: OutboxEventStatus.PENDING,
    retryCount: 0,
    ...overrides,
  };
}

describe('OutboxPublisherService', () => {
  let service: OutboxPublisherService;
  let prisma: { outboxEvent: { findMany: jest.Mock; update: jest.Mock } };
  let notificationsQueue: { add: jest.Mock };
  let xeroSyncQueue: { add: jest.Mock };

  beforeEach(() => {
    prisma = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    notificationsQueue = { add: jest.fn().mockResolvedValue({}) };
    xeroSyncQueue = { add: jest.fn().mockResolvedValue({}) };
    service = new OutboxPublisherService(
      prisma as unknown as PrismaService,
      notificationsQueue as unknown as Queue,
      xeroSyncQueue as unknown as Queue,
    );
  });

  it('enqueues OrderSubmitted to the notifications queue with jobId = event id and marks it PUBLISHED', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([makeEvent()]);

    await service.publishPending();

    expect(notificationsQueue.add).toHaveBeenCalledWith(
      'OrderSubmitted',
      {
        eventId: 'evt-1',
        aggregateType: 'Order',
        aggregateId: 'order-1',
        payload: { orderId: 'order-1' },
      },
      { jobId: 'evt-1' },
    );
    expect(xeroSyncQueue.add).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-1' },
        data: expect.objectContaining({ status: OutboxEventStatus.PUBLISHED }),
      }),
    );
  });

  it('routes OrderAccepted to the xero-sync queue', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([makeEvent({ id: 'evt-2', eventType: 'OrderAccepted' })]);

    await service.publishPending();

    expect(xeroSyncQueue.add).toHaveBeenCalledWith('OrderAccepted', expect.anything(), { jobId: 'evt-2' });
    expect(notificationsQueue.add).not.toHaveBeenCalled();
  });

  it('marks unrouted event types PUBLISHED without enqueueing anything', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([makeEvent({ id: 'evt-3', eventType: 'OrderCancelled' })]);

    await service.publishPending();

    expect(notificationsQueue.add).not.toHaveBeenCalled();
    expect(xeroSyncQueue.add).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-3' },
        data: expect.objectContaining({ status: OutboxEventStatus.PUBLISHED }),
      }),
    );
  });

  it('marks the event FAILED with the error and bumps retryCount when enqueueing throws', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([makeEvent()]);
    notificationsQueue.add.mockRejectedValue(new Error('Redis unavailable'));

    await service.publishPending();

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          status: OutboxEventStatus.FAILED,
          retryCount: { increment: 1 },
          errorMessage: 'Redis unavailable',
        }),
      }),
    );
    const statuses = prisma.outboxEvent.update.mock.calls.map((c) => c[0].data.status);
    expect(statuses).not.toContain(OutboxEventStatus.PUBLISHED);
  });

  it('keeps processing later events after one fails', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([
      makeEvent({ id: 'evt-1' }),
      makeEvent({ id: 'evt-2' }),
    ]);
    notificationsQueue.add.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({});

    await service.publishPending();

    expect(notificationsQueue.add).toHaveBeenCalledTimes(2);
    const publishedIds = prisma.outboxEvent.update.mock.calls
      .filter((c) => c[0].data.status === OutboxEventStatus.PUBLISHED)
      .map((c) => c[0].where.id);
    expect(publishedIds).toEqual(['evt-2']);
  });

  it('does not overlap ticks while a publish run is in flight', async () => {
    let release!: (value: never[]) => void;
    prisma.outboxEvent.findMany.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );

    const first = service.tick();
    const second = service.tick();
    release([]);
    await Promise.all([first, second]);

    expect(prisma.outboxEvent.findMany).toHaveBeenCalledTimes(1);
  });
});
