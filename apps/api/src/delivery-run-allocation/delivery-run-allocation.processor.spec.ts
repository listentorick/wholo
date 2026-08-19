import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { DeliveryRunAllocationProcessor } from './delivery-run-allocation.processor';
import { DeliveryRunAllocationService } from './delivery-run-allocation.service';
import { PrismaService } from '../prisma/prisma.service';

function makeJob(payload: Record<string, unknown> = { orderId: 'order-1' }) {
  return {
    id: 'job-1',
    name: 'OrderAccepted',
    data: { eventId: 'evt-1', aggregateType: 'Order', aggregateId: 'order-1', payload },
  } as unknown as Job;
}

describe('DeliveryRunAllocationProcessor', () => {
  let processor: DeliveryRunAllocationProcessor;
  let prisma: { order: { findUnique: jest.Mock } };
  let allocation: { allocateOrder: jest.Mock };

  beforeEach(async () => {
    prisma = { order: { findUnique: jest.fn() } };
    allocation = { allocateOrder: jest.fn().mockResolvedValue({ allocated: true, runId: 'run-1', deliverySequence: 1 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryRunAllocationProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: DeliveryRunAllocationService, useValue: allocation },
      ],
    }).compile();

    processor = module.get(DeliveryRunAllocationProcessor);
  });

  it('allocates an accepted order', async () => {
    const order = { id: 'order-1', orderNumber: 'ORD-1', status: OrderStatus.ACCEPTED };
    prisma.order.findUnique.mockResolvedValue(order);

    await processor.process(makeJob());

    expect(allocation.allocateOrder).toHaveBeenCalledWith(order);
  });

  it('skips a job that carries no orderId', async () => {
    await processor.process(makeJob({}));

    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(allocation.allocateOrder).not.toHaveBeenCalled();
  });

  it('skips when the order no longer exists', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await processor.process(makeJob());

    expect(allocation.allocateOrder).not.toHaveBeenCalled();
  });

  it('re-reads the order and skips when it is no longer ACCEPTED', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'order-1', orderNumber: 'ORD-1', status: OrderStatus.CANCELLED });

    await processor.process(makeJob());

    expect(allocation.allocateOrder).not.toHaveBeenCalled();
  });

  it('completes without throwing when the order is left unassigned', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'order-1', orderNumber: 'ORD-1', status: OrderStatus.ACCEPTED });
    allocation.allocateOrder.mockResolvedValue({ allocated: false, reason: 'NO_ROUTE' });

    await expect(processor.process(makeJob())).resolves.toBeUndefined();
  });
});
