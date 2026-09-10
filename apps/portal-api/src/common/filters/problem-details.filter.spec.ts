import { ArgumentsHost, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ProblemDetailsFilter } from './problem-details.filter';

function fakeHost(req: Record<string, unknown> = {}): { host: ArgumentsHost; res: { status: jest.Mock; set: jest.Mock; json: jest.Mock } } {
  const res = {
    status: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('ProblemDetailsFilter', () => {
  let filter: ProblemDetailsFilter;
  let errorSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new ProblemDetailsFilter();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('logs a 5xx at error with a stack and still writes problem+json', () => {
    const { host, res } = fakeHost({ method: 'POST', url: '/api/v1/orders?token=x' });
    filter.catch(new InternalServerErrorException('db down'), host);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }));
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('logs an unknown thrown value as a 500', () => {
    const { host, res } = fakeHost({ method: 'GET', url: '/api/v1/x' });
    filter.catch('kaboom', host);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('does not log a 4xx at error', () => {
    const { host, res } = fakeHost({ method: 'GET', url: '/api/v1/x' });
    filter.catch(new BadRequestException('bad'), host);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('honours a plain Error with a .status (portal-api branch) — 409 is not an error log', () => {
    const { host, res } = fakeHost({ method: 'GET', url: '/api/v1/x' });
    filter.catch(Object.assign(new Error('conflict'), { status: 409 }), host);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
