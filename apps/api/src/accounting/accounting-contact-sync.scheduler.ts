import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AccountingConnectionStatus, IngestionRunTrigger } from '@prisma/client';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingSyncService } from './sync/accounting-sync.service';

const SYNC_INTERVAL_MS = 30 * 60 * 1000;
// A fresh worker still catches up quickly, but not in the same instant it
// (and everything else) restarts — every deploy would otherwise enqueue a
// full sync for every connected org at once. See ADR-061 / "Concurrency".
const INITIAL_DELAY_MS = 90 * 1000;
// Per-connection random offset so a sweep across a large fleet arrives
// smeared across a window rather than as one burst.
const PER_CONNECTION_JITTER_MS = 4 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs only in the worker process (see WorkerModule) — same structural
// pattern as OutboxPublisherService/AccountingTokenRefreshScheduler: plain
// @Interval tick + re-entrancy guard.
//
// The actual enqueue (IngestionRun row + outbox event, in one transaction)
// lives in AccountingSyncService — the manual "Sync with Xero" endpoint uses
// the same path. Going through the outbox rather than the queue directly
// gives the same durability guarantee to a scheduled trigger as to a manual
// one. See queue.constants.ts.
@Injectable()
export class AccountingContactSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(AccountingContactSyncScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingSync: AccountingSyncService,
  ) {}

  onModuleInit(): void {
    // Delayed, not immediate — see INITIAL_DELAY_MS.
    const t = setTimeout(() => {
      void this.tick();
    }, INITIAL_DELAY_MS);
    t.unref();
  }

  @Interval(SYNC_INTERVAL_MS)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.requestSyncForActiveConnections();
    } finally {
      this.running = false;
    }
  }

  async requestSyncForActiveConnections(): Promise<void> {
    const connections = await this.prisma.accountingConnection.findMany({
      where: { status: AccountingConnectionStatus.CONNECTED },
      select: { id: true, distributorId: true },
    });

    for (const connection of connections) {
      await sleep(Math.floor(Math.random() * PER_CONNECTION_JITTER_MS));
      try {
        await this.accountingSync.requestSyncForConnection(
          connection.distributorId,
          connection.id,
          'contact',
          IngestionRunTrigger.SCHEDULED,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to request scheduled contact sync for connection ${connection.id}: ${message}`);
      }
    }
  }
}
