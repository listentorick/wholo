import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Product } from '@wholo/types';
import { ProductStatus } from '@wholo/types';
import ProductsPage from './page';

vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ isLoading: false }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('@/components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockList = vi.fn();

vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return {
    ...actual,
    adminProductsApi: { list: (...args: unknown[]) => mockList(...args) },
    adminProductTypesApi: { list: vi.fn().mockResolvedValue([]) },
    adminSuppliersApi: { list: vi.fn().mockResolvedValue([]) },
  };
});

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    distributorId: 'dist-1',
    name: 'Cabernet Sauvignon 2023',
    description: null,
    sku: 'CAB-SAUV-001',
    status: ProductStatus.ACTIVE,
    price: '12.99',
    productType: { id: 'pt-1', name: 'Red Wine' } as Product['productType'],
    supplier: { id: 'sup-1', name: 'Napa Imports' } as Product['supplier'],
    taxType: { id: 'tax-1', name: 'Standard Rate', isDefault: false } as Product['taxType'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Desktop table and mobile card list both render in JSDOM at once — scope
// queries to whichever surface is under test, same convention as
// AccountingProductsTable.spec.tsx.
describe('ProductsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({
      data: [makeProduct()],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });
  });

  describe('desktop table', () => {
    it('renders name, SKU, type, supplier and tax', async () => {
      render(<ProductsPage />);
      const table = within(await screen.findByRole('table'));

      expect(table.getByText('Cabernet Sauvignon 2023')).toBeInTheDocument();
      expect(table.getByText('SKU: CAB-SAUV-001')).toBeInTheDocument();
      expect(table.getByText('Red Wine')).toBeInTheDocument();
      expect(table.getByText('Napa Imports')).toBeInTheDocument();
      expect(table.getByText('Standard Rate')).toBeInTheDocument();
    });
  });

  describe('mobile card list', () => {
    it('shows name, SKU and status collapsed, with type/supplier hidden until expanded', async () => {
      render(<ProductsPage />);
      const list = within(await screen.findByRole('list'));

      expect(list.getByText('Cabernet Sauvignon 2023')).toBeInTheDocument();
      expect(list.getByText('SKU: CAB-SAUV-001')).toBeInTheDocument();
      expect(list.getByText('Active')).toBeInTheDocument();

      // The expanded panel (with Type/Supplier) stays mounted, CSS-collapsed,
      // before the card is tapped — assert via aria-expanded rather than
      // absence from the DOM, same convention as AccountingProductsTable.spec.tsx.
      const toggle = list.getByRole('button', { name: /Cabernet Sauvignon 2023/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await userEvent.click(toggle);

      expect(list.getByText('Red Wine')).toBeInTheDocument();
      expect(list.getByText('Napa Imports')).toBeInTheDocument();
      expect(list.getByRole('link', { name: /View product/ })).toHaveAttribute('href', '/products/prod-1/edit');
    });

    it('surfaces the "Needs review" tax warning on the collapsed card face', async () => {
      mockList.mockResolvedValue({
        data: [makeProduct({ taxType: { id: 'tax-1', name: 'Default', isDefault: true } as Product['taxType'] })],
        pagination: { nextCursor: null, hasMore: false, total: 1 },
      });

      render(<ProductsPage />);
      const list = within(await screen.findByRole('list'));
      // The badge also repeats in the (still-collapsed, CSS-hidden) expanded
      // panel — scope to the toggle's own header row to assert it's visible
      // without expanding, not just present somewhere in the card.
      const toggle = list.getByRole('button', { name: /Cabernet Sauvignon 2023/ });
      const header = within(toggle.parentElement!);

      expect(header.getByText('Needs review')).toBeInTheDocument();
    });

    it('surfaces the "No tax type" warning on the collapsed card face', async () => {
      mockList.mockResolvedValue({
        data: [makeProduct({ taxType: null })],
        pagination: { nextCursor: null, hasMore: false, total: 1 },
      });

      render(<ProductsPage />);
      const list = within(await screen.findByRole('list'));
      const toggle = list.getByRole('button', { name: /Cabernet Sauvignon 2023/ });
      const header = within(toggle.parentElement!);

      expect(header.getByText('No tax type')).toBeInTheDocument();
    });

    it('shows no tax badge collapsed when the tax type is fine', async () => {
      render(<ProductsPage />);
      const list = within(await screen.findByRole('list'));
      const toggle = list.getByRole('button', { name: /Cabernet Sauvignon 2023/ });
      const header = within(toggle.parentElement!);

      expect(header.queryByText('Needs review')).not.toBeInTheDocument();
      expect(header.queryByText('No tax type')).not.toBeInTheDocument();
    });
  });
});
