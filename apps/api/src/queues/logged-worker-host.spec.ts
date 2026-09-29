import { Logger } from '@nestjs/common';
import { MetadataScanner } from '@nestjs/core';
import { ON_WORKER_EVENT_METADATA } from '@nestjs/bullmq/dist/bull.constants';
import { Job, UnrecoverableError } from 'bullmq';
import { describeJobFailure, LoggedWorkerHost } from './logged-worker-host';

function fakeJob(overrides: Partial<{ attemptsMade: number; attempts: number; data: unknown }> = {}): Job {
  return {
    id: 'job-1',
    name: 'OrderAccepted',
    attemptsMade: overrides.attemptsMade ?? 1,
    opts: { attempts: overrides.attempts ?? 5 },
    data: overrides.data ?? { eventId: 'evt-1', aggregateType: 'Order', aggregateId: 'order-1', payload: {} },
  } as unknown as Job;
}

describe('describeJobFailure', () => {
  it('logs a retryable failure at warn with the outbox correlation ids', () => {
    const log = describeJobFailure('accounting-invoice-export', fakeJob({ attemptsMade: 2 }), new Error('HTTP 503'));

    expect(log.level).toBe('warn');
    expect(log.fields).toMatchObject({
      event: 'queue.job.failed',
      queue: 'accounting-invoice-export',
      jobId: 'job-1',
      jobName: 'OrderAccepted',
      attemptsMade: 2,
      maxAttempts: 5,
      final: false,
      eventId: 'evt-1',
      aggregateType: 'Order',
      aggregateId: 'order-1',
    });
    expect((log.fields.err as Error).message).toBe('HTTP 503');
    expect(log.message).toContain('will retry (attempt 2/5)');
  });

  it('logs the last attempt at error — BullMQ has given up', () => {
    const log = describeJobFailure('accounting-contact-sync', fakeJob({ attemptsMade: 3, attempts: 3 }), new Error('x'));

    expect(log.level).toBe('error');
    expect(log.fields.final).toBe(true);
    expect(log.message).toContain('gave up');
  });

  it('treats UnrecoverableError as final even with attempts left', () => {
    const log = describeJobFailure('q', fakeJob({ attemptsMade: 1, attempts: 5 }), new UnrecoverableError('permanent'));

    expect(log.level).toBe('error');
    expect(log.fields.final).toBe(true);
  });

  it('omits correlation ids a non-outbox job does not carry', () => {
    const log = describeJobFailure('q', fakeJob({ data: { bulkJobId: 'b-1' } }), new Error('x'));

    expect(log.fields).not.toHaveProperty('eventId');
    expect(log.fields).not.toHaveProperty('aggregateId');
  });

  it('still logs when BullMQ passes no job', () => {
    const log = describeJobFailure('q', undefined, new Error('x'));

    expect(log.level).toBe('error');
    expect(log.fields.jobId).toBeUndefined();
  });

  it('never puts a raw non-Error rejection on the log line', () => {
    const raw = JSON.stringify({ response: { body: { EmailAddress: 'jane@customer.com' } } });
    const log = describeJobFailure('q', fakeJob(), raw as unknown as Error);

    expect(JSON.stringify({ ...log.fields, err: (log.fields.err as Error).message })).not.toContain('jane@customer.com');
  });
});

describe('LoggedWorkerHost', () => {
  class TestProcessor extends LoggedWorkerHost {
    async process(): Promise<void> {}
  }

  function processorWithWorker(name: string): TestProcessor {
    const processor = new TestProcessor();
    Object.defineProperty(processor, 'worker', { get: () => ({ name }) });
    return processor;
  }

  afterEach(() => jest.restoreAllMocks());

  it('emits one structured line per failed attempt, context = the processor class', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    processorWithWorker('analytics-facts').onJobFailed(fakeJob({ attemptsMade: 1 }), new Error('db blip'));

    expect(warn).toHaveBeenCalledTimes(1);
    const [fields, message] = warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields).toMatchObject({ event: 'queue.job.failed', queue: 'analytics-facts', final: false });
    expect(message).toContain('analytics-facts job OrderAccepted job-1 failed');
  });

  it('logs a stalled job at warn', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    processorWithWorker('notifications').onJobStalled('job-9');

    expect(warn.mock.calls[0][0]).toMatchObject({ event: 'queue.job.stalled', queue: 'notifications', jobId: 'job-9' });
  });

  it('registers its handlers where @nestjs/bullmq discovers them on a subclass', () => {
    // Same walk BullExplorer.registerWorkerEventListeners does: scan the
    // subclass instance's prototype chain, read the @OnWorkerEvent metadata.
    const instance = new TestProcessor();
    const events: string[] = [];
    new MetadataScanner().scanFromPrototype(instance, Object.getPrototypeOf(instance), (key) => {
      const meta = Reflect.getMetadata(ON_WORKER_EVENT_METADATA, (instance as unknown as Record<string, object>)[key]);
      if (meta) events.push(meta.eventName);
    });

    expect(events.sort()).toEqual(['failed', 'stalled']);
  });
});
