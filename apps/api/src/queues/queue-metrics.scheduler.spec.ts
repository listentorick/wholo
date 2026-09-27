import { ConfigService } from '@nestjs/config';
import { PlatformMetricsService } from '@wholo/nest-telemetry';

// BullMQ Queue / ioredis are constructed in the scheduler ctor — stub both so
// the unit test never touches Redis.
jest.mock('ioredis', () => {
  const ctor = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
  }));
  return { __esModule: true, default: ctor, Redis: ctor };
});

interface FakeQueue {
  name: string;
  getJobCounts: jest.Mock;
  getWaiting: jest.Mock;
  close: jest.Mock;
}

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(
    (name: string): FakeQueue => ({
      name,
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, delayed: 0, failed: 0 }),
      getWaiting: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  ),
}));

import { Queue as MockedQueue } from 'bullmq';
import { QueueMetricsScheduler } from './queue-metrics.scheduler';

function build() {
  const config = { get: jest.fn((_k: string, d?: unknown) => d) } as unknown as ConfigService;
  // A real registry — assertions read what a /metrics scrape would see.
  const metrics = new PlatformMetricsService(config);
  const scheduler = new QueueMetricsScheduler(metrics, config);
  const queues = (MockedQueue as unknown as jest.Mock).mock.results.map(
    (r) => r.value as FakeQueue,
  );
  return { metrics, scheduler, queues };
}

type Series = { labels: Record<string, string | number>; value: number };

async function series(metrics: PlatformMetricsService, name: string): Promise<Series[]> {
  const metric = metrics.registry.getSingleMetric(name);
  return metric ? ((await metric.get()).values as Series[]) : [];
}

const jobs = (m: PlatformMetricsService) => series(m, 'stocdup_queue_jobs');
const ages = (m: PlatformMetricsService) => series(m, 'stocdup_queue_oldest_waiting_age_ms');

async function ageOf(m: PlatformMetricsService, queue: string): Promise<number | undefined> {
  return (await ages(m)).find((s) => s.labels.queue === queue)?.value;
}

/** Queues with a reported value — every state gauge plus the age gauge. */
async function reportedQueues(m: PlatformMetricsService): Promise<Set<string>> {
  const names = new Set<string>();
  for (const s of [...(await jobs(m)), ...(await ages(m))]) names.add(String(s.labels.queue));
  return names;
}

describe('QueueMetricsScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (MockedQueue as unknown as jest.Mock).mockImplementation((name: string): FakeQueue => ({
      name,
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, delayed: 0, failed: 0 }),
      getWaiting: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined),
    }));
  });

  it('monitors every declared queue', () => {
    const { queues } = build();
    const names = queues.map((q) => q.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'notifications',
        'notification-delivery',
        'accounting-invoice-export',
        'accounting-contact-sync',
        'accounting-product-sync',
        'accounting-tax-type-sync',
        'analytics-facts',
        'accounting-bulk-import',
        'delivery-run-allocation',
        'keycloak-users',
      ]),
    );
    expect(new Set(names).size).toBe(names.length); // no duplicates
  });

  it('sets a job-count gauge per (queue, state) and an oldest-waiting-age gauge', async () => {
    const { metrics, scheduler, queues } = build();
    queues[0].getJobCounts.mockResolvedValue({ waiting: 4, active: 1, delayed: 2, failed: 3 });

    await scheduler.sweep();

    const first = (await jobs(metrics)).filter((s) => s.labels.queue === queues[0].name);
    expect(Object.fromEntries(first.map((s) => [s.labels.state, s.value]))).toEqual({
      waiting: 4,
      active: 1,
      delayed: 2,
      failed: 3,
    });
    expect(await ageOf(metrics, queues[0].name)).toBe(0);
    // every queue x 4 states, and one age series per queue
    expect(await jobs(metrics)).toHaveLength(queues.length * 4);
    expect(await ages(metrics)).toHaveLength(queues.length);
  });

  it('overwrites the previous sweep rather than accumulating', async () => {
    const { metrics, scheduler, queues } = build();
    queues[0].getJobCounts.mockResolvedValueOnce({ waiting: 9, active: 0, delayed: 0, failed: 0 });
    await scheduler.sweep();
    queues[0].getJobCounts.mockResolvedValueOnce({ waiting: 2, active: 0, delayed: 0, failed: 0 });
    await scheduler.sweep();

    const waiting = (await jobs(metrics)).find(
      (s) => s.labels.queue === queues[0].name && s.labels.state === 'waiting',
    );
    expect(waiting?.value).toBe(2);
  });

  it('reports the age of the oldest waiting job from either end of the list', async () => {
    const { metrics, scheduler, queues } = build();
    const now = Date.now();
    queues[0].getWaiting
      .mockResolvedValueOnce([{ timestamp: now - 1_000 }]) // head sample (newest)
      .mockResolvedValueOnce([{ timestamp: now - 90_000 }]); // tail sample (oldest)

    await scheduler.sweep();

    const age = await ageOf(metrics, queues[0].name);
    expect(age).toBeGreaterThanOrEqual(90_000);
    expect(age).toBeLessThan(95_000);
  });

  it('reports 0 age when nothing is waiting', async () => {
    const { metrics, scheduler, queues } = build();
    await scheduler.sweep();
    expect(await ageOf(metrics, queues[0].name)).toBe(0);
  });

  it('keeps sweeping when one queue throws', async () => {
    const { metrics, scheduler, queues } = build();
    queues[0].getJobCounts.mockRejectedValue(new Error('redis down'));

    await expect(scheduler.sweep()).resolves.toBeUndefined();

    // the remaining queues still reported
    const reported = await reportedQueues(metrics);
    expect(reported.has(queues[0].name)).toBe(false);
    expect(reported.size).toBe(queues.length - 1);
  });

  it('times out a hung queue call and does not leave the sweep wedged', async () => {
    jest.useFakeTimers();
    try {
      const { metrics, scheduler, queues } = build();
      queues[0].getJobCounts.mockReturnValue(new Promise(() => {})); // never settles

      const swept = scheduler.sweep();
      await jest.advanceTimersByTimeAsync(11_000); // past REPORT_TIMEOUT_MS
      await swept;

      // queue 0 timed out, the others still reported
      const reported = await reportedQueues(metrics);
      expect(reported.has(queues[0].name)).toBe(false);
      expect(reported.size).toBe(queues.length - 1);
      // re-entrancy guard released
      expect((scheduler as unknown as { running: boolean }).running).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('is a no-op while a previous sweep is still running (re-entrancy guard)', async () => {
    const { metrics, scheduler } = build();
    (scheduler as unknown as { running: boolean }).running = true;

    await scheduler.sweep();

    expect((await reportedQueues(metrics)).size).toBe(0);
  });

  it('closes its queues and connection on shutdown', async () => {
    const { scheduler, queues } = build();
    await scheduler.onModuleDestroy();
    for (const q of queues) expect(q.close).toHaveBeenCalled();
  });
});
