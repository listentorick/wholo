import * as dgram from 'node:dgram';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from './metrics.service';

/** Minimal ConfigService stand-in: get(key, default). */
function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      (values[key] ?? defaultValue) as T | undefined,
  } as unknown as ConfigService;
}

/** Bind a UDP listener on an ephemeral port and expose the next datagram. */
async function listener(): Promise<{
  port: number;
  next: (timeoutMs?: number) => Promise<string>;
  close: () => void;
}> {
  const socket = dgram.createSocket('udp4');
  const queue: string[] = [];
  let waiter: ((msg: string) => void) | null = null;

  socket.on('message', (buf) => {
    const msg = buf.toString('utf8');
    if (waiter) {
      waiter(msg);
      waiter = null;
    } else {
      queue.push(msg);
    }
  });

  await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
  const port = socket.address().port;

  return {
    port,
    next: (timeoutMs = 500) =>
      new Promise<string>((resolve, reject) => {
        const queued = queue.shift();
        if (queued !== undefined) return resolve(queued);
        const timer = setTimeout(() => reject(new Error('no datagram received')), timeoutMs);
        waiter = (msg) => {
          clearTimeout(timer);
          resolve(msg);
        };
      }),
    close: () => socket.close(),
  };
}

describe('MetricsService — enabled', () => {
  let udp: Awaited<ReturnType<typeof listener>>;
  let service: MetricsService;

  beforeEach(async () => {
    udp = await listener();
    service = new MetricsService(
      fakeConfig({ APP_ENV: 'test', STATSD_HOST: '127.0.0.1', STATSD_PORT: String(udp.port) }),
    );
  });

  afterEach(() => {
    service.onApplicationShutdown();
    udp.close();
  });

  it('emits the InfluxDB-style StatsD counter line with the environment tag injected', async () => {
    service.increment('stocdup_orders_submitted', 1, {
      distributor_id: '123',
      distributor_name: 'Acme Wines',
      source: 'portal',
      currency: 'GBP',
    });

    await expect(udp.next()).resolves.toBe(
      'stocdup_orders_submitted,environment=test,distributor_id=123,distributor_name=Acme_Wines,source=portal,currency=GBP:1|c',
    );
  });

  it('emits the order value counter with the raw minor-unit value', async () => {
    service.increment('stocdup_order_value_minor', 12750, {
      distributor_id: '123',
      distributor_name: 'Acme_Wines',
      source: 'on_behalf',
      currency: 'GBP',
    });

    await expect(udp.next()).resolves.toBe(
      'stocdup_order_value_minor,environment=test,distributor_id=123,distributor_name=Acme_Wines,source=on_behalf,currency=GBP:12750|c',
    );
  });

  it('sanitises line-protocol break characters in a tag value', async () => {
    service.increment('stocdup_orders_submitted', 1, {
      distributor_id: 'd1',
      distributor_name: 'Smith, Jones = Co | Ltd:',
      source: 'portal',
      currency: 'GBP',
    });

    const line = await udp.next();
    expect(line).toContain('distributor_name=Smith_Jones_Co_Ltd');
    // one metric line, no stray separators from the raw name
    expect(line.match(/:/g)).toHaveLength(1);
    expect(line.endsWith(':1|c')).toBe(true);
  });

  it('never throws from increment even with a non-finite value', () => {
    expect(() =>
      service.increment('x', Number.NaN, { distributor_id: 'd', source: 'portal', currency: 'GBP' }),
    ).not.toThrow();
  });
});

describe('MetricsService — disabled (STATSD_HOST unset)', () => {
  it('is a no-op: no datagram, no throw', async () => {
    const udp = await listener();
    const service = new MetricsService(fakeConfig({ APP_ENV: 'test', STATSD_PORT: String(udp.port) }));

    expect(() =>
      service.increment('stocdup_orders_submitted', 1, {
        distributor_id: '123',
        source: 'portal',
        currency: 'GBP',
      }),
    ).not.toThrow();

    await expect(udp.next(150)).rejects.toThrow('no datagram received');
    service.onApplicationShutdown();
    udp.close();
  });

  it('onApplicationShutdown resolves when disabled', () => {
    const service = new MetricsService(fakeConfig({}));
    expect(() => service.onApplicationShutdown()).not.toThrow();
  });
});
