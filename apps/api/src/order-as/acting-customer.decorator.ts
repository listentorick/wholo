import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ORDER_AS_CONTEXT_KEY, OrderAsContext } from './order-as.interceptor';

interface RequestWithOrderAsContext {
  user: { organisationId: string };
  [ORDER_AS_CONTEXT_KEY]?: OrderAsContext;
}

/**
 * The tenant a customer-facing request should act on: the impersonated customer
 * during an order-as session, otherwise the caller's own organisation. This is
 * the one expression that decides whose data a request touches — resolving it
 * here means a new endpoint can't omit it by accident (H2).
 */
export const ActingCustomerId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<RequestWithOrderAsContext>();
    const orderAs = req[ORDER_AS_CONTEXT_KEY];
    return orderAs?.customerId ?? req.user.organisationId;
  },
);

/**
 * The raw order-as context, for the few call sites that need more than the
 * resolved customer id (the session token, or the session's bound
 * distributorId). `undefined` outside an order-as session.
 */
export const OrderAsSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrderAsContext | undefined => {
    const req = ctx.switchToHttp().getRequest<RequestWithOrderAsContext>();
    return req[ORDER_AS_CONTEXT_KEY];
  },
);
