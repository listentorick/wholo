import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

/**
 * Platform telemetry (ADR-062 / ADR-063). Global so any feature can emit
 * without re-importing.
 *
 * - HTTP apps (`api`, `admin-api`, `portal-api`, `driver-api`) import
 *   `MetricsModule.forRoot()` — that also registers the global
 *   `MetricsInterceptor` for per-request HTTP metrics.
 * - The worker imports the plain `MetricsModule` — no HTTP layer to intercept,
 *   it only emits queue gauges.
 *
 * `MetricsService` depends on `ConfigService`, which the apps register with
 * `ConfigModule.forRoot({ isGlobal: true })`.
 */
@Global()
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {
  static forRoot(): DynamicModule {
    return {
      module: MetricsModule,
      providers: [{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
    };
  }
}
