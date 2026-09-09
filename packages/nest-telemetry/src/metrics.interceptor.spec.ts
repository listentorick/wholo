import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { lastValueFrom, of, throwError } from 'rxjs';
import { MetricsInterceptor } from './metrics.interceptor';
import type { MetricsService } from './metrics.service';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T>(key: string, dflt?: T): T | undefined => (values[key] ?? dflt) as T | undefined,
  } as unknown as ConfigService;
}

function metricsSpy() {
  return {
    increment: vi.fn(),
    timing: vi.fn(),
    gauge: vi.fn(),
  } as unknown as MetricsService & {
    increment: ReturnType<typeof vi.fn>;
    timing: ReturnType<typeof vi.fn>;
    gauge: ReturnType<typeof vi.fn>;
  };
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

describe('MetricsInterceptor', () => {
  it('emits a request counter + a timing on a successful response', async () => {
    const metrics = metricsSpy();
    const interceptor = new MetricsInterceptor(metrics, fakeConfig({ SERVICE_NAME: 'api' }));

    await lastValueFrom(
      interceptor.intercept(
        httpContext({ method: 'get', url: '/api/v1/orders' }, { statusCode: 200 }),
        handler(of({ ok: true })),
      ),
    );

    expect(metrics.increment).toHaveBeenCalledWith('stocdup_http_requests', 1, {
      service: 'api',
      method: 'GET',
      status_class: '2xx',
    });
    expect(metrics.timing).toHaveBeenCalledWith(
      'stocdup_http_request_ms',
      expect.any(Number),
      { service: 'api' },
    );
  });

  it('maps status codes to classes', async () => {
    const metrics = metricsSpy();
    const interceptor = new MetricsInterceptor(metrics, fakeConfig({ SERVICE_NAME: 'portal-api' }));

    for (const [status, klass] of [
      [204, '2xx'],
      [301, '3xx'],
      [404, '4xx'],
      [503, '5xx'],
    ] as const) {
      await lastValueFrom(
        interceptor.intercept(
          httpContext({ method: 'GET', url: '/api/v1/x' }, { statusCode: status }),
          handler(of(null)),
        ),
      );
      expect(metrics.increment).toHaveBeenLastCalledWith('stocdup_http_requests', 1, {
        service: 'portal-api',
        method: 'GET',
        status_class: klass,
      });
    }
  });

  it('records a thrown HttpException with its own status class and still emits a timing', async () => {
    const metrics = metricsSpy();
    const interceptor = new MetricsInterceptor(metrics, fakeConfig({ SERVICE_NAME: 'api' }));
    const err = Object.assign(new Error('boom'), { getStatus: () => 503 });

    await expect(
      lastValueFrom(
        interceptor.intercept(
          httpContext({ method: 'POST', url: '/api/v1/orders' }, { statusCode: 200 }),
          handler(throwError(() => err)),
        ),
      ),
    ).rejects.toThrow('boom');

    expect(metrics.increment).toHaveBeenCalledWith('stocdup_http_requests', 1, {
      service: 'api',
      method: 'POST',
      status_class: '5xx',
    });
    expect(metrics.timing).toHaveBeenCalledWith(
      'stocdup_http_request_ms',
      expect.any(Number),
      { service: 'api' },
    );
  });

  it('treats a plain thrown error as 5xx', async () => {
    const metrics = metricsSpy();
    const interceptor = new MetricsInterceptor(metrics, fakeConfig({ SERVICE_NAME: 'api' }));

    await expect(
      lastValueFrom(
        interceptor.intercept(
          httpContext({ method: 'GET', url: '/api/v1/x' }, { statusCode: 200 }),
          handler(throwError(() => new Error('kaboom'))),
        ),
      ),
    ).rejects.toThrow('kaboom');

    expect(metrics.increment).toHaveBeenCalledWith('stocdup_http_requests', 1, {
      service: 'api',
      method: 'GET',
      status_class: '5xx',
    });
  });

  it('ignores health-probe traffic', async () => {
    const metrics = metricsSpy();
    const interceptor = new MetricsInterceptor(metrics, fakeConfig({ SERVICE_NAME: 'api' }));

    for (const url of ['/api/v1/health', '/api/v1/health/ready']) {
      await lastValueFrom(
        interceptor.intercept(
          httpContext({ method: 'GET', url }, { statusCode: 200 }),
          handler(of(null)),
        ),
      );
    }

    expect(metrics.increment).not.toHaveBeenCalled();
    expect(metrics.timing).not.toHaveBeenCalled();
  });

  it('ignores non-HTTP execution contexts', async () => {
    const metrics = metricsSpy();
    const interceptor = new MetricsInterceptor(metrics, fakeConfig({}));

    await lastValueFrom(interceptor.intercept(httpContext({}, {}, 'rpc'), handler(of(1))));

    expect(metrics.increment).not.toHaveBeenCalled();
  });

  it('falls back to service=unknown when SERVICE_NAME is unset', async () => {
    const metrics = metricsSpy();
    const interceptor = new MetricsInterceptor(metrics, fakeConfig({}));

    await lastValueFrom(
      interceptor.intercept(
        httpContext({ method: 'GET', url: '/api/v1/x' }, { statusCode: 200 }),
        handler(of(null)),
      ),
    );

    expect(metrics.increment).toHaveBeenCalledWith('stocdup_http_requests', 1, {
      service: 'unknown',
      method: 'GET',
      status_class: '2xx',
    });
  });
});
