import type { ArgumentsHost } from '@nestjs/common';
import { loggableError, logHttpException } from './problem-details';

function fakeHost(req: { method?: string; url?: string } = {}): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ArgumentsHost;
}

function spyLogger() {
  return { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn() };
}

describe('logHttpException', () => {
  it('logs a 5xx Error at error — stack on `err`, message is a one-liner', () => {
    const logger = spyLogger();
    const err = new Error('kaboom');
    logHttpException(logger, err, 500, fakeHost({ method: 'POST', url: '/api/v1/orders?x=1' }));

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [payload, message] = logger.error.mock.calls[0];
    expect(payload).toMatchObject({ method: 'POST', path: '/api/v1/orders', statusCode: 500 });
    expect(payload.err).toBeInstanceOf(Error);
    expect(payload.err.message).toBe('kaboom');
    expect(payload.err.stack).toBe(err.stack); // plain Error: same header + frames
    expect(message).toBe('POST /api/v1/orders -> 500');
    expect(String(message)).not.toContain('\n'); // never the raw stack
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('wraps a non-Error 5xx so it still logs', () => {
    const logger = spyLogger();
    logHttpException(logger, 'weird string failure', 503, fakeHost({ method: 'GET', url: '/x' }));

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0].err).toBeInstanceOf(Error);
    expect(logger.error.mock.calls[0][0].err.message).toBe('weird string failure');
  });

  it('logs a 4xx at debug, not error', () => {
    const logger = spyLogger();
    logHttpException(logger, new Error('bad input'), 404, fakeHost({ method: 'GET', url: '/api/v1/x' }));

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith('GET /api/v1/x -> 404');
  });

  it('ignores health-probe 5xx (readiness "not ready" is control flow)', () => {
    const logger = spyLogger();
    logHttpException(logger, new Error('redis down'), 503, fakeHost({ method: 'GET', url: '/api/v1/health/ready' }));

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });
});

describe('loggableError', () => {
  class PrismaClientValidationError extends Error {
    name = 'PrismaClientValidationError';
    clientVersion = '5.0.0';
  }

  it('withholds a Prisma error message, which can carry query arguments', () => {
    const err = new PrismaClientValidationError(
      'Invalid `prisma.user.create()` invocation: { email: "jane@customer.com", address: "1 High St" }',
    );
    const safe = loggableError(err);
    const serialised = JSON.stringify({ message: safe.message, stack: safe.stack, ...safe });

    expect(safe.name).toBe('PrismaClientValidationError');
    expect(safe.message).toContain('message withheld');
    expect(serialised).not.toContain('jane@customer.com');
    expect(serialised).not.toContain('High St');
    expect(serialised).not.toContain('clientVersion');
    expect(safe.stack).toMatch(/\n\s+at /); // frames kept for debugging
  });

  it('keeps a Prisma error code', () => {
    const err = Object.assign(new Error('Unique constraint failed on (email) = jane@customer.com'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['email'] },
    });
    const safe = loggableError(err);

    expect(safe.message).toBe('PrismaClientKnownRequestError P2002 (message withheld: may contain query data)');
    expect((safe as unknown as { code: string }).code).toBe('P2002');
    expect(JSON.stringify({ ...safe, stack: safe.stack })).not.toContain('jane@customer.com');
  });

  it('drops enumerable properties such as an HTTP client request config', () => {
    const err = Object.assign(new Error('Request failed with status code 502'), {
      name: 'AxiosError',
      code: 'ERR_BAD_RESPONSE',
      config: { headers: { Authorization: 'Bearer secret-token' } },
      response: { data: { email: 'jane@customer.com' } },
    });
    const safe = loggableError(err);

    expect(safe.message).toBe('Request failed with status code 502');
    expect((safe as unknown as { code: string }).code).toBe('ERR_BAD_RESPONSE');
    expect(Object.keys(safe).sort()).toEqual(['code', 'name']);
    expect(JSON.stringify({ ...safe, stack: safe.stack })).not.toMatch(/secret-token|jane@customer/);
  });

  it('wraps a non-Error value', () => {
    const safe = loggableError('weird string failure');

    expect(safe).toBeInstanceOf(Error);
    expect(safe.message).toBe('weird string failure');
  });

  it('withholds a JSON-string rejection (xero-node rejects with the whole HTTP response as a string)', () => {
    const rejection = JSON.stringify({
      response: { statusCode: 400, headers: { 'xero-correlation-id': 'abc' }, body: { Email: 'jane@customer.com' } },
    });
    const safe = loggableError(rejection);

    expect(safe.message).toContain('withheld');
    expect(JSON.stringify({ ...safe, message: safe.message, stack: safe.stack })).not.toContain('jane@customer.com');
  });

  it('withholds a long plain string', () => {
    const safe = loggableError('x'.repeat(500));

    expect(safe.message).toBe('Non-Error string thrown (500 chars, withheld: may contain response data)');
  });

  it('withholds a non-Error object', () => {
    const safe = loggableError({ response: { body: { email: 'jane@customer.com' } } });

    expect(safe.message).toBe('Non-Error object thrown (withheld: may contain response data)');
  });
});
