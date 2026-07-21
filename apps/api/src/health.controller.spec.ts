import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma/prisma.service';
import { RedisHealthService } from './health/redis-health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const mockPrisma = { $queryRaw: jest.fn() };
  const mockRedisHealth = { ping: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisHealthService, useValue: mockRedisHealth },
      ],
    }).compile();
    controller = module.get(HealthController);
  });

  describe('check (liveness)', () => {
    it('returns ok without touching any dependency', () => {
      expect(controller.check()).toEqual({ status: 'ok' });
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(mockRedisHealth.ping).not.toHaveBeenCalled();
    });
  });

  describe('ready (readiness)', () => {
    it('returns ok when db and redis are reachable', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockRedisHealth.ping.mockResolvedValue(undefined);

      await expect(controller.ready()).resolves.toEqual({
        status: 'ok',
        checks: { db: 'ok', redis: 'ok' },
      });
    });

    it('throws 503 when the db is unreachable', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
      mockRedisHealth.ping.mockResolvedValue(undefined);

      await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('throws 503 when redis is unreachable', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockRedisHealth.ping.mockRejectedValue(new Error('connection refused'));

      await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('throws 503 when both db and redis are unreachable', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
      mockRedisHealth.ping.mockRejectedValue(new Error('connection refused'));

      await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
