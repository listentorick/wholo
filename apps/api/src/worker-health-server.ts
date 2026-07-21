import { createServer } from 'node:http';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisHealthService } from './health/redis-health.service';

// The worker is a NestFactory.createApplicationContext process — no HTTP
// listener at all — so k8s has no target for a probe. This starts a bare
// node:http server (not a full Nest HTTP module) purely to expose one.
export function startWorkerHealthServer(app: INestApplicationContext, port: number) {
  const logger = new Logger('WorkerHealthServer');
  const prisma = app.get(PrismaService);
  const redisHealth = app.get(RedisHealthService);

  const server = createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(404).end();
      return;
    }

    if (req.url === '/health/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.url === '/health/ready') {
      Promise.allSettled([prisma.$queryRaw`SELECT 1`, redisHealth.ping()]).then(([db, redis]) => {
        const checks = {
          db: db.status === 'rejected' ? 'error' : 'ok',
          redis: redis.status === 'rejected' ? 'error' : 'ok',
        };
        const ok = db.status === 'fulfilled' && redis.status === 'fulfilled';
        res
          .writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ status: ok ? 'ok' : 'error', checks }));
      });
      return;
    }

    res.writeHead(404).end();
  });

  server.listen(port, () => logger.log(`Worker health server listening on :${port}`));
  return server;
}
