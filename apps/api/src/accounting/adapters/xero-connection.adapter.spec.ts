import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { parseXeroCalendarDate, XeroAccountingAdapter } from './xero-connection.adapter';
import { AccountingProviderError } from './accounting-provider.error';
import { AccountingCallBudgetService } from '../accounting-call-budget.service';

const mockGetContacts = jest.fn();
const mockGetItems = jest.fn();
const mockCreateInvoices = jest.fn();
const mockGetTaxRates = jest.fn();
const mockGetInvoices = jest.fn();
const mockBudgetAcquire = jest.fn();

const mockXeroClientInstance = {
  buildConsentUrl: jest.fn(),
  apiCallback: jest.fn(),
  setTokenSet: jest.fn(),
  updateTenants: jest.fn(),
  accountingApi: { getContacts: mockGetContacts, getItems: mockGetItems, createInvoices: mockCreateInvoices, getTaxRates: mockGetTaxRates, getInvoices: mockGetInvoices },
};

jest.mock('xero-node', () => ({
  XeroClient: jest.fn().mockImplementation(() => mockXeroClientInstance),
  Contact: { ContactStatusEnum: { ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED', GDPRREQUEST: 'GDPRREQUEST' } },
  Address: { AddressTypeEnum: { POBOX: 'POBOX', STREET: 'STREET' } },
  TaxRate: { StatusEnum: { ACTIVE: 'ACTIVE', DELETED: 'DELETED' } },
  Invoice: {
    TypeEnum: { ACCREC: 'ACCREC', ACCPAY: 'ACCPAY' },
    StatusEnum: { DRAFT: 'DRAFT', SUBMITTED: 'SUBMITTED', AUTHORISED: 'AUTHORISED', PAID: 'PAID' },
  },
  CurrencyCode: { GBP: 'GBP', EUR: 'EUR', USD: 'USD' },
  LineAmountTypes: { Exclusive: 'Exclusive', Inclusive: 'Inclusive', NoTax: 'NoTax' },
}));

// The shape xero-node 18.1.0 actually rejects with (verified against the SDK
// with a local HTTP server): a JSON *string* of ApiError.generateError().
function xeroSdkRejection(statusCode: number, body: unknown, headers: Record<string, string> = {}): string {
  return JSON.stringify({
    response: {
      statusCode,
      body,
      headers: { 'content-type': 'application/json', connection: 'keep-alive', ...headers },
      request: { url: { protocol: 'https:', host: 'api.xero.com', path: '/api.xro/2.0/Invoices' }, headers: {}, method: 'PUT' },
    },
    body,
  });
}

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
    mockBudgetAcquire.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XeroAccountingAdapter,
        { provide: ConfigService, useValue: makeConfig() },
        { provide: AccountingCallBudgetService, useValue: { acquire: mockBudgetAcquire } },
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

      const { records: contacts } = await adapter.listContacts(tokenSet, 'tenant-1');

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
        undefined,
        undefined,
        1000,
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

      const {
        records: [contact],
      } = await adapter.listContacts(tokenSet, 'tenant-1');

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

      const {
        records: [contact],
      } = await adapter.listContacts(tokenSet, 'tenant-1');

      expect(contact.billingLine1).toBe('PO Box 7');
      expect(contact.deliveryLine1).toBeUndefined();
      expect(contact.deliveryCity).toBeUndefined();
    });

    it('marks archived contacts based on contactStatus', async () => {
      mockGetContacts.mockResolvedValueOnce({
        body: { contacts: [{ contactID: 'c-2', name: 'Old Co', contactStatus: 'ARCHIVED' }] },
      });

      const {
        records: [contact],
      } = await adapter.listContacts(tokenSet, 'tenant-1');
      expect(contact.isArchived).toBe(true);
    });

    it('paginates at Xero\'s maximum page size until a short page is returned', async () => {
      const fullPage = Array.from({ length: 1000 }, (_, i) => ({
        contactID: `c-${i}`,
        name: `Contact ${i}`,
      }));
      mockGetContacts
        .mockResolvedValueOnce({ body: { contacts: fullPage } })
        .mockResolvedValueOnce({ body: { contacts: [{ contactID: 'c-last', name: 'Last' }] } });

      const { records: contacts } = await adapter.listContacts(tokenSet, 'tenant-1');

      expect(contacts).toHaveLength(1001);
      expect(mockGetContacts).toHaveBeenCalledTimes(2);
      expect(mockGetContacts).toHaveBeenNthCalledWith(
        2,
        'tenant-1',
        undefined,
        undefined,
        undefined,
        undefined,
        2,
        true,
        undefined,
        undefined,
        1000,
      );
    });

    it('takes one call-budget slot per page, keyed by the organisation', async () => {
      const fullPage = Array.from({ length: 1000 }, (_, i) => ({ contactID: `c-${i}`, name: `C ${i}` }));
      mockGetContacts
        .mockResolvedValueOnce({ body: { contacts: fullPage } })
        .mockResolvedValueOnce({ body: { contacts: [] } });

      await adapter.listContacts(tokenSet, 'tenant-1');

      expect(mockBudgetAcquire).toHaveBeenCalledTimes(2);
      expect(mockBudgetAcquire).toHaveBeenCalledWith('XERO', 'tenant-1', 50);
    });

    it('turns the cursor into If-Modified-Since for an incremental fetch', async () => {
      mockGetContacts.mockResolvedValueOnce({ body: { contacts: [] } });

      await adapter.listContacts(tokenSet, 'tenant-1', '2026-01-01T00:00:00.000Z');

      expect(mockGetContacts.mock.calls[0][1]).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });

    it('returns a next cursor 5 minutes before the newest change seen, so same-second writes are not skipped', async () => {
      mockGetContacts.mockResolvedValueOnce({
        body: {
          contacts: [
            { contactID: 'a', name: 'A', updatedDateUTC: new Date('2026-05-01T10:00:00.000Z') },
            { contactID: 'b', name: 'B', updatedDateUTC: new Date('2026-05-01T12:00:00.000Z') },
          ],
        },
      });

      const { nextCursor } = await adapter.listContacts(tokenSet, 'tenant-1');

      expect(nextCursor).toBe('2026-05-01T11:55:00.000Z');
    });

    it('never moves the cursor backwards, and keeps it when nothing changed', async () => {
      mockGetContacts.mockResolvedValueOnce({ body: { contacts: [] } });
      const unchanged = await adapter.listContacts(tokenSet, 'tenant-1', '2026-05-01T11:55:00.000Z');
      expect(unchanged.nextCursor).toBe('2026-05-01T11:55:00.000Z');

      mockGetContacts.mockResolvedValueOnce({
        body: { contacts: [{ contactID: 'old', name: 'Old', updatedDateUTC: new Date('2026-05-01T11:56:00.000Z') }] },
      });
      const overlap = await adapter.listContacts(tokenSet, 'tenant-1', '2026-05-01T11:55:00.000Z');
      expect(overlap.nextCursor).toBe('2026-05-01T11:55:00.000Z');
    });

    it('has no cursor to offer after a full fetch of an empty organisation', async () => {
      mockGetContacts.mockResolvedValueOnce({ body: { contacts: [] } });

      const { nextCursor } = await adapter.listContacts(tokenSet, 'tenant-1');

      expect(nextCursor).toBeNull();
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

      const { records: products } = await adapter.listProducts(tokenSet, 'tenant-1');

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

      const {
        records: [product],
      } = await adapter.listProducts(tokenSet, 'tenant-1');

      expect(product.displayName).toBe('MERLOT-CASE');
    });

    it('defaults isSold/isPurchased to true and prices to undefined when details are absent', async () => {
      mockGetItems.mockResolvedValueOnce({
        body: { items: [{ itemID: 'item-3', code: 'BARE' }] },
      });

      const {
        records: [product],
      } = await adapter.listProducts(tokenSet, 'tenant-1');

      expect(product.isSold).toBe(true);
      expect(product.isPurchased).toBe(true);
      expect(product.isTracked).toBe(false);
      expect(product.salesUnitPrice).toBeUndefined();
      expect(product.purchaseUnitPrice).toBeUndefined();
      expect(product.quantityOnHand).toBeUndefined();
    });

    it('turns the cursor into If-Modified-Since for getItems', async () => {
      mockGetItems.mockResolvedValueOnce({ body: { items: [] } });

      await adapter.listProducts(tokenSet, 'tenant-1', '2026-03-01T00:00:00.000Z');

      expect(mockGetItems).toHaveBeenCalledWith('tenant-1', new Date('2026-03-01T00:00:00.000Z'), undefined, undefined, 4);
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
      mockCreateInvoices.mockRejectedValueOnce(
        xeroSdkRejection(400, {
          Message: 'A validation exception occurred',
          Elements: [{ ValidationErrors: [{ Message: 'Account code 999 is not valid' }] }],
        }),
      );

      const err = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);

      expect(err).toBeInstanceOf(AccountingProviderError);
      expect(err.transient).toBe(false);
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Xero rejected the invoice: Account code 999 is not valid');
    });

    it('never lets the raw SDK rejection (headers, request, body) into the error it throws', async () => {
      mockCreateInvoices.mockRejectedValueOnce(
        xeroSdkRejection(400, { Elements: [{ ValidationErrors: [{ Message: 'Bad' }] }], ContactEmail: 'jane@customer.com' }),
      );

      const err = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);
      const everything = JSON.stringify({ message: err.message, cause: err.cause, details: err.details });

      expect(everything).not.toContain('jane@customer.com');
      expect(everything).not.toContain('/api.xro/2.0/Invoices');
      expect(everything).not.toContain('keep-alive');
    });

    it('classifies rate limits (429) as transient and carries Retry-After for the queue backoff', async () => {
      mockCreateInvoices.mockRejectedValueOnce(xeroSdkRejection(429, 'Rate limit exceeded', { 'retry-after': '7' }));

      const err = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);

      expect(err).toBeInstanceOf(AccountingProviderError);
      expect(err.transient).toBe(true);
      expect(err.code).toBe('HTTP_429');
      expect(err.retryAfterMs).toBe(7_000);
    });

    it('classifies provider faults (5xx) as transient', async () => {
      for (const statusCode of [500, 503]) {
        mockCreateInvoices.mockRejectedValueOnce(xeroSdkRejection(statusCode, null));
        const err = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);
        expect(err).toBeInstanceOf(AccountingProviderError);
        expect(err.transient).toBe(true);
      }
    });

    it('classifies an expired or invalid access token (401) as transient — the retry refreshes it', async () => {
      mockCreateInvoices.mockRejectedValueOnce(
        xeroSdkRejection(401, { Type: null, Title: 'Unauthorized', Status: 401, Detail: 'TokenExpired: token expired at 09/30/2026 10:00:00' }),
      );

      const err = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);

      expect(err).toBeInstanceOf(AccountingProviderError);
      expect(err.transient).toBe(true);
      expect(err.code).toBe('HTTP_401');
    });

    it('classifies forbidden (403) as permanent — a valid token not allowed for this organisation needs a reconnect', async () => {
      mockCreateInvoices.mockRejectedValueOnce(
        xeroSdkRejection(403, { Type: null, Title: 'Forbidden', Status: 403, Detail: 'AuthenticationUnsuccessful' }),
      );

      const err = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);

      expect(err).toBeInstanceOf(AccountingProviderError);
      expect(err.transient).toBe(false);
      expect(err.code).toBe('HTTP_403');
    });

    it('classifies a transport failure (xero-node 18.1 rejects with statusCode 0) as transient', async () => {
      mockCreateInvoices.mockRejectedValueOnce(xeroSdkRejection(0, 'connect ECONNREFUSED 10.0.0.1:443'));

      const err = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);

      expect(err.transient).toBe(true);
      expect(err.code).toBe('NETWORK');
      expect(err.message).toContain('ECONNREFUSED');
    });

    it('classifies a thrown Error without an HTTP response as transient', async () => {
      mockCreateInvoices.mockRejectedValueOnce(new Error('socket hang up'));

      const err = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);

      expect(err).toBeInstanceOf(AccountingProviderError);
      expect(err.transient).toBe(true);
      expect(err.message).toContain('socket hang up');
    });

    it('logs one structured warn per failed call, with the ids needed to chase it', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      mockCreateInvoices.mockRejectedValueOnce(
        xeroSdkRejection(400, { Elements: [{ ValidationErrors: [{ Message: 'Bad code' }] }] }, { 'xero-correlation-id': 'corr-1' }),
      );

      await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch(() => undefined);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatchObject({
        event: 'accounting.provider.call_failed',
        provider: 'XERO',
        externalOrgId: 'tenant-1',
        op: 'createInvoices',
        statusCode: 400,
        transient: false,
        validationMessages: ['Bad code'],
        xeroCorrelationId: 'corr-1',
      });
      warn.mockRestore();
    });

    it('warns when the organisation is close to its daily call limit', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      mockCreateInvoices.mockResolvedValueOnce({
        response: { status: 200, headers: { 'x-daylimit-remaining': '120', 'x-minlimit-remaining': '55' } },
        body: { invoices: [createdInvoice] },
      });

      await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key');

      expect(warn.mock.calls[0][0]).toMatchObject({
        event: 'accounting.provider.day_limit_low',
        externalOrgId: 'tenant-1',
        dayRemaining: 120,
        minRemaining: 55,
      });
      warn.mockRestore();
    });
  });

  // ADR-073: the caller must know when a failed create may have gone through.
  describe('createInvoice — was the invoice possibly created?', () => {
    const tokenSet = { accessToken: 'a', refreshToken: 'r', expiresAt: new Date().toISOString(), scope: 'accounting.invoices' };
    const request = {
      externalContactId: 'contact-1',
      reference: 'ORD-1001',
      currency: 'GBP',
      issueDate: '2026-07-09',
      targetStatus: 'DRAFT' as const,
      lines: [{ description: 'Cabernet Sauvignon 2023', quantity: 6, unitPrice: '12.34' }],
    };
    const failure = (rejection: unknown) => {
      mockCreateInvoices.mockRejectedValueOnce(rejection);
      return adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);
    };

    it('reports an unknown outcome when Xero never answered or failed on its side', async () => {
      expect((await failure(xeroSdkRejection(0, 'socket hang up'))).outcomeUnknown).toBe(true);
      expect((await failure(new Error('socket hang up'))).outcomeUnknown).toBe(true);
      expect((await failure(xeroSdkRejection(500, null))).outcomeUnknown).toBe(true);
      expect((await failure(xeroSdkRejection(503, null))).outcomeUnknown).toBe(true);
    });

    it('reports an unknown outcome when the call times out — Xero may still complete it', async () => {
      jest.useFakeTimers();
      try {
        mockCreateInvoices.mockReturnValueOnce(new Promise(() => undefined)); // never answers
        const pending = adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);
        await jest.advanceTimersByTimeAsync(61_000);
        const err = await pending;
        expect(err).toBeInstanceOf(AccountingProviderError);
        expect(err.transient).toBe(true);
        expect(err.outcomeUnknown).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('reports an unknown outcome when Xero answers success without an invoice', async () => {
      mockCreateInvoices.mockResolvedValueOnce({ body: { invoices: [] }, response: { status: 200 } });
      const err = await adapter.createInvoice(tokenSet, 'tenant-1', request, 'key').catch((e) => e);
      expect(err.outcomeUnknown).toBe(true);
    });

    it('reports a definite "not created" when Xero refused the request', async () => {
      for (const statusCode of [400, 401, 403, 429]) {
        expect((await failure(xeroSdkRejection(statusCode, null))).outcomeUnknown).toBe(false);
      }
    });
  });

  describe('findInvoiceByReference', () => {
    const tokenSet = { accessToken: 'a', refreshToken: 'r', expiresAt: new Date().toISOString(), scope: 'accounting.invoices' };

    it('asks Xero for live sales invoices this app created with that reference', async () => {
      mockGetInvoices.mockResolvedValueOnce({ body: { invoices: [] } });

      await adapter.findInvoiceByReference(tokenSet, 'tenant-1', 'ORD-2026-00042');

      const args = mockGetInvoices.mock.calls[0];
      expect(args[0]).toBe('tenant-1');
      expect(args[1]).toBeUndefined(); // no If-Modified-Since: whatever its age
      expect(args[2]).toBe('Type=="ACCREC" AND Reference=="ORD-2026-00042"');
      expect(args[7]).toEqual(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID']); // not VOIDED / DELETED
      expect(args[10]).toBe(true); // createdByMyApp
    });

    it('returns null when Xero has no such invoice', async () => {
      mockGetInvoices.mockResolvedValueOnce({ body: { invoices: [] } });

      expect(await adapter.findInvoiceByReference(tokenSet, 'tenant-1', 'ORD-1001')).toBeNull();
    });

    it('returns the invoice Xero holds, as a provider-neutral result', async () => {
      mockGetInvoices.mockResolvedValueOnce({
        body: { invoices: [{ invoiceID: 'inv-1', invoiceNumber: 'INV-0042', status: 'AUTHORISED' }] },
      });

      expect(await adapter.findInvoiceByReference(tokenSet, 'tenant-1', 'ORD-1001')).toMatchObject({
        externalInvoiceId: 'inv-1',
        externalInvoiceNumber: 'INV-0042',
        externalInvoiceStatus: 'AUTHORISED',
      });
    });

    it('settles on the oldest when Xero already holds more than one, and reports the duplicate', async () => {
      const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mockGetInvoices.mockResolvedValueOnce({
        body: { invoices: [{ invoiceID: 'inv-old', status: 'PAID' }, { invoiceID: 'inv-new', status: 'DRAFT' }] },
      });

      const found = await adapter.findInvoiceByReference(tokenSet, 'tenant-1', 'ORD-1001');

      expect(found?.externalInvoiceId).toBe('inv-old');
      expect(errorLog).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'accounting.invoice.duplicate_detected', reference: 'ORD-1001' }),
        expect.any(String),
      );
      errorLog.mockRestore();
    });

    it('throws rather than answer "no invoice" when the lookup fails', async () => {
      mockGetInvoices.mockRejectedValueOnce(xeroSdkRejection(503, null));

      await expect(adapter.findInvoiceByReference(tokenSet, 'tenant-1', 'ORD-1001')).rejects.toBeInstanceOf(
        AccountingProviderError,
      );
    });

    it('refuses a reference that could alter the Xero filter', async () => {
      await expect(adapter.findInvoiceByReference(tokenSet, 'tenant-1', 'X" OR Type=="ACCPAY')).rejects.toBeInstanceOf(
        AccountingProviderError,
      );
      expect(mockGetInvoices).not.toHaveBeenCalled();
    });
  });

  describe('listInvoiceStatuses', () => {
    const tokenSet = { accessToken: 'a', refreshToken: 'r', expiresAt: new Date().toISOString(), scope: 'accounting.invoices' };

    // Shapes as xero-node 18 returns them: date-only fields are raw
    // "/Date(ms+0000)/" strings, updatedDateUTC is already a Date.
    const xeroInvoice = {
      invoiceID: 'inv-1',
      invoiceNumber: 'INV-0042',
      status: 'AUTHORISED',
      currencyCode: 'GBP',
      total: 120,
      amountPaid: 50,
      amountCredited: 0,
      amountDue: 70,
      date: '/Date(1756684800000+0000)/', // 2025-09-01
      dueDate: '/Date(1759190400000+0000)/', // 2025-09-30
      updatedDateUTC: new Date('2025-09-10T08:00:00.000Z'),
    };

    it('asks Xero only for sales invoices this app created, a whole page at a time', async () => {
      mockGetInvoices.mockResolvedValueOnce({ body: { invoices: [] } });

      await adapter.listInvoiceStatuses(tokenSet, 'tenant-1');

      const args = mockGetInvoices.mock.calls[0];
      expect(args[0]).toBe('tenant-1');
      expect(args[1]).toBeUndefined(); // full pull: no If-Modified-Since
      expect(args[2]).toBe('Type=="ACCREC"');
      expect(args[10]).toBe(true); // createdByMyApp
      expect(args[13]).toBe(1000); // pageSize
    });

    it('maps a part-paid Xero invoice to the provider-neutral status, with calendar dates', async () => {
      mockGetInvoices.mockResolvedValueOnce({ body: { invoices: [xeroInvoice] } });

      const { records, nextCursor } = await adapter.listInvoiceStatuses(tokenSet, 'tenant-1');

      expect(records).toEqual([
        {
          externalInvoiceId: 'inv-1',
          externalInvoiceNumber: 'INV-0042',
          state: 'AWAITING_PAYMENT',
          rawStatus: 'AUTHORISED',
          currency: 'GBP',
          total: '120',
          amountPaid: '50',
          amountCredited: '0',
          amountDue: '70',
          issueDate: '2025-09-01',
          dueDate: '2025-09-30',
          fullyPaidOn: null,
          providerUpdatedAt: new Date('2025-09-10T08:00:00.000Z'),
        },
      ]);
      expect(nextCursor).toBe('2025-09-10T07:55:00.000Z');
    });

    it('maps every Xero status onto the neutral lifecycle', async () => {
      const statuses = ['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED', 'DELETED'];
      mockGetInvoices.mockResolvedValueOnce({
        body: { invoices: statuses.map((st, i) => ({ ...xeroInvoice, invoiceID: `i${i}`, status: st })) },
      });

      const { records } = await adapter.listInvoiceStatuses(tokenSet, 'tenant-1');

      expect(records.map((r) => r.state)).toEqual(['DRAFT', 'AWAITING_APPROVAL', 'AWAITING_PAYMENT', 'PAID', 'VOIDED', 'DELETED']);
    });

    it('pages until a short page and passes the cursor as If-Modified-Since', async () => {
      const full = Array.from({ length: 1000 }, (_, i) => ({ ...xeroInvoice, invoiceID: `i${i}` }));
      mockGetInvoices.mockResolvedValueOnce({ body: { invoices: full } }).mockResolvedValueOnce({ body: { invoices: [] } });

      const { records } = await adapter.listInvoiceStatuses(tokenSet, 'tenant-1', '2025-09-01T00:00:00.000Z');

      expect(records).toHaveLength(1000);
      expect(mockGetInvoices).toHaveBeenCalledTimes(2);
      expect(mockGetInvoices.mock.calls[0][1]).toEqual(new Date('2025-09-01T00:00:00.000Z'));
      expect(mockGetInvoices.mock.calls[1][8]).toBe(2); // page
    });
  });

  describe('hasInvoiceReadScope', () => {
    it('accepts the granular invoices scope (read-write or read-only) and the legacy broad scope', () => {
      expect(adapter.hasInvoiceReadScope('openid accounting.invoices')).toBe(true);
      expect(adapter.hasInvoiceReadScope('openid accounting.invoices.read')).toBe(true);
      expect(adapter.hasInvoiceReadScope('openid accounting.transactions')).toBe(true);
      expect(adapter.hasInvoiceReadScope('openid accounting.contacts')).toBe(false);
    });
  });
});

describe('parseXeroCalendarDate', () => {
  it('takes the UTC calendar date of a Xero /Date(ms+0000)/ value, never shifting time zones', () => {
    expect(parseXeroCalendarDate('/Date(1759190400000+0000)/')).toBe('2025-09-30');
  });

  it('accepts ISO dates and date-times', () => {
    expect(parseXeroCalendarDate('2025-09-30')).toBe('2025-09-30');
    expect(parseXeroCalendarDate('2025-09-30T00:00:00')).toBe('2025-09-30');
  });

  it('returns null for missing or unrecognised values', () => {
    expect(parseXeroCalendarDate(undefined)).toBeNull();
    expect(parseXeroCalendarDate('')).toBeNull();
    expect(parseXeroCalendarDate('next tuesday')).toBeNull();
  });
});
