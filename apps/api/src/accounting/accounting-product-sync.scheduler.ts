import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AccountingConnectionStatus } from '@prisma/client';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';

const SYNC_INTERVAL_MS = 30 * 60 * 1000;

// Runs only in the worker process (see WorkerModule) — same structural
// pattern as AccountingContactSyncScheduler: plain @Interval tick +
// re-entrancy guard, writing one AccountingProductSyncRequested outbox event
// per CONNECTED connection. Scheduled and manual "sync now" both go through
// the outbox uniformly — see queue.constants.ts for why.
@Injectable()
export class AccountingProductSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(AccountingProductSyncScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  // Runs once immediately at worker startup so a freshly deployed/restarted
  // worker doesn't wait up to the full interval for its first sync.
  async onModuleInit(): Promise<void> {
    await this.tick();
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
      select: { id: true },
    });

    for (const connection of connections) {
      try {
        await this.prisma.$transaction((tx) =>
          this.outbox.writeEvent(tx, 'AccountingConnection', connection.id, 'AccountingProductSyncRequested', {}),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to request scheduled product sync for connection ${connection.id}: ${message}`);
      }
    }
  }
}
