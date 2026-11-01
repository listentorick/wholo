import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Permission, ProductStatus } from '@wholo/types';
import type { AccountingProductLink, Product } from '@wholo/types';
import ProductPage from './page';
import EditProductRedirect from './edit/page';

const mockRedirect = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: 'prod-1' }),
  redirect: (url: string) => mockRedirect(url),
}));

let mockPermissions: Permission[] = [];
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token', user: { permissions: mockPermissions, organisationCurrencyCode: 'GBP' } }),
}));

let mockRequestedTab: string | null = null;
const mockSetTab = vi.fn();
vi.mock('@/lib/hooks/use-query-param-tab', () => ({
  useQueryParamTab: (defaultTab: string) => ({ activeTab: mockRequestedTab ?? defaultTab, setTab: mockSetTab }),
}));

vi.mock('@/lib/ingestion-sync-context', () => ({
  useIngestionSync: () => ({ reloadSignal: 0, triggerSync: vi.fn(), isSyncing: false }),
}));

vi.mock('@/components/products/ProductImageUploader', () => ({ ProductImageUploader: () => <p>Images</p> }));
vi.mock('@/components/integrations/record-link/AccountingLinkSection', () => ({
  AccountingLinkSection: () => <p>Accounting link section</p>,
}));

const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockGetLink = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({
  adminProductsApi: {
    get: (...a: unknown[]) => mockGet(...a),
    update: (...a: unknown[]) => mockUpdate(...a),
    delete: vi.fn(),
  },
  adminProductTypesApi: { list: () => Promise.resolve([]) },
  adminSuppliersApi: { list: () => Promise.resolve([]) },
  adminTaxTypesApi: {
    // Arrives after the fields appear, as on a real connection: Save stays
    // disabled until now, so a test that clicks too early fails every time.
    list: () =>
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ data: [{ id: 'tax-1', name: 'Standard', ratePercentage: '20', active: true, isDefault: false }] }),
          50,
        ),
      ),
  },
  adminPriceListsApi: { getProductPricing: () => Promise.resolve([]), list: () => Promise.resolve({ data: [] }) },
  adminAccountingApi: { getProductAccountingLink: (...a: unknown[]) => mockGetLink(...a) },
}));

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    distributorId: 'dist-1',
    name: 'Sparkling Grape Juice',
    description: null,
    sku: 'NA-008',
    status: ProductStatus.DRAFT,
    price: '3.20',
    productType: null,
    supplier: null,
    taxType: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Product;
}

const notLinked = {
  connection: { provider: 'FAKE', providerName: 'Fake Books', status: 'CONNECTED', lastSyncedAt: null },
  link: null,
  change: null,
  suggestion: null,
  history: [],
} as unknown as AccountingProductLink;

// Save and the fields stay disabled until the product type, supplier and tax
// type lists load, so wait for that before using them, as a person has to.
async function saveButtonWhenReady() {
  const save = await screen.findByRole('button', { name: 'Save changes' });
  await waitFor(() => expect(save).toBeEnabled());
  return save;
}

describe('ProductPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = [];
    mockRequestedTab = null;
    mockGet.mockResolvedValue(makeProduct());
    mockUpdate.mockImplementation((_id: string, req: Partial<Product>) => Promise.resolve(makeProduct(req)));
  });

  it('opens on Details with Details and Pricing tabs; no Integrations without accounting access', async () => {
    render(<ProductPage />);
    expect(await screen.findByLabelText('Title')).toHaveValue('Sparkling Grape Juice');
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pricing' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Integrations' })).not.toBeInTheDocument();
    expect(mockGetLink).not.toHaveBeenCalled();
  });

  it('one Save sends the Details and Pricing fields together and stays on the page', async () => {
    mockRequestedTab = 'pricing';
    render(<ProductPage />);
    const save = await saveButtonWhenReady();
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '4.50' } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('prod-1', expect.objectContaining({ name: 'Sparkling Grape Juice', sku: 'NA-008', price: '4.50' })),
    );
    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
  });

  it('opens the Pricing tab when the failing field is there', async () => {
    render(<ProductPage />);
    const save = await saveButtonWhenReady();
    fireEvent.click(screen.getByLabelText('Active'));
    fireEvent.click(save);
    await waitFor(() => expect(mockSetTab).toHaveBeenCalledWith('pricing'));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('with a connection: shows Integrations and the not-linked pill', async () => {
    mockPermissions = [Permission.ACCOUNTING_READ];
    mockGetLink.mockResolvedValue(notLinked);
    render(<ProductPage />);
    expect(await screen.findByRole('button', { name: 'Integrations' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not linked' }));
    expect(mockSetTab).toHaveBeenCalledWith('integrations');
    expect(mockGetLink).toHaveBeenCalledWith('prod-1');
  });

  it('?tab=integrations renders the accounting section', async () => {
    mockPermissions = [Permission.ACCOUNTING_READ];
    mockRequestedTab = 'integrations';
    mockGetLink.mockResolvedValue(notLinked);
    render(<ProductPage />);
    expect(await screen.findByText('Accounting link section')).toBeInTheDocument();
  });
});

describe('/products/[id]/edit', () => {
  it('redirects to the tabbed product page', async () => {
    await EditProductRedirect({ params: Promise.resolve({ id: 'prod-1' }) });
    expect(mockRedirect).toHaveBeenCalledWith('/products/prod-1');
  });
});
