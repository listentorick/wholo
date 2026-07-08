import { Test, TestingModule } from '@nestjs/testing';
import { XeroCallbackController } from './xero-callback.controller';
import { AccountingService } from './accounting.service';

const mockService = { handleXeroCallback: jest.fn() };

function mockRequest(originalUrl: string, forwardedProto?: string) {
  return {
    protocol: 'http',
    get: (header: string) => (header === 'x-forwarded-proto' ? forwardedProto : 'admin.localhost:8443'),
    originalUrl,
  } as unknown as import('express').Request;
}

function mockResponse() {
  return { redirect: jest.fn() } as unknown as import('express').Response;
}

describe('XeroCallbackController (BFF)', () => {
  let controller: XeroCallbackController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [XeroCallbackController],
      providers: [{ provide: AccountingService, useValue: mockService }],
    }).compile();
    controller = module.get(XeroCallbackController);
  });

  it('reconstructs the callback URL and forwards code/state to the service', async () => {
    mockService.handleXeroCallback.mockResolvedValue({ status: 'connected' });
    const req = mockRequest('/api/v1/accounting/xero/callback?code=abc&state=xyz');
    const res = mockResponse();

    await controller.callback({ code: 'abc', state: 'xyz' }, req, res);

    expect(mockService.handleXeroCallback).toHaveBeenCalledWith(
      'http://admin.localhost:8443/api/v1/accounting/xero/callback?code=abc&state=xyz',
      'abc',
      'xyz',
    );
  });

  it('prefers the x-forwarded-proto header over req.protocol (Traefik terminates TLS upstream)', async () => {
    mockService.handleXeroCallback.mockResolvedValue({ status: 'connected' });
    const req = mockRequest('/api/v1/accounting/xero/callback?code=abc&state=xyz', 'https');
    const res = mockResponse();

    await controller.callback({ code: 'abc', state: 'xyz' }, req, res);

    expect(mockService.handleXeroCallback).toHaveBeenCalledWith(
      'https://admin.localhost:8443/api/v1/accounting/xero/callback?code=abc&state=xyz',
      'abc',
      'xyz',
    );
  });

  it('redirects to /integrations?status=connected on success (relative — same origin as the frontend)', async () => {
    mockService.handleXeroCallback.mockResolvedValue({ status: 'connected' });
    const res = mockResponse();

    await controller.callback(
      { code: 'abc', state: 'xyz' },
      mockRequest('/api/v1/accounting/xero/callback?code=abc&state=xyz'),
      res,
    );

    expect(res.redirect).toHaveBeenCalledWith('/integrations?status=connected');
  });

  it('redirects to /integrations?status=error&reason=... on failure', async () => {
    mockService.handleXeroCallback.mockResolvedValue({ status: 'error', reason: 'expired_state' });
    const res = mockResponse();

    await controller.callback(
      { code: 'abc', state: 'xyz' },
      mockRequest('/api/v1/accounting/xero/callback?code=abc&state=xyz'),
      res,
    );

    expect(res.redirect).toHaveBeenCalledWith('/integrations?status=error&reason=expired_state');
  });

  it('handles a missing code (Xero access_denied) without crashing', async () => {
    mockService.handleXeroCallback.mockResolvedValue({ status: 'error', reason: 'access_denied' });
    const res = mockResponse();

    await controller.callback(
      { error: 'access_denied', state: 'xyz' },
      mockRequest('/api/v1/accounting/xero/callback?error=access_denied&state=xyz'),
      res,
    );

    expect(mockService.handleXeroCallback).toHaveBeenCalledWith(expect.any(String), undefined, 'xyz');
    expect(res.redirect).toHaveBeenCalledWith('/integrations?status=error&reason=access_denied');
  });
});
