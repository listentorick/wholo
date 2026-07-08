import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { XeroAccountingAdapter } from './xero-connection.adapter';

const mockXeroClientInstance = {
  buildConsentUrl: jest.fn(),
  apiCallback: jest.fn(),
  setTokenSet: jest.fn(),
  updateTenants: jest.fn(),
  refreshWithRefreshToken: jest.fn(),
};

jest.mock('xero-node', () => ({
  XeroClient: jest.fn().mockImplementation(() => mockXeroClientInstance),
}));

const makeConfig = () => ({
  getOrThrow: jest.fn((key: string) => {
    const values: Record<string, string> = {
      XERO_CLIENT_ID: 'client-id',
      XERO_CLIENT_SECRET: 'client-secret',
      XERO_REDIRECT_URI: 'http://localhost:3001/api/v1/accounting/xero/callback',
    };
    return values[key];
  }),
});

describe('XeroAccountingAdapter', () => {
  let adapter: XeroAccountingAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XeroAccountingAdapter,
        { provide: ConfigService, useValue: makeConfig() },
      ],
    }).compile();
    adapter = module.get(XeroAccountingAdapter);
  });

  it('buildAuthorizationUrl returns a plain string, no xero-node types leak out', async () => {
    mockXeroClientInstance.buildConsentUrl.mockResolvedValue('https://xero.example/consent?state=abc');
    const url = await adapter.buildAuthorizationUrl('abc');
    expect(url).toBe('https://xero.example/consent?state=abc');
  });

  it('exchangeCodeForToken maps the raw xero-node token set to AccountingTokenSet', async () => {
    mockXeroClientInstance.apiCallback.mockResolvedValue({
      access_token: 'access-123',
      refresh_token: 'refresh-123',
      expires_at: 1893456000,
      id_token: 'id-123',
      scope: 'openid accounting.contacts',
    });

    const tokenSet = await adapter.exchangeCodeForToken('http://callback?code=abc&state=xyz', 'xyz');

    expect(tokenSet).toEqual({
      accessToken: 'access-123',
      refreshToken: 'refresh-123',
      expiresAt: new Date(1893456000 * 1000).toISOString(),
      idToken: 'id-123',
      scope: 'openid accounting.contacts',
    });
  });

  it('exchangeCodeForToken throws when the provider omits required token fields', async () => {
    mockXeroClientInstance.apiCallback.mockResolvedValue({ access_token: 'only-this' });
    await expect(adapter.exchangeCodeForToken('http://callback', 'xyz')).rejects.toThrow(
      /complete token set/,
    );
  });

  it('listAvailableOrganisations maps tenants to provider-neutral shape', async () => {
    mockXeroClientInstance.updateTenants.mockResolvedValue([
      { tenantId: 'tenant-1', tenantName: 'Acme Wines' },
      { tenantId: 'tenant-2', tenantName: 'Acme Spirits' },
    ]);

    const orgs = await adapter.listAvailableOrganisations({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date().toISOString(),
      scope: 'openid',
    });

    expect(orgs).toEqual([
      { externalId: 'tenant-1', name: 'Acme Wines' },
      { externalId: 'tenant-2', name: 'Acme Spirits' },
    ]);
    expect(mockXeroClientInstance.setTokenSet).toHaveBeenCalled();
    expect(mockXeroClientInstance.updateTenants).toHaveBeenCalledWith(false);
  });

  it('refreshAccessToken delegates to refreshWithRefreshToken and maps the result', async () => {
    mockXeroClientInstance.refreshWithRefreshToken.mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_at: 1893456000,
      scope: 'openid',
    });

    const refreshed = await adapter.refreshAccessToken({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: new Date().toISOString(),
      scope: 'openid',
    });

    expect(mockXeroClientInstance.refreshWithRefreshToken).toHaveBeenCalledWith(
      'client-id',
      'client-secret',
      'old-refresh',
    );
    expect(refreshed.accessToken).toBe('new-access');
  });
});
