import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Permission, TaxClassification } from '@wholo/types';
import TaxTypesPage from './page';

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));
const granted: { list: string[] } = { list: [] };
vi.mock('@/lib/permissions', () => ({ useCan: () => (p: string) => granted.list.includes(p) }));

const list = vi.fn();
vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return { ...actual, adminTaxTypesApi: { list: (...a: unknown[]) => list(...a) } };
});

const row = { id: 'tt-1', name: 'Standard rate', classification: TaxClassification.STANDARD, ratePercentage: '20.00', active: true, isDefault: false };

beforeEach(() => {
  vi.clearAllMocks();
  granted.list = [];
});

describe('Tax types page', () => {
  it('offers New tax type to someone who can manage them', async () => {
    granted.list = [Permission.TAX_TYPES_READ, Permission.TAX_TYPES_MANAGE];
    list.mockResolvedValue({ data: [row], pagination: { total: 1, hasMore: false, nextCursor: null } });
    render(<TaxTypesPage />);

    expect(await screen.findByText('Standard rate')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New tax type' })).toHaveAttribute('href', '/tax-types/new');
  });

  it('shows a read-only viewer the list with no New tax type button', async () => {
    granted.list = [Permission.TAX_TYPES_READ];
    list.mockResolvedValue({ data: [row], pagination: { total: 1, hasMore: false, nextCursor: null } });
    render(<TaxTypesPage />);

    expect(await screen.findByText('Standard rate')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New tax type' })).not.toBeInTheDocument();
  });

  it('does not invite a read-only viewer to create the first tax type', async () => {
    granted.list = [Permission.TAX_TYPES_READ];
    list.mockResolvedValue({ data: [], pagination: { total: 0, hasMore: false, nextCursor: null } });
    render(<TaxTypesPage />);

    expect(await screen.findByText('No tax types yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Create first tax type|New tax type/ })).not.toBeInTheDocument();
  });

  it('invites someone who can manage them to create the first one', async () => {
    granted.list = [Permission.TAX_TYPES_READ, Permission.TAX_TYPES_MANAGE];
    list.mockResolvedValue({ data: [], pagination: { total: 0, hasMore: false, nextCursor: null } });
    render(<TaxTypesPage />);

    expect(await screen.findByRole('link', { name: 'Create first tax type' })).toBeInTheDocument();
  });
});
