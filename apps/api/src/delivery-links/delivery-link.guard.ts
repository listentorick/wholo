import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DeliveryLinksService, OrderForDeliveryLink } from './delivery-links.service';

export const DELIVERY_ORDER_KEY = 'deliveryOrder';

export interface RequestWithDeliveryOrder extends Request {
  [DELIVERY_ORDER_KEY]?: OrderForDeliveryLink;
}

// The delivery-link routes have no login; the X-Delivery-Token header is the
// only credential. This guard resolves it to its order — signature first,
// then that the order exists and can still be delivered — and hands the order
// to the handler (@DeliveryOrder()).
//
// It is a guard so that it runs before every interceptor: a request with a
// missing, malformed or forged token is refused before FileInterceptor
// (multer) reads its body (ADR-076). resolveOrder answers 404 or 410 without
// saying which check failed.
@Injectable()
export class DeliveryLinkGuard implements CanActivate {
  constructor(private readonly deliveryLinks: DeliveryLinksService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithDeliveryOrder>();
    const header = request.headers['x-delivery-token'];
    const token = (Array.isArray(header) ? header[0] : header) ?? '';
    request[DELIVERY_ORDER_KEY] = await this.deliveryLinks.resolveOrder(token);
    return true;
  }
}
