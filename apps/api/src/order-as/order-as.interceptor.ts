import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { OrderAsService } from './order-as.service';

export const ORDER_AS_CONTEXT_KEY = 'orderAsContext';

export interface OrderAsContext {
  sessionToken: string;
  customerId: string;
  distributorId: string;
}

@Injectable()
export class OrderAsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OrderAsInterceptor.name);
  constructor(private orderAsService: OrderAsService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const sessionToken = request.headers?.['x-order-as-session'] as string | undefined;

    if (sessionToken && request.user?.sub) {
      this.logger.log(`resolving order-as session for sub=${request.user.sub}`);
      const resolved = await this.orderAsService.resolveSession(sessionToken, request.user.sub);
      this.logger.log(`session resolved: customerId=${resolved.customerId} distributorId=${resolved.distributorId}`);
      request[ORDER_AS_CONTEXT_KEY] = { sessionToken, ...resolved } satisfies OrderAsContext;
    }

    return next.handle();
  }
}
