import { ConfigService } from '@nestjs/config';
import { MetricsService } from '@wholo/nest-telemetry';

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
  const metrics = {
    increment: jest.fn(),
    timing: jest.fn(),
    gauge: jest.fn(),
  } as unknown as MetricsService;
  const config = { get: jest.fn((_k: string, d?: unknown) => d) } as unknown as ConfigService;
  const scheduler = new QueueMetricsScheduler(metrics, config);
  const queues = (MockedQueue as unknown as jest.Mock).mock.results.map(
    (r) => r.value as FakeQueue,
  );
  return { metrics, scheduler, queues };
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
      ]),
    );
    expect(new Set(names).size).toBe(names.length); // no duplicates
  });

  it('emits a job-count gauge per (queue, state) and an oldest-waiting-age gauge', async () => {
    const { metrics, scheduler, queues } = build();
    queues[0].getJobCounts.mockResolvedValue({ waiting: 4, active: 1, delayed: 2, failed: 3 });

    await scheduler.sweep();

    for (const state of ['waiting', 'active', 'delayed', 'failed']) {
      expect(metrics.gauge).toHaveBeenCalledWith('stocdup_queue_jobs', expect.any(Number), {
        queue: queues[0].name,
        state,
      });
    }
    expect(metrics.gauge).toHaveBeenCalledWith('stocdup_queue_jobs', 3, {
      queue: queues[0].name,
      state: 'failed',
    });
    expect(metrics.gauge).toHaveBeenCalledWith(
      'stocdup_queue_oldest_waiting_age_ms',
      expect.any(Number),
      { queue: queues[0].name },
    );
    // 9 queues x (4 state gauges + 1 age gauge)
    expect((metrics.gauge as jest.Mock).mock.calls.length).toBe(queues.length * 5);
  });

  it('reports the age of the oldest waiting job from either end of the list', async () => {
    const { metrics, scheduler, queues } = build();
    const now = Date.now();
    queues[0].getWaiting
      .mockResolvedValueOnce([{ timestamp: now - 1_000 }]) // head sample (newest)
      .mockResolvedValueOnce([{ timestamp: now - 90_000 }]); // tail sample (oldest)

    await scheduler.sweep();

    const ageCall = (metrics.gauge as jest.Mock).mock.calls.find(
      (c) => c[0] === 'stocdup_queue_oldest_waiting_age_ms' && c[2].queue === queues[0].name,
    );
    expect(ageCall?.[1]).toBeGreaterThanOrEqual(90_000);
    expect(ageCall?.[1]).toBeLessThan(95_000);
  });

  it('reports 0 age when nothing is waiting', async () => {
    const { metrics, scheduler, queues } = build();
    await scheduler.sweep();
    const ageCall = (metrics.gauge as jest.Mock).mock.calls.find(
      (c) => c[0] === 'stocdup_queue_oldest_waiting_age_ms' && c[2].queue === queues[0].name,
    );
    expect(ageCall?.[1]).toBe(0);
  });

  it('keeps sweeping when one queue throws', async () => {
    const { metrics, scheduler, queues } = build();
    queues[0].getJobCounts.mockRejectedValue(new Error('redis down'));

    await expect(scheduler.sweep()).resolves.toBeUndefined();

    // the remaining 8 queues still reported (8 x 5 gauges)
    expect((metrics.gauge as jest.Mock).mock.calls.length).toBe((queues.length - 1) * 5);
  });

  it('is a no-op while a previous sweep is still running (re-entrancy guard)', async () => {
    const { metrics, scheduler } = build();
    (scheduler as unknown as { running: boolean }).running = true;

    await scheduler.sweep();

    expect(metrics.gauge).not.toHaveBeenCalled();
  });

  it('closes its queues and connection on shutdown', async () => {
    const { scheduler, queues } = build();
    await scheduler.onModuleDestroy();
    for (const q of queues) expect(q.close).toHaveBeenCalled();
  });
});
