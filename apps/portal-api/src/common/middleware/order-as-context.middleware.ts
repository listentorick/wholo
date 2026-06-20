import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { orderAsStorage } from '../order-as-context';

@Injectable()
export class OrderAsContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const token = req.headers['x-order-as-session'] as string | undefined;
    orderAsStorage.run(token ?? null, () => next());
  }
}
