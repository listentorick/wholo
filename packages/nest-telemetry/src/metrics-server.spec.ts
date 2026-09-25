import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Counter, Registry } from 'prom-client';
import { startMetricsServer, startMetricsServerFromEnv } from './metrics-server';
import { PlatformMetricsService } from './platform-metrics.service';

describe('startMetricsServer', () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    const registry = new Registry();
    new Counter({ name: 'test_things_total', help: 'things', registers: [registry] }).inc(3);
    server = startMetricsServer(registry, 0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('serves the registry in Prometheus text format on GET /metrics', async () => {
    const res = await fetch(`${base}/metrics`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await res.text()).toContain('test_things_total 3');
  });

  it('returns 404 for any other path', async () => {
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/health`)).status).toBe(404);
  });

  it('returns 405 for non-GET methods on /metrics', async () => {
    const res = await fetch(`${base}/metrics`, { method: 'POST' });

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });
});

describe('startMetricsServerFromEnv', () => {
  const config = { get: <T>(_k: string, d?: T) => d } as unknown as ConfigService;
  const metrics = new PlatformMetricsService(config);
  const app = { get: () => metrics } as unknown as INestApplicationContext;

  it.each([undefined, '', '  ', 'abc', '3.5', '-1', '70000'])(
    'does not start a server when METRICS_PORT is %j',
    (value) => {
      expect(startMetricsServerFromEnv(app, { METRICS_PORT: value })).toBeUndefined();
    },
  );

  it("serves the app's PlatformMetricsService registry on METRICS_PORT", async () => {
    metrics.recordHttpRequest('GET', '2xx');
    const server = startMetricsServerFromEnv(app, { METRICS_PORT: '0' })!;
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    try {
      const port = (server.address() as AddressInfo).port;
      const body = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();
      expect(body).toMatch(/stocdup_http_requests_total\{[^}]*\} 1/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
