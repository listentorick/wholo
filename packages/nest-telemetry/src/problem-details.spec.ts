import type { ArgumentsHost } from '@nestjs/common';
import { logHttpException } from './problem-details';

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
    expect(payload).toMatchObject({ err, method: 'POST', path: '/api/v1/orders', statusCode: 500 });
    expect(payload.err.stack).toBe(err.stack);
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
