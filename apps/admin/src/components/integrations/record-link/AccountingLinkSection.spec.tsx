import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Permission } from '@wholo/types';
import type { AccountingCustomerLink, AccountingProductLink, AccountingProvider } from '@wholo/types';
import { AccountingLinkSection } from './AccountingLinkSection';
import { customerLinkConfig, productLinkConfig } from './record-link-config';

let mockPermissions: Permission[] = [];
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { permissions: mockPermissions } }),
}));

const mockTriggerSync = vi.fn();
vi.mock('@/lib/ingestion-sync-context', () => ({
  useIngestionSync: () => ({ triggerSync: mockTriggerSync, isSyncing: false }),
}));

const api = vi.hoisted(() => ({
  listContacts: vi.fn(),
  listProducts: vi.fn(),
  matchContact: vi.fn(),
  matchProduct: vi.fn(),
  confirmSuggestion: vi.fn(),
  confirmProductSuggestion: vi.fn(),
  unlinkMapping: vi.fn(),
  unlinkProductMapping: vi.fn(),
  acknowledgeContactChange: vi.fn(),
  acknowledgeProductChange: vi.fn(),
}));

vi.mock('@wholo/admin-api-client', async () => {
  const actual = await vi.importActual<typeof import('@wholo/admin-api-client')>('@wholo/admin-api-client');
  return { ApiError: actual.ApiError, adminAccountingApi: api };
});

const { ApiError } = await import('@wholo/admin-api-client');

const connection = { provider: 'FAKE' as AccountingProvider, providerName: 'Fake Books', status: 'CONNECTED', lastSyncedAt: null } as const;
const contact = { id: 'ext-c-1', displayName: 'Highfield Golf Club Ltd', code: 'HGC-01', email: 'bar@highfield.example' };
const item = { id: 'ext-p-1', displayName: 'Sparkling Grape Juice 75cl', code: 'NA-008', salesUnitPrice: '3.20', taxCode: 'T20', taxName: '20% (VAT on Income)' };

function customerLink(overrides: Partial<AccountingCustomerLink> = {}) {
  return { connection, link: null, change: null, suggestion: null, history: [], ...overrides } as AccountingCustomerLink & {
    connection: typeof connection;
  };
}

function productLink(overrides: Partial<AccountingProductLink> = {}) {
  return { connection, link: null, change: null, suggestion: null, history: [], ...overrides } as AccountingProductLink & {
    connection: typeof connection;
  };
}

const linkedContact: AccountingCustomerLink['link'] = {
  mappingId: 'map-1',
  matchMethod: 'ACCOUNT_CODE_EXACT',
  linkedAt: '2026-10-12T09:00:00.000Z',
  linkedBy: { name: 'James Vine' },
  external: contact,
};

const customerRecord = { displayName: 'Highfield Golf Club', rows: [{ label: 'Email', value: 'bar@highfield.example' }] };
const productRecord = { displayName: 'Sparkling Grape Juice', rows: [{ label: 'Code', value: 'NA-008' }] };

function renderCustomer(link: ReturnType<typeof customerLink>, onChanged = vi.fn()) {
  render(
    <AccountingLinkSection config={customerLinkConfig} link={link} matchTargetId="rel-1" record={customerRecord} onChanged={onChanged} />,
  );
  return onChanged;
}

function renderProduct(link: ReturnType<typeof productLink>, onChanged = vi.fn()) {
  render(
    <AccountingLinkSection config={productLinkConfig} link={link} matchTargetId="prod-1" record={productRecord} onChanged={onChanged} />,
  );
  return onChanged;
}

describe('AccountingLinkSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = [Permission.ACCOUNTING_READ, Permission.ACCOUNTING_IMPORT];
    Object.values(api).forEach((fn) => fn.mockResolvedValue(undefined));
  });

  it('names the provider only from the connection', () => {
    renderCustomer(customerLink());
    expect(screen.getByText('Fake Books')).toBeInTheDocument();
    // No logo for this provider: the initial badge stands in.
    expect(screen.getByText('F')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Not linked to a Fake Books contact')).toBeInTheDocument();
  });

  it("shows the provider's logo when it has one", () => {
    renderCustomer(customerLink({ connection: { ...connection, provider: 'XERO' as AccountingProvider } }));
    expect(document.querySelector('img')).toHaveAttribute('src', '/logos/xero.png');
  });

  describe('linked', () => {
    it('shows the linked contact, who linked it and how', () => {
      renderCustomer(customerLink({ link: linkedContact }));
      expect(screen.getByText('Linked contact')).toBeInTheDocument();
      expect(screen.getByText('Highfield Golf Club Ltd')).toBeInTheDocument();
      expect(screen.getByText('HGC-01')).toBeInTheDocument();
      expect(screen.getByText(/by James Vine · matched on account code/)).toBeInTheDocument();
    });

    it('Unlink… confirms, then unlinks the mapping and reloads', async () => {
      const onChanged = renderCustomer(customerLink({ link: linkedContact }));
      fireEvent.click(screen.getByRole('button', { name: 'Unlink…' }));
      expect(api.unlinkMapping).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Yes, unlink' }));
      await waitFor(() => expect(api.unlinkMapping).toHaveBeenCalledWith('map-1'));
      expect(onChanged).toHaveBeenCalled();
    });

    it('offers Unlink, not a search, while linked', () => {
      renderCustomer(customerLink({ link: linkedContact }));
      expect(screen.getByRole('button', { name: 'Unlink…' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Change link/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    });
  });

  describe('changed', () => {
    it('says it changed in the provider and acknowledges the change', async () => {
      const onChanged = renderCustomer(customerLink({ link: linkedContact, change: { detectedAt: '2026-10-24T08:00:00.000Z' } }));
      expect(screen.getByText('Changed in Fake Books on 24 Oct 2026')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
      await waitFor(() => expect(api.acknowledgeContactChange).toHaveBeenCalledWith('ext-c-1'));
      expect(onChanged).toHaveBeenCalled();
    });

    it('acknowledges a product change through the product route', async () => {
      renderProduct(
        productLink({
          link: { mappingId: 'map-p', matchMethod: 'SKU_EXACT', linkedAt: '2026-10-03T09:00:00.000Z', linkedBy: null, external: item },
          change: { detectedAt: '2026-10-24T08:00:00.000Z' },
        }),
      );
      expect(screen.getByText('20% (VAT on Income)')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
      await waitFor(() => expect(api.acknowledgeProductChange).toHaveBeenCalledWith('ext-p-1'));
    });
  });

  describe('not linked', () => {
    it('warns for a customer and keeps it quiet for a product', () => {
      renderCustomer(customerLink());
      expect(screen.getByText(/can’t be sent until it’s linked/)).toBeInTheDocument();
    });

    it('a product explains invoices still go out', () => {
      renderProduct(productLink());
      expect(screen.getByText('Not linked to a Fake Books item')).toBeInTheDocument();
      expect(screen.getByText(/use its description/)).toBeInTheDocument();
    });

    it('links to the suggested contact', async () => {
      const onChanged = renderCustomer(
        customerLink({ suggestion: { id: 'sug-1', confidence: 95, matchMethod: 'EMAIL_EXACT', matchReason: 'Same email address', external: contact } }),
      );
      expect(screen.getByText('Suggested match · Same email address')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Link to this contact' }));
      await waitFor(() => expect(api.confirmSuggestion).toHaveBeenCalledWith('sug-1'));
      expect(onChanged).toHaveBeenCalled();
    });

    it('a product suggestion that conflicts on tax type asks, then retries with the override', async () => {
      api.confirmProductSuggestion.mockRejectedValueOnce(
        new ApiError({ type: 'about:blank', title: 'TAX_TYPE_CONFLICT', status: 409, detail: 'Tax type would change' }, 409),
      );
      renderProduct(
        productLink({ suggestion: { id: 'sug-p', confidence: 100, matchMethod: 'SKU_EXACT', matchReason: 'Same SKU', external: item } }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Link to this item' }));
      expect(await screen.findByText('Tax type would change')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Confirm & overwrite' }));
      await waitFor(() =>
        expect(api.confirmProductSuggestion).toHaveBeenLastCalledWith('sug-p', { confirmTaxTypeOverride: true }),
      );
      await waitFor(() => expect(screen.queryByText('Tax type would change')).not.toBeInTheDocument());
    });

    it('searches the provider and links the selected item; items linked elsewhere cannot be picked', async () => {
      api.listProducts.mockResolvedValue({
        data: [
          { id: 'ext-p-2', displayName: 'Grape Juice Still 1L', externalProductCode: 'GJ-1L', mapping: null },
          { id: 'ext-p-3', displayName: 'Red Grape Juice 75cl', externalProductCode: 'RG-75', mapping: { productName: 'Red Grape Juice' } },
        ],
      });
      renderProduct(productLink());
      fireEvent.change(screen.getByLabelText('Search Fake Books items'), { target: { value: 'grape' } });
      const radios = await screen.findAllByRole('radio');
      expect(api.listProducts).toHaveBeenCalledWith({
        search: 'grape',
        limit: 10,
        status: ['READY_TO_IMPORT', 'SUGGESTED', 'CONFLICT', 'LINKED'],
      });
      expect(screen.getByText('Already linked to Red Grape Juice')).toBeInTheDocument();
      expect(radios[1]).toBeDisabled();
      fireEvent.click(radios[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Link selected' }));
      await waitFor(() =>
        expect(api.matchProduct).toHaveBeenCalledWith('ext-p-2', { productId: 'prod-1', confirmTaxTypeOverride: false }),
      );
      expect(api.unlinkProductMapping).not.toHaveBeenCalled();
    });

    it('explains what the search leaves out when nothing matches', async () => {
      api.listContacts.mockResolvedValue({ data: [] });
      renderCustomer(customerLink());
      fireEvent.change(screen.getByLabelText('Search Fake Books contacts'), { target: { value: 'roe' } });
      expect(
        await screen.findByText(/No matching Fake Books contacts\. Archived contacts and contacts that aren’t customers aren’t listed/),
      ).toBeInTheDocument();
    });

    it('Sync now starts a sync', async () => {
      mockTriggerSync.mockResolvedValue(undefined);
      renderCustomer(customerLink());
      fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
      await waitFor(() => expect(mockTriggerSync).toHaveBeenCalled());
    });
  });

  it('offers no actions while the connection is in error, and says where to fix it', () => {
    renderCustomer(customerLink({ connection: { ...connection, status: 'ERROR' }, link: linkedContact, change: { detectedAt: '2026-10-24T08:00:00.000Z' } }));
    expect(screen.getByText(/The Fake Books connection needs attention/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Integrations › Accounting/ })).toHaveAttribute('href', '/integrations/accounting');
    expect(screen.queryByRole('button', { name: /Unlink|Acknowledge/ })).not.toBeInTheDocument();
  });

  it('a link that worked is not reported as failed when the reload afterwards fails', async () => {
    const onChanged = vi.fn().mockRejectedValue(new Error('reload failed'));
    renderCustomer(
      customerLink({ suggestion: { id: 'sug-1', confidence: 95, matchMethod: 'EMAIL_EXACT', matchReason: 'Same email address', external: contact } }),
      onChanged,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Link to this contact' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('is read-only without ACCOUNTING_IMPORT', () => {
    mockPermissions = [Permission.ACCOUNTING_READ];
    renderCustomer(customerLink({ link: linkedContact, change: { detectedAt: '2026-10-24T08:00:00.000Z' } }));
    expect(screen.getByText('Highfield Golf Club Ltd')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unlink|Change link|Acknowledge/ })).not.toBeInTheDocument();
  });

  it('read-only not-linked shows no search', () => {
    mockPermissions = [Permission.ACCOUNTING_READ];
    renderCustomer(customerLink());
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('lists link history newest first, with unlinks as their own entries', () => {
    renderCustomer(
      customerLink({
        history: [
          { externalDisplayName: 'Highfield GC (old)', matchMethod: 'MANUAL', linkedAt: '2026-09-02T09:00:00.000Z', linkedBy: { name: 'James Vine' }, unlinkedAt: '2026-10-01T09:00:00.000Z' },
        ],
      }),
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      '1 Oct 2026Unlinked from Highfield GC (old)',
      '2 Sept 2026Linked to Highfield GC (old) by James Vine — linked by hand',
    ]);
  });
});
