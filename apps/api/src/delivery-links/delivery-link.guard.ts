import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DeliveryLinksService, OrderForDeliveryLink } from './delivery-links.service';
import { OPEN_DELIVERY_ONLY_KEY } from './open-delivery-only.decorator';

export const DELIVERY_ORDER_KEY = 'deliveryOrder';

export interface RequestWithDeliveryOrder extends Request {
  [DELIVERY_ORDER_KEY]?: OrderForDeliveryLink;
}

// The delivery-link routes have no login; the X-Delivery-Token header is the
// only credential. This guard resolves it to its order — that the token is
// one we printed, and that the order can still be delivered — and hands the
// order to the handler (@DeliveryOrder()). On routes marked
// @OpenDeliveryOnly() it also refuses a delivery that is already recorded.
//
// It is a guard so that it runs before every interceptor: a request with a
// missing or unknown token, or one that would change a completed delivery,
// is refused before FileInterceptor (multer) reads its body (ADR-076).
// resolveOrder answers 404 or 410 without saying which check failed.
@Injectable()
export class DeliveryLinkGuard implements CanActivate {
  constructor(
    private readonly deliveryLinks: DeliveryLinksService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithDeliveryOrder>();
    const header = request.headers['x-delivery-token'];
    const token = (Array.isArray(header) ? header[0] : header) ?? '';
    const order = await this.deliveryLinks.resolveOrder(token);

    const openOnly = this.reflector.getAllAndOverride<boolean>(OPEN_DELIVERY_ONLY_KEY, [context.getHandler(), context.getClass()]);
    if (openOnly) await this.deliveryLinks.assertOpen(order);

    request[DELIVERY_ORDER_KEY] = order;
    return true;
  }
}
