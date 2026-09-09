import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

/**
 * Platform-health HTTP telemetry (ADR-063). One counter and one timing per
 * request:
 *
 *   stocdup_http_requests  {service, method, status_class}   |c
 *   stocdup_http_request_ms{service}                         |ms
 *
 * Tagged by service / method / status class only — never a route path (PII and
 * unbounded tag cardinality). The timing carries only `service` so the p95
 * series count stays equal to the number of services.
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
  private readonly service: string;

  constructor(
    private readonly metrics: MetricsService,
    config: ConfigService,
  ) {
    this.service = config.get<string>('SERVICE_NAME', 'unknown');
  }

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
      this.metrics.increment('stocdup_http_requests', 1, {
        service: this.service,
        method,
        status_class: statusClass,
      });
      this.metrics.timing('stocdup_http_request_ms', Date.now() - startedAt, {
        service: this.service,
      });
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
