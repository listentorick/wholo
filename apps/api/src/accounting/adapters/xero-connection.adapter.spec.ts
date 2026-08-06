import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { XeroAccountingAdapter } from './xero-connection.adapter';
import { AccountingProviderError } from './accounting-provider.error';

const mockGetContacts = jest.fn();
const mockGetItems = jest.fn();
const mockCreateInvoices = jest.fn();

const mockXeroClientInstance = {
  buildConsentUrl: jest.fn(),
  apiCallback: jest.fn(),
  setTokenSet: jest.fn(),
  updateTenants: jest.fn(),
  accountingApi: { getContacts: mockGetContacts, getItems: mockGetItems, createInvoices: mockCreateInvoices },
};

jest.mock('xero-node', () => ({
  XeroClient: jest.fn().mockImplementation(() => mockXeroClientInstance),
  Contact: { ContactStatusEnum: { ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED', GDPRREQUEST: 'GDPRREQUEST' } },
  Address: { AddressTypeEnum: { POBOX: 'POBOX', STREET: 'STREET' } },
  Invoice: {
    TypeEnum: { ACCREC: 'ACCREC', ACCPAY: 'ACCPAY' },
    StatusEnum: { DRAFT: 'DRAFT', SUBMITTED: 'SUBMITTED', AUTHORISED: 'AUTHORISED', PAID: 'PAID' },
  },
  CurrencyCode: { GBP: 'GBP', EUR: 'EUR', USD: 'USD' },
  LineAmountTypes: { Exclusive: 'Exclusive', Inclusive: 'Inclusive', NoTax: 'NoTax' },
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

  describe('refreshAccessToken', () => {
    const tokenSet = {
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: new Date().toISOString(),
      scope: 'openid',
    };
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    const mockFetchOnce = (impl: (...args: unknown[]) => unknown) => {
      global.fetch = jest.fn().mockImplementation(impl) as unknown as typeof fetch;
    };

    it('posts the refresh_token grant directly to the Xero token endpoint (bypassing xero-node) and maps the result', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 1800,
          scope: 'openid',
        }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const before = Date.now();
      const refreshed = await adapter.refreshAccessToken(tokenSet);
      const after = Date.now();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://identity.xero.com/connect/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
          body: 'grant_type=refresh_token&refresh_token=old-refresh',
        }),
      );
      expect(refreshed.accessToken).toBe('new-access');
      expect(refreshed.refreshToken).toBe('new-refresh');
      // No client.refreshWithRefreshToken involved at all any more, so
      // expires_at must be computed locally from the raw expires_in — assert
      // it lands in the expected window rather than trusting an echoed field.
      const expiresAtMs = new Date(refreshed.expiresAt).getTime();
      expect(expiresAtMs).toBeGreaterThanOrEqual(before + 1800 * 1000 - 1000);
      expect(expiresAtMs).toBeLessThanOrEqual(after + 1800 * 1000);
    });

    it('classifies invalid_grant (dead/reused refresh token) as permanent, tagged with its OAuth code', async () => {
      mockFetchOnce(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'invalid_grant', error_description: 'token expired or revoked' }),
        }),
      );

      const err = await adapter.refreshAccessToken(tokenSet).catch((e) => e);

      expect(err).toBeInstanceOf(AccountingProviderError);
      expect(err.transient).toBe(false);
      expect(err.code).toBe('invalid_grant');
      expect(err.message).toContain('invalid_grant');
    });

    it('classifies invalid_client (our application credentials, not the distributor) as permanent with a distinct code', async () => {
      mockFetchOnce(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'invalid_client' }),
        }),
      );

      const err = await adapter.refreshAccessToken(tokenSet).catch((e) => e);

      expect(err.transient).toBe(false);
      expect(err.code).toBe('invalid_client');
    });

    it('classifies 429 as transient', async () => {
      mockFetchOnce(() => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) }));

      const err = await adapter.refreshAccessToken(tokenSet).catch((e) => e);
      expect(err.transient).toBe(true);
    });

    it('classifies 5xx as transient', async () => {
      mockFetchOnce(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }));

      const err = await adapter.refreshAccessToken(tokenSet).catch((e) => e);
      expect(err.transient).toBe(true);
    });

    it('classifies an unknown 4xx as permanent (retrying identically would not succeed) with a generic message', async () => {
      mockFetchOnce(() => Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({}) }));

      const err = await adapter.refreshAccessToken(tokenSet).catch((e) => e);
      expect(err.transient).toBe(false);
      expect(err.message).toContain('400');
    });

    it('classifies a network failure (fetch rejects, no HTTP response at all) as transient', async () => {
      mockFetchOnce(() => Promise.reject(new TypeError('fetch failed')));

      const err = await adapter.refreshAccessToken(tokenSet).catch((e) => e);
      expect(err).toBeInstanceOf(AccountingProviderError);
      expect(err.transient).toBe(true);
      expect(err.message).toContain('fetch failed');
    });

    it('passes a real AbortSignal (genuine transport-level cancel, not a Promise.race wrapper) and classifies a timeout as transient', async () => {
      let observedSignal: AbortSignal | undefined;
      mockFetchOnce((_url: unknown, init: { signal?: AbortSignal }) => {
        observedSignal = init.signal;
        return Promise.reject(new DOMException('This operation was aborted', 'TimeoutError'));
      });

      const err = await adapter.refreshAccessToken(tokenSet).catch((e) => e);

      expect(observedSignal).toBeInstanceOf(AbortSignal);
      expect(err.transient).toBe(true);
    });
  });

  describe('listContacts', () => {
    const tokenSet = {
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date().toISOString(),
      scope: 'openid accounting.contacts',
    };

    it('maps a single STREET address to both billing (fallback) and delivery', async () => {
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
          deliveryLine1: '1 Vine Street',
          deliveryLine2: undefined,
          deliveryCity: 'London',
          deliveryState: undefined,
          deliveryPostcode: 'E1 1AA',
          deliveryCountry: 'UK',
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

    it('maps POBOX to billing and STREET to delivery when a contact has both', async () => {
      mockGetContacts.mockResolvedValueOnce({
        body: {
          contacts: [
            {
              contactID: 'contact-2',
              name: 'Acme Spirits',
              isCustomer: true,
              isSupplier: false,
              contactStatus: 'ACTIVE',
              addresses: [
                {
                  addressType: 'STREET',
                  addressLine1: '1 Vine Street',
                  city: 'London',
                  postalCode: 'E1 1AA',
                  country: 'UK',
                },
                {
                  addressType: 'POBOX',
                  addressLine1: 'PO Box 42',
                  city: 'London',
                  postalCode: 'E1 2BB',
                  country: 'UK',
                },
              ],
            },
          ],
        },
      });

      const [contact] = await adapter.listContacts(tokenSet, 'tenant-1');

      expect(contact.billingLine1).toBe('PO Box 42');
      expect(contact.billingPostcode).toBe('E1 2BB');
      expect(contact.deliveryLine1).toBe('1 Vine Street');
      expect(contact.deliveryPostcode).toBe('E1 1AA');
    });

    it('maps a single POBOX address to billing only, leaving delivery empty', async () => {
      mockGetContacts.mockResolvedValueOnce({
        body: {
          contacts: [
            {
              contactID: 'contact-3',
              name: 'Mail Order Co',
              isCustomer: true,
              isSupplier: false,
              contactStatus: 'ACTIVE',
              addresses: [
                {
                  addressType: 'POBOX',
                  addressLine1: 'PO Box 7',
                  city: 'Bristol',
                  postalCode: 'BS1 1AA',
                  country: 'UK',
                },
              ],
            },
          ],
        },
      });

      const [contact] = await adapter.listContacts(tokenSet, 'tenant-1');

      expect(contact.billingLine1).toBe('PO Box 7');
      expect(contact.deliveryLine1).toBeUndefined();
      expect(contact.deliveryCity).toBeUndefined();
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

  describe('hasInvoiceCreationScope', () => {
    it('accepts the granular accounting.invoices scope', () => {
      expect(adapter.hasInvoiceCreationScope('openid accounting.invoices offline_access')).toBe(true);
    });

    it('accepts the legacy broad accounting.transactions scope (pre-granular-cutover apps)', () => {
      expect(adapter.hasInvoiceCreationScope('openid accounting.transactions offline_access')).toBe(true);
    });

    it('rejects a scope set without invoice access (pre-Phase-4 connections)', () => {
      expect(
        adapter.hasInvoiceCreationScope('openid profile email accounting.contacts accounting.settings offline_access'),
      ).toBe(false);
    });
  });

  describe('createInvoice', () => {
    const tokenSet = {
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date().toISOString(),
      scope: 'openid accounting.transactions',
    };

    const request = {
      externalContactId: 'contact-1',
      reference: 'ORD-1001',
      currency: 'GBP',
      issueDate: '2026-07-09',
      targetStatus: 'DRAFT' as const,
      lines: [
        {
          description: 'Cabernet Sauvignon 2023',
          quantity: 6,
          unitPrice: '12.34',
          externalItemCode: 'CAB-SAUV-001',
          taxCode: 'OUTPUT2',
          accountCode: '200',
        },
        { description: 'Unmapped Merlot', quantity: 2, unitPrice: '9.99' },
      ],
    };

    const createdInvoice = {
      invoiceID: 'inv-1',
      invoiceNumber: 'INV-0042',
      status: 'DRAFT',
    };

    it('maps the neutral request to a Xero ACCREC invoice with the idempotency key', async () => {
      mockCreateInvoices.mockResolvedValueOnce({ body: { invoices: [createdInvoice] } });

      await adapter.createInvoice(tokenSet, 'tenant-1', request, 'export-1:1');

      expect(mockXeroClientInstance.setTokenSet).toHaveBeenCalled();
      expect(mockCreateInvoices).toHaveBeenCalledWith(
        'tenant-1',
        {
          invoices: [
            {
              type: 'ACCREC',
              contact: { contactID: 'contact-1' },
              date: '2026-07-09',
              reference: 'ORD-1001',
              currencyCode: 'GBP',
              lineAmountTypes: 'Exclusive',
              status: 'DRAFT',
              lineItems: [
                {
                  description: 'Cabernet Sauvignon 2023',
                  quantity: 6,
                  unitAmount: 12.34,
                  itemCode: 'CAB-SAUV-001',
                  taxType: 'OUTPUT2',
                  accountCode: '200',
                },
                { description: 'Unmapped Merlot', quantity: 2, unitAmount: 9.99 },
              ],
            },
          ],
        },
        true,
        4,
        'export-1:1',
      );
    });

    it('maps each target status onto the matching Xero status', async () => {
      for (const targetStatus of ['SUBMITTED', 'AUTHORISED'] as const) {
        mockCreateInvoices.mockResolvedValueOnce({ body: { invoices: [createdInvoice] } });
        await adapter.createInvoice(tokenSet, 'tenant-1', { ...request, targetStatus }, 'key');
        const sent = mockCreateInvoices.mock.calls.at(-1)![1].invoices[0];
        expect(sent.status).toBe(targetStatus);
      }
    });

    it('returns the created invoice identifiers as a provider-neutral result', async () => {
      mockCreateInvoices.mockResolvedValueOnce({ body: { invoices: [createdInvoice] } });

      const result = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key');

      expect(result).toEqual({
        externalInvoiceId: 'inv-1',
        externalInvoiceNumber: 'INV-0042',
        externalInvoiceStatus: 'DRAFT',
        raw: createdInvoice,
      });
    });

    it('tolerates a missing invoice number (orgs that number on approval)', async () => {
      mockCreateInvoices.mockResolvedValueOnce({
        body: { invoices: [{ invoiceID: 'inv-2', status: 'DRAFT' }] },
      });

      const result = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key');

      expect(result.externalInvoiceId).toBe('inv-2');
      expect(result.externalInvoiceNumber).toBeUndefined();
    });

    it('throws a permanent AccountingProviderError when the response contains no invoice', async () => {
      mockCreateInvoices.mockResolvedValueOnce({ body: { invoices: [] } });

      await expect(adapter.createInvoice(tokenSet, 'tenant-1', request, 'key')).rejects.toMatchObject({
        name: 'AccountingProviderError',
        transient: false,
      });
    });

    it('classifies validation failures (400) as permanent and surfaces Xero validation messages', async () => {
      mockCreateInvoices.mockRejectedValueOnce({
        response: {
          statusCode: 400,
          body: {
            Elements: [{ ValidationErrors: [{ Message: 'Account code 999 is not valid' }] }],
          },
        },
      });

      const err = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);

      expect(err).toBeInstanceOf(AccountingProviderError);
      expect(err.transient).toBe(false);
      expect(err.message).toContain('Account code 999 is not valid');
    });

    it('classifies rate limits (429) and provider faults (5xx) as transient', async () => {
      for (const statusCode of [429, 500, 503]) {
        mockCreateInvoices.mockRejectedValueOnce({ response: { statusCode } });
        const err = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);
        expect(err).toBeInstanceOf(AccountingProviderError);
        expect(err.transient).toBe(true);
      }
    });

    it('classifies errors without an HTTP response (network faults) as transient', async () => {
      mockCreateInvoices.mockRejectedValueOnce(new Error('socket hang up'));

      const err = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);

      expect(err).toBeInstanceOf(AccountingProviderError);
      expect(err.transient).toBe(true);
      expect(err.message).toContain('socket hang up');
    });
  });
});
