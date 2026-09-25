import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { lastValueFrom, of, throwError } from 'rxjs';
import { MetricsInterceptor } from './metrics.interceptor';
import { PlatformMetricsService } from './platform-metrics.service';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T>(key: string, dflt?: T): T | undefined => (values[key] ?? dflt) as T | undefined,
  } as unknown as ConfigService;
}

function httpContext(req: unknown, res: unknown, type = 'http'): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

function handler(source: unknown): CallHandler {
  return { handle: () => source } as CallHandler;
}

/** A real registry per test — assertions read what a scrape would see. */
function setup(env: Record<string, string> = { SERVICE_NAME: 'api' }) {
  const metrics = new PlatformMetricsService(fakeConfig(env));
  return { metrics, interceptor: new MetricsInterceptor(metrics) };
}

async function requestCount(
  metrics: PlatformMetricsService,
  method: string,
  statusClass: string,
): Promise<number> {
  const metric = await metrics.registry.getSingleMetric('stocdup_http_requests_total')!.get();
  return (
    metric.values.find((v) => v.labels.method === method && v.labels.status_class === statusClass)
      ?.value ?? 0
  );
}

async function durationCount(metrics: PlatformMetricsService): Promise<number> {
  const metric = await metrics.registry.getSingleMetric('stocdup_http_request_duration_seconds')!.get();
  return metric.values.find((v) => v.metricName === 'stocdup_http_request_duration_seconds_count')?.value ?? 0;
}

describe('MetricsInterceptor', () => {
  it('counts the request and observes its duration on a successful response', async () => {
    const { metrics, interceptor } = setup();

    await lastValueFrom(
      interceptor.intercept(
        httpContext({ method: 'get', url: '/api/v1/orders' }, { statusCode: 200 }),
        handler(of({ ok: true })),
      ),
    );

    expect(await requestCount(metrics, 'GET', '2xx')).toBe(1);
    expect(await durationCount(metrics)).toBe(1);
  });

  it('maps status codes to classes', async () => {
    const { metrics, interceptor } = setup({ SERVICE_NAME: 'portal-api' });

    for (const status of [204, 301, 404, 503]) {
      await lastValueFrom(
        interceptor.intercept(
          httpContext({ method: 'GET', url: '/api/v1/x' }, { statusCode: status }),
          handler(of(null)),
        ),
      );
    }

    for (const klass of ['2xx', '3xx', '4xx', '5xx']) {
      expect(await requestCount(metrics, 'GET', klass)).toBe(1);
    }
  });

  it('records a thrown HttpException with its own status class and still observes duration', async () => {
    const { metrics, interceptor } = setup();
    const err = Object.assign(new Error('boom'), { getStatus: () => 503 });

    await expect(
      lastValueFrom(
        interceptor.intercept(
          httpContext({ method: 'POST', url: '/api/v1/orders' }, { statusCode: 200 }),
          handler(throwError(() => err)),
        ),
      ),
    ).rejects.toThrow('boom');

    expect(await requestCount(metrics, 'POST', '5xx')).toBe(1);
    expect(await durationCount(metrics)).toBe(1);
  });

  it('treats a plain thrown error as 5xx', async () => {
    const { metrics, interceptor } = setup();

    await expect(
      lastValueFrom(
        interceptor.intercept(
          httpContext({ method: 'GET', url: '/api/v1/x' }, { statusCode: 200 }),
          handler(throwError(() => new Error('kaboom'))),
        ),
      ),
    ).rejects.toThrow('kaboom');

    expect(await requestCount(metrics, 'GET', '5xx')).toBe(1);
  });

  it('ignores health-probe traffic', async () => {
    const { metrics, interceptor } = setup();

    for (const url of ['/api/v1/health', '/api/v1/health/ready']) {
      await lastValueFrom(
        interceptor.intercept(httpContext({ method: 'GET', url }, { statusCode: 200 }), handler(of(null))),
      );
    }

    expect(await requestCount(metrics, 'GET', '2xx')).toBe(0);
    expect(await durationCount(metrics)).toBe(0);
  });

  it('ignores non-HTTP execution contexts', async () => {
    const { metrics, interceptor } = setup();

    await lastValueFrom(interceptor.intercept(httpContext({}, {}, 'rpc'), handler(of(1))));

    expect(await durationCount(metrics)).toBe(0);
  });

  it('labels every series with the service name, falling back to "unknown"', async () => {
    const named = setup({ SERVICE_NAME: 'driver-api' });
    const unnamed = setup({});

    for (const { interceptor } of [named, unnamed]) {
      await lastValueFrom(
        interceptor.intercept(
          httpContext({ method: 'GET', url: '/api/v1/x' }, { statusCode: 200 }),
          handler(of(null)),
        ),
      );
    }

    expect(await named.metrics.registry.metrics()).toMatch(
      /stocdup_http_requests_total\{[^}]*service="driver-api"[^}]*\} 1/,
    );
    expect(await unnamed.metrics.registry.metrics()).toMatch(
      /stocdup_http_requests_total\{[^}]*service="unknown"[^}]*\} 1/,
    );
  });
});
