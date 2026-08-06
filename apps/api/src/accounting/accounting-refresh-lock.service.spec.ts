import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AccountingRefreshLockService } from './accounting-refresh-lock.service';

const mockSet = jest.fn();
const mockEval = jest.fn();
const mockQuit = jest.fn();
const mockOn = jest.fn();

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      set: mockSet,
      eval: mockEval,
      quit: mockQuit,
      on: mockOn,
    })),
  };
});

const mockConfig = {
  get: jest.fn((_key: string, fallback: string) => fallback),
};

describe('AccountingRefreshLockService', () => {
  let service: AccountingRefreshLockService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    const module = await Test.createTestingModule({
      providers: [AccountingRefreshLockService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();
    service = module.get(AccountingRefreshLockService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('tryAcquire', () => {
    it('returns a lock when SET NX succeeds', async () => {
      mockSet.mockResolvedValue('OK');

      const lock = await service.tryAcquire('conn-1', 15_000);

      expect(lock).not.toBeNull();
      expect(mockSet).toHaveBeenCalledWith(
        'wholo:accounting-refresh:conn-1',
        expect.any(String),
        'PX',
        15_000,
        'NX',
      );
      await lock?.release();
    });

    it('returns null when the key is already held (SET NX returns null)', async () => {
      mockSet.mockResolvedValue(null);

      const lock = await service.tryAcquire('conn-1', 15_000);

      expect(lock).toBeNull();
    });

    it('fails closed (returns null) when Redis itself errors', async () => {
      mockSet.mockRejectedValue(new Error('connect ECONNREFUSED'));

      const lock = await service.tryAcquire('conn-1', 15_000);

      expect(lock).toBeNull();
    });

    it('uses a distinct owner token per acquisition', async () => {
      mockSet.mockResolvedValue('OK');

      await service.tryAcquire('conn-1', 15_000);
      await service.tryAcquire('conn-1', 15_000);

      const [, ownerA] = mockSet.mock.calls[0];
      const [, ownerB] = mockSet.mock.calls[1];
      expect(ownerA).not.toEqual(ownerB);
    });
  });

  describe('AccountingRefreshLock', () => {
    it('renews the lease on an interval while held, owner-checked via the renew script', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockResolvedValue(1);

      const lock = await service.tryAcquire('conn-1', 15_000);
      const ownerToken = mockSet.mock.calls[0][1];

      jest.advanceTimersByTime(5_001); // just past ttlMs / 3
      await Promise.resolve();
      await Promise.resolve();

      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining('pexpire'),
        1,
        'wholo:accounting-refresh:conn-1',
        ownerToken,
        15_000,
      );

      await lock?.release();
    });

    it('stops renewing once released', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockResolvedValue(1);

      const lock = await service.tryAcquire('conn-1', 15_000);
      await lock?.release();
      mockEval.mockClear();

      jest.advanceTimersByTime(20_000);
      await Promise.resolve();

      expect(mockEval).not.toHaveBeenCalledWith(expect.stringContaining('pexpire'), expect.anything());
    });

    it('release performs an owner-checked compare-and-delete', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockResolvedValue(1);

      const lock = await service.tryAcquire('conn-1', 15_000);
      const ownerToken = mockSet.mock.calls[0][1];
      await lock?.release();

      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining('del'),
        1,
        'wholo:accounting-refresh:conn-1',
        ownerToken,
      );
    });

    it('release swallows Redis errors rather than throwing (TTL is the safety net)', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockRejectedValue(new Error('connect ECONNREFUSED'));

      const lock = await service.tryAcquire('conn-1', 15_000);

      await expect(lock?.release()).resolves.toBeUndefined();
    });
  });

  describe('onModuleDestroy', () => {
    it('quits the redis client', async () => {
      await service.onModuleDestroy();
      expect(mockQuit).toHaveBeenCalled();
    });
  });
});
