import { createServer, Server } from 'node:http';
import { INestApplicationContext, Logger } from '@nestjs/common';
import type { Registry } from 'prom-client';
import { PlatformMetricsService } from './platform-metrics.service';

/**
 * Serves `GET /metrics` for Telegraf's `inputs.prometheus` scrape (ADR-065).
 *
 * A bare `node:http` server on its own port rather than a Nest route: the BFFs
 * are internet-facing, and this port is only ever added to the cluster-internal
 * Service — never to an ingress — so queue depths and request internals are
 * never public. It also works unchanged in the worker, which has no HTTP layer,
 * and is never counted by `MetricsInterceptor`.
 *
 * `unref()`ed so it never holds a process open on its own, and a listen
 * failure (port taken, EACCES) is logged, never thrown — an unhandled `error`
 * event would otherwise take down the service it is only meant to observe.
 */
export function startMetricsServer(registry: Registry, port: number): Server {
  const logger = new Logger('MetricsServer');

  const server = createServer((req, res) => {
    if (req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET' }).end();
      return;
    }
    registry.metrics().then(
      (body) => res.writeHead(200, { 'Content-Type': registry.contentType }).end(body),
      (err: Error) => {
        logger.warn(`metrics collection failed: ${err.message}`);
        res.writeHead(500).end();
      },
    );
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    logger.error(`Metrics server failed on :${port} (${err.code ?? err.message}) — metrics disabled`);
  });
  server.unref();
  server.listen(port, () => logger.log(`Metrics server listening on :${port}`));
  return server;
}

/**
 * Entrypoint helper: starts the metrics server on `METRICS_PORT` when it is set
 * (Helm sets it; local `.env` and tests don't — so two apps on one dev host
 * never race for the port). Returns undefined when disabled.
 */
export function startMetricsServerFromEnv(
  app: INestApplicationContext,
  env: NodeJS.ProcessEnv = process.env,
): Server | undefined {
  const raw = env.METRICS_PORT?.trim();
  const port = Number(raw);
  if (!raw || !Number.isInteger(port) || port < 0 || port > 65535) return undefined;
  return startMetricsServer(app.get(PlatformMetricsService).registry, port);
}
