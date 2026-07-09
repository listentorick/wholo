import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AccountingConnectionStatus } from '@prisma/client';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';

const SYNC_INTERVAL_MS = 30 * 60 * 1000;

// Runs only in the worker process (see WorkerModule) — same structural
// pattern as OutboxPublisherService/AccountingTokenRefreshScheduler: plain
// @Interval tick + re-entrancy guard.
//
// This writes an outbox event per connection rather than enqueueing a
// BullMQ job directly, even though it already runs in the queue-owning
// process. An OutboxEvent's durability guarantee (processed even if the
// queue is briefly unavailable) applies just as much to a scheduled sync as
// to a manual "sync now" click — both are "this must run, don't drop it"
// requests, so both go through the same path. See queue.constants.ts.
@Injectable()
export class AccountingContactSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(AccountingContactSyncScheduler.name);
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
          this.outbox.writeEvent(tx, 'AccountingConnection', connection.id, 'AccountingContactSyncRequested', {}),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to request scheduled contact sync for connection ${connection.id}: ${message}`);
      }
    }
  }
}
