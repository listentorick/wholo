import type { Job } from 'bullmq';
import { AccountingProviderError } from './adapters/accounting-provider.error';
import { CALL_BUDGET_EXHAUSTED } from './accounting-call-budget.service';

// Part of the accounting integration framework — see
// adapters/accounting-connection-adapter.interface.ts.
//
// The one failure policy for every accounting job (pulls and invoice export).
// Adapters classify provider failures (AccountingProviderError.transient);
// this turns that into what the job does next:
//   permanent   — retrying would fail identically (validation, 403, reconnect
//                 needed): stop retrying (UnrecoverableError / wait for the user).
//   lastAttempt — BullMQ will not run this job again after this failure.
//   budgetWait  — our own per-organisation call budget ran out
//                 (CALL_BUDGET_EXHAUSTED): nothing was sent to the provider,
//                 so it's a wait, not a failure (ADR-071).
// Anything that isn't an AccountingProviderError is unexpected (our bug) and
// is treated as transient.
export interface JobFailure {
  providerError: AccountingProviderError | null;
  permanent: boolean;
  lastAttempt: boolean;
  budgetWait: boolean;
}

// attemptsMade counts previous failed attempts while this one runs.
export function isLastAttempt(job: Pick<Job, 'attemptsMade' | 'opts'>): boolean {
  return (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1);
}

export function classifyJobFailure(err: unknown, job: Pick<Job, 'attemptsMade' | 'opts'>): JobFailure {
  const providerError = err instanceof AccountingProviderError ? err : null;
  return {
    providerError,
    permanent: providerError !== null && !providerError.transient,
    lastAttempt: isLastAttempt(job),
    budgetWait: providerError?.code === CALL_BUDGET_EXHAUSTED,
  };
}
