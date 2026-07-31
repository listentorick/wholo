import { ExecutionContext } from '@nestjs/common';
import { ActingCustomerId, OrderAsSession } from './acting-customer.decorator';
import { ORDER_AS_CONTEXT_KEY } from './order-as.interceptor';

// createParamDecorator wraps its factory in decorator metadata rather than exposing
// it directly. This is the standard NestJS pattern for unit-testing the factory in
// isolation: apply the decorator to a throwaway method and pull the factory back out.
interface ParamMetadata<T> {
  factory: (data: unknown, ctx: ExecutionContext) => T;
}

function getFactory<T>(decorator: () => ParameterDecorator): (data: unknown, ctx: ExecutionContext) => T {
  class TestHost {
    method(@decorator() _value: T) {
      // unused — only the parameter metadata is inspected
    }
  }
  const args = Reflect.getMetadata('__routeArguments__', TestHost, 'method');
  const metadata = Object.values(args)[0] as ParamMetadata<T>;
  return metadata.factory;
}

function makeContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ActingCustomerId', () => {
  const factory = getFactory<string>(ActingCustomerId);

  it("returns the caller's own organisationId when there is no order-as session", () => {
    const request = { user: { organisationId: 'org-1' } };
    expect(factory(undefined, makeContext(request))).toBe('org-1');
  });

  it('returns the impersonated customerId when an order-as session is present', () => {
    const request = {
      user: { organisationId: 'admin-org' },
      [ORDER_AS_CONTEXT_KEY]: { sessionToken: 'tok', customerId: 'cust-1', distributorId: 'admin-org' },
    };
    expect(factory(undefined, makeContext(request))).toBe('cust-1');
  });
});

describe('OrderAsSession', () => {
  const factory = getFactory<unknown>(OrderAsSession);

  it('returns undefined when there is no order-as session', () => {
    const request = { user: { organisationId: 'org-1' } };
    expect(factory(undefined, makeContext(request))).toBeUndefined();
  });

  it('returns the raw order-as context when present', () => {
    const orderAs = { sessionToken: 'tok', customerId: 'cust-1', distributorId: 'admin-org' };
    const request = { user: { organisationId: 'admin-org' }, [ORDER_AS_CONTEXT_KEY]: orderAs };
    expect(factory(undefined, makeContext(request))).toEqual(orderAs);
  });
});
