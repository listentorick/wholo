import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiClientService } from './api-client.service';

function makeResponse(status: number, body: string): Response {
  return new Response(body === '' ? null : body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClientService (driver-api)', () => {
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
    fetchMock.mockResolvedValue(makeResponse(200, '{"orderNumber":"10428"}'));

    await expect(service.get('/delivery-links', { 'X-Delivery-Token': 'tok' })).resolves.toEqual({ orderNumber: '10428' });
  });

  it('forwards the given headers on the outbound request', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, '{}'));

    await service.get('/delivery-links', { 'X-Delivery-Token': 'tok' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/delivery-links',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Delivery-Token': 'tok' }) }),
    );
  });

  it('resolves undefined for a 204', async () => {
    fetchMock.mockResolvedValue(makeResponse(204, ''));

    await expect(service.get('/delivery-links')).resolves.toBeUndefined();
  });

  it('still reports a 502 for a non-empty body that is not JSON', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, '<html>not json</html>'));

    await expect(service.get('/delivery-links')).rejects.toMatchObject({
      constructor: HttpException,
      status: 502,
    });
  });

  it('throws HttpException carrying the upstream problem+json detail on a 4xx', async () => {
    fetchMock.mockResolvedValue(makeResponse(410, '{"detail":"Gone"}'));

    await expect(service.get('/delivery-links')).rejects.toMatchObject({
      message: 'Gone',
      status: 410,
    });
  });

  it('throws HttpException with a fallback message on a 4xx with an empty body', async () => {
    fetchMock.mockResolvedValue(makeResponse(404, ''));

    await expect(service.get('/delivery-links')).rejects.toMatchObject({
      message: 'Request failed: 404',
      status: 404,
    });
  });
});
