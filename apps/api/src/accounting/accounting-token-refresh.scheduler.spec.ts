import { Test, TestingModule } from '@nestjs/testing';
import { AccountingConnectionStatus, AccountingProvider } from '@prisma/client';
import { AccountingTokenRefreshScheduler } from './accounting-token-refresh.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectionService } from './accounting-connection.service';

const mockPrisma = {
  accountingConnection: {
    findMany: jest.fn(),
  },
};

const mockAccountingConnectionService = {
  getValidTokenSet: jest.fn(),
};

describe('AccountingTokenRefreshScheduler', () => {
  let scheduler: AccountingTokenRefreshScheduler;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingTokenRefreshScheduler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountingConnectionService, useValue: mockAccountingConnectionService },
      ],
    }).compile();
    scheduler = module.get(AccountingTokenRefreshScheduler);
  });

  function expectDormancyQueryShape() {
    expect(mockPrisma.accountingConnection.findMany).toHaveBeenCalledWith({
      where: {
        status: AccountingConnectionStatus.CONNECTED,
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: expect.any(Date) } }],
      },
    });
    const thresholdDate = mockPrisma.accountingConnection.findMany.mock.calls[0][0].where.OR[1].lastSyncedAt.lt;
    const daysAgo = (Date.now() - thresholdDate.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysAgo).toBeCloseTo(25, 0);
  }

  describe('refreshDormantConnections (used by both onModuleInit and the daily tick)', () => {
    it('queries for CONNECTED connections not synced in ~25 days and refreshes each one', async () => {
      mockPrisma.accountingConnection.findMany.mockResolvedValue([
        { distributorId: 'dist-1', provider: AccountingProvider.XERO },
        { distributorId: 'dist-2', provider: AccountingProvider.XERO },
      ]);
      mockAccountingConnectionService.getValidTokenSet.mockResolvedValue({});

      await scheduler.refreshDormantConnections();

      expectDormancyQueryShape();
      expect(mockAccountingConnectionService.getValidTokenSet).toHaveBeenCalledWith('dist-1', AccountingProvider.XERO);
      expect(mockAccountingConnectionService.getValidTokenSet).toHaveBeenCalledWith('dist-2', AccountingProvider.XERO);
    });

    it('logs and continues when one connection fails, so it does not block the rest of the batch', async () => {
      mockPrisma.accountingConnection.findMany.mockResolvedValue([
        { distributorId: 'dist-broken', provider: AccountingProvider.XERO },
        { distributorId: 'dist-2', provider: AccountingProvider.XERO },
      ]);
      mockAccountingConnectionService.getValidTokenSet.mockImplementation(async (distributorId: string) => {
        if (distributorId === 'dist-broken') throw new Error('invalid_grant');
        return {};
      });

      await expect(scheduler.refreshDormantConnections()).resolves.toBeUndefined();

      expect(mockAccountingConnectionService.getValidTokenSet).toHaveBeenCalledWith('dist-2', AccountingProvider.XERO);
    });
  });

  describe('onModuleInit', () => {
    it('runs a sweep immediately at startup', async () => {
      mockPrisma.accountingConnection.findMany.mockResolvedValue([]);
      await scheduler.onModuleInit();
      expect(mockPrisma.accountingConnection.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('tick (the daily @Interval)', () => {
    it('runs a sweep', async () => {
      mockPrisma.accountingConnection.findMany.mockResolvedValue([]);
      await scheduler.tick();
      expect(mockPrisma.accountingConnection.findMany).toHaveBeenCalledTimes(1);
    });

    it('does not run concurrently with itself (re-entrancy guard)', async () => {
      let resolveFirst!: () => void;
      mockPrisma.accountingConnection.findMany.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = () => resolve([]);
        }),
      );

      const firstTick = scheduler.tick();
      const secondTick = scheduler.tick();
      resolveFirst();
      await Promise.all([firstTick, secondTick]);

      expect(mockPrisma.accountingConnection.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
