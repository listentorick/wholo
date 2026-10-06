import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Permission } from '@wholo/types';
import PaymentTermsPage from './page';

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));
const granted: { list: string[] } = { list: [] };
vi.mock('@/lib/permissions', () => ({ useCan: () => (p: string) => granted.list.includes(p) }));

const list = vi.fn();
const makeDefault = vi.fn();
vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return {
    ...actual,
    adminPaymentTermsApi: { list: (...a: unknown[]) => list(...a), makeDefault: (...a: unknown[]) => makeDefault(...a) },
  };
});

const term = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, type: 'DAYS_AFTER_INVOICE', summary: `${name} rule`, isSystem: false, isDefault: false, active: true, customerCount: 0, ...extra,
});
const integration = (extra: Record<string, unknown> = {}) =>
  term('pt-sys', 'Set by accounting software', { type: 'ACCOUNTING_SYSTEM_DEFAULT', isSystem: true, ...extra });
const response = (data: unknown[], accountingProvider: string | null = 'XERO') => ({
  data,
  defaultPaymentTermId: 'x',
  accountingProvider,
});

beforeEach(() => {
  vi.clearAllMocks();
  granted.list = [Permission.CUSTOMERS_READ, Permission.CUSTOMERS_MANAGE];
});

describe('Payment terms page', () => {
  it('lists the distributor\'s terms and names the integration option after the connected integration', async () => {
    list.mockResolvedValue(response([term('pt-30', 'Net 30'), integration({ isDefault: true })]));
    render(<PaymentTermsPage />);

    expect(await screen.findByText('Net 30')).toBeInTheDocument();
    expect(screen.getByText('Xero manages due date')).toBeInTheDocument();
    expect(screen.queryByText('Set by accounting software')).not.toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('hides the integration option when no integration is connected, and warns there is no default', async () => {
    list.mockResolvedValue(response([term('pt-30', 'Net 30'), integration({ isDefault: true })], null));
    render(<PaymentTermsPage />);

    expect(await screen.findByText('Net 30')).toBeInTheDocument();
    expect(screen.queryByText(/manages due date/)).not.toBeInTheDocument();
    expect(screen.getByText(/No default payment terms/)).toBeInTheDocument();
  });

  it('does not warn when one of the distributor\'s own terms is the default', async () => {
    list.mockResolvedValue(response([term('pt-30', 'Net 30', { isDefault: true }), integration()], null));
    render(<PaymentTermsPage />);

    expect(await screen.findByText('Net 30')).toBeInTheDocument();
    expect(screen.queryByText(/No default payment terms/)).not.toBeInTheDocument();
  });

  it('makes a term the default and reloads', async () => {
    list.mockResolvedValue(response([term('pt-30', 'Net 30'), integration({ isDefault: true })]));
    makeDefault.mockResolvedValue({});
    render(<PaymentTermsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Make default' }));

    await waitFor(() => expect(makeDefault).toHaveBeenCalledWith('pt-30'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('offers no Make default on the current default or an inactive term', async () => {
    list.mockResolvedValue(response([term('pt-30', 'Net 30', { isDefault: true }), term('pt-old', 'Old', { active: false })], null));
    render(<PaymentTermsPage />);

    expect(await screen.findByText('Old')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make default' })).not.toBeInTheDocument();
  });

  it('shows a read-only viewer the list with nothing to change', async () => {
    granted.list = [Permission.CUSTOMERS_READ];
    list.mockResolvedValue(response([term('pt-30', 'Net 30'), integration({ isDefault: true })]));
    render(<PaymentTermsPage />);

    expect(await screen.findByText('Net 30')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New payment term' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make default' })).not.toBeInTheDocument();
  });

  it('says there are no payment terms yet when nothing can be listed', async () => {
    list.mockResolvedValue(response([integration({ isDefault: true })], null));
    render(<PaymentTermsPage />);

    expect(await screen.findByText(/No payment terms yet/)).toBeInTheDocument();
  });

  it('reports a failed load', async () => {
    list.mockRejectedValue(new Error('boom'));
    render(<PaymentTermsPage />);

    expect(await screen.findByText('Failed to load payment terms. Please refresh.')).toBeInTheDocument();
  });
});
