import { PrismaService } from '../prisma/prisma.service';
import { AccountingSyncService } from './sync/accounting-sync.service';
import { AccountingContactSyncScheduler } from './accounting-contact-sync.scheduler';

describe('AccountingContactSyncScheduler', () => {
  let scheduler: AccountingContactSyncScheduler;
  let prisma: { accountingConnection: { findMany: jest.Mock } };
  let accountingSync: { requestSyncForConnection: jest.Mock };
  let randomSpy: jest.SpyInstance;

  beforeEach(() => {
    // No jitter delay in tests.
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    prisma = { accountingConnection: { findMany: jest.fn().mockResolvedValue([]) } };
    accountingSync = { requestSyncForConnection: jest.fn().mockResolvedValue({ runs: [], lastSucceededAt: null }) };
    scheduler = new AccountingContactSyncScheduler(
      prisma as unknown as PrismaService,
      accountingSync as unknown as AccountingSyncService,
    );
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('requests a scheduled contact sync for every CONNECTED connection', async () => {
    prisma.accountingConnection.findMany.mockResolvedValue([
      { id: 'conn-1', distributorId: 'dist-1' },
      { id: 'conn-2', distributorId: 'dist-2' },
    ]);

    await scheduler.requestSyncForActiveConnections();

    expect(prisma.accountingConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'CONNECTED' }) }),
    );
    expect(accountingSync.requestSyncForConnection).toHaveBeenCalledTimes(2);
    expect(accountingSync.requestSyncForConnection).toHaveBeenCalledWith('dist-1', 'conn-1', 'contact', 'SCHEDULED');
    expect(accountingSync.requestSyncForConnection).toHaveBeenCalledWith('dist-2', 'conn-2', 'contact', 'SCHEDULED');
  });

  it('does nothing when there are no active connections', async () => {
    await scheduler.requestSyncForActiveConnections();
    expect(accountingSync.requestSyncForConnection).not.toHaveBeenCalled();
  });

  it('continues to the next connection when one request fails', async () => {
    prisma.accountingConnection.findMany.mockResolvedValue([
      { id: 'conn-1', distributorId: 'dist-1' },
      { id: 'conn-2', distributorId: 'dist-2' },
    ]);
    accountingSync.requestSyncForConnection.mockRejectedValueOnce(new Error('db down')).mockResolvedValue({});

    await scheduler.requestSyncForActiveConnections();

    expect(accountingSync.requestSyncForConnection).toHaveBeenCalledTimes(2);
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

  it('does not run an immediate sweep on module init', () => {
    const tickSpy = jest.spyOn(scheduler, 'tick').mockResolvedValue(undefined);
    scheduler.onModuleInit();
    expect(tickSpy).not.toHaveBeenCalled();
    tickSpy.mockRestore();
  });
});
