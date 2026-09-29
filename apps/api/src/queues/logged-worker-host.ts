import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { loggableError } from '@wholo/nest-telemetry';
import { Job, UnrecoverableError } from 'bullmq';

// The payload shape every outbox-relayed job carries (OutboxPublisherService).
// Jobs added any other way simply lack these fields.
interface OutboxJobData {
  eventId?: unknown;
  aggregateType?: unknown;
  aggregateId?: unknown;
}

export interface JobFailureLog {
  level: 'warn' | 'error';
  fields: Record<string, unknown>;
  message: string;
}

// Pure so it can be tested without a running Worker. "final" means BullMQ will
// not run this job again: attempts are used up, or the processor threw
// UnrecoverableError (a permanent failure it already recorded). A final
// failure needs a human, so it is logged at error; a failure that will be
// retried is expected churn (rate limits, blips) and logged at warn.
export function describeJobFailure(queue: string, job: Job | undefined, err: Error): JobFailureLog {
  const maxAttempts = job?.opts.attempts ?? 1;
  const attemptsMade = job?.attemptsMade ?? 0;
  // No job at all (BullMQ can emit that for a lock-lost failure): nothing
  // tells us a retry is coming, so treat it as needing attention.
  const final =
    !job || err instanceof UnrecoverableError || err?.name === 'UnrecoverableError' || attemptsMade >= maxAttempts;
  const data = (job?.data ?? {}) as OutboxJobData;
  const fields: Record<string, unknown> = {
    event: 'queue.job.failed',
    queue,
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade,
    maxAttempts,
    final,
    err: loggableError(err),
  };
  if (typeof data.eventId === 'string') fields.eventId = data.eventId;
  if (typeof data.aggregateType === 'string') fields.aggregateType = data.aggregateType;
  if (typeof data.aggregateId === 'string') fields.aggregateId = data.aggregateId;

  const outcome = final ? 'gave up' : `will retry (attempt ${attemptsMade}/${maxAttempts})`;
  return {
    level: final ? 'error' : 'warn',
    fields,
    message: `${queue} job ${job?.name ?? '?'} ${job?.id ?? '?'} failed — ${outcome}`,
  };
}

// Base for every BullMQ processor in apps/api (ADR-064 addendum): a thrown
// job error is otherwise invisible — BullMQ records it in Redis and nothing
// reaches the logs. Extending this instead of WorkerHost gives each queue one
// structured `queue.job.failed` line per failed attempt (warn while retries
// remain, error once BullMQ gives up) and a warn on stalled jobs.
//
// @nestjs/bullmq discovers @OnWorkerEvent handlers by walking the instance's
// prototype chain (MetadataScanner.scanFromPrototype), so handlers declared
// here register for every subclass.
export abstract class LoggedWorkerHost extends WorkerHost {
  private readonly jobEventLogger = new Logger(this.constructor.name);

  @OnWorkerEvent('failed')
  onJobFailed(job: Job | undefined, err: Error): void {
    const { level, fields, message } = describeJobFailure(this.worker.name, job, err);
    this.jobEventLogger[level](fields, message);
  }

  @OnWorkerEvent('stalled')
  onJobStalled(jobId: string): void {
    this.jobEventLogger.warn(
      { event: 'queue.job.stalled', queue: this.worker.name, jobId },
      `${this.worker.name} job ${jobId} stalled — BullMQ will re-run it`,
    );
  }
}
