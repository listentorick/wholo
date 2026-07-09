import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiClientService } from './api-client.service';

function makeResponse(status: number, body: string): Response {
  return new Response(body === '' ? null : body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClientService (portal-api)', () => {
  let service: ApiClientService;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    service = new ApiClientService({ get: jest.fn().mockReturnValue('http://api.test') } as unknown as ConfigService);
    fetchMock = jest.spyOn(global, 'fetch' as never);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('parses a JSON body on success', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, '{"id":"x-1"}'));

    await expect(service.get('/things/x-1', 'token')).resolves.toEqual({ id: 'x-1' });
  });

  it('resolves undefined for a 2xx with an empty body instead of surfacing a 502', async () => {
    // Regression: an empty 201 from a void upstream action used to be
    // reported as "Upstream error" (502) even though the action succeeded.
    fetchMock.mockResolvedValue(makeResponse(201, ''));

    await expect(service.post('/things/t-1/actions', 'token')).resolves.toBeUndefined();
  });

  it('resolves undefined for a 204', async () => {
    fetchMock.mockResolvedValue(makeResponse(204, ''));

    await expect(service.get('/things/x-1', 'token')).resolves.toBeUndefined();
  });

  it('still reports a 502 for a non-empty body that is not JSON', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, '<html>not json</html>'));

    await expect(service.get('/things', 'token')).rejects.toMatchObject({
      constructor: HttpException,
      status: 502,
    });
  });

  it('throws HttpException carrying the upstream message on a 4xx with a JSON body', async () => {
    fetchMock.mockResolvedValue(makeResponse(403, '{"message":"Forbidden resource"}'));

    await expect(service.get('/things', 'token')).rejects.toMatchObject({
      message: 'Forbidden resource',
      status: 403,
    });
  });

  it('throws HttpException with a fallback message on a 4xx with an empty body', async () => {
    fetchMock.mockResolvedValue(makeResponse(404, ''));

    await expect(service.get('/things/missing', 'token')).rejects.toMatchObject({
      message: 'Request failed: 404',
      status: 404,
    });
  });
});
