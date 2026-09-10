import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PinoAppLogger } from '@wholo/nest-telemetry';
import { WorkerModule } from './worker.module';
import { startWorkerHealthServer } from './worker-health-server';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(PinoAppLogger));
  app.flushLogs();
  app.enableShutdownHooks();

  const healthPort = app.get(ConfigService).get<number>('WORKER_HEALTH_PORT', 3099);
  startWorkerHealthServer(app, healthPort);

  new Logger('Worker').log('Wholo worker started — outbox publisher and queue processors running');
}

bootstrap();
