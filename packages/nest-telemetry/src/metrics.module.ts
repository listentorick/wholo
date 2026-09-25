import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';
import { PlatformMetricsService } from './platform-metrics.service';

/**
 * Platform telemetry. Global so any feature can emit without re-importing.
 *
 * - `MetricsService` — StatsD/UDP, for the order-activity counters (ADR-062).
 * - `PlatformMetricsService` — prom-client instruments for platform health
 *   (ADR-063/065), served by `startMetricsServer` from each entrypoint.
 *
 * - HTTP apps (`api`, `admin-api`, `portal-api`, `driver-api`) import
 *   `MetricsModule.forRoot()` — that also registers the global
 *   `MetricsInterceptor` for per-request HTTP metrics.
 * - The worker imports the plain `MetricsModule` — no HTTP layer to intercept,
 *   it only sets queue gauges.
 *
 * Both services depend on `ConfigService`, which the apps register with
 * `ConfigModule.forRoot({ isGlobal: true })`.
 */
@Global()
@Module({
  providers: [MetricsService, PlatformMetricsService],
  exports: [MetricsService, PlatformMetricsService],
})
export class MetricsModule {
  static forRoot(): DynamicModule {
    return {
      module: MetricsModule,
      providers: [{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
    };
  }
}
