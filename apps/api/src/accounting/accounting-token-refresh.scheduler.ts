import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AccountingConnectionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectionService } from './accounting-connection.service';

const DAY_MS = 24 * 60 * 60 * 1000;
// Dormancy-prevention only — not framed around the ~30 min access-token
// lifetime at all. Xero refresh tokens expire after 60 days of inactivity;
// checking daily for anything not refreshed in the last 25 days leaves a
// wide margin on both sides, so this is untroubled by ordinary worker
// restarts/brief downtime. Real-time correctness at the point of actual use
// is a separate concern, handled by AccountingConnectionService.getValidTokenSet.
const DORMANCY_THRESHOLD_MS = 25 * DAY_MS;

// Runs only in the worker process (see WorkerModule) — same structural
// pattern as OutboxPublisherService: plain @Interval tick + re-entrancy guard.
@Injectable()
export class AccountingTokenRefreshScheduler implements OnModuleInit {
  private readonly logger = new Logger(AccountingTokenRefreshScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingConnectionService: AccountingConnectionService,
  ) {}

  // Runs once immediately at worker startup so a freshly deployed/restarted
  // worker doesn't wait up to 24h for its first sweep.
  async onModuleInit(): Promise<void> {
    await this.tick();
  }

  @Interval(DAY_MS)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.refreshDormantConnections();
    } finally {
      this.running = false;
    }
  }

  async refreshDormantConnections(): Promise<void> {
    const connections = await this.prisma.accountingConnection.findMany({
      where: {
        status: AccountingConnectionStatus.CONNECTED,
        OR: [
          { lastSyncedAt: null },
          { lastSyncedAt: { lt: new Date(Date.now() - DORMANCY_THRESHOLD_MS) } },
        ],
      },
    });

    for (const connection of connections) {
      try {
        await this.accountingConnectionService.getValidTokenSet(connection.distributorId, connection.provider);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Dormancy-prevention refresh failed for distributor ${connection.distributorId}: ${message}`,
        );
      }
    }
  }
}
