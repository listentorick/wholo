import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { XeroAccountingAdapter } from './xero-connection.adapter';

const mockGetContacts = jest.fn();
const mockGetItems = jest.fn();

const mockXeroClientInstance = {
  buildConsentUrl: jest.fn(),
  apiCallback: jest.fn(),
  setTokenSet: jest.fn(),
  updateTenants: jest.fn(),
  refreshWithRefreshToken: jest.fn(),
  accountingApi: { getContacts: mockGetContacts, getItems: mockGetItems },
};

jest.mock('xero-node', () => ({
  XeroClient: jest.fn().mockImplementation(() => mockXeroClientInstance),
  Contact: { ContactStatusEnum: { ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED', GDPRREQUEST: 'GDPRREQUEST' } },
  Address: { AddressTypeEnum: { POBOX: 'POBOX', STREET: 'STREET' } },
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

  describe('listContacts', () => {
    const tokenSet = {
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date().toISOString(),
      scope: 'openid accounting.contacts',
    };

    it('maps xero-node contacts to the provider-neutral shape', async () => {
      mockGetContacts.mockResolvedValueOnce({
        body: {
          contacts: [
            {
              contactID: 'contact-1',
              contactNumber: 'CODE-1',
              accountNumber: 'ACC-1',
              name: 'Acme Wines',
              emailAddress: 'billing@acme.example',
              isCustomer: true,
              isSupplier: false,
              contactStatus: 'ACTIVE',
              updatedDateUTC: '2026-01-01T00:00:00.000Z',
              addresses: [
                {
                  addressType: 'STREET',
                  addressLine1: '1 Vine Street',
                  city: 'London',
                  postalCode: 'E1 1AA',
                  country: 'UK',
                },
              ],
            },
          ],
        },
      });

      const contacts = await adapter.listContacts(tokenSet, 'tenant-1');

      expect(contacts).toEqual([
        {
          externalId: 'contact-1',
          code: 'CODE-1',
          accountNumber: 'ACC-1',
          displayName: 'Acme Wines',
          email: 'billing@acme.example',
          billingLine1: '1 Vine Street',
          billingLine2: undefined,
          billingCity: 'London',
          billingState: undefined,
          billingPostcode: 'E1 1AA',
          billingCountry: 'UK',
          isCustomer: true,
          isSupplier: false,
          isArchived: false,
          updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          raw: expect.any(Object),
        },
      ]);
      expect(mockXeroClientInstance.setTokenSet).toHaveBeenCalled();
      expect(mockGetContacts).toHaveBeenCalledWith(
        'tenant-1',
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        true,
      );
    });

    it('marks archived contacts based on contactStatus', async () => {
      mockGetContacts.mockResolvedValueOnce({
        body: { contacts: [{ contactID: 'c-2', name: 'Old Co', contactStatus: 'ARCHIVED' }] },
      });

      const [contact] = await adapter.listContacts(tokenSet, 'tenant-1');
      expect(contact.isArchived).toBe(true);
    });

    it('paginates until a short page is returned', async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => ({
        contactID: `c-${i}`,
        name: `Contact ${i}`,
      }));
      mockGetContacts
        .mockResolvedValueOnce({ body: { contacts: fullPage } })
        .mockResolvedValueOnce({ body: { contacts: [{ contactID: 'c-last', name: 'Last' }] } });

      const contacts = await adapter.listContacts(tokenSet, 'tenant-1');

      expect(contacts).toHaveLength(101);
      expect(mockGetContacts).toHaveBeenCalledTimes(2);
      expect(mockGetContacts).toHaveBeenNthCalledWith(2, 'tenant-1', undefined, undefined, undefined, undefined, 2, true);
    });

    it('passes modifiedSince through to getContacts', async () => {
      mockGetContacts.mockResolvedValueOnce({ body: { contacts: [] } });
      const since = new Date('2026-01-01T00:00:00.000Z');

      await adapter.listContacts(tokenSet, 'tenant-1', since);

      expect(mockGetContacts).toHaveBeenCalledWith('tenant-1', since, undefined, undefined, undefined, 1, true);
    });
  });

  describe('listProducts', () => {
    const tokenSet = {
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date().toISOString(),
      scope: 'openid accounting.settings',
    };

    it('maps xero-node items to the provider-neutral shape', async () => {
      mockGetItems.mockResolvedValueOnce({
        body: {
          items: [
            {
              itemID: 'item-1',
              code: 'CAB-SAUV-001',
              name: 'Cabernet Sauvignon 2023',
              description: 'A bold red',
              isSold: true,
              isPurchased: false,
              isTrackedAsInventory: true,
              quantityOnHand: 42.5,
              salesDetails: { unitPrice: 12.3456, taxType: 'OUTPUT2', accountCode: '200' },
              purchaseDetails: { unitPrice: 8.5, taxType: 'INPUT2', accountCode: '300' },
              updatedDateUTC: '2026-02-01T00:00:00.000Z',
            },
          ],
        },
      });

      const products = await adapter.listProducts(tokenSet, 'tenant-1');

      expect(products).toEqual([
        {
          externalId: 'item-1',
          code: 'CAB-SAUV-001',
          displayName: 'Cabernet Sauvignon 2023',
          description: 'A bold red',
          salesUnitPrice: '12.3456',
          purchaseUnitPrice: '8.5',
          taxCode: 'OUTPUT2',
          accountCode: '200',
          purchaseTaxCode: 'INPUT2',
          purchaseAccountCode: '300',
          isSold: true,
          isPurchased: false,
          isTracked: true,
          isActive: true,
          quantityOnHand: '42.5',
          updatedAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
          raw: expect.any(Object),
        },
      ]);
      expect(mockXeroClientInstance.setTokenSet).toHaveBeenCalled();
    });

    it('requests four-decimal-place unit prices (unitdp=4) in a single unpaginated call', async () => {
      mockGetItems.mockResolvedValueOnce({ body: { items: [] } });

      await adapter.listProducts(tokenSet, 'tenant-1');

      expect(mockGetItems).toHaveBeenCalledTimes(1);
      expect(mockGetItems).toHaveBeenCalledWith('tenant-1', undefined, undefined, undefined, 4);
    });

    it('falls back to the item code as display name when name is missing', async () => {
      mockGetItems.mockResolvedValueOnce({
        body: { items: [{ itemID: 'item-2', code: 'MERLOT-CASE' }] },
      });

      const [product] = await adapter.listProducts(tokenSet, 'tenant-1');

      expect(product.displayName).toBe('MERLOT-CASE');
    });

    it('defaults isSold/isPurchased to true and prices to undefined when details are absent', async () => {
      mockGetItems.mockResolvedValueOnce({
        body: { items: [{ itemID: 'item-3', code: 'BARE' }] },
      });

      const [product] = await adapter.listProducts(tokenSet, 'tenant-1');

      expect(product.isSold).toBe(true);
      expect(product.isPurchased).toBe(true);
      expect(product.isTracked).toBe(false);
      expect(product.salesUnitPrice).toBeUndefined();
      expect(product.purchaseUnitPrice).toBeUndefined();
      expect(product.quantityOnHand).toBeUndefined();
    });

    it('passes modifiedSince through to getItems', async () => {
      mockGetItems.mockResolvedValueOnce({ body: { items: [] } });
      const since = new Date('2026-03-01T00:00:00.000Z');

      await adapter.listProducts(tokenSet, 'tenant-1', since);

      expect(mockGetItems).toHaveBeenCalledWith('tenant-1', since, undefined, undefined, 4);
    });
  });
});
