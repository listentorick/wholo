import { ConnectionOptions } from 'bullmq';

// BullMQ takes ioredis-style connection options rather than a URL string.
export function redisConnectionFromUrl(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.password ? { password: url.password } : {}),
    ...(url.username ? { username: url.username } : {}),
  };
}
