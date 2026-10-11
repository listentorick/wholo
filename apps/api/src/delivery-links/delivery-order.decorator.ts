import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { DELIVERY_ORDER_KEY, RequestWithDeliveryOrder } from './delivery-link.guard';
import { OrderForDeliveryLink } from './delivery-links.service';

/**
 * The order the request's delivery token resolved to. Set by DeliveryLinkGuard,
 * which must be on the route — a handler using this without the guard gets a
 * thrown error rather than an unverified order.
 */
export const DeliveryOrder = createParamDecorator((_data: unknown, ctx: ExecutionContext): OrderForDeliveryLink => {
  const order = ctx.switchToHttp().getRequest<RequestWithDeliveryOrder>()[DELIVERY_ORDER_KEY];
  if (!order) throw new Error('@DeliveryOrder() used on a route without DeliveryLinkGuard');
  return order;
});
