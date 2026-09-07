import { Injectable } from '@nestjs/common';
import { IngestionRun, IngestionRunTrigger, Prisma } from '@prisma/client';
import type { AccountingSyncStatusResponse, IngestionRunSummary } from '@wholo/types';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { IngestionRunService } from '../../ingestion/ingestion-run.service';
import { AccountingConnectionService } from '../accounting-connection.service';
import {
  ACCOUNTING_SOURCE_TYPE,
  ACCOUNTING_SYNC_EVENT_TYPE,
  ACCOUNTING_SYNC_RESOURCE_TYPES,
  AccountingSyncResourceType,
} from './accounting-sync.constants';

@Injectable()
export class AccountingSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly ingestionRuns: IngestionRunService,
    private readonly connections: AccountingConnectionService,
  ) {}

  // Manual "Sync with Xero" — all three resource types, in one transaction.
  async requestSync(distributorId: string, trigger: IngestionRunTrigger): Promise<AccountingSyncStatusResponse> {
    const connection = await this.connections.getActiveConnectionOrThrow(distributorId);
    return this.enqueue(distributorId, connection.id, [...ACCOUNTING_SYNC_RESOURCE_TYPES], trigger);
  }

  // Used by the schedulers — they already hold the connection id and sweep one
  // resource type at a time.
  async requestSyncForConnection(
    distributorId: string,
    connectionId: string,
    resourceType: AccountingSyncResourceType,
    trigger: IngestionRunTrigger,
  ): Promise<AccountingSyncStatusResponse> {
    return this.enqueue(distributorId, connectionId, [resourceType], trigger);
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

  private async enqueue(
    distributorId: string,
    connectionId: string,
    resourceTypes: AccountingSyncResourceType[],
    trigger: IngestionRunTrigger,
  ): Promise<AccountingSyncStatusResponse> {
    await this.prisma.$transaction(async (tx) => {
      for (const resourceType of resourceTypes) {
        const run = await this.ingestionRuns.requestRun(tx, {
          distributorId,
          sourceType: ACCOUNTING_SOURCE_TYPE,
          sourceRef: connectionId,
          resourceType,
          trigger,
        });
        await this.outbox.writeEvent(
          tx,
          'AccountingConnection',
          connectionId,
          ACCOUNTING_SYNC_EVENT_TYPE[resourceType],
          { runId: run.id } as Prisma.InputJsonValue,
        );
      }
    });

    // Return the full current status so the caller (and the UI) sees all
    // resource types, not just the ones just queued.
    return this.getStatus(distributorId);
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
