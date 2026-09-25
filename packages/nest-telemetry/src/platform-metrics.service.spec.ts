import type { ConfigService } from '@nestjs/config';
import { PlatformMetricsService } from './platform-metrics.service';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T>(key: string, dflt?: T): T | undefined => (values[key] ?? dflt) as T | undefined,
  } as unknown as ConfigService;
}

function service(env: Record<string, string> = { APP_ENV: 'live', SERVICE_NAME: 'api' }) {
  return new PlatformMetricsService(fakeConfig(env));
}

/** The exposition text a scrape would receive. */
const scrape = (m: PlatformMetricsService) => m.registry.metrics();

describe('PlatformMetricsService', () => {
  it('exposes cumulative request counters labelled by method, status class, environment and service', async () => {
    const m = service();
    m.recordHttpRequest('GET', '2xx');
    m.recordHttpRequest('GET', '2xx');
    m.recordHttpRequest('POST', '5xx');

    const text = await scrape(m);
    expect(text).toMatch(/stocdup_http_requests_total\{(?=[^}]*method="GET")(?=[^}]*status_class="2xx")(?=[^}]*environment="live")(?=[^}]*service="api")[^}]*\} 2/);
    expect(text).toMatch(/stocdup_http_requests_total\{(?=[^}]*method="POST")(?=[^}]*status_class="5xx")[^}]*\} 1/);
    expect(text).toContain('# TYPE stocdup_http_requests_total counter');
  });

  it('defaults environment to local and service to unknown', async () => {
    const m = service({});
    m.recordHttpRequest('GET', '2xx');

    expect(await scrape(m)).toMatch(
      /stocdup_http_requests_total\{(?=[^}]*environment="local")(?=[^}]*service="unknown")[^}]*\} 1/,
    );
  });

  it('observes request duration into histogram buckets, sum and count', async () => {
    const m = service();
    m.observeHttpDuration(0.042);
    m.observeHttpDuration(3);

    const text = await scrape(m);
    expect(text).toContain('# TYPE stocdup_http_request_duration_seconds histogram');
    expect(text).toMatch(/stocdup_http_request_duration_seconds_bucket\{le="0\.05"[^}]*\} 1/);
    expect(text).toMatch(/stocdup_http_request_duration_seconds_bucket\{le="5"[^}]*\} 2/);
    expect(text).toMatch(/stocdup_http_request_duration_seconds_bucket\{le="\+Inf"[^}]*\} 2/);
    expect(text).toMatch(/stocdup_http_request_duration_seconds_sum\{[^}]*\} 3\.042/);
    expect(text).toMatch(/stocdup_http_request_duration_seconds_count\{[^}]*\} 2/);
  });

  it('drops non-finite and negative durations instead of throwing', async () => {
    const m = service();

    expect(() => m.observeHttpDuration(Number.NaN)).not.toThrow();
    expect(() => m.observeHttpDuration(Number.POSITIVE_INFINITY)).not.toThrow();
    expect(() => m.observeHttpDuration(-1)).not.toThrow();

    expect(await scrape(m)).not.toMatch(/stocdup_http_request_duration_seconds_count\{[^}]*\} [1-9]/);
  });

  it('sets queue gauges, overwriting the previous sweep', async () => {
    const m = service();
    m.setQueueJobs(7, 'notifications', 'waiting');
    m.setQueueJobs(2, 'notifications', 'waiting');
    m.setQueueJobs(1, 'notifications', 'failed');
    m.setQueueOldestWaitingAgeMs(1500, 'notifications');

    const text = await scrape(m);
    expect(text).toMatch(/stocdup_queue_jobs\{(?=[^}]*queue="notifications")(?=[^}]*state="waiting")[^}]*\} 2\n/);
    expect(text).toMatch(/stocdup_queue_jobs\{(?=[^}]*state="failed")[^}]*\} 1\n/);
    expect(text).toMatch(/stocdup_queue_oldest_waiting_age_ms\{(?=[^}]*queue="notifications")[^}]*\} 1500\n/);
  });

  it('records 0 for non-finite or negative gauge values instead of throwing', async () => {
    const m = service();

    expect(() => m.setQueueJobs(Number.NaN, 'q', 'waiting')).not.toThrow();
    expect(() => m.setQueueOldestWaitingAgeMs(-5, 'q')).not.toThrow();

    const text = await scrape(m);
    expect(text).toMatch(/stocdup_queue_jobs\{(?=[^}]*queue="q")[^}]*\} 0\n/);
    expect(text).toMatch(/stocdup_queue_oldest_waiting_age_ms\{(?=[^}]*queue="q")[^}]*\} 0\n/);
  });

  it('keeps each instance on its own registry', async () => {
    const a = service();
    const b = service();
    a.recordHttpRequest('GET', '2xx');

    expect(await scrape(b)).not.toMatch(/stocdup_http_requests_total\{/);
  });
});
