import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PlatformMetricsService } from './platform-metrics.service';

/**
 * Platform-health HTTP telemetry (ADR-063, transport per ADR-065). One counter
 * increment and one histogram observation per request:
 *
 *   stocdup_http_requests_total          {environment, service, method, status_class}
 *   stocdup_http_request_duration_seconds{environment, service}
 *
 * (`environment` / `service` are registry default labels.) Labelled by method /
 * status class only — never a route path (PII and unbounded cardinality). The
 * histogram carries no extra labels so its series count stays small.
 *
 * `/api/v1/health*` is excluded: k8s liveness/readiness probes and Telegraf's
 * own `http_response` self-checks would otherwise dominate the request count
 * and, during a readiness blip, inflate the 5xx rate.
 *
 * Interceptors run *after* guards, so a guard-thrown 5xx is not observed here.
 * Accepted: guard failures are rare and overwhelmingly 401/403.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: PlatformMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest();
    const url: string = req.originalUrl ?? req.url ?? '';
    if (url.startsWith('/api/v1/health')) return next.handle();

    const startedAt = Date.now();
    const method = String(req.method ?? 'GET').toUpperCase();

    const record = (statusCode: number): void => {
      const statusClass = `${Math.floor((statusCode || 0) / 100)}xx`;
      this.metrics.recordHttpRequest(method, statusClass);
      this.metrics.observeHttpDuration((Date.now() - startedAt) / 1000);
    };

    return next.handle().pipe(
      tap({
        next: () => record(http.getResponse()?.statusCode ?? 200),
        error: (err) => record(errorStatus(err)),
      }),
    );
  }
}

/** Best-effort HTTP status from a thrown error; defaults to 500. */
function errorStatus(err: unknown): number {
  const getStatus = (err as { getStatus?: unknown })?.getStatus;
  if (typeof getStatus === 'function') {
    const status = Number((getStatus as () => unknown).call(err));
    if (Number.isInteger(status) && status >= 100 && status <= 599) return status;
  }
  return 500;
}
