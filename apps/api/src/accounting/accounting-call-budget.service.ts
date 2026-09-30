import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis, { RedisOptions } from 'ioredis';
import { loggableError } from '@wholo/nest-telemetry';
import { redisConnectionFromUrl } from '../queues/redis-connection';
import { AccountingProviderError } from './adapters/accounting-provider.error';

const KEY_PREFIX = 'wholo:accounting-call-budget:';
const WINDOW_MS = 60_000;
const COMMAND_TIMEOUT_MS = 3_000;
// Waiting for a free slot holds a worker lane; past this, give the lane back
// and let the job's backoff reschedule it instead.
export const MAX_BUDGET_WAIT_MS = 20_000;
const WAIT_JITTER_MS = 250;
// Error code thrown when a wait would pass MAX_BUDGET_WAIT_MS.
export const CALL_BUDGET_EXHAUSTED = 'CALL_BUDGET_EXHAUSTED';

// Sliding-window log: one sorted-set member per call, scored by the Redis
// server's own clock (TIME) so every process agrees on "now". Admits the
// call (returns 0) when fewer than ARGV[1] calls landed in the last ARGV[2]
// ms, otherwise returns how many ms until the oldest one ages out.
const ACQUIRE_SCRIPT = `
local t = redis.call("TIME")
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local window = tonumber(ARGV[2])
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - window)
if redis.call("ZCARD", KEYS[1]) < tonumber(ARGV[1]) then
  redis.call("ZADD", KEYS[1], now, now .. ":" .. ARGV[3])
  redis.call("PEXPIRE", KEYS[1], window)
  return 0
end
local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
return math.max(1, tonumber(oldest[2]) + window - now)
`;

// Provider-neutral per-organisation call budget (ADR-071): guarantees no more
// than `perMinute` provider API calls for one external organisation in any
// rolling 60 s, across every process and queue. Each adapter declares its
// own limit and calls acquire() before every HTTP request it makes.
//
// Fails OPEN on a Redis error — the opposite of AccountingRefreshLockService,
// which fails closed because it guards token integrity. Here the worst case
// of letting a call through is a provider 429, which the adapter already
// turns into a transient error carrying Retry-After.
@Injectable()
export class AccountingCallBudgetService implements OnModuleDestroy {
  private readonly logger = new Logger(AccountingCallBudgetService.name);
  private readonly client: Redis;

  constructor(config: ConfigService) {
    const connection = redisConnectionFromUrl(
      config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    ) as RedisOptions;
    this.client = new Redis({ ...connection, commandTimeout: COMMAND_TIMEOUT_MS, maxRetriesPerRequest: 1 });
    this.client.on('error', (err) =>
      this.logger.warn({ event: 'accounting.call_budget.redis_error', err: loggableError(err) }, 'Accounting call budget Redis error'),
    );
  }

  async acquire(provider: string, externalOrgId: string, perMinute: number): Promise<void> {
    const key = `${KEY_PREFIX}${provider}:${externalOrgId}`;
    let waited = 0;
    for (;;) {
      let waitMs: number;
      try {
        waitMs = Number(await this.client.eval(ACQUIRE_SCRIPT, 1, key, perMinute, WINDOW_MS, randomUUID()));
      } catch (err) {
        this.logger.warn(
          { event: 'accounting.call_budget.unavailable', provider, externalOrgId, err: loggableError(err) },
          `Accounting call budget unavailable for ${provider} org ${externalOrgId} — proceeding without it`,
        );
        return;
      }
      if (waitMs <= 0) return;

      if (waited + waitMs > MAX_BUDGET_WAIT_MS) {
        throw new AccountingProviderError(
          `${provider} call budget for this organisation is exhausted — retrying later`,
          true,
          undefined,
          CALL_BUDGET_EXHAUSTED,
          { retryAfterMs: waitMs },
        );
      }
      const pause = waitMs + Math.floor(Math.random() * WAIT_JITTER_MS);
      await this.sleep(pause);
      waited += pause;
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
