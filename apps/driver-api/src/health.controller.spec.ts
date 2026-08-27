import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

const mockConfig = {
  get: jest.fn((_key: string, fallback: string) => fallback),
};

describe('HealthController', () => {
  let controller: HealthController;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: ConfigService, useValue: mockConfig }],
    }).compile();
    controller = module.get(HealthController);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('check (liveness)', () => {
    it('returns ok without calling upstream', () => {
      global.fetch = jest.fn();
      expect(controller.check()).toEqual({ status: 'ok' });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('ready (readiness)', () => {
    it('returns ok when the central api responds 2xx', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      await expect(controller.ready()).resolves.toEqual({ status: 'ok', checks: { api: 'ok' } });
    });

    it('throws 503 when the central api responds non-2xx', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

      await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('throws 503 when the central api is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));

      await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
