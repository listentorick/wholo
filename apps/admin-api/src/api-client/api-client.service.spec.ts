import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiClientService } from './api-client.service';

function makeResponse(status: number, body: string): Response {
  return new Response(body === '' ? null : body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClientService (admin-api)', () => {
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

  it('resolves undefined for a 201 with an empty body (void upstream action)', async () => {
    // Regression: the accounting confirm/ignore/unlink endpoints respond 201
    // with no body; res.json() used to throw here, turning an upstream
    // success into a 500 after the side effect had already committed.
    fetchMock.mockResolvedValue(makeResponse(201, ''));

    await expect(service.post('/accounting/products/suggestions/s-1/confirm', 'token')).resolves.toBeUndefined();
  });

  it('resolves undefined for a 204', async () => {
    fetchMock.mockResolvedValue(makeResponse(204, ''));

    await expect(service.delete('/things/x-1', 'token')).resolves.toBeUndefined();
  });

  it('throws HttpException carrying the problem detail on a 4xx with a JSON body', async () => {
    fetchMock.mockResolvedValue(makeResponse(409, '{"detail":"Already linked"}'));

    await expect(service.post('/things', 'token', {})).rejects.toMatchObject({
      constructor: HttpException,
      message: 'Already linked',
      status: 409,
    });
  });

  it('throws HttpException with a fallback message on a 4xx with an empty body, not a parse crash', async () => {
    fetchMock.mockResolvedValue(makeResponse(404, ''));

    await expect(service.get('/things/missing', 'token')).rejects.toMatchObject({
      message: 'Request failed: 404',
      status: 404,
    });
  });

  it('throws HttpException with a fallback message on a 5xx with a non-JSON body', async () => {
    fetchMock.mockResolvedValue(makeResponse(502, '<html>bad gateway</html>'));

    await expect(service.get('/things', 'token')).rejects.toMatchObject({
      message: 'Request failed: 502',
      status: 502,
    });
  });
});
