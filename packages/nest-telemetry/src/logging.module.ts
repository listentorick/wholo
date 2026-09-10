import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { buildPinoOptions } from './logging.config';

/**
 * Structured logging (ADR-064). Import once in each app's root module (and the
 * worker module) — it registers `nestjs-pino`'s `Logger` and, for HTTP apps,
 * the pino-http request-logging middleware.
 *
 * Config is static (every knob comes from `process.env`), so this is safe in
 * the worker's `ApplicationContext` where there is no `ConfigService`. The
 * pino-http middleware providers it registers are inert without an HTTP server.
 */
@Module({
  imports: [LoggerModule.forRoot(buildPinoOptions())],
  exports: [LoggerModule],
})
export class LoggingModule {}
