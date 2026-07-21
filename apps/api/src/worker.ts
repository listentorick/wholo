import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';
import { startWorkerHealthServer } from './worker-health-server';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();

  const healthPort = app.get(ConfigService).get<number>('WORKER_HEALTH_PORT', 3099);
  startWorkerHealthServer(app, healthPort);

  new Logger('Worker').log('Wholo worker started — outbox publisher and queue processors running');
}

bootstrap();
