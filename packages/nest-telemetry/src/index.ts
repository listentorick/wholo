// Shared NestJS platform observability for the Stocdup services:
//   - metrics  (ADR-062 order activity, ADR-063 platform health) — StatsD/UDP
//   - logging  (ADR-064) — structured JSON via nestjs-pino, shipped to Loki
export { MetricsService } from './metrics.service';
export { MetricsModule } from './metrics.module';
export { MetricsInterceptor } from './metrics.interceptor';

export { LoggingModule } from './logging.module';
export { buildPinoOptions } from './logging.config';
export { logHttpException } from './problem-details';

// Re-exported so the apps never depend on `nestjs-pino` directly.
// `PinoAppLogger` is nestjs-pino's NestJS `LoggerService` — pass it to
// `app.useLogger(app.get(PinoAppLogger))` in each entrypoint. Application code
// keeps using `@nestjs/common`'s `Logger` (`new Logger(ctx)`), which delegates
// to it once `useLogger` is set.
export { Logger as PinoAppLogger, PinoLogger, LoggerErrorInterceptor } from 'nestjs-pino';
