import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import express, { Request, Response, NextFunction } from 'express';
import next from 'next';
import { join } from 'path';

async function bootstrap() {
  const dev = process.env.NODE_ENV !== 'production';

  // NEXT_APP_DIR must point to the apps/portal directory.
  // Default resolves from dist/main.js → apps/portal-api/dist → apps/portal-api → apps → apps/portal.
  // Docker image sets NEXT_APP_DIR=/app/portal explicitly.
  const dir = process.env.NEXT_APP_DIR ?? join(__dirname, '..', '..', 'portal');

  const nextApp = next({ dev, dir });
  const nextHandler = nextApp.getRequestHandler();
  await nextApp.prepare();

  const expressServer = express();

  // Route non-API requests to Next.js BEFORE NestJS initialises.
  // This must come first so our handler runs before NestJS registers its own
  // not-found fallback, which would otherwise intercept page requests.
  expressServer.use((req: Request, res: Response, nextFn: NextFunction) => {
    if (req.path.startsWith('/api/')) {
      return nextFn();
    }
    return nextHandler(req, res);
  });

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressServer));

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableCors({ origin: true, credentials: true });

  await app.listen(process.env['PORT'] ?? 3003);
}

bootstrap();
