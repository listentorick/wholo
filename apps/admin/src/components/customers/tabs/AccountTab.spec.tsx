import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { AccountTab } from './AccountTab';
import { adminCustomersApi, adminPaymentTermsApi, ApiError } from '@wholo/admin-api-client';
import type { Customer } from '@wholo/types';
import type { TabSaveState } from './tab-save-state';

vi.mock('@wholo/admin-api-client', async () => {
  const actual = await vi.importActual<typeof import('@wholo/admin-api-client')>('@wholo/admin-api-client');
  return {
    ...actual,
    adminCustomersApi: { update: vi.fn() },
    adminPaymentTermsApi: { list: vi.fn() },
  };
});

const mockUpdate = adminCustomersApi.update as ReturnType<typeof vi.fn>;
const mockListTerms = adminPaymentTermsApi.list as ReturnType<typeof vi.fn>;

const term = (id: string, name: string, summary: string, extra: Record<string, unknown> = {}) => ({
  id, name, summary, type: 'DAYS_AFTER_INVOICE', isDefault: false, isSystem: false, active: true, ...extra,
});
const TERMS = [
  term('pt-30', 'Net 30', '30 days after the invoice date', { isDefault: true }),
  term('pt-fri', 'Weekly Friday', 'The next Friday after the invoice date'),
  term('pt-old', 'Old terms', '7 days after the invoice date', { active: false }),
  term('pt-sys', 'Set by accounting software', 'Due date set by the accounting software', { isSystem: true, type: 'ACCOUNTING_SYSTEM_DEFAULT' }),
];
const listWith = (overrides: Record<string, unknown> = {}) => ({
  data: TERMS,
  defaultPaymentTermId: 'pt-30',
  accountingProvider: 'XERO',
  ...overrides,
});

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'rel-1',
    organisationId: 'org-1',
    distributorId: 'dist-1',
    status: 'ACTIVE' as Customer['status'],
    organisation: {
      id: 'org-1', name: 'Blackbird Kitchen', legalName: null, email: null, phone: null,
      addressLine1: null, addressLine2: null, addressCity: null, addressState: null, addressPostcode: null, addressCountry: null,
      billingLine1: null, billingLine2: null, billingCity: null, billingState: null, billingPostcode: null, billingCountry: null,
    },
    accountNumber: 'ACC-001',
    creditLimit: null,
    minimumOrderSpend: null,
    paymentTermId: null, paymentTerm: null,
    notes: null,
    deliveryLine1: null, deliveryLine2: null, deliveryCity: null, deliveryState: null, deliveryPostcode: null, deliveryCountry: null,
    billingLine1: null, billingLine2: null, billingCity: null, billingState: null, billingPostcode: null, billingCountry: null,
    priceListId: null, priceList: null, deliveryProfileId: null, deliveryProfile: null,
    catalogues: [], invitations: [],
    recentContactSelfDeclared: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListTerms.mockResolvedValue(listWith());
});

describe('AccountTab', () => {
  it('pre-fills the account number from the customer', () => {
    render(<AccountTab customer={makeCustomer()} mode="tab" />);
    expect(screen.getByLabelText('Account number')).toHaveValue('ACC-001');
  });

  it('registers a save state with the sidebar via onSaveStateChange', () => {
    const onSaveStateChange = vi.fn();
    render(<AccountTab customer={makeCustomer()} mode="tab" onSaveStateChange={onSaveStateChange} />);
    expect(onSaveStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Save', saving: false, onSave: expect.any(Function) }),
    );
  });

  it('clears the registered save state on unmount', () => {
    const onSaveStateChange = vi.fn();
    const { unmount } = render(
      <AccountTab customer={makeCustomer()} mode="tab" onSaveStateChange={onSaveStateChange} />,
    );
    onSaveStateChange.mockClear();
    unmount();
    expect(onSaveStateChange).toHaveBeenCalledWith(null);
  });

  it('saves successfully and reports the Saved state through onSaveStateChange', async () => {
    mockUpdate.mockResolvedValue(makeCustomer());
    const captured: { state: TabSaveState | null } = { state: null };
    const onSaveStateChange = vi.fn((state: TabSaveState | null) => {
      captured.state = state;
    });

    render(<AccountTab customer={makeCustomer()} mode="tab" onSaveStateChange={onSaveStateChange} />);

    await act(async () => {
      captured.state?.onSave();
    });

    await waitFor(() => expect(captured.state?.success).toBe('Saved'));
  });

  it('shows a field-level error under Account number on a 409 conflict, not a generic save-state error', async () => {
    mockUpdate.mockRejectedValue(
      new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, detail: 'This account number is already in use by another customer' }, 409),
    );
    const captured: { state: TabSaveState | null } = { state: null };
    const onSaveStateChange = vi.fn((state: TabSaveState | null) => {
      captured.state = state;
    });

    render(<AccountTab customer={makeCustomer()} mode="tab" onSaveStateChange={onSaveStateChange} />);

    await act(async () => {
      captured.state?.onSave();
    });

    await waitFor(() =>
      expect(screen.getByText('This account number is already in use by another customer')).toBeInTheDocument(),
    );
    expect(captured.state?.error).toBeFalsy();
  });

  it('reports the generic error through onSaveStateChange for a non-conflict failure', async () => {
    mockUpdate.mockRejectedValue(new Error('network down'));
    const captured: { state: TabSaveState | null } = { state: null };
    const onSaveStateChange = vi.fn((state: TabSaveState | null) => {
      captured.state = state;
    });

    render(<AccountTab customer={makeCustomer()} mode="tab" onSaveStateChange={onSaveStateChange} />);

    await act(async () => {
      captured.state?.onSave();
    });

    await waitFor(() => expect(captured.state?.error).toBe('network down'));
  });

  describe('payment terms', () => {
    const onTerm = (id: string, name: string) => makeCustomer({ paymentTermId: id, paymentTerm: { id, name, summary: '' } });
    const optionLabels = (select: HTMLElement) => Array.from((select as HTMLSelectElement).options).map((o) => o.textContent);

    async function renderTab(customer: Customer) {
      const captured: { state: TabSaveState | null } = { state: null };
      render(
        <AccountTab customer={customer} mode="tab" onSaveStateChange={(state) => { captured.state = state; }} />,
      );
      const select = screen.getByLabelText('Payment terms');
      await waitFor(() => expect(select).toBeEnabled());
      return { select, captured };
    }
    async function save(captured: { state: TabSaveState | null }) {
      await act(async () => {
        captured.state?.onSave();
      });
    }

    it('lists the distributor\'s terms with the default marked, then the integration by name', async () => {
      const { select } = await renderTab(makeCustomer());
      expect(optionLabels(select)).toEqual(['Net 30 (default)', 'Weekly Friday', 'Xero manages due date']);
    });

    it('does not offer the integration when none is connected', async () => {
      mockListTerms.mockResolvedValue(listWith({ accountingProvider: null }));
      const { select } = await renderTab(makeCustomer());
      expect(optionLabels(select)).toEqual(['Net 30 (default)', 'Weekly Friday']);
    });

    it('shows the default in force and says the customer is using the default', async () => {
      const { select } = await renderTab(makeCustomer());
      expect(select).toHaveValue('pt-30');
      expect(screen.getByText('Using default')).toBeInTheDocument();
      expect(screen.queryByText('Set for this customer')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Use default instead' })).not.toBeInTheDocument();
    });

    it('says when terms are set on the customer, even when they match the default', async () => {
      const { select } = await renderTab(onTerm('pt-30', 'Net 30'));
      expect(select).toHaveValue('pt-30');
      expect(screen.getByText('Set for this customer')).toBeInTheDocument();
      expect(screen.queryByText('Using default')).not.toBeInTheDocument();
    });

    it('still shows a customer\'s existing term after it was deactivated', async () => {
      const { select } = await renderTab(onTerm('pt-old', 'Old terms'));
      expect(select).toHaveValue('pt-old');
    });

    it('sets the picked term on the customer and saves it', async () => {
      mockUpdate.mockResolvedValue(makeCustomer());
      const { select, captured } = await renderTab(makeCustomer());

      fireEvent.change(select, { target: { value: 'pt-fri' } });
      expect(screen.getByText('Set for this customer')).toBeInTheDocument();
      await save(captured);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('org-1', expect.objectContaining({ paymentTermId: 'pt-fri' })));
    });

    it('can hand one customer to the integration', async () => {
      mockUpdate.mockResolvedValue(makeCustomer());
      const { select, captured } = await renderTab(makeCustomer());

      fireEvent.change(select, { target: { value: 'pt-sys' } });
      expect(screen.getByText('Set for this customer')).toBeInTheDocument();
      await save(captured);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('org-1', expect.objectContaining({ paymentTermId: 'pt-sys' })));
    });

    it('goes back to the default with "Use default instead" and saves null', async () => {
      mockUpdate.mockResolvedValue(makeCustomer());
      const { select, captured } = await renderTab(onTerm('pt-fri', 'Weekly Friday'));

      fireEvent.click(screen.getByRole('button', { name: 'Use default instead' }));
      expect(select).toHaveValue('pt-30');
      expect(screen.getByText('Using default')).toBeInTheDocument();
      await save(captured);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('org-1', expect.objectContaining({ paymentTermId: null })));
    });

    it('says no payment terms are set when there is no integration and no default of the distributor\'s own', async () => {
      mockListTerms.mockResolvedValue(
        listWith({
          accountingProvider: null,
          defaultPaymentTermId: 'pt-sys',
          data: TERMS.map((t) => ({ ...t, isDefault: t.id === 'pt-sys' })),
        }),
      );
      const { select } = await renderTab(makeCustomer());

      expect(select).toHaveValue('');
      expect(optionLabels(select)).toEqual(['No payment terms set', 'Net 30', 'Weekly Friday']);
      expect(screen.getByRole('link', { name: 'Set up payment terms' })).toHaveAttribute('href', '/payment-terms');
    });
  });
});
