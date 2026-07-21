import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { redisConnectionFromUrl } from '../queues/redis-connection';

@Injectable()
export class RedisHealthService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisHealthService.name);
  private readonly client: Redis;

  constructor(config: ConfigService) {
    // bullmq's ConnectionOptions is a union that also admits a live Redis/Cluster
    // instance; cast to the plain-options shape it actually returns here so the
    // spread below doesn't confuse ioredis's constructor overload resolution.
    const connection = redisConnectionFromUrl(
      config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    ) as RedisOptions;
    this.client = new Redis({
      ...connection,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      // Health checks shouldn't trigger ioredis's background reconnect loop —
      // a failed ping should just fail, not keep retrying between requests.
      retryStrategy: () => null,
    });
    this.client.on('error', (err) => this.logger.warn(`Redis health connection error: ${err.message}`));
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
