import { INestApplicationContext } from '@nestjs/common';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { startWorkerHealthServer } from './worker-health-server';
import { PrismaService } from './prisma/prisma.service';
import { RedisHealthService } from './health/redis-health.service';

describe('startWorkerHealthServer', () => {
  let server: Server;
  let baseUrl: string;
  const mockPrisma = { $queryRaw: jest.fn() };
  const mockRedisHealth = { ping: jest.fn() };

  const fakeApp = {
    get: (token: unknown) => {
      if (token === PrismaService) return mockPrisma;
      if (token === RedisHealthService) return mockRedisHealth;
      throw new Error('unexpected token');
    },
  } as unknown as INestApplicationContext;

  beforeEach(() => {
    jest.clearAllMocks();
    server = startWorkerHealthServer(fakeApp, 0);
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(() => {
    server.close();
  });

  it('/health/live always returns 200', async () => {
    const res = await fetch(`${baseUrl}/health/live`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('/health/ready returns 200 when db and redis are reachable', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockRedisHealth.ping.mockResolvedValue(undefined);

    const res = await fetch(`${baseUrl}/health/ready`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', checks: { db: 'ok', redis: 'ok' } });
  });

  it('/health/ready returns 503 when redis is unreachable', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockRedisHealth.ping.mockRejectedValue(new Error('connection refused'));

    const res = await fetch(`${baseUrl}/health/ready`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'error', checks: { db: 'ok', redis: 'error' } });
  });

  it('unknown paths return 404', async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    expect(res.status).toBe(404);
  });
});
