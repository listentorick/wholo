import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AccountingProductSyncScheduler } from './accounting-product-sync.scheduler';

describe('AccountingProductSyncScheduler', () => {
  let scheduler: AccountingProductSyncScheduler;
  let prisma: { accountingConnection: { findMany: jest.Mock }; $transaction: jest.Mock };
  let outbox: { writeEvent: jest.Mock };

  beforeEach(() => {
    prisma = {
      accountingConnection: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({})),
    };
    outbox = { writeEvent: jest.fn().mockResolvedValue({}) };
    scheduler = new AccountingProductSyncScheduler(
      prisma as unknown as PrismaService,
      outbox as unknown as OutboxService,
    );
  });

  it('writes an AccountingProductSyncRequested outbox event for every CONNECTED connection', async () => {
    prisma.accountingConnection.findMany.mockResolvedValue([{ id: 'conn-1' }, { id: 'conn-2' }]);

    await scheduler.requestSyncForActiveConnections();

    expect(prisma.accountingConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'CONNECTED' }) }),
    );
    expect(outbox.writeEvent).toHaveBeenCalledTimes(2);
    expect(outbox.writeEvent).toHaveBeenCalledWith(
      expect.anything(),
      'AccountingConnection',
      'conn-1',
      'AccountingProductSyncRequested',
      {},
    );
    expect(outbox.writeEvent).toHaveBeenCalledWith(
      expect.anything(),
      'AccountingConnection',
      'conn-2',
      'AccountingProductSyncRequested',
      {},
    );
  });

  it('does nothing when there are no active connections', async () => {
    await scheduler.requestSyncForActiveConnections();
    expect(outbox.writeEvent).not.toHaveBeenCalled();
  });

  it('continues to the next connection when writing one outbox event fails', async () => {
    prisma.accountingConnection.findMany.mockResolvedValue([{ id: 'conn-1' }, { id: 'conn-2' }]);
    outbox.writeEvent.mockRejectedValueOnce(new Error('db down')).mockResolvedValue({});

    await scheduler.requestSyncForActiveConnections();

    expect(outbox.writeEvent).toHaveBeenCalledTimes(2);
  });

  it('does not overlap ticks while a sync request run is in flight', async () => {
    let release!: () => void;
    prisma.accountingConnection.findMany.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve([]))),
    );

    const first = scheduler.tick();
    const second = scheduler.tick();
    release();
    await Promise.all([first, second]);

    expect(prisma.accountingConnection.findMany).toHaveBeenCalledTimes(1);
  });
});
