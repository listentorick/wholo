import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AccountingConnectionStatus, IngestionRunTrigger } from '@prisma/client';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingSyncService } from './sync/accounting-sync.service';

const SYNC_INTERVAL_MS = 30 * 60 * 1000;
// See AccountingContactSyncScheduler / ADR-061 for why the first run is
// delayed and the sweep is jittered.
const INITIAL_DELAY_MS = 90 * 1000;
const PER_CONNECTION_JITTER_MS = 4 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs only in the worker process (see WorkerModule) — same structural
// pattern as AccountingContactSyncScheduler. The enqueue (IngestionRun row +
// AccountingProductSyncRequested outbox event, one transaction) lives in
// AccountingSyncService, shared with the manual "Sync with Xero" endpoint.
@Injectable()
export class AccountingProductSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(AccountingProductSyncScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingSync: AccountingSyncService,
  ) {}

  onModuleInit(): void {
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
          'product',
          IngestionRunTrigger.SCHEDULED,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to request scheduled product sync for connection ${connection.id}: ${message}`);
      }
    }
  }
}
