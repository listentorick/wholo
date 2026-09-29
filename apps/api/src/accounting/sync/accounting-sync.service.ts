import { Injectable, Logger } from '@nestjs/common';
import { IngestionRun, IngestionRunTrigger, Prisma } from '@prisma/client';
import type { AccountingSyncStatusResponse, IngestionRunSummary } from '@wholo/types';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { IngestionRunService } from '../../ingestion/ingestion-run.service';
import { AccountingConnectionService } from '../accounting-connection.service';
import {
  ACCOUNTING_SOURCE_TYPE,
  ACCOUNTING_SYNC_EVENT_TYPE,
  ACCOUNTING_SYNC_INTERVAL_MS,
  ACCOUNTING_SYNC_RESOURCE_TYPES,
  AccountingSyncResourceType,
} from './accounting-sync.constants';

// When a scheduled row's slot has passed, its next slot is the first one
// strictly after `now` on the same grid (slot + k·interval): no drift, and a
// long outage skips the missed slots rather than replaying them.
export function nextSlotAfter(slot: Date, now: Date, intervalMs: number): Date {
  const behind = now.getTime() - slot.getTime();
  const steps = behind < 0 ? 1 : Math.floor(behind / intervalMs) + 1;
  return new Date(slot.getTime() + steps * intervalMs);
}

export interface EnqueueDueResult {
  enqueued: boolean;
  nextRunAt: Date;
}

@Injectable()
export class AccountingSyncService {
  private readonly logger = new Logger(AccountingSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly ingestionRuns: IngestionRunService,
    private readonly connections: AccountingConnectionService,
  ) {}

  // Manual "Sync with Xero" — all three resource types, in one transaction.
  async requestSync(distributorId: string, trigger: IngestionRunTrigger): Promise<AccountingSyncStatusResponse> {
    const connection = await this.connections.getActiveConnectionOrThrow(distributorId);
    const queued = await this.enqueue(distributorId, connection.id, [...ACCOUNTING_SYNC_RESOURCE_TYPES], trigger);
    this.logger.log(
      {
        event: 'accounting.sync.requested',
        provider: connection.provider,
        distributorId,
        connectionId: connection.id,
        trigger,
        queued,
      },
      `Accounting sync requested for distributor ${distributorId} (${trigger}); queued: ${queued.join(', ') || 'none — already in flight'}`,
    );
    // Return the full current status so the caller (and the UI) sees all
    // resource types, not just the ones just queued.
    return this.getStatus(distributorId);
  }

  // Single resource type for one connection (e.g. a targeted re-sync).
  async requestSyncForConnection(
    distributorId: string,
    connectionId: string,
    resourceType: AccountingSyncResourceType,
    trigger: IngestionRunTrigger,
  ): Promise<AccountingSyncStatusResponse> {
    await this.enqueue(distributorId, connectionId, [resourceType], trigger);
    return this.getStatus(distributorId);
  }

  // Scheduler path: in one transaction, request the run (writing the outbox
  // event only if nothing is already in flight) and move the row's slot on.
  // The slot advances even when a run is in flight — that slot's work is
  // already covered by the running pull.
  async enqueueDue(
    distributorId: string,
    connectionId: string,
    resourceType: AccountingSyncResourceType,
    slot: Date | null,
    now: Date,
  ): Promise<EnqueueDueResult> {
    const intervalMs = ACCOUNTING_SYNC_INTERVAL_MS[resourceType];
    return this.prisma.$transaction(async (tx) => {
      const { run, shouldEnqueue } = await this.ingestionRuns.requestRun(tx, {
        distributorId,
        sourceType: ACCOUNTING_SOURCE_TYPE,
        sourceRef: connectionId,
        resourceType,
        trigger: IngestionRunTrigger.SCHEDULED,
      });
      if (shouldEnqueue) {
        await this.writeSyncEvent(tx, connectionId, resourceType, run.id);
      }
      const nextRunAt = nextSlotAfter(slot ?? now, now, intervalMs);
      await this.ingestionRuns.advanceSchedule(tx, run.id, nextRunAt);
      return { enqueued: shouldEnqueue, nextRunAt };
    });
  }

  async getStatus(distributorId: string): Promise<AccountingSyncStatusResponse> {
    const connection = await this.connections.getCurrentConnection(distributorId);
    if (!connection) {
      return { runs: [], lastSucceededAt: null };
    }
    const rows = await this.ingestionRuns.listRuns({
      distributorId,
      sourceType: ACCOUNTING_SOURCE_TYPE,
      sourceRef: connection.id,
    });
    const runs = rows.map(toSummary);
    const lastSucceededAt = rows
      .filter((r) => r.status === 'COMPLETED' && r.finishedAt)
      .map((r) => r.finishedAt as Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return { runs, lastSucceededAt: lastSucceededAt ? lastSucceededAt.toISOString() : null };
  }

  // Returns the resource types actually queued — a type whose run is already
  // queued/processing gets no second event (requestRun's shouldEnqueue).
  private async enqueue(
    distributorId: string,
    connectionId: string,
    resourceTypes: AccountingSyncResourceType[],
    trigger: IngestionRunTrigger,
  ): Promise<AccountingSyncResourceType[]> {
    return this.prisma.$transaction(async (tx) => {
      const queued: AccountingSyncResourceType[] = [];
      for (const resourceType of resourceTypes) {
        const { run, shouldEnqueue } = await this.ingestionRuns.requestRun(tx, {
          distributorId,
          sourceType: ACCOUNTING_SOURCE_TYPE,
          sourceRef: connectionId,
          resourceType,
          trigger,
        });
        if (shouldEnqueue) {
          await this.writeSyncEvent(tx, connectionId, resourceType, run.id);
          queued.push(resourceType);
        }
      }
      return queued;
    });
  }

  private async writeSyncEvent(
    tx: Prisma.TransactionClient,
    connectionId: string,
    resourceType: AccountingSyncResourceType,
    runId: string,
  ): Promise<void> {
    await this.outbox.writeEvent(
      tx,
      'AccountingConnection',
      connectionId,
      ACCOUNTING_SYNC_EVENT_TYPE[resourceType],
      { runId } as Prisma.InputJsonValue,
    );
  }
}

function toSummary(run: IngestionRun): IngestionRunSummary {
  return {
    id: run.id,
    sourceType: run.sourceType,
    sourceRef: run.sourceRef,
    resourceType: run.resourceType,
    status: run.status,
    trigger: run.trigger,
    recordsTotal: run.recordsTotal,
    recordsProcessed: run.recordsProcessed,
    recordsFailed: run.recordsFailed,
    recordsCreated: run.recordsCreated,
    recordsUpdated: run.recordsUpdated,
    recordsRemoved: run.recordsRemoved,
    detailCount: run.detailCount,
    errorMessage: run.errorMessage,
    queuedAt: run.queuedAt.toISOString(),
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
  };
}
