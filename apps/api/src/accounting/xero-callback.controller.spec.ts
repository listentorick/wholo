import { Test, TestingModule } from '@nestjs/testing';
import { XeroCallbackController } from './xero-callback.controller';
import { AccountingConnectionService } from './accounting-connection.service';
import { AccountingOAuthError } from './accounting-oauth.error';

const mockService = { handleCallback: jest.fn() };

describe('XeroCallbackController', () => {
  let controller: XeroCallbackController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [XeroCallbackController],
      providers: [{ provide: AccountingConnectionService, useValue: mockService }],
    }).compile();
    controller = module.get(XeroCallbackController);
  });

  it('returns {status: connected} on success and forwards the raw body to the service', async () => {
    mockService.handleCallback.mockResolvedValue(undefined);

    const result = await controller.callback({
      callbackUrl: 'http://localhost:3020/api/v1/accounting/xero/callback?code=abc&state=xyz',
      code: 'abc',
      state: 'xyz',
    });

    expect(result).toEqual({ status: 'connected' });
    expect(mockService.handleCallback).toHaveBeenCalledWith(
      'http://localhost:3020/api/v1/accounting/xero/callback?code=abc&state=xyz',
      'abc',
      'xyz',
    );
  });

  it('returns {status: error, reason} when the service throws an AccountingOAuthError', async () => {
    mockService.handleCallback.mockRejectedValue(new AccountingOAuthError('expired_state'));

    const result = await controller.callback({
      callbackUrl: 'http://localhost:3020/api/v1/accounting/xero/callback?code=abc&state=xyz',
      code: 'abc',
      state: 'xyz',
    });

    expect(result).toEqual({ status: 'error', reason: 'expired_state' });
  });

  it('falls back to reason=unknown for a non-OAuth error', async () => {
    mockService.handleCallback.mockRejectedValue(new Error('unexpected'));

    const result = await controller.callback({
      callbackUrl: 'http://localhost:3020/api/v1/accounting/xero/callback',
      code: 'abc',
      state: 'xyz',
    });

    expect(result).toEqual({ status: 'error', reason: 'unknown' });
  });
});
