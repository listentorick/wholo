import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis, { RedisOptions } from 'ioredis';
import { redisConnectionFromUrl } from '../queues/redis-connection';

const KEY_PREFIX = 'wholo:accounting-refresh:';
const COMMAND_TIMEOUT_MS = 3_000;

// Default lease length for an acquired lock. Renewed on an interval well
// under this (see AccountingRefreshLock) so a live owner never loses it
// mid-operation; an owner that crashes without renewing frees it within one
// TTL period.
export const ACCOUNTING_REFRESH_LOCK_TTL_MS = 15_000;

// Only delete if the value still matches the owner token we set — never
// blind-DEL, which could release a lock a different owner has since
// legitimately acquired after our lease lapsed.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

// Only renew the TTL if we still hold it — never blindly extend, which
// would let a caller that's no longer actually the owner pretend it still is.
const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

// A held lock manages its own lease renewal for as long as it's alive —
// callers just hold the reference and call release() when done; they never
// need to think about keeping the lease alive themselves.
export class AccountingRefreshLock {
  private renewTimer: ReturnType<typeof setInterval> | null;

  constructor(
    private readonly client: Redis,
    private readonly key: string,
    private readonly ownerToken: string,
    private readonly ttlMs: number,
    private readonly logger: Logger,
  ) {
    this.renewTimer = setInterval(() => void this.renew(), Math.floor(ttlMs / 3));
    // Renewal is a background convenience, not a reason to keep the Node
    // process alive — don't block shutdown on this timer.
    this.renewTimer.unref?.();
  }

  private async renew(): Promise<void> {
    try {
      await this.client.eval(RENEW_SCRIPT, 1, this.key, this.ownerToken, this.ttlMs);
    } catch (err) {
      this.logger.warn(`Failed to renew accounting refresh lock ${this.key}: ${(err as Error).message}`);
    }
  }

  async release(): Promise<void> {
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
    try {
      await this.client.eval(RELEASE_SCRIPT, 1, this.key, this.ownerToken);
    } catch (err) {
      this.logger.warn(`Failed to release accounting refresh lock ${this.key}: ${(err as Error).message}`);
    }
  }
}

// Redis-backed mutual exclusion for AccountingConnectionService.getValidTokenSet,
// keyed per AccountingConnection.id — replaces the old pg_advisory_xact_lock,
// which required holding a pooled DB connection open across the entire Xero
// HTTP round-trip. See ADR discussion in accounting-connection.service.ts.
//
// Unlike RedisHealthService (apps/api/src/health/redis-health.service.ts),
// which deliberately fails fast on the first blip because a health check
// that hangs is worse than one that fails, this lock must stay usable
// through a brief Redis hiccup — so it uses bounded-but-real retries rather
// than "give up immediately".
@Injectable()
export class AccountingRefreshLockService implements OnModuleDestroy {
  private readonly logger = new Logger(AccountingRefreshLockService.name);
  private readonly client: Redis;

  constructor(config: ConfigService) {
    const connection = redisConnectionFromUrl(
      config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    ) as RedisOptions;
    this.client = new Redis({
      ...connection,
      commandTimeout: COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (err) => this.logger.warn(`Accounting refresh lock Redis error: ${err.message}`));
  }

  // Returns null if the lock is held by someone else, or if Redis itself is
  // unavailable — callers must treat both identically (fail closed: never
  // proceed to call Xero without confirmed lock ownership).
  async tryAcquire(connectionId: string, ttlMs: number = ACCOUNTING_REFRESH_LOCK_TTL_MS): Promise<AccountingRefreshLock | null> {
    const key = KEY_PREFIX + connectionId;
    const ownerToken = randomUUID();

    let result: string | null;
    try {
      result = await this.client.set(key, ownerToken, 'PX', ttlMs, 'NX');
    } catch (err) {
      this.logger.warn(`Failed to acquire accounting refresh lock for connection ${connectionId}: ${(err as Error).message}`);
      return null;
    }
    if (result !== 'OK') return null;

    return new AccountingRefreshLock(this.client, key, ownerToken, ttlMs, this.logger);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
