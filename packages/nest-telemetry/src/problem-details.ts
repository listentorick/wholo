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
 *   - status >= 500 → `error`; the stack rides on the serialized `err`, the
 *     message is a one-line summary
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
    const err = exception instanceof Error ? exception : new Error(String(exception));
    // Object arg -> pino merges it (stack via the `err` serializer); the string
    // is the message. Context comes from the filter's `new Logger(name)`.
    logger.error({ err, method, path, statusCode: status }, summary);
    return;
  }

  if (status >= 400) {
    logger.debug?.(summary);
  }
}
