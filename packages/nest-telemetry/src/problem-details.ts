import type { ArgumentsHost, LoggerService } from '@nestjs/common';

/**
 * Log an HTTP exception from a `ProblemDetailsFilter` (ADR-064).
 *
 * The filter is `@Catch()` (catch-all) and writes the response itself, which
 * pre-empts NestJS's built-in exception logging — so 5xx errors and their stack
 * traces never otherwise reach stdout. This is the single `error`-level emitter
 * for a failed request; the pino-http request-completion log records the same
 * request at `warn` (see `customLogLevel`), so counting `level="error"` lines
 * gives a clean 5xx signal with no double-count.
 *
 *   - status >= 500 → `error`; a sanitised copy of the error rides on `err`
 *     (see `loggableError`), the message is a one-line summary
 *   - status 400-499 → `debug` one-liner (client errors are noise at `info`)
 *   - `/api/v1/health*` → nothing (readiness "not ready" is control flow)
 */
export function logHttpException(
  logger: LoggerService,
  exception: unknown,
  status: number,
  host: ArgumentsHost,
): void {
  const req = host.switchToHttp().getRequest<{ method?: string; originalUrl?: string; url?: string }>();
  const method = req?.method ?? 'GET';
  const path = String(req?.originalUrl ?? req?.url ?? '').split('?')[0];

  if (path.startsWith('/api/v1/health')) return;

  const summary = `${method} ${path} -> ${status}`;

  if (status >= 500) {
    // Object arg -> pino merges it (stack via the `err` serializer); the string
    // is the message. Context comes from the filter's `new Logger(name)`.
    logger.error({ err: loggableError(exception), method, path, statusCode: status }, summary);
    return;
  }

  if (status >= 400) {
    logger.debug?.(summary);
  }
}

/**
 * The copy of a 5xx exception that is safe to ship to Loki.
 *
 * pino's `err` serializer writes an error's message, stack and every enumerable
 * property. Two common 500s would leak through that:
 *   - Prisma client errors repeat the failing query's arguments (customer
 *     emails, addresses, …) in `message` — and so in the first line of `stack`;
 *   - HTTP client errors (axios, from a BFF → apps/api call) carry the request
 *     `config`, including the `Authorization: Bearer …` header.
 *
 * So only `name`, a string/number `code`, the message (withheld for Prisma
 * errors) and the stack frames are kept; enumerable properties are dropped.
 */
export function loggableError(exception: unknown): Error {
  const src = exception instanceof Error ? exception : new Error(String(exception));
  const rawCode = (src as { code?: unknown }).code;
  const code = typeof rawCode === 'string' || typeof rawCode === 'number' ? rawCode : undefined;
  const message = src.name.startsWith('PrismaClient')
    ? `${src.name}${code !== undefined ? ` ${code}` : ''} (message withheld: may contain query data)`
    : src.message;

  const safe = new Error(message);
  safe.name = src.name;
  safe.stack = [`${src.name}: ${message}`, ...stackFrames(src.stack)].join('\n');
  if (code !== undefined) Object.assign(safe, { code });
  return safe;
}

/** The `    at …` lines of a stack — never its header, which embeds the message. */
function stackFrames(stack: string | undefined): string[] {
  return (stack ?? '').split('\n').filter((line) => /^\s+at /.test(line));
}
