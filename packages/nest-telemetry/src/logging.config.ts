import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';

/**
 * Structured logging config (ADR-064) — one place that builds the `nestjs-pino`
 * options for all 5 Node processes (`apps/api` + its worker, and the three
 * BFFs).
 *
 * Output is one JSON object per event to stdout: `level` (string), `time`
 * (ISO-8601), `msg`, `context` (the NestJS `new Logger('Ctx')` name), plus the
 * ambient `service` / `environment`. Fluent Bit parses that into Loki fields;
 * `level` is lifted into Loki structured metadata.
 *
 * Pure factory — reads `process.env` directly so it works before `ConfigModule`
 * is ready and inside the worker's `ApplicationContext`.
 */

const HEALTH_PATH = /^\/api\/v1\/health/;

// Request headers safe to log. Everything else (cookies, auth, custom session
// headers) is dropped by the serializer rather than relying on redaction alone.
const REQ_HEADER_ALLOW = ['host', 'user-agent', 'referer', 'content-type', 'content-length'] as const;

function pickHeaders(headers: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!headers) return out;
  for (const key of REQ_HEADER_ALLOW) {
    if (headers[key] !== undefined) out[key] = headers[key];
  }
  return out;
}

export function buildPinoOptions(env: NodeJS.ProcessEnv = process.env): Params {
  // Opt-in only (LOG_PRETTY=1 in `pnpm dev`). Never auto-enable via isTTY —
  // pino-pretty is a worker-thread transport and pino-pretty is dev-only, so an
  // auto-enabled transport leaks open handles into jest/integration runs.
  const pretty = env.LOG_PRETTY === '1' || env.LOG_PRETTY === 'true';

  return {
    pinoHttp: {
      level: env.LOG_LEVEL ?? 'info',
      // `service` / `environment` on every line — same identifiers as the
      // ADR-062/063 metric tags.
      base: {
        service: env.SERVICE_NAME ?? 'unknown',
        environment: env.APP_ENV ?? 'local',
      },
      // Emit the string label ("info"), not pino's numeric level (30).
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      messageKey: 'msg',
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // k8s liveness/readiness probes + Telegraf's http_response checks would
      // otherwise dominate the request log.
      autoLogging: {
        ignore: (req) => HEALTH_PATH.test(String((req as { originalUrl?: string }).originalUrl ?? req.url ?? '')),
      },
      // The request-completion line is an observation, never the error itself —
      // ProblemDetailsFilter is the single `error`-level emitter for a 5xx (with
      // the stack). Keeping 5xx summaries at `warn` here avoids a double-counted
      // error event per failed request. `err` set means pino-http itself caught
      // a thrown error object (rare with Nest's filter in place) — that is worth
      // `error`.
      customLogLevel: (_req, res, err) => {
        if (err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customSuccessMessage: (req, res) => `${req.method} ${cleanUrl(req.url)} ${res.statusCode}`,
      customErrorMessage: (req, res) => `${req.method} ${cleanUrl(req.url)} ${res.statusCode}`,
      serializers: {
        req(req: {
          id?: unknown;
          method?: string;
          url?: string;
          headers?: Record<string, unknown>;
          remoteAddress?: string;
        }) {
          return {
            id: req.id,
            method: req.method,
            url: cleanUrl(req.url), // never log query strings — delivery links etc. carry tokens
            headers: pickHeaders(req.headers),
            remoteAddress: req.remoteAddress,
          };
        },
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-order-as-session"]',
          'req.headers["x-distributor-id"]',
          '*.password',
          '*.token',
          '*.accessToken',
          '*.refreshToken',
          '*.secret',
          '*.clientSecret',
          '*.authorization',
        ],
        censor: '[redacted]',
        remove: false,
      },
      transport: pretty
        ? { target: 'pino-pretty', options: { singleLine: true, colorize: true, translateTime: 'HH:MM:ss.l' } }
        : undefined,
    },
  };
}

/** Path portion only — drop the query string. */
function cleanUrl(url: string | undefined): string {
  return String(url ?? '').split('?')[0];
}
