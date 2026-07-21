import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { RedisHealthService } from './redis-health.service';

const mockPing = jest.fn();
const mockDisconnect = jest.fn();
const mockOn = jest.fn();

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      ping: mockPing,
      disconnect: mockDisconnect,
      on: mockOn,
    })),
  };
});

const mockConfig = {
  get: jest.fn((_key: string, fallback: string) => fallback),
};

describe('RedisHealthService', () => {
  let service: RedisHealthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [RedisHealthService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();
    service = module.get(RedisHealthService);
  });

  it('resolves when redis responds to ping', async () => {
    mockPing.mockResolvedValue('PONG');

    await expect(service.ping()).resolves.toBeUndefined();
  });

  it('throws when redis ping fails', async () => {
    mockPing.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(service.ping()).rejects.toThrow('connect ECONNREFUSED');
  });

  it('disconnects the client on module destroy', async () => {
    await service.onModuleDestroy();

    expect(mockDisconnect).toHaveBeenCalled();
  });
});
